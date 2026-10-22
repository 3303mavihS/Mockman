#!/usr/bin/env python3
"""MockMan web server — FastAPI over the core/ engine.

Local-only by design: binds 127.0.0.1, no auth (single-user desktop tool).
Serves the React build from webui/dist when present, plus the JSON API.

Run:
    .venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8420
"""

import re
import threading
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

import json

from core import ROOT
from core.brain import ask_interviewer
from core.personas import list_personas, read_persona, write_persona
from core.sessions import (finalize_session, list_sessions, load_session,
                           log_turn, make_session_dir)
from core.stt import is_empty_recording, transcribe
from core.tts import Speaker

PROFILE_DIR = ROOT / "profile"
PROFILE_DIR.mkdir(exist_ok=True)

app = FastAPI(title="MockMan", docs_url=None, redoc_url=None, openapi_url=None)

# ---------------------------------------------------------------------------
# Shared state (single-user local tool: one Kokoro model, active interviews)
# ---------------------------------------------------------------------------

_speaker: Speaker | None = None
_speaker_lock = threading.Lock()


def get_speaker() -> Speaker:
    global _speaker
    with _speaker_lock:
        if _speaker is None:
            _speaker = Speaker()
        return _speaker


class InterviewState:
    def __init__(self, session_id: str | None, session_dir: Path, turn: int = 1):
        self.session_id = session_id
        self.session_dir = session_dir
        self.turn = turn              # candidate answer counter (answer_N.wav)
        self.question_seq = 1         # interviewer audio counter (interviewer_N.wav)
        self.ended = False


_interviews: dict[str, InterviewState] = {}

_AUDIO_NAME_RE = re.compile(r"^(answer|interviewer)_\d+\.wav$")
MAX_CONTEXT_CHARS = 20_000
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50MB of wav is ~4 min of audio


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class StartRequest(BaseModel):
    role: str = Field(min_length=1, max_length=200)
    itype: str = Field(default="mixed", max_length=50)
    context: str = Field(default="", max_length=MAX_CONTEXT_CHARS)
    persona: str = Field(default="interviewer", max_length=64)


class PersonaUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=50_000)


# ---------------------------------------------------------------------------
# Platform endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "voice": get_speaker().available}


@app.get("/api/sessions")
def sessions() -> list[dict]:
    return list_sessions()


@app.get("/api/sessions/{day}/{sid}")
def session_detail(day: str, sid: str) -> dict:
    detail = load_session(day, sid)
    if detail is None:
        raise HTTPException(status_code=404, detail="session not found")
    return detail


@app.get("/api/sessions/{day}/{sid}/audio/{name}")
def session_audio(day: str, sid: str, name: str) -> FileResponse:
    if not _AUDIO_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="invalid audio name")
    detail_dir = ROOT / "sessions" / day / sid
    if load_session(day, sid) is None:  # validates day/sid + existence
        raise HTTPException(status_code=404, detail="session not found")
    wav = detail_dir / name
    if not wav.is_file():
        raise HTTPException(status_code=404, detail="audio not found")
    return FileResponse(wav, media_type="audio/wav")


@app.get("/api/personas")
def personas() -> list[dict]:
    return list_personas()


@app.get("/api/personas/{persona_id}")
def persona_detail(persona_id: str) -> dict:
    content = read_persona(persona_id)
    if content is None:
        raise HTTPException(status_code=404, detail="persona not found")
    return {"id": persona_id, "content": content}


@app.put("/api/personas/{persona_id}")
def persona_update(persona_id: str, body: PersonaUpdate) -> dict:
    if not write_persona(persona_id, body.content):
        raise HTTPException(status_code=400, detail="invalid persona id")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Profile (resume reused across interviews; stays local, gitignored)
# ---------------------------------------------------------------------------

class ProfileUpdate(BaseModel):
    resume: str = Field(default="", max_length=MAX_CONTEXT_CHARS)


@app.get("/api/profile")
def profile_get() -> dict:
    f = PROFILE_DIR / "resume.txt"
    return {"resume": f.read_text() if f.is_file() else ""}


@app.put("/api/profile")
def profile_put(body: ProfileUpdate) -> dict:
    (PROFILE_DIR / "resume.txt").write_text(body.resume)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Post-session analysis (question extraction -> feedback.json)
# ---------------------------------------------------------------------------

def _extract_feedback(session_dir: Path) -> None:
    """Background job: run the analyzer persona over the transcript and save
    structured feedback. Best-effort — failures just mean no feedback.json."""
    transcript_file = session_dir / "transcript.md"
    if not transcript_file.is_file():
        return
    transcript = transcript_file.read_text()
    prompt = (
        "Analyze this mock interview transcript and output the JSON object.\n\n"
        + transcript
    )
    _, text = ask_interviewer(prompt, None, agent="analyzer")
    if not text:
        return
    # tolerate markdown fences around the JSON
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    try:
        data = json.loads(cleaned)
    except (json.JSONDecodeError, IndexError):
        return
    if isinstance(data, dict) and "questions" in data:
        (session_dir / "feedback.json").write_text(json.dumps(data, indent=2))


