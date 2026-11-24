"""Generate the handwriting reveal order from a font and its authored nib paths.

Use --greeting for the Caveat greeting, or no flag for Patrick Hand. Requires
Pillow and NumPy. FreeType builds without WOFF2 also need FontTools and Brotli.
The packed map stores timing only. The browser supplies the font alpha and layout.
"""
import argparse
from heapq import heappop, heappush
from io import BytesIO
import json
from math import ceil, hypot, sqrt
from pathlib import Path
import re

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "dist" / "assets"
CHARS = "".join(dict.fromkeys("Glad you’re here.Project bakeryEducationSay hi.".replace(" ", "")))
SCALE = 2
LEFT, TOP = -12, -82
WIDTH, HEIGHT = 68 * SCALE, 116 * SCALE
COLUMNS = 6
# Distances are expressed in the original 100px em throughout.
NEIGHBORS = [(x, y, hypot(x, y) / SCALE)
             for y in (-1, 0, 1) for x in (-1, 0, 1) if x or y]


def trace_path(path):
    """Sample line, quadratic and cubic Bézier guides at subpixel intervals."""
    tokens = iter(re.findall(r"[A-Za-z]|-?(?:\d+(?:\.\d*)?|\.\d+)", path))
    points = []
    for command in tokens:
        degree = {"M": 0, "L": 1, "Q": 2, "C": 3}[command.upper()]
        if not degree:
            points.append(np.array([float(next(tokens)), float(next(tokens))]))
            continue
        controls = np.array([points[-1]] + [[float(next(tokens)), float(next(tokens))] for _ in range(degree)])
        if command.islower():
            controls[1:] += controls[0]
        count = max(1, ceil(np.linalg.norm(np.diff(controls, axis=0), axis=1).sum() * 4))
        for t in np.arange(1, count + 1) / count:
            curve = controls
            for _ in range(degree):
                curve = (1 - t) * curve[:-1] + t * curve[1:]
            points.append(curve[0])
    points = np.array(points)
    distances = np.r_[0, np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))]
    return points, distances


def timeline(guides):
    paths = []
    now = 0
    for guide in guides.split("|"):
        line, arc = trace_path(guide)
        if paths:
            now += min(15, 4 + .11 * np.linalg.norm(line[0] - paths[-1][0][-1]))
        duration = max(23, arc[-1] * .66)
        paths.append((line, arc, now, duration))
        now += duration
    return paths, now


def adjacent(idx, active):
    y, x = divmod(idx, WIDTH)
    for dx, dy, step in NEIGHBORS:
        nx, ny = x + dx, y + dy
        if 0 <= nx < WIDTH and 0 <= ny < HEIGHT:
            nxt = ny * WIDTH + nx
            if active[nxt]:
                yield nxt, step


