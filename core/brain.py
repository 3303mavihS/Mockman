"""Interviewer brain — the LLM adapter seam.

Default backend shells out to `opencode run` with the persona agent from
`.opencode/agent/`. Session continuity is via opencode's --session flag.

Future adapters (Claude Code, Gemini CLI, Ollama) implement this same
contract: ask(message, session_id) -> (session_id, response_text).
"""

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from . import ROOT

DEFAULT_AGENT = "interviewer"


def _opencode_bin() -> str:
    """Locate the opencode binary. GUI-launched processes (MockMan.app,
    Finder-started servers) inherit a bare PATH without ~/.opencode/bin,
    so check the default install location explicitly."""
    found = shutil.which("opencode")
    if found:
        return found
    default = Path.home() / ".opencode" / "bin" / "opencode"
    if default.is_file():
        return str(default)
    raise RuntimeError(
        "opencode CLI not found (checked PATH and ~/.opencode/bin). "
        "Install it from opencode.ai — MockMan's interviewer brain needs it."
    )


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


def ask_interviewer(message: str, session_id: str | None,
                    agent: str = DEFAULT_AGENT) -> tuple[str | None, str]:
    """Send a message to the interviewer persona; returns (session_id, reply)."""
    cmd = [_opencode_bin(), "run", "--agent", agent, "--format", "json"]
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
            subprocess.run(cmd, stdout=out, stderr=subprocess.DEVNULL,
                           stdin=subprocess.DEVNULL, check=False, cwd=ROOT)
        return parse_opencode_json(tmp_path)
    finally:
        os.unlink(tmp_path)
