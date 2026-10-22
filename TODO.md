# MockMan — progress & roadmap

## ✅ Done

### Engine (CLI era)
- [x] Voice loop end-to-end: mic → on-device STT → interviewer agent → neural TTS
- [x] `record.swift` — mic CLI (Enter to stop, 1s stale-input grace, signal-safe)
- [x] `transcribe.swift` — Apple SpeechAnalyzer STT (on-device, ~57× realtime, empty-audio guard)
- [x] Interviewer persona — `.opencode/agent/interviewer.md` (tools disabled, probe-always rules, feedback mode, chat-channel rules)
- [x] Kokoro neural TTS via MLX — persistent in-process model, `say` fallback
- [x] Pronunciation lexicon, verified by STT round-trip
- [x] Robustness: stdin flush, transcription timeout, clean Ctrl+C, EOF-safe piped runs
- [x] Project-local Python 3.12 (survives Homebrew upgrades)
- [x] `metrics.py` — pace, fillers, per-turn table, token cost; text + `--json` output

### Web platform (all 6 phases — see docs/WEB-UI-PLAN.md)
- [x] FastAPI backend (127.0.0.1): sessions, personas, profile, interview lifecycle, audio
- [x] Post-session pipeline: report + analyzer persona → feedback.json (question verdicts, coaching notes)
- [x] Dashboard: stats cards, session list, report/analysis chips
- [x] Setup: role, round, persona picker, Meet/Zoom theme, resume+JD prefill
- [x] Green room: camera preview, mic meter, real device dropdowns, session summary
- [x] Call screens (both themes per approved designs): tiles, captions, hold-to-talk, problem board, timer, status bar; viewport-bounded, smooth board stretch
- [x] Ended screens: instant hang-up, background wrap-up, zero-answer discard; summary cards
- [x] Review: transcript bubbles + replay with durations, report table, question coaching, markdown export
- [x] Settings: persona manager (add/edit/reset/delete), resume+JD profile, appearance (dark theme + accent)
- [x] Startup: `./mockman` lifecycle (start/stop/restart/status/logs), MockMan.app with real icon, background voice warmup, Quit-from-UI

### Repo hygiene
- [x] .gitignore hardened (sessions, profile, runtimes, pid file)
- [x] README / THOUGHT-PROCESS / TODO / ISSUES-AND-FIXES / WEB-UI-PLAN docs

## 🔲 Next up

- [ ] **Brain adapters** — Claude Code (`claude -p --resume`), Gemini CLI (`gemini -p` free tier), Ollama (local, $0). The seam (`core/brain.py::ask_interviewer`) already exists; add a brain picker in Settings
- [ ] **Streaming pipeline** — LLM tokens → sentence-chunked TTS → play; target ~6s turn latency (from ~15–20s)
- [ ] **`install.sh`** — one-command setup (deps, Swift build, webui build, MockMan.app regeneration)
- [ ] WS live-event channel (server-push captions/state instead of request-scoped)
- [ ] README screenshots / demo GIF

## 🔲 Later

- [ ] Cross-session analytics — filler rate / pace trend ("am I improving?")
- [ ] Pause detection from STT word timestamps
- [ ] Feedback that cites metrics ("19 fillers in your opener")
- [ ] VAD / trailing-silence trim (kills silence hallucinations)
- [ ] Cross-platform: whisper.cpp + Piper backends behind the existing seams
- [ ] Persona presets shipped in-repo (Bar Raiser, Friendly) via `defaults/`

## 🧊 Icebox

- System-design mode with a shared notepad/whiteboard
- Company-specific question banks via the context field
- Session export as shareable audio
- Menubar app
