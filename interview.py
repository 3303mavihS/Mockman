#!/usr/bin/env python3
"""MockMan — voice mock interview orchestrator.

Pipeline per turn:
    mic (./record) -> Apple Speech STT (./transcribe) -> opencode interviewer
    agent -> Kokoro neural TTS (persistent, loaded once) -> speakers.

Usage:
    .venv/bin/python interview.py [role] [type] [context-file]

    role    : e.g. "Senior Backend Engineer"        (default)
    type    : "behavioral" | "technical" | "system design" | "mixed" (default: mixed)
    context : optional text file with your resume and/or the target JD

Controls: press Enter to stop each recording. Say "end the interview" for
spoken feedback and exit.
"""

import contextlib
import io
import itertools
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")  # keep torch/mlx deprecation noise off the UI

ROOT = Path(__file__).resolve().parent
VOICE = os.environ.get("MOCKMAN_VOICE", "af_heart")
KOKORO_MODEL = os.environ.get("MOCKMAN_TTS_MODEL", "mlx-community/Kokoro-82M-bf16")

# Words Kokoro mispronounces -> respellings verified by STT round-trip.
# Extend this list as you notice new mispronunciations.
PRONUNCIATIONS = {
    "Redis": "Red-iss",
    "redis": "red-iss",
    "Kubernetes": "Koo-ber-net-iss",
    "kubernetes": "koo-ber-net-iss",
    "dedup": "dee-doop",
    "Dedup": "Dee-doop",
}
_PRON_RE = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in PRONUNCIATIONS) + r")\b"
)


def preprocess_for_tts(text: str) -> str:
    """Fix known mispronunciations before synthesis."""
    return _PRON_RE.sub(lambda m: PRONUNCIATIONS[m.group(0)], text)


# ---------------- status indicator ----------------

