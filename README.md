# MockMan 🎙️

**Local mock-interview practice. Speak your answers, get grilled by an AI interviewer, get measured on how you did. No subscriptions. Your voice never leaves your Mac.**

```
🎙️ you speak → 📝 on-device transcription → 🧠 AI interviewer → 🔊 neural voice replies
```

---

## The problem

Every mock-interview platform is the same machine under the hood: your voice → speech-to-text → a GPT-style wrapper with a persona → text-to-speech → a subscription paywall. The model was never the product — the *loop* was. And the loop is buildable, locally, for free.

MockMan is that loop, self-hosted:

- **No subscription** — ~5¢/session with a frontier API, **free** with Gemini CLI's free tier or a local Ollama model
- **Private** — recordings and transcripts stay in a gitignored `sessions/` folder on your disk; the only thing that ever leaves the machine is transcript text sent to *your chosen* LLM provider (and nothing at all if you run a local brain)
- **Measurable** — every session ends with a report: speaking pace, filler-word rate, answer lengths, token cost

## Why macOS only (for now)

v1 is deliberately Mac-native, and it's a feature, not laziness:

1. **STT: Apple's `SpeechAnalyzer`** (macOS 26+) — the same engine that transcribes Voice Memos and Notes. On-device, zero downloads to manage, measured **~57× realtime** (a 2.5-minute answer transcribes in ~2.6s). No other platform hands you that for free.
2. **TTS: Kokoro-82M via MLX** — Apple's ML framework, running on Apple Silicon's unified memory. Neural-quality voice, fully offline.
3. **Mic capture: AVAudioEngine** — a tiny Swift CLI, no PortAudio/ffmpeg dependency.

The abstraction seams (`transcribe()`, `ask_interviewer()`, `Speaker`) are deliberate: `whisper.cpp` + Piper are the parked cross-platform fallbacks. See [TODO.md](TODO.md).

## Features

- 🎙️ **Voice-in, voice-out** interview loop — press Enter, answer out loud, press Enter
- 🧠 **Interviewer persona** that probes ("where does the dedup state live?"), interprets garbled transcripts charitably, and never breaks character
- 📄 **Resume/JD injection** — pass a context file and questions target *your* background
- 📊 **Per-session analytics** — pace (wpm), filler words ("um/uh") per minute, answer lengths, token usage & cost
- 🗂️ **Session archive** — every interview saved as `sessions/<date>/<id>/` with recordings, live transcript, report, and raw session export
- 🗣️ **Pronunciation lexicon** — Kokoro mispronounces "Redis"? One dict entry fixes it forever
- 🛡️ **Battle-tested UX guards** — stale-Enter immunity, empty-recording detection, transcription timeouts, clean Ctrl+C

## Requirements

| Thing | Why |
|---|---|
| macOS 26+ (Tahoe), Apple Silicon | SpeechAnalyzer API + MLX |
| Xcode Command Line Tools (`swiftc`) | compiles the two Swift CLIs |
| Homebrew | for `espeak-ng` (Kokoro's fallback for out-of-dictionary tech words) |
| A brain | [opencode](https://opencode.ai) (default), or any CLI LLM — see configuration |

## Install

```bash
git clone https://github.com/3303mavihS/Mockman.git && cd Mockman

# 1. project-local Python 3.12 (self-contained; survives Homebrew upgrades)
curl -sL "https://github.com/astral-sh/python-build-standalone/releases/download/20261021/cpython-3.12.15%2B20261021-aarch64-apple-darwin-install_only.tar.gz" \
  -o /tmp/pbs.tar.gz && mkdir -p .python && tar -xzf /tmp/pbs.tar.gz -C .python --strip-components=1 && rm /tmp/pbs.tar.gz

# 2. dependencies
.python/bin/python3.12 -m venv .venv
.venv/bin/pip install mlx-audio misaki num2words phonemizer-fork espeakng-loader "misaki[en]"

# 3. Kokoro's grapheme-to-phoneme fallback (tech vocabulary!)
brew install espeak-ng

# 4. compile the native helpers
xcrun swiftc -O record.swift -o record
xcrun swiftc -O transcribe.swift -o transcribe
```

First run downloads the Kokoro voice model (~300MB, once) and macOS will ask for microphone + speech-recognition permission (once each).

## Usage

```bash
# defaults: "Senior Backend Engineer", mixed interview
.venv/bin/python interview.py

# full form: role, type, and a file with your resume + target JD
.venv/bin/python interview.py "Senior Backend Engineer" mixed ~/resume-and-jd.txt

# different interviewer voice
MOCKMAN_VOICE=am_michael .venv/bin/python interview.py

# analytics for any past session (id is printed when a session ends)
.venv/bin/python metrics.py <session-id>
```

**Flow:** Riya speaks → press **Enter**, answer out loud, press **Enter** → she probes. Say **"end the interview"** for spoken structured feedback. `Ctrl+C` exits cleanly anytime. Every turn is logged to `sessions/<date>/<id>/transcript.md` *live* — a crash loses nothing.

## Configuration

| Knob | Where |
|---|---|
| Interviewer persona, tone, rules | `.opencode/agent/interviewer.md` — plain markdown, edit and rerun |
| Voice | `MOCKMAN_VOICE` env var (`af_heart`, `af_bella`, `af_nova`, `am_adam`, `am_michael`, …) |
| TTS model | `MOCKMAN_TTS_MODEL` env var |
| Pronunciation fixes | `PRONUNCIATIONS` dict at the top of `interview.py` |

## What a session report looks like

```
⏱️  total speaking time : 16.7 min
🗣️  words spoken        : 2026  (avg 225/answer)
🏃 avg pace            : 122 wpm  (conversational ≈120-150)
🌀 fillers             : 80 total (4.8/min — target < 2/min)
🪙 tokens              : 6,949 total + 43,644 cache-read
💰 cost (est.)         : $0.0463
```

## The story behind it

The decision log — why SpeechAnalyzer over Whisper, why a markdown file is the persona, the Homebrew incident that killed Python mid-build, the stale-Enter bug hunt — is in **[THOUGHT-PROCESS.md](THOUGHT-PROCESS.md)**. What's done vs. what's next lives in **[TODO.md](TODO.md)**.

## License

MIT — see [LICENSE](LICENSE).
