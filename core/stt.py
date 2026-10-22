"""On-device speech-to-text via the compiled Apple SpeechAnalyzer binary."""

import subprocess
from pathlib import Path

from . import ROOT

TRANSCRIBE_BIN = ROOT / "transcribe"


def is_empty_recording(wav_path: Path) -> bool:
    # AVAudioFile writes a ~4KB header; real speech is >100KB/s.
    return wav_path.stat().st_size < 10_000


def transcribe(wav_path: Path, timeout: int = 60) -> str:
    """WAV -> transcript. Returns "" on empty audio, failure, or timeout."""
    wav_path = Path(wav_path)
    # Skip pathological captures: empty audio can hang the Speech framework's
    # results stream (the Swift binary also guards this; belt and suspenders).
    if is_empty_recording(wav_path):
        return ""
    try:
        result = subprocess.run([str(TRANSCRIBE_BIN), str(wav_path)],
                                capture_output=True, text=True, check=False,
                                timeout=timeout, cwd=ROOT)
    except subprocess.TimeoutExpired:
        return ""
    return result.stdout.strip()
