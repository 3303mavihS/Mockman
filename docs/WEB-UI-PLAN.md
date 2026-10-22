# MockMan Web UI — Plan & Checkpoints

Source of truth for the web build. Update this file when decisions change or
checkpoints complete. Last updated: 2026-10-22.

## Product framing

MockMan-the-platform simulates the *entire interview ritual*, because realism
is the training effect: dashboard → set up interview → pick call platform
theme → green room (mic/cam check) → waiting room → grid call → end call →
feedback. The app **idles at the platform** when launched; a session exists
only once the user "joins the meeting".

## Locked decisions

| Decision | Choice | Reason |
|---|---|---|
| Mic interaction | **Hold-to-talk** (Space or button), on-screen hint | click-toggle risks forgetting to stop (learned from CLI stale-Enter bug) |
| Mic while interviewer speaks | **disabled** | same bug class as stale-Enter; prevent recording over TTS playback |
| Stack | **FastAPI backend + React (Vite) frontend** | maintainability; future UI features (persona editing) |
| Candidate tile | **real webcam via getUserMedia, toggleable** | realism; default on |
| Interviewer tile | **audio-reactive avatar + name label** (no fake video) | honest, no trademark/stock issues |
| Chat | **technical rounds only** (DSA/sysdesign): question in chat, code-formatted answer | keeps behavioral rounds voice-real |
| Themes | Meet-style first, Zoom-style second; **inspired-by, no copied assets/logos** | trademark safety for public repo |
| Launcher | `mockman` command + optional Automator `.app`; starts server + opens browser | no terminal flow for the user |
| Live captions | yes — interviewer speech + candidate transcript shown caption-style | realism + catch STT errors live |
| Realism beats | waiting room, meeting timer, "recording" dot, mic-check green room | cheap, high vibe value |
| Persona management | UI lists/edits markdown persona files in `.opencode/agent/` | persona-as-file stays the contract |
| Resume | profile-level upload, overridable per interview | daily practice shouldn't re-upload |
| Post-session | metrics report + LLM question-extraction pass → `feedback.json` | powers review/replay/weak-points views |

## Target file layout

```
mockman/
├── interview.py          # CLI frontend (thin, kept working)
├── metrics.py
├── core/                 # ← Phase 0: engine shared by CLI + server
│   ├── stt.py            #   transcribe() via Apple Speech binary
│   ├── brain.py          #   ask_interviewer() via opencode (adapter seam)
│   ├── tts.py            #   Speaker (Kokoro, pronunciation lexicon)
│   ├── sessions.py       #   create/list/load sessions, finalize
│   └── personas.py       #   list/read/write persona markdown files
├── server.py             # ← Phase 1: FastAPI app (127.0.0.1 only)
├── webui/                # ← Phase 2+: Vite + React app
└── sessions/             # user data (gitignored)
```

Key conventions:
- Core is **UI-free**: no prints/spinners inside `core/`; frontends wrap calls
  with their own status UX (CLI spinners / WS events).
- Browser sends **PCM16 mono 16kHz WAV** (AudioWorklet encoder) → existing
  `transcribe` binary works unchanged.
- WS events: `state` (listening|thinking|speaking), `caption` (who, text),
  `turn` (n), `ended`.

## Phases & checkpoints

### Phase 0 — Core refactor ✅ (2026-10-22)
- [x] 0.1 `core/` package: stt, brain, tts, sessions, personas extracted from interview.py
- [x] 0.2 session store: `list_sessions()`, `load_session(day, sid)` (transcript + report + separate answer/interviewer audio lists)
- [x] 0.3 persona store: `list_personas()`, `read_persona()`, `write_persona()`
- [x] **CHECKPOINT 0 ✅:** CLI ran a full turn over core/ (garbled "3Ds" → Riya recovered "probably with Redis" → eviction follow-up); session folder + transcript.md written.

### Phase 1 — FastAPI backend (bind 127.0.0.1)
- [x] 1.1 scaffold + `GET /api/health`; serves `webui/dist` when built
- [x] 1.2 REST: `GET /api/sessions`, `GET /api/sessions/{day}/{sid}`, `GET/PUT /api/personas[/{id}]` (path-traversal-guarded)
- [x] 1.3 interview: `POST /api/interview/start|answer|end` (REST-only for v1: client shows "thinking/speaking" while the request is in flight; **WS `/ws/interview/{id}` live-event channel deferred to Phase 3** where the call UI needs captions/state pushes)
- [x] 1.4 audio: answer wav upload → transcript; interviewer replies → `interviewer_N.wav` (own sequence counter — separate from answer_N numbering; bug found & fixed: opening audio was being overwritten) → `GET /api/sessions/{day}/{sid}/audio/{file}` (validated filename regex)
- [ ] 1.5 post-session job: LLM question-extraction → `feedback.json` (deferred — do with Phase 2 review UI)
- [x] **CHECKPOINT 1 ✅:** curl drove start → wav answer → end via API; transcript, response audio, feedback, report.txt, session.json all correct. (Notes: `POST /api/setup` merged into `/interview/start` fields; resume upload endpoint pending with Phase 2 settings UI.)

### Phase 2 — Platform shell (React)
- [ ] 2.1 Vite scaffold, router, dark theme base
- [ ] 2.2 Dashboard: session cards (date, role, duration, pace/filler chips)
- [ ] 2.3 Session detail: transcript + report + per-turn audio replay
- [ ] 2.4 Settings: persona picker + markdown editor, interviewer name, resume upload
- [ ] **CHECKPOINT 2:** browse & replay a past session entirely in browser. `git commit`.

### Phase 3 — Simulation (Meet-style) — built 2026-10-22
- [x] 3.1 setup screen (role, round type, theme picker; Zoom pill disabled "soon")
- [x] 3.2 green room: webcam preview + mic level meter + Join (graceful permission-denied states)
- [x] 3.3 waiting-room beat — doubles as the /start latency cover ("Riya will let you in shortly")
- [x] 3.4 call screen: grid, interviewer tile (pulse-ring avatar), webcam tile (toggleable), control bar (mic/cam/captions/end), timer, recording dot
- [x] 3.5 hold-to-talk (Space + button, mouse+touch), mic locked while speaking/processing, captions toggle
- [x] 3.6 call-ended screen with feedback + saved-session path
- [ ] **CHECKPOINT 3:** full voice interview in browser, zero terminal — **needs human test** (getUserMedia mic/cam can't be scripted headlessly here). Browser WAV capture is new code: AudioWorklet → downsample → PCM16 WAV.
- Notes: no react-router (state-machine screens); StrictMode OFF on purpose (Call mounts fire /start); webcam stream shared green-room → call via ref.

### Phase 4 — Technical rounds via chat
- [ ] 4.1 chat panel; 4.2 technical flow (question→chat, code answers); 4.3 persona chat instructions
- [ ] **CHECKPOINT 4:** complete a technical round with a code answer via chat. `git commit`.

### Phase 5 — Zoom theme + launcher
- [ ] 5.1 Zoom theme; 5.2 `mockman` command + .app (idle-until-join); 5.3 README/demo
- [ ] **CHECKPOINT 5:** double-click app → dashboard → join → interview. Ship web v1.
