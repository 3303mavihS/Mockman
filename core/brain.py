"""Interviewer brain — the LLM adapter seam.

Default backend shells out to `opencode run` with the persona agent from
`.opencode/agent/`. Session continuity is via opencode's --session flag.

Future adapters (Claude Code, Gemini CLI, Ollama) implement this same
contract: ask(message, session_id) -> (session_id, response_text).
"""

import json
import os
import subprocess
import tempfile

from . import ROOT

DEFAULT_AGENT = "interviewer"


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
    cmd = ["opencode", "run", "--agent", agent, "--format", "json"]
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
