#!/usr/bin/env python3
"""Generate the extension icons.

Pure stdlib on purpose: no image library, no npm package, nothing to audit.
Run from the extension directory:  python3 store/make-icons.py
"""

import math
import os
import struct
import zlib

SIZES = (16, 32, 48, 128)
SS = 4  # supersampling factor, averaged down for antialiasing

BG = (0x2F, 0x6F, 0x4F)  # matches the popup accent and the toolbar badge
FG = (0xFF, 0xFF, 0xFF)

# Screen coordinates: 0deg points right, 90deg points down.
# The arc sweeps clockwise and stops at ARC_END_DEG, leaving a gap at top right
# where the arrowhead sits.
ARC_END_DEG = 290.0
ARC_RESUME_DEG = 350.0


def in_arc(angle_deg: float) -> bool:
    return angle_deg <= ARC_END_DEG or angle_deg >= ARC_RESUME_DEG


def triangle_contains(px, py, a, b, c) -> bool:
    def sign(p, q, r):
        return (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1])

    d1 = sign((px, py), a, b)
    d2 = sign((px, py), b, c)
    d3 = sign((px, py), c, a)
    has_neg = d1 < 0 or d2 < 0 or d3 < 0
    has_pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (has_neg and has_pos)


def rounded_square(dx, dy, half, radius) -> bool:
    ax, ay = abs(dx), abs(dy)
    if ax <= half - radius or ay <= half - radius:
        return ax <= half and ay <= half
    cx = ax - (half - radius)
    cy = ay - (half - radius)
    return math.hypot(cx, cy) <= radius


def render(size: int) -> bytes:
    s = size * SS
    c = (s - 1) / 2.0
    half = s / 2.0
    corner = s * 0.22
    ring_r = s * 0.29
    stroke = s * 0.115

    # Arrowhead: a triangle straddling the ring at the end of the sweep, its tip
    # continuing along the tangent so the eye reads direction of travel.
    theta = math.radians(ARC_END_DEG)
    tx, ty = -math.sin(theta), math.cos(theta)  # tangent, clockwise on screen
    nx, ny = math.cos(theta), math.sin(theta)  # outward normal
    ex, ey = c + ring_r * nx, c + ring_r * ny
    h = s * 0.15
    half_base = h * 0.85
    tip = (ex + tx * h, ey + ty * h)
    b1 = (ex + nx * half_base, ey + ny * half_base)
    b2 = (ex - nx * half_base, ey - ny * half_base)

    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            r_acc = g_acc = b_acc = a_acc = 0
            for sy in range(SS):
                py = y * SS + sy
                for sx in range(SS):
                    px = x * SS + sx
                    dx, dy = px - c, py - c

                    if not rounded_square(dx, dy, half, corner):
                        continue

                    dist = math.hypot(dx, dy)
                    angle = math.degrees(math.atan2(dy, dx)) % 360.0
                    on_ring = abs(dist - ring_r) <= stroke / 2 and in_arc(angle)
                    on_head = triangle_contains(px, py, tip, b1, b2)

                    colour = FG if (on_ring or on_head) else BG
                    r_acc += colour[0]
                    g_acc += colour[1]
                    b_acc += colour[2]
                    a_acc += 255

            n = SS * SS
            if a_acc == 0:
                row += bytes((0, 0, 0, 0))
            else:
                covered = a_acc // 255
                row += bytes(
                    (
                        r_acc // covered,
                        g_acc // covered,
                        b_acc // covered,
                        a_acc // n,
                    )
                )
        rows.append(bytes(row))

    raw = b"".join(b"\x00" + r for r in rows)
    return png(size, size, raw)


def chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def png(width: int, height: int, raw: bytes) -> bytes:
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    out = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
    os.makedirs(out, exist_ok=True)
    for size in SIZES:
        path = os.path.join(out, f"icon-{size}.png")
        with open(path, "wb") as handle:
            handle.write(render(size))
        print(f"wrote {os.path.relpath(path)}")


if __name__ == "__main__":
    main()
