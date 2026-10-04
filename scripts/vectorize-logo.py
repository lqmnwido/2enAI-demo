"""Trace the supplied 2EN APPS mark into reusable, bevel-ready contours."""
from PIL import Image
from collections import defaultdict
from pathlib import Path
import json
import math

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/branding/2en-apps-source.jpg"
DEST = ROOT / "blender/2en_apps_contours.json"
image = Image.open(SOURCE).convert("RGB")
width, height = image.size
pixels = image.load()
dark = [[max(pixels[x, y]) < 205 and sum(pixels[x, y]) < 475 for x in range(width)] for y in range(height)]

def inside(x, y):
    return 0 <= x < width and 0 <= y < height and dark[y][x]

edges = defaultdict(list)
for y in range(height):
    for x in range(width):
        if not dark[y][x]:
            continue
        if not inside(x, y - 1): edges[(x, y)].append((x + 1, y))
        if not inside(x + 1, y): edges[(x + 1, y)].append((x + 1, y + 1))
        if not inside(x, y + 1): edges[(x + 1, y + 1)].append((x, y + 1))
        if not inside(x - 1, y): edges[(x, y + 1)].append((x, y))

def signed_area(points):
    return sum(x * points[(i + 1) % len(points)][1] - points[(i + 1) % len(points)][0] * y for i, (x, y) in enumerate(points)) / 2

def distance(point, start, end):
    x, y = point; ax, ay = start; bx, by = end
    dx, dy = bx - ax, by - ay
    if not dx and not dy: return math.hypot(x - ax, y - ay)
    return abs(dy * x - dx * y + bx * ay - by * ax) / math.hypot(dx, dy)

def simplify_open(points, tolerance):
    if len(points) <= 2: return points
    start, end = points[0], points[-1]
    farthest = max(range(1, len(points) - 1), key=lambda i: distance(points[i], start, end))
    if distance(points[farthest], start, end) <= tolerance: return [start, end]
    return simplify_open(points[:farthest + 1], tolerance)[:-1] + simplify_open(points[farthest:], tolerance)

def simplify_closed(points, tolerance):
    # Split a closed ring at its two farthest x-extrema before RDP.
    left = min(range(len(points)), key=lambda i: points[i][0])
    right = max(range(len(points)), key=lambda i: points[i][0])
    ring = points[left:] + points[:left]
    right = (right - left) % len(points)
    a = simplify_open(ring[:right + 1], tolerance)
    b = simplify_open(ring[right:] + [ring[0]], tolerance)
    return (a[:-1] + b[:-1])

contours = []
while edges:
    start = next(iter(edges))
    current = start
    points = [start]
    for _ in range(width * height * 2):
        options = edges[current]
        nxt = options.pop()
        if not options: del edges[current]
        current = nxt
        if current == start: break
        points.append(current)
    else:
        raise RuntimeError("Logo boundary did not close")
    area = signed_area(points)
    if abs(area) < 18: continue
    simple = simplify_closed(points, 1.35)
    if len(simple) >= 3:
        contours.append({"area": round(area, 1), "points": simple})

contours.sort(key=lambda item: abs(item["area"]), reverse=True)
DEST.write_text(json.dumps({"width": width, "height": height, "contours": contours}, separators=(",", ":")), encoding="utf8")
print(f"{len(contours)} contours, {sum(len(c['points']) for c in contours)} vertices -> {DEST}")