def make_tile(char, paths, total, font, left=LEFT):
    mask = Image.new("L", (WIDTH, HEIGHT))
    ImageDraw.Draw(mask).text((-left * SCALE, -TOP * SCALE), char, 255, font=font, anchor="ls")
    # Traverse the real letter interiors first. Otherwise pen paths can jump
    # through a counter or the narrow gap between the two upper branches of y.
    active = (np.asarray(mask).ravel() >= 48)
    ids = np.flatnonzero(active)
    coords = np.column_stack(((ids % WIDTH + .5) / SCALE + left, (ids // WIDTH + .5) / SCALE + TOP))
    nearest = np.full(WIDTH * HEIGHT, np.inf)
    sample = np.full(WIDTH * HEIGHT, -1, dtype=int)
    desired = np.full(WIDTH * HEIGHT, np.inf)
    nib_contact = np.full(WIDTH * HEIGHT, np.inf)
    pass_start = []
    flat_samples = []
    queue = []

    for n, (line, arc, start, duration) in enumerate(paths):
        # Anchor each guide sample on ink, including slightly off-centre guides.
        last_stamp = -1.
        for point, at in zip(line, arc, strict=True):
            counts = np.sum((coords - point) ** 2, axis=1)
            j = int(counts.argmin())
            idx = int(ids[j])
            distance = sqrt(counts[j])
            serial = len(flat_samples)
            flat_samples.append((n, at))
            if at == 0:
                pass_start.append(idx)
            if distance < nearest[idx]:
                nearest[idx], sample[idx] = distance, serial
                heappush(queue, (distance, serial, idx))
            if arc[-1] < 2 or at - last_stamp < .65 and at != arc[-1]:
                continue
            last_stamp = at
            # At a crossing the first pass already inked an entire nib-width,
            # even if a second centerline later passes closer to the same pixel.
            # Grow that nib through connected font ink, so it cannot reach across
            # the gap between the two arms of y. Ramp pressure at pen-down.
            radius = 4.35 if at == 0 else min(4.35, .5 + at)
            stamp_time = start + duration * at / arc[-1]
            seen = {idx: distance}
            front = [(distance, idx)]
            while front:
                dist, pixel = heappop(front)
                if dist != seen[pixel] or dist > radius:
                    continue
                cap_delay = dist * .66 if at == 0 else 0.
                nib_contact[pixel] = min(nib_contact[pixel], stamp_time + cap_delay)
                for nxt, step in adjacent(pixel, active):
                    candidate = dist + step
                    if candidate <= radius and candidate < seen.get(nxt, np.inf):
                        seen[nxt] = candidate
                        heappush(front, (candidate, nxt))

    # Multi-source geodesic Voronoi cells give each ink pixel exclusively to
    # one guide sample. A neighbouring stroke cannot steal its other side.
    while queue:
        dist, serial, idx = heappop(queue)
        if serial != sample[idx] or dist != nearest[idx]:
            continue
        for nxt, step in adjacent(idx, active):
            new_dist = dist + step
            if new_dist < nearest[nxt]:
                nearest[nxt], sample[nxt] = new_dist, serial
                heappush(queue, (new_dist, serial, nxt))
    if np.any(sample[ids] < 0):
        raise ValueError(f"{char}: a disconnected ink component needs a pen guide")

    outer_radius = np.zeros(len(paths))
    for idx in ids:
        n, _ = flat_samples[sample[idx]]
        outer_radius[n] = max(outer_radius[n], nearest[idx])
    for idx in ids:
        n, at = flat_samples[sample[idx]]
        line, arc, start, duration = paths[n]
        # Near a wide stroke's edges the front lags slightly, like a round nib.
        # A tiny dot grows out from the point where the pen meets the paper.
        radius = 5.
        dist = nearest[idx]
        edge = radius - sqrt(max(0., radius ** 2 - min(dist, radius) ** 2))
        if arc[-1] < 2:
            fraction = dist / max(outer_radius[n], .01)
        else:
            fraction = min(1., (at + edge) / (arc[-1] + radius))
        desired[idx] = min(nib_contact[idx], start + duration * fraction)

    # Even at joins, the only places a new connected component may start are
    # the authored nib contacts. Ink can then spread only through existing ink.
    arrival = np.full(WIDTH * HEIGHT, np.inf)
    for idx, path in zip(pass_start, paths, strict=True):
        time = path[2]
        if time < arrival[idx]:
            arrival[idx] = time
            heappush(queue, (time, idx))
    while queue:
        at, idx = heappop(queue)
        if at != arrival[idx]:
            continue
        for nxt, step in adjacent(idx, active):
            time = max(desired[nxt], at + .25 * step)
            if time < arrival[nxt]:
                arrival[nxt] = time
                heappush(queue, (time, nxt))

    # Extend nearby native values into a 3-unit guard band. Hinting and
    # antialiasing vary between browsers. Only the live font can put ink here.
    support = Image.fromarray(active.reshape(HEIGHT, WIDTH).astype("uint8") * 255)
    fringe = np.asarray(support.filter(ImageFilter.MaxFilter(6 * SCALE + 1))).ravel() != 0
    queue = [(0., int(idx), int(idx)) for idx in ids]
    best = np.where(active, 0., np.inf)
    while queue:
        dist, source, idx = heappop(queue)
        if dist != best[idx]:
            continue
        for nxt, step in adjacent(idx, fringe):
            if dist + step < best[nxt]:
                best[nxt] = dist + step
                arrival[nxt] = arrival[source]
                heappush(queue, (best[nxt], source, nxt))
    tile = np.full(WIDTH * HEIGHT, 255, dtype=np.uint8)
    tile[fringe] = np.rint(254 * arrival[fringe] / max(total, np.max(arrival[ids]))).astype(np.uint8)
    return Image.fromarray(tile.reshape(HEIGHT, WIDTH))


def pack_order(samples):
    """Pack row-major bytes into runs or literal blocks of up to 128 samples."""
    packed = bytearray()
    literal = bytearray()
    offset = 0

    def flush_literal():
        if literal:
            packed.append(len(literal) - 1)
            packed.extend(literal)
            literal.clear()

    while offset < len(samples):
        value = samples[offset]
        end = offset + 1
        limit = min(offset + 128, len(samples))
        while end < limit and samples[end] == value:
            end += 1
        if end - offset >= 3:
            flush_literal()
            packed.extend((0x80 | (end - offset - 1), value))
            offset = end
        else:
            literal.append(value)
            offset += 1
            if len(literal) == 128:
                flush_literal()
    flush_literal()
    return bytes(packed)


def load_font(path):
    data = path.read_bytes()
    try:
        return ImageFont.truetype(BytesIO(data), 100 * SCALE)
    except OSError:
        from fontTools.ttLib import TTFont
        buffer = BytesIO()
        with TTFont(BytesIO(data)) as font:
            font.flavor = None
            font.save(buffer)
        buffer.seek(0)
        return ImageFont.truetype(buffer, 100 * SCALE)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--greeting", action="store_true")
    greeting = parser.parse_args().greeting
    name = "greeting" if greeting else "heading"
    guides = json.loads((HERE / f"{name}-pen-guides.json").read_text())
    chars = tuple(guides) if greeting else CHARS
    # Caveat's G leans farther right, while its y still needs room on the left.
    left = -7 if greeting else LEFT
    font = load_font(ASSETS / ("seattle-greeting-ink.woff2" if greeting else "patrick-hand.woff2"))
    atlas = Image.new("L", (WIDTH * COLUMNS, HEIGHT * ceil(len(chars) / COLUMNS)), 255)
    meta = {}
    for index, char in enumerate(chars):
        paths, total = timeline(guides[char])
        tile = make_tile(char, paths, total, font, left)
        atlas.paste(tile, (index % COLUMNS * WIDTH, index // COLUMNS * HEIGHT))
        meta[char] = [round(total, 3), *paths[0][0][0].tolist(), *paths[-1][0][-1].tolist()]
    (ASSETS / f"{name}-pen-order.bin").write_bytes(pack_order(atlas.tobytes()))
    print(json.dumps(meta, ensure_ascii=False))


if __name__ == "__main__":
    main()
