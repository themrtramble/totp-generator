"""Generate TOTP Generator brand icons and favicon.ico"""
from __future__ import annotations

import math
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "img")
PUBLIC = os.path.join(ROOT, "public")


def lerp(a: float, b: float, t: float) -> int:
    return int(a + (b - a) * t)


def mix(c1, c2, t):
    return tuple(lerp(c1[i], c2[i], t) for i in range(3)) + (255,)


def draw_logo(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad = max(1, int(size * 0.02))
    radius = int(size * 0.22)
    d.rounded_rectangle(
        [pad, pad, size - pad - 1, size - pad - 1],
        radius=radius,
        fill=(8, 12, 24, 255),
    )

    body = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inset = int(size * 0.09)
    br = int(size * 0.19)

    grad = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    c1, c2, c3 = (139, 124, 255), (99, 85, 255), (46, 230, 197)
    for y in range(size):
        t = y / max(size - 1, 1)
        if t < 0.55:
            col = mix(c1, c2, t / 0.55)
        else:
            col = mix(c2, c3, (t - 0.55) / 0.45)
        gd.line([(0, y), (size, y)], fill=col)

    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle(
        [inset, inset, size - inset - 1, size - inset - 1],
        radius=br,
        fill=255,
    )
    body = Image.composite(grad, body, mask)
    img = Image.alpha_composite(img, body)

    # soft highlight
    hi = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hi)
    hd.ellipse(
        [int(size * 0.18), int(size * 0.12), int(size * 0.82), int(size * 0.55)],
        fill=(255, 255, 255, 48),
    )
    hi = hi.filter(ImageFilter.GaussianBlur(radius=max(1, size * 0.04)))
    img = Image.alpha_composite(img, hi)
    d = ImageDraw.Draw(img)

    cx = cy = size / 2.0
    ring_r = size * 0.31
    stroke = max(2, int(size * 0.045))
    start = -90
    extent = 250
    steps = max(24, size // 2)
    for i in range(steps):
        a0 = math.radians(start + extent * i / steps)
        a1 = math.radians(start + extent * (i + 1) / steps)
        x0 = cx + ring_r * math.cos(a0)
        y0 = cy + ring_r * math.sin(a0)
        x1 = cx + ring_r * math.cos(a1)
        y1 = cy + ring_r * math.sin(a1)
        d.line([(x0, y0), (x1, y1)], fill=(255, 255, 255, 235), width=stroke)

    rem_steps = max(8, steps // 4)
    for i in range(rem_steps):
        a0 = math.radians(start + extent + (360 - extent) * i / rem_steps)
        a1 = math.radians(start + extent + (360 - extent) * (i + 1) / rem_steps)
        x0 = cx + ring_r * math.cos(a0)
        y0 = cy + ring_r * math.sin(a0)
        x1 = cx + ring_r * math.cos(a1)
        y1 = cy + ring_r * math.sin(a1)
        d.line([(x0, y0), (x1, y1)], fill=(255, 255, 255, 55), width=max(1, stroke - 1))

    # lock body
    lw = size * 0.28
    lh = size * 0.22
    lx = cx - lw / 2
    ly = cy - lh * 0.05
    lr = max(1, size * 0.045)
    d.rounded_rectangle(
        [lx + 1, ly + 2, lx + lw + 1, ly + lh + 2],
        radius=lr,
        fill=(15, 20, 40, 70),
    )
    d.rounded_rectangle([lx, ly, lx + lw, ly + lh], radius=lr, fill=(255, 255, 255, 245))

    # shackle posts + arc
    post_w = max(2, int(size * 0.05))
    post_h = int(size * 0.11)
    left_x = int(cx - size * 0.08)
    right_x = int(cx + size * 0.08 - post_w)
    top_y = int(ly - post_h + size * 0.015)
    bot_y = int(ly + size * 0.02)
    d.rounded_rectangle(
        [left_x, top_y + int(post_h * 0.35), left_x + post_w, bot_y],
        radius=max(1, post_w // 2),
        fill=(255, 255, 255, 245),
    )
    d.rounded_rectangle(
        [right_x, top_y + int(post_h * 0.35), right_x + post_w, bot_y],
        radius=max(1, post_w // 2),
        fill=(255, 255, 255, 245),
    )
    arc_bbox = [left_x, top_y, right_x + post_w, top_y + int(post_h * 1.15)]
    for i in range(60):
        a0 = math.radians(180 + 180 * i / 60)
        a1 = math.radians(180 + 180 * (i + 1) / 60)
        if math.sin(a0) > 0:
            continue
        rx = (arc_bbox[2] - arc_bbox[0]) / 2
        ry = (arc_bbox[3] - arc_bbox[1]) / 2
        ox = (arc_bbox[0] + arc_bbox[2]) / 2
        oy = (arc_bbox[1] + arc_bbox[3]) / 2
        x0 = ox + rx * math.cos(a0)
        y0 = oy + ry * math.sin(a0)
        x1 = ox + rx * math.cos(a1)
        y1 = oy + ry * math.sin(a1)
        d.line([(x0, y0), (x1, y1)], fill=(255, 255, 255, 245), width=post_w)

    # keyhole
    kx, ky = cx, ly + lh * 0.42
    kr = size * 0.028
    d.ellipse([kx - kr, ky - kr, kx + kr, ky + kr], fill=(99, 85, 255, 255))
    d.polygon(
        [
            (kx - kr * 0.45, ky + kr * 0.5),
            (kx + kr * 0.45, ky + kr * 0.5),
            (kx + kr * 0.28, ky + lh * 0.28),
            (kx - kr * 0.28, ky + lh * 0.28),
        ],
        fill=(99, 85, 255, 255),
    )

    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.rounded_rectangle(
        [inset, inset, size - inset - 1, size - inset - 1],
        radius=br,
        fill=(139, 124, 255, 40),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=max(1, size * 0.06)))
    return Image.alpha_composite(glow, img)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    targets = [
        (16, "favicon-16.png"),
        (32, "favicon-32.png"),
        (48, "favicon-48.png"),
        (180, "apple-touch-icon.png"),
        (192, "icon-192.png"),
        (512, "icon-512.png"),
    ]
    for s, name in targets:
        path = os.path.join(OUT, name)
        draw_logo(s).save(path, "PNG")
        print("wrote", path)

    icons = [draw_logo(s) for s in (16, 32, 48, 64, 128, 256)]
    ico_path = os.path.join(PUBLIC, "favicon.ico")
    icons[0].save(
        ico_path,
        format="ICO",
        sizes=[(im.width, im.height) for im in icons],
        append_images=icons[1:],
    )
    print("wrote", ico_path, os.path.getsize(ico_path), "bytes")


if __name__ == "__main__":
    main()
