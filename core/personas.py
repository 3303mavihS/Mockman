"""Persona store — interviewer personas are opencode agent markdown files.

A persona file = frontmatter (description, permissions) + the prompt body.
Editing a persona in the UI edits the file; opencode picks it up on the
next `opencode run` (fresh process per turn, so no restart dance needed).
"""

import re
from pathlib import Path

from . import ROOT

PERSONAS_DIR = ROOT / ".opencode" / "agent"
_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_DESC_RE = re.compile(r"^description:\s*(.+)$", re.MULTILINE)


def list_personas() -> list[dict]:
    """Interviewer personas for the picker. Internal agents (hidden: true in
    frontmatter, e.g. the analyzer) are excluded."""
    out = []
    if not PERSONAS_DIR.is_dir():
        return out
    for f in sorted(PERSONAS_DIR.glob("*.md")):
        text = f.read_text()
        if re.search(r"^hidden:\s*true\s*$", text, re.MULTILINE):
            continue
        m = _DESC_RE.search(text)
        out.append({
            "id": f.stem,
            "description": m.group(1).strip() if m else "",
        })
    return out


def read_persona(persona_id: str) -> str | None:
    if not _ID_RE.match(persona_id):
        return None
    path = PERSONAS_DIR / f"{persona_id}.md"
    return path.read_text() if path.is_file() else None


def write_persona(persona_id: str, content: str) -> bool:
    """Create or replace a persona. Returns False on invalid id."""
    if not _ID_RE.match(persona_id):
        return False
    PERSONAS_DIR.mkdir(parents=True, exist_ok=True)
    (PERSONAS_DIR / f"{persona_id}.md").write_text(content)
    return True


def delete_persona(persona_id: str) -> bool:
    """Delete a persona file. The built-in 'interviewer' is protected."""
    if persona_id == "interviewer" or not _ID_RE.match(persona_id):
        return False
    path = PERSONAS_DIR / f"{persona_id}.md"
    if path.is_file():
        path.unlink()
        return True
    return False
