"""MockMan core engine — shared by the CLI (interview.py) and the web
server (server.py). Nothing in here prints or drives UI; frontends wrap
these calls with their own status UX (CLI spinners / WebSocket events)."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
