#!/usr/bin/env python3
"""Generate the MockMan app icon (assets/mockman_icon.png).

Brand mark: the chartreuse "∿" wave on a dark olive squircle.
Regenerate + reinstall with: .venv/bin/python scripts/make_icon.py
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

S = 1024
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "mockman_icon.png"

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# dark olive squircle-ish background
d.rounded_rectangle([28, 28, S - 28, S - 28], radius=236, fill="#1c241f")
# subtle inner edge
d.rounded_rectangle([28, 28, S - 28, S - 28], radius=236,
                    outline="#3a443d", width=4)

# the wave — one smooth period of a sine, thick round-capped stroke
w, amp, cy = 620, 96, S // 2
x0 = (S - w) // 2
pts = [
    (x0 + i, cy + int(amp * math.sin(i / w * math.pi * 2)))
    for i in range(w + 1)
]
d.line(pts, fill="#d4f36a", width=36, joint="curve")
r = 18
for p in (pts[0], pts[-1]):
    d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill="#d4f36a")

OUT.parent.mkdir(exist_ok=True)
img.save(OUT)
print(f"icon written: {OUT}")
