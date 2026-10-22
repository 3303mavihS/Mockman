# MockMan — progress & roadmap

## ✅ Done (v1)

- [x] Voice loop end-to-end: mic → on-device STT → interviewer agent → neural TTS
- [x] `record.swift` — mic CLI (Enter to stop, 1s stale-input grace, signal-safe)
- [x] `transcribe.swift` — Apple SpeechAnalyzer STT (on-device, ~57× realtime, empty-audio guard)
- [x] Interviewer persona — `.opencode/agent/interviewer.md` (tools disabled, probe-always rules, feedback mode)
- [x] Kokoro neural TTS via MLX — persistent in-process model, `say` fallback
- [x] Pronunciation lexicon (Redis/Kubernetes/dedup/…) verified by STT round-trip
- [x] Status spinners with elapsed time per stage
- [x] Session storage: `sessions/<date>/<id>/` with wavs + live transcript.md + auto report.txt + session.json
- [x] `metrics.py` — pace, filler rate, answer lengths, token usage & cost per session
- [x] Robustness: stdin flush, transcription timeout, clean Ctrl+C, EOF-safe piped runs
- [x] Project-local Python 3.12 (survives Homebrew upgrades)
- [x] Repo hygiene: .gitignore (sessions/private data never tracked), README, thought-process doc

## 🔲 Next up

- [ ] **Brain adapters** — Claude Code (`claude -p --resume`), Gemini CLI (`gemini -p`), Ollama (local, $0); stateless-history fallback for arbitrary CLIs. The seam (`ask_interviewer`) already exists
- [ ] **Streaming pipeline** — read LLM tokens as they arrive → sentence-chunk → TTS → play; target ~6s turn latency (from ~15–20s)
- [ ] **Web UI** — browser mic + playback (retires both Swift CLIs), live transcript view, session-history sidebar reading `sessions/`
- [ ] **`install.sh`** — one-command setup replacing README steps 1–4

## 🔲 Later

- [ ] Cross-session analytics — filler rate / pace trend across sessions ("am I improving?")
- [ ] Pause detection from STT word timestamps (long-silence flagging mid-answer)
- [ ] Feedback that cites the metrics ("you um'd 19× in your opener")
- [ ] VAD / trailing-silence trim (kills STT hallucinations on quiet audio)
- [ ] Cross-platform: whisper.cpp + Piper backends behind the existing seams
- [ ] Demo GIF in README (asciinema or screenshot)
- [ ] Filler-word config (custom words beyond um/uh/erm/hmm)

## 🧊 Icebox (ideas, uncommitted)

- System-design mode with a shared notepad/whiteboard
- Multiple interviewer personalities (friendly / hostile / FAANG-bar-raiser)
- Company-specific question banks fed via the context file
- Export session as shareable audio podcast
