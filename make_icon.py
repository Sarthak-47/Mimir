"""
Generate the Mimir eye-in-diamond icon as a 1024x1024 PNG.
Run with: python make_icon.py
Requires: pip install pillow
"""

from PIL import Image, ImageDraw
import math

SIZE   = 1024
VBOX   = 36          # SVG viewBox size
SCALE  = SIZE / VBOX

# Design tokens
BG     = (9, 14, 10)          # --stone-1  #090e0a
GOLD   = (201, 168, 76)       # --gold     #c9a84c
SW     = max(4, int(SCALE * 0.055))  # stroke width, ~2px at 36-unit scale

def s(x, y):
    """Scale a point from viewBox coords to pixel coords."""
    pad = SIZE * 0.06          # 6% padding so nothing clips at the edges
    return (pad + x * (SIZE - 2 * pad) / VBOX,
            pad + y * (SIZE - 2 * pad) / VBOX)

def qbez(p0, cp, p1, steps=120):
    """Quadratic Bezier curve points."""
    pts = []
    for i in range(steps + 1):
        t = i / steps
        x = (1 - t)**2 * p0[0] + 2*(1-t)*t * cp[0] + t**2 * p1[0]
        y = (1 - t)**2 * p0[1] + 2*(1-t)*t * cp[1] + t**2 * p1[1]
        pts.append(s(x, y))
    return pts


img  = Image.new("RGBA", (SIZE, SIZE), BG + (255,))
draw = ImageDraw.Draw(img)

# ── Diamond outline ────────────────────────────────────────────
diamond = [s(18, 2), s(34, 18), s(18, 34), s(2, 18)]
for i in range(4):
    draw.line([diamond[i], diamond[(i + 1) % 4]], fill=GOLD, width=SW)

# ── Cardinal tick marks ────────────────────────────────────────
ticks = [
    (s(18, 2),  s(18, 5.5)),
    (s(34, 18), s(30.5, 18)),
    (s(18, 34), s(18, 30.5)),
    (s(2, 18),  s(5.5, 18)),
]
for a, b in ticks:
    draw.line([a, b], fill=GOLD, width=SW)

# ── Eye shape (two quadratic bezier arcs) ─────────────────────
# Upper arc: (10,18) → ctrl(18,11) → (26,18)
# Lower arc: (26,18) → ctrl(18,25) → (10,18)
upper = qbez((10, 18), (18, 11), (26, 18))
lower = qbez((26, 18), (18, 25), (10, 18))

for seg in [upper, lower]:
    for i in range(len(seg) - 1):
        draw.line([seg[i], seg[i + 1]], fill=GOLD, width=SW)

# ── Iris circle ────────────────────────────────────────────────
r_iris = 3.5 * (SIZE - 2 * SIZE * 0.06) / VBOX
cx, cy = s(18, 18)
draw.ellipse([cx - r_iris, cy - r_iris, cx + r_iris, cy + r_iris],
             outline=GOLD, width=SW)

# ── Pupil (filled) ────────────────────────────────────────────
r_pupil = 1.5 * (SIZE - 2 * SIZE * 0.06) / VBOX
draw.ellipse([cx - r_pupil, cy - r_pupil, cx + r_pupil, cy + r_pupil],
             fill=GOLD)

img.save("icon_source.png")
print(f"Saved icon_source.png ({SIZE}x{SIZE})")
