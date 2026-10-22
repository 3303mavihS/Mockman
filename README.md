# MockMan 🎙️

**Local mock-interview practice that feels like the real thing.** A full platform: set up a round, pass a device check in the green room, join a Meet- or Zoom-style call, answer out loud to an AI interviewer with a neural voice — then review transcripts, replays, per-question coaching, and speaking metrics.

No subscriptions. Your voice and transcripts never leave your Mac (except answer text to *your chosen* LLM provider — or nowhere, with a local brain).

```
setup → green room (device check) → join → live call (voice + problem board)
      → end → auto-generated feedback, report & question analysis → review
```

---

## Why this exists

Every mock-interview platform is the same machine under the hood: your voice → speech-to-text → a GPT-style wrapper with a persona → text-to-speech → a paywall. The model was never the product — the *loop* was. MockMan is that loop, self-hosted:

- **~5¢/session** with a frontier API; **free** via Gemini CLI's free tier or a local Ollama model
- **Private by construction** — recordings, transcripts, and reports live in a gitignored `sessions/` folder on your disk
- **Measurable** — pace, filler words, answer structure, question-by-question verdicts, token cost

## The experience

| Surface | What you get |
|---|---|
| **Dashboard** | session history, lifetime stats (sessions, speaking minutes, average), report/analysis chips |
| **Setup** | role, round type (behavioral / technical / system design / mixed), persona picker, Meet/Zoom theme, resume+JD context |
| **Green room** | camera preview, live mic meter, real device dropdowns, session summary — join blocked until the mic is on |
| **The call** | Meet-style or Zoom-style room: webcam tile, audio-reactive interviewer avatar, live captions, hold-to-talk (Space), problem board for technical rounds, meeting timer |
| **Call ended** | instant hang-up; feedback/report/analysis generate in the background |
| **Review** | chat-style transcript with per-turn audio replay, speaking report with per-turn table, question-by-question coaching (strong/average/weak + notes), export as markdown |
| **Settings** | persona manager (create/edit/reset/delete interviewer personalities as markdown), resume profile, appearance (dark platform theme, accent color) |

## Architecture

```
webui/ (React + Vite)                platform + call UI
server.py (FastAPI, 127.0.0.1)       REST API over the engine
core/                                 the UI-free engine:
  stt.py      Apple SpeechAnalyzer (on-device, ~57× realtime)
  brain.py    interviewer LLM via opencode agent (adapter seam)
  tts.py      Kokoro-82M neural voice (MLX) + pronunciation lexicon
  sessions.py session store, metrics, traversal-safe lookups
  personas.py interviewer personas as editable markdown files
.opencode/agent/interviewer.md       Riya's persona (the interviewer's brain)
.opencode/agent/analyzer.md          post-session question extractor
record/transcribe (Swift)            native mic + STT CLIs (terminal mode)
interview.py                         the original terminal frontend
mockman                              launcher: start/stop/restart/status/logs
MockMan.app                          double-clickable launcher (machine-local)
```

## Requirements

macOS 26+ (Tahoe) on Apple Silicon · Xcode CLT (`swiftc`) · Homebrew (`espeak-ng`) · Node.js (frontend build) · [opencode](https://opencode.ai) CLI authenticated to any LLM provider

## Install

```bash
git clone https://github.com/3303mavihS/Mockman.git && cd Mockman

# 1. project-local Python 3.12 (self-contained; survives Homebrew upgrades)
curl -sL "https://github.com/astral-sh/python-build-standalone/releases/download/20261021/cpython-3.12.15%2B20261021-aarch64-apple-darwin-install_only.tar.gz" \
  -o /tmp/pbs.tar.gz && mkdir -p .python && tar -xzf /tmp/pbs.tar.gz -C .python --strip-components=1 && rm /tmp/pbs.tar.gz

# 2. python deps
.python/bin/python3.12 -m venv .venv
.venv/bin/pip install mlx-audio misaki num2words phonemizer-fork espeakng-loader "misaki[en]" fastapi "uvicorn[standard]" python-multipart pillow

# 3. Kokoro's grapheme-to-phoneme fallback (tech vocabulary!)
brew install espeak-ng

# 4. native helpers (terminal mode)
xcrun swiftc -O record.swift -o record
xcrun swiftc -O transcribe.swift -o transcribe

# 5. web UI
cd webui && npm install && npm run build && cd ..

# 6. optional: double-clickable app icon
#    (regenerates the machine-local MockMan.app launcher)
```

First run downloads the Kokoro voice model (~300MB, once) and asks mic/camera/speech permissions (once each).

## Run it

```bash
./mockman           # start server (if down) + open the app
./mockman status    # is it up?
./mockman stop      # shut down (or use the sidebar Quit button)
./mockman logs      # tail the server log
```

Or double-click **MockMan.app**. The app idles at the dashboard — an interview exists only once you join a meeting.

**Terminal mode** still works: `.venv/bin/python interview.py "Senior Backend Engineer" mixed ~/resume.txt`

## Configuration

| Knob | Where |
|---|---|
| Interviewer persona(s) | Settings UI, or `.opencode/agent/*.md` directly |
| Voice | `MOCKMAN_VOICE` env var (`af_heart`, `am_michael`, …) |
| TTS model | `MOCKMAN_TTS_MODEL` env var |
| Pronunciation fixes | `PRONUNCIATIONS` in `core/tts.py` |
| Port | `MOCKMAN_PORT` env var (default 8420) |

## Docs

- **[THOUGHT-PROCESS.md](THOUGHT-PROCESS.md)** — the design log: why SpeechAnalyzer over Whisper, persona-as-markdown, the TTS escalation ladder, the Homebrew incident
- **[docs/ISSUES-AND-FIXES.md](docs/ISSUES-AND-FIXES.md)** — every bug we hit and how it was fixed (the debugging playbook)
- **[docs/WEB-UI-PLAN.md](docs/WEB-UI-PLAN.md)** — the web platform plan with phase checkpoints
- **[TODO.md](TODO.md)** — what's done and what's next

## License

MIT — see [LICENSE](LICENSE).