# ---------------------------------------------------------------------------
# Interview endpoints
# ---------------------------------------------------------------------------

def _synthesize_interviewer(state: InterviewState, text: str) -> str | None:
    """Synthesize interviewer speech into the session dir (for replay).
    Uses its own sequence counter — independent of answer turn numbering —
    so the opening, each response, and the feedback never overwrite.
    Returns the wav filename, or None if Kokoro is unavailable."""
    wav = get_speaker().synthesize(
        text, out_dir=str(state.session_dir))
    if wav is None:
        return None
    target = state.session_dir / f"interviewer_{state.question_seq}.wav"
    Path(wav).rename(target)
    state.question_seq += 1
    return target.name


@app.post("/api/interview/start")
def interview_start(req: StartRequest) -> dict:
    setup = f"SETUP: Role: {req.role}. Interview type: {req.itype}."
    if req.context.strip():
        setup += f"\nCandidate resume / job description context:\n{req.context.strip()}"
    setup += "\nBegin the interview."

    session_id, opening = ask_interviewer(setup, None, agent=req.persona)
    if not opening:
        raise HTTPException(status_code=502, detail="interviewer brain returned nothing")

    session_dir = make_session_dir(session_id, req.role, req.itype)
    state = InterviewState(session_id, session_dir)
    _interviews[session_id] = state
    log_turn(session_dir, "🤖 Interviewer", opening)
    audio = _synthesize_interviewer(state, opening)
    return {"interview_id": session_id, "opening": opening, "audio": audio,
            "turn": state.turn}


@app.post("/api/interview/{interview_id}/answer")
async def interview_answer(interview_id: str,
                           audio: UploadFile = File(...)) -> dict:
    state = _interviews.get(interview_id)
    if state is None or state.ended:
        raise HTTPException(status_code=404, detail="interview not found or ended")

    data = await audio.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="recording too large")
    wav = state.session_dir / f"answer_{state.turn}.wav"
    wav.write_bytes(data)

    if is_empty_recording(wav):
        return {"transcript": "", "response": None, "turn": state.turn,
                "audio": None, "ended": False}

    transcript = transcribe(wav)
    if not transcript:
        msg = "I didn't catch that. Could you repeat your answer?"
        log_turn(state.session_dir, "📝 You", "(nothing heard)")
        log_turn(state.session_dir, "🤖 Interviewer", msg)
        audio_name = _synthesize_interviewer(state, msg)
        return {"transcript": "", "response": msg, "turn": state.turn,
                "audio": audio_name, "ended": False}

    log_turn(state.session_dir, "📝 You", transcript)

    if "end the interview" in transcript.lower() or "end interview" in transcript.lower():
        return _end_interview(state, transcript)

    state.session_id, response = ask_interviewer(
        f"Candidate's answer (speech transcript): {transcript}", state.session_id)
    log_turn(state.session_dir, "🤖 Interviewer", response)
    audio_name = _synthesize_interviewer(state, response)
    result = {"transcript": transcript, "response": response,
              "turn": state.turn, "audio": audio_name, "ended": False}
    state.turn += 1
    return result


@app.post("/api/interview/{interview_id}/end")
def interview_end(interview_id: str) -> dict:
    state = _interviews.get(interview_id)
    if state is None or state.ended:
        raise HTTPException(status_code=404, detail="interview not found or ended")
    return _end_interview(state, trigger_transcript=None)


@app.get("/api/interview/{interview_id}/audio/{name}")
def interview_audio(interview_id: str, name: str) -> FileResponse:
    """Live-interview audio (response playback in the browser)."""
    state = _interviews.get(interview_id)
    if state is None:
        raise HTTPException(status_code=404, detail="interview not found")
    if not _AUDIO_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="invalid audio name")
    wav = state.session_dir / name
    if not wav.is_file():
        raise HTTPException(status_code=404, detail="audio not found")
    return FileResponse(wav, media_type="audio/wav")


def _end_interview(state: InterviewState, trigger_transcript: str | None) -> dict:
    _, feedback = ask_interviewer("END INTERVIEW", state.session_id)
    log_turn(state.session_dir, "🤖 Final feedback", feedback)
    audio_name = _synthesize_interviewer(state, feedback)
    state.ended = True
    finalize_session(state.session_dir, state.session_id)
    # structured question extraction runs in the background; the review UI
    # picks up feedback.json when it appears
    threading.Thread(target=_extract_feedback,
                     args=(state.session_dir,), daemon=True).start()
    return {"feedback": feedback, "audio": audio_name, "ended": True,
            "session": f"{state.session_dir.parent.name}/{state.session_dir.name}"}


# ---------------------------------------------------------------------------
# Static frontend (React build), when present
# ---------------------------------------------------------------------------

_dist = ROOT / "webui" / "dist"
if _dist.is_dir():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=_dist, html=True), name="webui")
