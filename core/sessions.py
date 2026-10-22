"""Session storage.

Layout: sessions/<YYYY-MM-DD>/<opencode-session-id>/
  answer_N.wav   — recordings, per turn
  transcript.md  — full text log, written live after every turn
  report.txt     — analytics (metrics.py), written at session end
  session.json   — raw opencode export, written at session end
"""

import re
import subprocess
import sys
import time
from pathlib import Path

from . import ROOT

SESSIONS_ROOT = ROOT / "sessions"
_SID_RE = re.compile(r"^[A-Za-z0-9_-]+$")
_DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def make_session_dir(session_id: str | None, role: str, itype: str) -> Path:
    day = time.strftime("%Y-%m-%d")
    sid = session_id or "nosession"
    path = SESSIONS_ROOT / day / sid
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
    """Export the raw session and generate the metrics report."""
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
    # machine-readable twin for the web UI (at-a-glance panel, per-turn table)
    report_json = subprocess.run(
        [sys.executable, str(ROOT / "metrics.py"), session_id,
         str(session_dir), "--json"],
        capture_output=True, text=True, check=False, cwd=ROOT)
    if report_json.stdout.strip().startswith("{"):
        (session_dir / "report.json").write_text(report_json.stdout)


def _validate_day_sid(day: str, sid: str) -> bool:
    """Guard against path traversal in web-facing lookups."""
    return bool(_DAY_RE.match(day)) and bool(_SID_RE.match(sid))


def list_sessions() -> list[dict]:
    """All sessions, newest first, with summary metadata for the dashboard."""
    out = []
    if not SESSIONS_ROOT.is_dir():
        return out
    for day_dir in sorted(SESSIONS_ROOT.iterdir(), reverse=True):
        if not day_dir.is_dir() or not _DAY_RE.match(day_dir.name):
            continue
        for sess in sorted(day_dir.iterdir(), reverse=True):
            if not sess.is_dir():
                continue
            title = ""
            transcript = sess / "transcript.md"
            if transcript.is_file():
                with open(transcript) as f:
                    title = f.readline().lstrip("# ").strip()
            out.append({
                "day": day_dir.name,
                "id": sess.name,
                "title": title or sess.name,
                "turns": len(list(sess.glob("answer_*.wav"))),
                "audio_seconds": round(sum(
                    max(0, p.stat().st_size - 4096) / (48000 * 4)
                    for p in sess.glob("answer_*.wav")
                )),
                "has_report": (sess / "report.txt").is_file(),
                "has_feedback": (sess / "feedback.json").is_file(),
            })
    return out


def load_session(day: str, sid: str) -> dict | None:
    """Full session detail for the review screen. None if invalid/missing."""
    if not _validate_day_sid(day, sid):
        return None
    sess = SESSIONS_ROOT / day / sid
    if not sess.is_dir():
        return None
    def _numbered(pattern: str) -> list[str]:
        return sorted(
            (p.name for p in sess.glob(pattern)),
            key=lambda n: int(re.search(r"\d+", n).group()),
        )

    import json

    def _json_file(name: str):
        f = sess / name
        if not f.is_file():
            return None
        try:
            return json.loads(f.read_text())
        except (json.JSONDecodeError, OSError):
            return None

    return {
        "day": day,
        "id": sid,
        "transcript": (sess / "transcript.md").read_text()
                      if (sess / "transcript.md").is_file() else "",
        "report": (sess / "report.txt").read_text()
                  if (sess / "report.txt").is_file() else "",
        "report_json": _json_file("report.json"),
        "answers": _numbered("answer_*.wav"),
        "interviewer": _numbered("interviewer_*.wav"),
        "feedback": _json_file("feedback.json"),
    }
