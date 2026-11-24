"""Bake the flag's traveling wave into the inline SVG, including its lettering."""
from math import sin, tau
from pathlib import Path
import re


top = [(8, 15), (47, 4), (76, 9), (108, 14), (133, 18), (150, 15), (169, 9)]
bottom = [(8, 64), (37, 55), (68, 55), (101, 61), (126, 66), (148, 65), (168, 57)]
tail = [(157, 12), (181, 6), (207, 10), (194, 31), (208, 49), (188, 46), (158, 60)]
steps = 32


def wave(points, phase):
    result = []
    for x, y in points:
        distance = (x - 8) / 200  # The cloth is tied at x=8.
        offset = 6.6 * distance * sin(tau * (phase - 0.87 * distance))
        result.append((x, y + offset))
    return result


def path_data(commands, points):
    # An empty command continues the previous Bézier segment.
    return " ".join(f"{cmd}{x:.6g} {round(y, 2):g}" for cmd, (x, y) in zip(commands, points, strict=True))


def outlines(phase):
    upper, lower = wave(top, phase), wave(bottom, phase)
    lettering = [(x + .68 * (bx - x), y + .68 * (by - y))
                 for (x, y), (bx, by) in zip(upper, lower)]
    curves = ["M", "C", "", "", "C", "", ""]
    return {
        "banner-face-shape": path_data(curves + ["L", "C", "", "", "C", "", ""], upper + lower[::-1]) + " Z",
        "banner-ink-right": path_data(curves, lettering),
        "banner-tail-shape": path_data(["M", "Q", "", "L", "L", "Q", ""], wave(tail, phase)) + " Z",
    }


if __name__ == "__main__":
    index = Path(__file__).resolve().parents[1] / "dist" / "index.html"
    html = index.read_text()
    frames = [outlines(i / steps) for i in range(steps)]
    frames.append(frames[0])
    for name, rest_shape in frames[0].items():
        values = ";\n                  ".join(frame[name] for frame in frames)
        pattern = rf'(<path id="{name}" d=")[^"]*(">[\s\S]*?<animate\b[^>]*?values=")[^"]*(")'
        html, count = re.subn(pattern, lambda m: m[1] + rest_shape + m[2] + values + m[3], html)
        if count != 1:
            raise ValueError(f"Expected one animated path for {name}, found {count}")
    index.write_text(html)