class Spinner:
    """Animated status line with elapsed time, e.g.
    '⠹ 🧠 Riya is thinking… (7s)'. Clears itself on exit."""

    FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"

    def __init__(self, label: str) -> None:
        self.label = label
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def _spin(self) -> None:
        t0 = time.monotonic()
        for frame in itertools.cycle(self.FRAMES):
            if self._stop.is_set():
                break
            elapsed = time.monotonic() - t0
            sys.stderr.write(f"\r{frame} {self.label} ({elapsed:.0f}s)   ")
            sys.stderr.flush()
            self._stop.wait(0.1)

    def __enter__(self) -> "Spinner":
        self._thread = threading.Thread(target=self._spin, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join()
        sys.stderr.write("\r" + " " * (len(self.label) + 20) + "\r")
        sys.stderr.flush()


# ---------------- TTS ----------------

class Speaker:
    """Kokoro neural TTS, model loaded once; falls back to macOS `say`."""

    def __init__(self) -> None:
        self._model = None
        self._generate = None
        try:
            from mlx_audio.tts.generate import generate_audio
            from mlx_audio.tts.utils import load_model

            with Spinner("🔊 Loading voice model (one time)…"):
                with contextlib.redirect_stdout(io.StringIO()), \
                     contextlib.redirect_stderr(io.StringIO()):
                    self._model = load_model(KOKORO_MODEL)
            self._generate = generate_audio
            print("✅ voice ready")
        except Exception as exc:  # noqa: BLE001 - any failure -> fallback
            print(f"Kokoro unavailable ({exc}); falling back to macOS 'say'")

    def say(self, text: str) -> None:
        spoken = preprocess_for_tts(text)
        if self._model is None:
            subprocess.run(["say", spoken], check=False)
            return
        with tempfile.TemporaryDirectory(prefix="mockman_tts_") as tmp:
            try:
                # Swallow mlx_audio's noisy per-turn prints (Text:/Voice:/...)
                with contextlib.redirect_stdout(io.StringIO()):
                    self._generate(
                        text=spoken,
                        model=self._model,
                        voice=VOICE,
                        speed=1.0,
                        output_path=tmp,
                        file_prefix="turn",
                        join_audio=True,
                        verbose=False,
                    )
                for wav in sorted(Path(tmp).glob("turn*.wav")):
                    subprocess.run(["afplay", str(wav)], check=False)
            except Exception as exc:  # noqa: BLE001
                print(f"(kokoro failed mid-session: {exc}; using 'say')")
                subprocess.run(["say", spoken], check=False)


# ---------------- interviewer brain (opencode) ----------------

def parse_opencode_json(path: str) -> tuple[str | None, str]:
    sid, texts = None, []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if sid is None:
                sid = event.get("sessionID")
            if event.get("type") == "text" and "part" in event:
                texts.append(event["part"].get("text", ""))
    return sid, "".join(texts).strip()


def ask_interviewer(message: str, session_id: str | None) -> tuple[str | None, str]:
    cmd = ["opencode", "run", "--agent", "interviewer", "--format", "json"]
    if session_id:
        cmd += ["--session", session_id]
    cmd.append(message)
    with tempfile.NamedTemporaryFile(
        mode="w+", suffix=".json", prefix="mockman_llm_", delete=False
    ) as tmp:
        tmp_path = tmp.name
    try:
        with open(tmp_path, "w") as out:
            # stdin=DEVNULL is required: `opencode run` reads non-TTY stdin
            # and would block our piped/interactive stdin until EOF.
            with Spinner("🧠 Riya is thinking…"):
                subprocess.run(cmd, stdout=out, stderr=subprocess.DEVNULL,
                               stdin=subprocess.DEVNULL, check=False, cwd=ROOT)
        return parse_opencode_json(tmp_path)
    finally:
        os.unlink(tmp_path)


# ---------------- mic + STT ----------------

def record_answer(wav_path: Path) -> bool:
    print("🎙️  Listening… speak your answer, then press Enter")
    # Drop any Enter presses buffered before recording started, otherwise
    # the recorder would stop instantly with an empty file.
    try:
        import termios
        termios.tcflush(sys.stdin.fileno(), termios.TCIFLUSH)
    except Exception:
        pass  # non-TTY stdin (piped runs)
    result = subprocess.run([str(ROOT / "record"), str(wav_path)],
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                            text=True, check=False, cwd=ROOT)
    if result.returncode != 0 and result.stderr:
        print(result.stderr.strip())
    return result.returncode == 0


def is_empty_recording(wav_path: Path) -> bool:
    # AVAudioFile writes a ~4KB header; real speech is >100KB/s.
    return wav_path.stat().st_size < 10_000


def transcribe(wav_path: Path) -> str:
    # Skip pathological captures: empty audio can hang the Speech framework's
    # results stream (the Swift binary also guards this; belt and suspenders).
    if is_empty_recording(wav_path):
        return ""
    with Spinner("📝 Transcribing your answer…"):
        try:
            result = subprocess.run([str(ROOT / "transcribe"), str(wav_path)],
                                    capture_output=True, text=True, check=False,
                                    timeout=60, cwd=ROOT)
        except subprocess.TimeoutExpired:
            print("⚠️  transcription timed out — skipping this answer")
            return ""
    return result.stdout.strip()


# ---------------- session storage ----------------
# Layout: sessions/<YYYY-MM-DD>/<opencode-session-id>/
#   answer_N.wav   — your recordings, per turn
#   transcript.md  — full text log, written live after every turn
#   report.txt     — analytics (metrics.py), written at session end
#   session.json   — raw opencode export, written at session end

def make_session_dir(session_id: str | None, role: str, itype: str) -> Path:
    day = time.strftime("%Y-%m-%d")
    sid = session_id or "nosession"
    path = ROOT / "sessions" / day / sid
    path.mkdir(parents=True, exist_ok=True)
    (path / "transcript.md").write_text(
        f"# MockMan interview — {role} ({itype})\n"
        f"date: {time.strftime('%Y-%m-%d %H:%M')}\n"
        f"opencode session: {sid}\n\n---\n\n"
    )
    return path


def log_turn(session_dir: Path, speaker_label: str, text: str) -> None:
    with open(session_dir / "transcript.md", "a") as f:
        f.write(f"**{speaker_label}:** {text}\n\n")


def finalize_session(session_dir: Path, session_id: str | None) -> None:
    if not session_id:
        return
    export = subprocess.run(["opencode", "export", session_id],
                            capture_output=True, text=True, check=False,
                            cwd=ROOT, stdin=subprocess.DEVNULL)
    if "{" in export.stdout:
        (session_dir / "session.json").write_text(
            export.stdout[export.stdout.index("{"):])
    report = subprocess.run(
        [sys.executable, str(ROOT / "metrics.py"), session_id, str(session_dir)],
        capture_output=True, text=True, check=False, cwd=ROOT)
    (session_dir / "report.txt").write_text(report.stdout)
    print(f"💾 saved: {session_dir.relative_to(ROOT)}/  (transcript.md, report.txt, session.json)")


# ---------------- main loop ----------------

def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)  # unbuffered prints for logs/pipes

    role = sys.argv[1] if len(sys.argv) > 1 else "Senior Backend Engineer"
    itype = sys.argv[2] if len(sys.argv) > 2 else "mixed"
    ctx_file = Path(sys.argv[3]) if len(sys.argv) > 3 else None

    print(f"🎤 MockMan — mock interview: {role} ({itype})")
    print("   Press Enter to stop each answer. Say 'end the interview' to finish.\n")

    speaker = Speaker()

    setup = f"SETUP: Role: {role}. Interview type: {itype}."
    if ctx_file and ctx_file.is_file():
        setup += f"\nCandidate resume / job description context:\n{ctx_file.read_text()}"
    setup += "\nBegin the interview."

    session_id, opening = ask_interviewer(setup, None)
    if not opening:
        print("error: interviewer agent returned nothing — check 'opencode run' works")
        sys.exit(1)
    session_dir = make_session_dir(session_id, role, itype)
    print(f"\n🤖 Interviewer: {opening}\n")
    log_turn(session_dir, "🤖 Interviewer", opening)
    with Spinner("🔊 Riya is speaking…"):
        speaker.say(opening)

    try:
        interview_loop(speaker, session_id, session_dir)
    except KeyboardInterrupt:
        print(f"\n\n👋 Session ended (opencode session: {session_id})")
    finally:
        finalize_session(session_dir, session_id)


