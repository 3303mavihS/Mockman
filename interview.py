#!/usr/bin/env python3
"""MockMan — voice mock interview, terminal frontend.

Thin CLI over the core/ engine (shared with the web server):
    mic (./record) -> Apple Speech STT -> opencode interviewer agent
    -> Kokoro neural TTS -> speakers.

Usage:
    .venv/bin/python interview.py [role] [type] [context-file]

    role    : e.g. "Senior Backend Engineer"        (default)
    type    : "behavioral" | "technical" | "system design" | "mixed" (default: mixed)
    context : optional text file with your resume and/or the target JD

Controls: press Enter to stop each answer. Say "end the interview" for
spoken feedback and exit.
"""

import itertools
import subprocess
import sys
import threading
import time
from pathlib import Path

from core import ROOT
from core.brain import ask_interviewer
from core.sessions import finalize_session, log_turn, make_session_dir
from core.stt import is_empty_recording, transcribe
from core.tts import Speaker


# ---------------- status indicator (CLI-only UX) ----------------

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


# ---------------- mic (CLI-only path; web uses the browser) ----------------

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


# ---------------- main loop ----------------

def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)  # unbuffered prints for logs/pipes

    role = sys.argv[1] if len(sys.argv) > 1 else "Senior Backend Engineer"
    itype = sys.argv[2] if len(sys.argv) > 2 else "mixed"
    ctx_file = Path(sys.argv[3]) if len(sys.argv) > 3 else None

    print(f"🎤 MockMan — mock interview: {role} ({itype})")
    print("   Press Enter to stop each answer. Say 'end the interview' to finish.\n")

    speaker = Speaker(status_cb=lambda s: None)
    # loading voice model can take ~10s on first run
    if speaker.available:
        print("✅ voice ready")
    else:
        print("⚠️  Kokoro unavailable — falling back to macOS 'say'")

    setup = f"SETUP: Role: {role}. Interview type: {itype}."
    if ctx_file and ctx_file.is_file():
        setup += f"\nCandidate resume / job description context:\n{ctx_file.read_text()}"
    setup += "\nBegin the interview."

    with Spinner("🧠 Riya is thinking…"):
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
        print(f"💾 saved: {session_dir.relative_to(ROOT)}/  (transcript.md, report.txt, session.json)")


def interview_loop(speaker: Speaker, session_id: str | None,
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

        with Spinner("📝 Transcribing your answer…"):
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
            with Spinner("🧠 Riya is thinking…"):
                _, feedback = ask_interviewer("END INTERVIEW", session_id)
            print(f"\n📊 Final feedback:\n🤖 {feedback}\n")
            log_turn(session_dir, "🤖 Final feedback", feedback)
            with Spinner("🔊 Riya is speaking…"):
                speaker.say(feedback)
            print(f"✅ Session complete (opencode session: {session_id})")
            break

        with Spinner("🧠 Riya is thinking…"):
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
