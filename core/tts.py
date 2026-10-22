"""Kokoro neural TTS (MLX), loaded once per process; macOS `say` fallback.

`synthesize()` returns a WAV path (used by the web server to stream audio);
`say()` additionally plays it locally (used by the CLI).
"""

import contextlib
import io
import os
import re
import subprocess
import tempfile
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")  # keep torch/mlx deprecation noise off callers

VOICE = os.environ.get("MOCKMAN_VOICE", "af_heart")
KOKORO_MODEL = os.environ.get("MOCKMAN_TTS_MODEL", "mlx-community/Kokoro-82M-bf16")

# Words Kokoro mispronounces -> respellings verified by STT round-trip.
# Extend this list as you notice new mispronunciations.
PRONUNCIATIONS = {
    "Redis": "Red-iss",
    "redis": "red-iss",
    "Kubernetes": "Koo-ber-net-iss",
    "kubernetes": "koo-ber-net-iss",
    "dedup": "dee-doop",
    "Dedup": "Dee-doop",
}
_PRON_RE = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in PRONUNCIATIONS) + r")\b"
)


def preprocess_for_tts(text: str) -> str:
    """Fix known mispronunciations before synthesis."""
    return _PRON_RE.sub(lambda m: PRONUNCIATIONS[m.group(0)], text)


class Speaker:
    """Neural TTS with graceful degradation to the system voice."""

    def __init__(self, status_cb=None) -> None:
        self._model = None
        self._generate = None
        self.available = False
        try:
            from mlx_audio.tts.generate import generate_audio
            from mlx_audio.tts.utils import load_model

            if status_cb:
                status_cb("loading-voice")
            with contextlib.redirect_stdout(io.StringIO()), \
                 contextlib.redirect_stderr(io.StringIO()):
                self._model = load_model(KOKORO_MODEL)
            self._generate = generate_audio
            self.available = True
            if status_cb:
                status_cb("voice-ready")
        except Exception:
            self.available = False  # callers fall back to `say`

    def synthesize(self, text: str, out_dir: str | None = None) -> Path | None:
        """Generate speech to a WAV file. Returns the path, or None on failure
        (caller should fall back to `say`)."""
        if not self.available:
            return None
        spoken = preprocess_for_tts(text)
        tmp = out_dir or tempfile.mkdtemp(prefix="mockman_tts_")
        try:
            # Swallow mlx_audio's noisy per-turn prints (Text:/Voice:/...)
            with contextlib.redirect_stdout(io.StringIO()):
                self._generate(
                    text=spoken,
                    model=self._model,
                    voice=VOICE,
                    speed=1.0,
                    output_path=tmp,
                    file_prefix="turn",
                    join_audio=True,
                    verbose=False,
                )
            wavs = sorted(Path(tmp).glob("turn*.wav"))
            return wavs[0] if wavs else None
        except Exception:
            return None

    def say(self, text: str) -> None:
        """Generate and play locally (CLI path)."""
        if self.available:
            wav = self.synthesize(text)
            if wav:
                subprocess.run(["afplay", str(wav)], check=False)
                return
        subprocess.run(["say", preprocess_for_tts(text)], check=False)
