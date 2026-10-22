# Issues & Fixes — the MockMan debugging log

Every real bug, environment trap, and design correction we hit building
MockMan, with the root cause and the fix. Written so future-us (and anyone
forking this) recognizes these shapes faster than we did.

Organized by subsystem, roughly in the order they bit us.

---

## 1. Speech-to-text (Apple SpeechAnalyzer)

### 1.1 Spurious "downloading assets" message on every call
**Symptom:** `transcribe` printed "downloading on-device speech assets" even when nothing downloaded.
**Cause:** `AssetInventory.assetInstallationRequest(supporting:)` returns a non-nil request object even for installed assets.
**Fix:** check `AssetInventory.status(forModules:) == .supported` first; only then request installation.
**Lesson:** "request" objects are not evidence of missing assets.

### 1.2 Zero-length audio hangs transcription forever
**Symptom:** a 0-frame WAV (empty recording) made the transcriber spin 163s+ with no output.
**Cause:** `SpeechAnalyzer`'s results stream never terminates on empty audio.
**Fix:** three layers — the Swift binary exits instantly when `audioFile.length == 0`; the orchestrator skips files under ~10KB; a 60s subprocess timeout degrades to "didn't catch that".
**Lesson:** never trust a stream's end condition on degenerate input; bound every external call.

### 1.3 STT hallucinates on silence
**Symptom:** long quiet tails produced phantom lines ("Okay. okay? Everything okay?").
**Mitigation:** prompt users to stop promptly; VAD/silence-trim is on the roadmap.
**Lesson:** Whisper-family decoders hallucinate given silence; cut audio at the edges.

## 2. Microphone capture (record.swift)

### 2.1 First recorder wrote a 0-byte WAV
**Symptom:** recording produced a valid header, zero frames.
**Cause (two):** AVAudioConverter misuse from the tap thread, and `exit(0)` skipped file finalization (unflushed header).
**Fix:** rewrite — write the mic's native format directly (the transcriber accepts anything `AVAudioFile` reads), and explicitly nil the file handle before exit to force a flush.
**Lesson:** format conversion you don't need is a bug farm; and unclosed audio files are silent data loss.

### 2.2 The stale-Enter bug (worst UX bug of the CLI era)
**Symptom:** turn 2's recording stopped instantly with 0 frames.
**Cause:** an Enter pressed while the interviewer was still speaking sat in the terminal buffer; the next recorder run consumed it immediately.
**Fix (three layers):** `termios.tcflush` before recording (TTY only); a 1-second grace period inside the recorder that drains any input arriving at startup (works for pipes too); an empty-recording guard with a clear user hint.
**Lesson:** input queued before your prompt is not input to your prompt. The web UI's "mic locked while Riya speaks" rule is the same bug's final form.

### 2.3 Mic permission missing in CLI context
**Fix:** explicit `AVCaptureDevice.authorizationStatus(for: .audio)` check + request, with a pointer to System Settings on denial.

## 3. Text-to-speech (Kokoro / mlx-audio)

### 3.1 `misaki[en]` doesn't build on Python 3.14
**Cause:** the `[en]` extra pulls spacy/thinc, which had no cp314 wheels (source build fails).
**Fix:** install plain `misaki` + `num2words`, `spacy --only-binary :all:`, `phonemizer-fork`, `espeakng-loader` — the English G2P path's actual needs.
**Lesson:** install extras' full trees only after the minimal path proves insufficient; `--only-binary` reveals whether wheels exist at all.

### 3.2 Kokoro crashed on any out-of-dictionary word
**Symptom:** `TypeError: NoneType + str` on sentences containing "Redis".
**Cause:** misaki's espeak fallback returns None when the `espeak-ng` *system binary* is absent (pip packages alone aren't enough).
**Fix:** `brew install espeak-ng` — mandatory for tech vocabulary.
**Lesson:** a Python package named `espeakng-loader` does not imply the espeak binary exists; test with genuinely out-of-dictionary words.

### 3.3 Tech-word pronunciation ("Riddies", "Kubernettis")
**Fix:** a respelling lexicon (`Redis→Red-iss`, `Kubernetes→Koo-ber-net-iss`, `dedup→dee-doop`, `Groww→Grow`) applied pre-synthesis.
**Verification trick:** we transcribed the generated audio with our own STT and checked the round-trip text — STT and TTS as each other's test harness, since we can't listen objectively.

### 3.4 mlx-audio CLI flag mismatch
`--file-prefix` rejected; the real flag is `--file_prefix`. Read `--help`, not memory.

## 4. Environment & packaging

### 4.1 Homebrew deleted our Python mid-build (the incident)
**Symptom:** venv broke *while in use* — `.venv/bin/python` dangling.
**Cause:** `brew install espeak-ng` triggered a cleanup that removed `python@3.14` (it was dependency-installed, so brew reclaimed it).
**Fix:** project-local Python 3.12 via python-build-standalone in `.python/`; venv symlinks point inside the project.
**Lesson:** never anchor a project to a package manager you don't control. This is now the distribution pattern for other users too.

### 4.2 .gitignore inline comments silently broke ignores
**Symptom:** `git ls-files` offered to track `.python/` (73MB) and `.venv/` (1.4GB).
**Cause:** `.gitignore` has no inline comments — `sessions/   # comment` matches a literal directory named `sessions/   # comment`.
**Fix:** comments on their own lines only. Verified with `git check-ignore -v`.
**Lesson:** this nearly shipped 1.5GB of runtime to a public repo. Always `git status` before the first commit.

