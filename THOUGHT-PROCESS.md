# Thought Process — how MockMan got designed

A decision log, written while building. Each entry: the question, the options, what we chose, and *why*. Intended for us (so future-us remembers) and for anyone forking this (so they know which decisions to revisit for their constraints).

---

## 0. The thesis

> Mock-interview platforms are "some GPT wrapper" — they ask questions based on a role, record your audio, transcribe it with some tool, send the transcript to the wrapper, and play the response back. And charge a subscription for it.

If the moat is the pipeline and not the model, the pipeline is buildable locally. Everything below follows from testing that claim.

## 1. Speech-to-text: three candidates, one winner

| Candidate | What it is | Verdict |
|---|---|---|
| **whisper.cpp** | Whisper reimplemented in C/C++ (llama.cpp author's sibling project). GGML weights, quantization, CoreML/Metal on Mac, runs everywhere | Parked as the **cross-platform fallback** |
| **mlx-whisper** | Whisper on Apple's MLX framework (unified memory — no CPU↔GPU copies). Fastest Whisper on M-series, pure pip install | Strong, but Apple-only *and* needs a model download |
| **Apple SpeechAnalyzer** (`Speech` framework, macOS 26) | The on-device engine behind Voice Memos / Notes transcription, opened to developers at WWDC25 | ✅ **Chosen** |

**Why SpeechAnalyzer:** zero install, zero model files to manage (the OS owns the assets), free, on-device, includes timestamps. We built a ~50-line Swift CLI around it and measured **~57× realtime** on a 2.5-minute human recording (2.6s). Quality on real speech: excellent; it even captures "um/uh" fillers, which later became the analytics feature.

**Key product insight discovered during testing:** the transcript doesn't need to be perfect — it needs to be *intelligible to the interviewer LLM*. A garbled "they try handling" in the context of a data-migration answer is enough for the LLM to ask "how did you validate consistency during cutover?" The persona is explicitly instructed to interpret charitably (see §3).

## 2. The brain: use what's already authenticated

Options: Ollama (local), llama.cpp, MLX-LM, or **opencode already installed and authenticated on the machine**.

Chose **opencode as the first brain**, with a twist: the interviewer is a *custom agent* defined in `.opencode/agent/interviewer.md` with **all tools denied** (no bash, no edit, no file access — it can only talk). The persona is a markdown file; editing the interviewer is editing text.

The brain is isolated behind one function — `ask_interviewer(message, session_id)` — so Claude Code (`claude -p --resume`), Gemini CLI (`gemini -p`), and Ollama are all ~20-line adapters away. That seam is the GitHub-release story.

**Discovered during testing:** `opencode run` reads non-TTY stdin and blocks until EOF — piped orchestration hung until we passed `stdin=DEVNULL`.

## 3. The persona is the product (rule design)

The interviewer file encodes what makes sessions useful:

- **Spoken-language only** — no markdown, no lists; everything is read aloud by TTS
- **2–4 sentences, exactly one question** per turn
- **Charitable STT interpretation** — transcripts have errors; infer intent, clarify only when truly ambiguous. (Verified live: "idempatum" → understood as *idempotent*, followed up correctly)
- **Always probe once** — scale, trade-offs, personal contribution, what went wrong
- **A separate feedback mode** triggered by saying "end the interview"
- **Tone pass** (added after real use): contractions, short sentences, "So/Right/Okay" openers — because the first version sounded like it was reading an essay

## 4. Text-to-speech: the three-ladder escalation

1. **macOS `say`** — zero install, robotic, and said "Redis" as "ridis". Good enough to prove the loop; not good enough to use.
2. **Apple Enhanced voices** — free download in Settings, big jump, still `say`.
3. **Kokoro-82M via mlx-audio** — neural TTS on the GPU. ✅ **Chosen.**

Kokoro findings that cost real debugging:

- **OOD words crash without espeak-ng.** "Redis", "dedup", "Kubernetes" aren't in its dictionary → grapheme-to-phoneme fallback → needs the `espeak-ng` system binary → `brew install espeak-ng` is *mandatory*, not optional, for a tech-interview tool.
- **Pronunciation lexicon.** Even with the fallback, "Redis" came out "Riddies". Fix: a small respelling dict (`Redis→Red-iss`, `Kubernetes→Koo-ber-net-iss`, `dedup→dee-doop`) applied to every response pre-synthesis.
- **Verification trick:** we can't listen objectively, so we verified pronunciation by *transcribing the generated audio with our own STT* and checking the round-trip text. STT↔TTS as each other's test harness.
- **Latency math:** loading Kokoro takes ~10s, so the model is loaded once at startup and kept in-process; generation per turn is a few seconds. (Next optimization: sentence-level streaming.)

## 5. Mic capture: Swift again, and the bug that shaped it

A second tiny Swift CLI (`AVAudioEngine` tap → WAV, Enter to stop) — chosen over PortAudio/sox/ffmpeg to keep **zero brew dependencies for the core loop**.

Real usage immediately exposed the classic input bug: **an Enter pressed while the interviewer is still speaking sits in the terminal buffer and instantly kills the *next* recording** (0 frames). Fixes, in layers: stdin flush before recording (TTY), a 1-second grace period in the recorder that drains stale input (works for pipes too), an empty-file guard, and a 60s transcription timeout.

Related discovery: **zero-length audio makes SpeechAnalyzer's results stream never terminate** — the transcriber now exits instantly on empty files.

## 6. The Homebrew incident (why `.python/` exists)

Mid-build, `brew install espeak-ng` triggered a cleanup that **removed Homebrew's python@3.14** (it had been dependency-installed, so brew reclaimed it), killing the venv that was symlinked to it — *while we were using it*.

Lesson: never anchor a project to a package manager you don't control. MockMan now carries a **project-local Python 3.12** (python-build-standalone, downloaded into `.python/`), and the venv symlinks point inside the project. Immune to brew, reproducible for others, and the right pattern for distribution anyway.

## 7. Metrics: the paid-feature that fell out for free

Because sessions persist (opencode session JSON) and every answer is a WAV file, analytics cost almost nothing: word counts, pace (wpm), filler-word rate, per-answer table, and **exact token accounting** from opencode's per-message metadata.

First real session: 9 answers, 2,026 words, 122 wpm, **80 fillers (4.8/min)**, $0.0463 estimated. The filler-rate-over-time trend across sessions is the actual self-improvement signal — on the roadmap.

## 8. Storage & privacy model

```
sessions/<YYYY-MM-DD>/<opencode-session-id>/
├── answer_N.wav    ← recordings, per turn
├── transcript.md   ← written live after every turn (crash-safe)
├── report.txt      ← metrics, auto-generated at exit
└── session.json    ← raw export (portable)
```

Everything under `sessions/` is gitignored. What leaves the machine: transcript text → your chosen LLM provider, nothing else. With a local Ollama brain, nothing at all.

## 9. The web platform era (decisions after the CLI worked)

Moving to a browser frontend surfaced a second wave of design decisions:

- **The platform simulates the ritual, not just the Q&A.** Dashboard → setup → green room (device check) → waiting room → call → ended → review. The realism *is* the training effect. The app idles at the dashboard; an interview exists only after "join" — that one rule kept every lifecycle sane.
- **Warm light for prep/review, dark studio for the live call.** The user's design concepts set this deliberately: two moods, one app. The palette (olive-charcoal + chartreuse) went app-wide from the meeting concept.
- **The problem board, not a chat.** First we put the whole conversation in the chat panel; the correct model is a one-way board — only interviewer artifacts (problem statements, code) live there. Conversation stays in captions. Product lesson: the panel is a *shared whiteboard*, not a message log.
- **Hold-to-talk over toggle.** Click-to-toggle forgets to stop. Holding Space is impossible to forget. (And the mic is hard-locked while the interviewer speaks — the CLI's stale-Enter bug in its final form.)
- **Hang up means hang up.** End-call used to block ~40s on feedback generation; now it closes in ~16ms and the wrap-up (feedback, report, analysis) runs in a background thread. Zero-answer sessions are discarded with no LLM call at all.
- **Browser audio replaces the Swift CLIs on the web path** — AudioWorklet → downsample → PCM16 WAV is exactly what the transcriber already eats. The Swift binaries remain for terminal mode.
- **One audio player, ever.** Overlapping playback was impossible to pause because each play made a new `Audio()`. A single managed player with toggle semantics ended the class of bug.
- **Cleanup invariants live at the router.** The camera-leak fix wasn't in any component — it's an App-level rule: *no camera stream may exist off the green-room/call screens.*
- **Startup is a feature.** Background voice warmup (health never blocks), a PID-filed launcher with start/stop/restart/status/logs, a Quit button in the UI, and a hand-built MockMan.app with a real icon — because "go to the terminal to start the tool" was a stated non-goal.
- **GUI ≠ terminal environment.** The bare-PATH 500 (opencode invisible to Finder-launched processes) is now handled by explicit binary resolution + launcher PATH exports — and verified under `env -i`.

The full bug-by-bug account lives in [docs/ISSUES-AND-FIXES.md](docs/ISSUES-AND-FIXES.md).

## What we'd revisit

- **Latency** (~15–20s/turn): LLM call dominates; streaming LLM→sentence-chunked TTS gets it to ~6s.
- **Trailing-silence STT hallucinations**: press Space promptly, or add VAD/silence-trim.
- **Cross-platform**: whisper.cpp + Piper behind the existing seams.
- **Brain choice per user**: the `ask_interviewer` seam is ready for Claude Code / Gemini CLI / Ollama adapters.
