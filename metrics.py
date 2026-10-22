#!/usr/bin/env python3
"""MockMan session analytics.

Usage:
    .venv/bin/python metrics.py <opencode-session-id> [wav-directory]

Cross-references the opencode session transcript with the local
answer_N.wav recordings to report speaking pace, filler words, and
interview structure. wav-directory defaults to the project root.
"""

import json
import re
import subprocess
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ANSWER_PREFIX = "Candidate's answer (speech transcript):"
FILLER_RE = re.compile(r"\b(um+|uh+|erm+|hmm+)\b", re.IGNORECASE)


def wav_duration(path: Path) -> float | None:
    """record.swift always writes 48kHz mono Float32 WAV with a 4KB header."""
    try:
        size = path.stat().st_size
        if size <= 4096:
            return None
        return (size - 4096) / (48000 * 4)
    except OSError:
        return None


def export_session(session_id: str) -> dict:
    out = subprocess.run(["opencode", "export", session_id],
                         capture_output=True, text=True, check=True)
    # stdout may carry a human banner line before the JSON payload
    return json.loads(out.stdout[out.stdout.index("{"):])


def message_text(msg: dict) -> str:
    text = "".join(
        p.get("text", "") for p in msg.get("parts", []) if p.get("type") == "text"
    ).strip()
    # exported user messages arrive wrapped in literal double quotes
    return text.strip('"')


def compute(data: dict, wav_dir: Path) -> dict:
    """Machine-readable metrics — also saved as report.json for the web UI."""
    msgs = data["messages"]
    answers, questions = [], []
    for m in msgs:
        role = m["info"]["role"]
        text = message_text(m)
        if role == "user" and text.startswith(ANSWER_PREFIX):
            answers.append(text[len(ANSWER_PREFIX):].strip())
        elif role == "user" and text.startswith(("SETUP:", "END INTERVIEW")):
            continue
        elif role == "assistant" and text:
            questions.append(text)

    rows, total_dur, total_words, total_fillers = [], 0, 0, 0
    for i, ans in enumerate(answers, start=1):
        dur = wav_duration(wav_dir / f"answer_{i}.wav")
        words = len(ans.split())
        fillers = len(FILLER_RE.findall(ans))
        wpm = words / dur * 60 if dur else 0
        total_dur += dur or 0
        total_words += words
        total_fillers += fillers
        rows.append({"turn": i, "seconds": round(dur or 0), "words": words,
                     "wpm": round(wpm), "fillers": fillers,
                     "preview": ans[:60]})

    t_in = t_out = t_reason = t_cache = 0
    cost = 0.0
    for m in msgs:
        if m["info"]["role"] != "assistant":
            continue
        t = m["info"].get("tokens") or {}
        t_in += t.get("input", 0)
        t_out += t.get("output", 0)
        t_reason += t.get("reasoning", 0)
        t_cache += (t.get("cache") or {}).get("read", 0)
        cost += m["info"].get("cost") or 0.0
    est_cost = cost if cost > 0 else t_in * 3e-6 + t_out * 15e-6 + t_cache * 0.3e-6

    return {
        "turns": rows,
        "totals": {
            "speaking_seconds": round(total_dur),
            "words": total_words,
            "avg_wpm": round(total_words / (total_dur / 60)) if total_dur else 0,
            "fillers": total_fillers,
            "fillers_per_min": round(total_fillers / (total_dur / 60), 1) if total_dur else 0,
            "interviewer_turns": len(questions),
        },
        "tokens": {"input": t_in, "output": t_out, "reasoning": t_reason,
                   "cache_read": t_cache},
        "cost_usd": round(est_cost, 4),
    }


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("usage: metrics.py <opencode-session-id> [wav-directory] [--json]")
    as_json = "--json" in sys.argv
    positional = [a for a in sys.argv[1:] if not a.startswith("--")]
    wav_dir = Path(positional[1]) if len(positional) > 1 else ROOT
    data = export_session(positional[0])
    msgs = data["messages"]

    answers, questions = [], []
    for m in msgs:
        role = m["info"]["role"]
        text = message_text(m)
        if role == "user" and text.startswith(ANSWER_PREFIX):
            answers.append(text[len(ANSWER_PREFIX):].strip())
        elif role == "user" and text.startswith(("SETUP:", "END INTERVIEW")):
            continue
        elif role == "assistant" and text:
            questions.append(text)

    if as_json:
        print(json.dumps(compute(data, wav_dir), indent=2))
        return

    print(f"\n📊 MockMan session report — {positional[0]}")
    print(f"   agent: {data['info'].get('agent')} | turns analyzed: {len(answers)}\n")

    total_dur = total_words = total_fillers = 0
    print(f"{'turn':<6}{'audio':>7}{'words':>7}{'wpm':>6}{'um/uh':>7}   answer preview")
    print("—" * 78)
    for i, ans in enumerate(answers, start=1):
        dur = wav_duration(wav_dir / f"answer_{i}.wav")
        words = len(ans.split())
        fillers = len(FILLER_RE.findall(ans))
        wpm = words / dur * 60 if dur else 0
        total_dur += dur or 0
        total_words += words
        total_fillers += fillers
        preview = ans[:42] + ("…" if len(ans) > 42 else "")
        dur_s = f"{dur:.0f}s" if dur else "  —"
        print(f"{i:<6}{dur_s:>7}{words:>7}{wpm:>6.0f}{fillers:>7}   {preview}")

    print("—" * 78)
    n = max(len(answers), 1)
    print(f"\n⏱️  total speaking time : {total_dur/60:.1f} min (incl. pauses before Enter)")
    print(f"🗣️  words spoken        : {total_words}  (avg {total_words/n:.0f}/answer)")
    print(f"🏃 avg pace            : {total_words/(total_dur/60) if total_dur else 0:.0f} wpm"
          "  (conversational ≈120-150, presentations ≈100-130)")
    print(f"🌀 fillers             : {total_fillers} total "
          f"({total_fillers/(total_dur/60) if total_dur else 0:.1f}/min — target < 2/min)")
    print(f"❓ interviewer turns   : {len(questions)}")

    # ---- token / cost accounting (from opencode message metadata) ----
    t_in = t_out = t_reason = t_cache = 0
    cost = 0.0
    for m in msgs:
        if m["info"]["role"] != "assistant":
            continue
        t = m["info"].get("tokens") or {}
        t_in += t.get("input", 0)
        t_out += t.get("output", 0)
        t_reason += t.get("reasoning", 0)
        t_cache += (t.get("cache") or {}).get("read", 0)
        cost += m["info"].get("cost") or 0.0
    print(f"\n🪙 tokens              : {t_in + t_out + t_reason:,} total "
          f"({t_in:,} in / {t_out:,} out / {t_reason:,} reasoning) "
          f"+ {t_cache:,} cache-read")
    if cost > 0:
        print(f"💰 cost (actual)       : ${cost:.4f}")
    else:
        # rough frontier-API estimate if the provider reports no cost
        est = t_in * 3e-6 + t_out * 15e-6 + t_cache * 0.3e-6
        print(f"💰 cost (est. @frontier API rates): ${est:.4f}")

    if answers:
        longest = max(range(len(answers)), key=lambda i: len(answers[i].split()))
        print(f"\n💡 longest answer: turn {longest+1} ({len(answers[longest].split())} words)."
              " Note: audio duration includes thinking-out-loud pauses before you"
              " pressed Enter, so WPM reads slightly low.")


if __name__ == "__main__":
    main()