### 4.3 opencode `run` blocks on non-TTY stdin
**Symptom:** the orchestrator hung at setup whenever stdin was a pipe.
**Cause:** `opencode run` reads piped stdin until EOF.
**Fix:** `stdin=subprocess.DEVNULL` on every spawn.
**Lesson:** CLIs that "helpfully" read stdin break pipelines; assume it, defend against it.

### 4.4 500 on join when launched from the .app (bare PATH)
**Cause:** GUI-launched processes inherit Finder's PATH (`/usr/bin:/bin:…`); `~/.opencode/bin` comes from shell profiles, which never ran.
**Fix (three layers):** `brain.py` resolves the binary explicitly (PATH → `~/.opencode/bin/opencode`); the launcher exports user-level PATH entries; the endpoint returns a clean 502 with the reason instead of a raw 500.
**Lesson:** "works in my terminal" ≠ works when double-clicked. Test with `env -i`.

### 4.5 Launcher restart race
**Cause:** `stop` returned before uvicorn released the port; the restart's bind failed.
**Fix:** `stop` waits for actual process death (SIGKILL fallback after 15s); PID file removed on quit so `status` never lies.

## 5. Web UI — backend

### 5.1 Interviewer audio overwrote itself
**Symptom:** the opening question's wav got replaced by the first response.
**Cause:** interviewer files were named by the *answer* turn counter.
**Fix:** separate `question_seq` counter; replay files never collide.
**Lesson:** two sequences in one namespace eventually collide.

### 5.2 End-call blocked the UI for ~40s
**Fix:** `/end` returns in ~16ms; feedback → TTS → report → question-extraction run in a background thread, then the in-memory session closes. Idempotent on double-click. Zero-answer sessions are discarded with no feedback call at all.

### 5.3 opencode export JSON quirks
**Two:** a human banner line precedes the JSON (parse from the first `{`), and exported user messages arrive wrapped in literal double quotes (strip them).

### 5.4 WAV durations: naive header math is wrong for AVAudioFile
**Cause:** AVAudioFile pads headers with JUNK and FLLR chunks, so `fmt`/`data` aren't at fixed offsets.
**Fix:** a proper RIFF chunk walker (2-byte-aligned chunk iteration) — handles recorder Float32/48k and browser PCM16/16k identically.

## 6. Web UI — frontend

### 6.1 The TDZ crash ("Join doesn't work")
**Symptom:** blank screen on Join; no network call fired.
**Cause:** `applyChat` was referenced in a `useCallback` deps array *above* its `const` declaration — a temporal-dead-zone ReferenceError at render, unmounting the whole tree.
**Fix:** declaration order discipline — callbacks before their consumers.
**Lesson:** closure *bodies* can reference later declarations; deps *arrays* evaluate immediately. Only the latter throws. Also: no-server-call in the log was the tell that the failure was render-side.

### 6.2 Overlapping audio / fake pause
**Cause:** every playback created a fresh `Audio()`; clicking "pause" started a second copy.
**Fix:** one module-level managed player — new play stops the current, replay buttons are true toggles, leaving a screen kills sound.

### 6.3 Camera stayed on after leaving
**Cause:** cleanup lived in the Call screen's unmount only; green-room's Back path never killed the stream.
**Fix:** an App-level invariant — *if the active screen is neither green-room nor call, no camera stream may exist.* Every exit path covered by construction.
**Lesson:** resource cleanup keyed to screens belongs at the router level, not the component level.

### 6.4 Transcript tab rendered garbage
**Cause:** the transcript parser split on speaker markers but the header block occupied pair-slot 0, shifting every (label, text) pair — the first bubble literally read "**🤖 Interviewer**".
**Fix:** walk markers with `matchAll`, slice text *between* them; preamble can never pollute pairs.

### 6.5 Zoom problem-board scrollbar flash
**Causes (two):** the board's `translateX` entrance poked outside its grid track (horizontal), and fixed `aspect-ratio` tiles pushed past the viewport when the 300px sidebar appeared (vertical).
**Fix:** the call screen is viewport-bounded (`100vh`, `overflow: hidden`) with flexing tiles; the sidebar board fades in without translation; toggling animates `grid-template-columns` 300px↔0 so the stage stretches smoothly.
**Lesson:** meeting UIs don't page-scroll. Bounded canvas, flexible children.

## 7. Design corrections (not bugs, but real reversals)

| First version | Shipped version | Why |
|---|---|---|
| Chat as full conversation thread | Chat as **problem board** (artifacts only) | user: questions/code belong there; conversation belongs in captions |
| Click-to-toggle mic | hold-to-talk | forgot-to-stop failure mode |
| Blocking end-call | instant close + background wrap-up | the meeting must *feel* hung up |
| Fake browser URL chrome | removed | the one decorative lie too many |
| `say` TTS | Kokoro + lexicon | "ridis" was the last straw |

## Meta-lessons

1. **Test harnesses you can hear:** we verified TTS with STT and STT with `say`-generated audio — the pipeline tested itself.
2. **Every external process gets a timeout and DEVNULL stdin.**
3. **Preamble-proof parsing; counters never shared between sequences.**
4. **Cleanup invariants belong at the highest level of the app, not in components.**
5. **The bug you fix in the CLI returns in the GUI wearing a new coat** (stale-Enter → mic-lock). Fix the class, not the instance.