def interview_loop(speaker: "Speaker", session_id: str | None,
                   session_dir: Path) -> None:
    turn = 1
    while True:
        print(f"——— your turn {turn} ———")
        wav = session_dir / f"answer_{turn}.wav"
        if not record_answer(wav):
            print("recorder failed")
            sys.exit(1)

        if is_empty_recording(wav):
            print("⚠️  nothing was recorded — press Enter only *after* you "
                  "finish speaking (any Enter pressed early is now ignored)")
            continue

        transcript = transcribe(wav)
        print(f"\n📝 You said: {transcript}")

        if not transcript:
            if not sys.stdin.isatty():
                # Scripted/piped run with stdin exhausted — exit instead of
                # busy-looping on empty recordings.
                print("(stdin closed and no speech captured — ending session)")
                break
            msg = "I didn't catch that. Could you repeat your answer?"
            print(f"\n🤖 Interviewer: {msg}\n")
            log_turn(session_dir, "📝 You", "(nothing heard)")
            log_turn(session_dir, "🤖 Interviewer", msg)
            with Spinner("🔊 Riya is speaking…"):
                speaker.say(msg)
            continue

        log_turn(session_dir, "📝 You", transcript)

        if "end the interview" in transcript.lower() or "end interview" in transcript.lower():
            _, feedback = ask_interviewer("END INTERVIEW", session_id)
            print(f"\n📊 Final feedback:\n🤖 {feedback}\n")
            log_turn(session_dir, "🤖 Final feedback", feedback)
            with Spinner("🔊 Riya is speaking…"):
                speaker.say(feedback)
            print(f"✅ Session complete (opencode session: {session_id})")
            break

        session_id, response = ask_interviewer(
            f"Candidate's answer (speech transcript): {transcript}", session_id
        )
        print(f"\n🤖 Interviewer: {response}\n")
        log_turn(session_dir, "🤖 Interviewer", response)
        with Spinner("🔊 Riya is speaking…"):
            speaker.say(response)
        turn += 1


if __name__ == "__main__":
    main()
