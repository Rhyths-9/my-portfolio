#!/usr/bin/env python3
"""Pre-render the Exterior.tmx scene to a PNG to validate TMX parsing.
Uses the first frame for animated tiles. Mirrors the logic the JS renderer will use."""
import re, os
import xml.etree.ElementTree as ET
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
TMX = os.path.join(ASSETS, "Exterior.tmx")

FLIP_H = 0x80000000
FLIP_V = 0x40000000
FLIP_D = 0x20000000
GID_MASK = 0x1FFFFFFF

tree = ET.parse(TMX)
root = tree.getroot()
TW = int(root.get("tilewidth"))
TH = int(root.get("tileheight"))

# Load tilesets
tilesets = []  # list of dicts: firstgid, columns, tilecount, image, anim{localid:[(tileid,dur)]}
for ts in root.findall("tileset"):
    firstgid = int(ts.get("firstgid"))
    columns = int(ts.get("columns"))
    tilecount = int(ts.get("tilecount"))
    img_el = ts.find("image")
    src = os.path.join(ASSETS, os.path.basename(img_el.get("source")))
    image = Image.open(src).convert("RGBA")
    anim = {}
    for tile in ts.findall("tile"):
        a = tile.find("animation")
        if a is not None:
            frames = [(int(f.get("tileid")), int(f.get("duration"))) for f in a.findall("frame")]
            anim[int(tile.get("id"))] = frames
    tilesets.append(dict(firstgid=firstgid, columns=columns, tilecount=tilecount,
                         image=image, anim=anim, name=ts.get("name")))

tilesets.sort(key=lambda t: t["firstgid"])

def find_tileset(gid):
    chosen = None
    for t in tilesets:
        if gid >= t["firstgid"]:
            chosen = t
        else:
            break
    return chosen

# Determine map extent from chunks across all layers
minx = miny = 10**9
maxx = maxy = -10**9
layers = []
for layer in root.findall("layer"):
    data = layer.find("data")
    chunks = []
    for ch in data.findall("chunk"):
        cx = int(ch.get("x")); cy = int(ch.get("y"))
        cw = int(ch.get("width")); chh = int(ch.get("height"))
        nums = [int(n) for n in re.findall(r"-?\d+", ch.text)]
        chunks.append((cx, cy, cw, chh, nums))
        minx = min(minx, cx); miny = min(miny, cy)
        maxx = max(maxx, cx+cw); maxy = max(maxy, cy+chh)
    layers.append((layer.get("name"), chunks))

W = (maxx - minx) * TW
H = (maxy - miny) * TH
print(f"Map extent tiles x[{minx},{maxx}) y[{miny},{maxy}) -> {W}x{H}px, {len(layers)} layers")

canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))

def blit(gid, px, py):
    raw = gid
    gid = raw & GID_MASK
    if gid == 0:
        return
    ts = find_tileset(gid)
    if ts is None:
        return
    local = gid - ts["firstgid"]
    # animated -> first frame
    if local in ts["anim"]:
        local = ts["anim"][local][0][0]
    col = local % ts["columns"]
    row = local // ts["columns"]
    sx = col * TW; sy = row * TH
    tile = ts["image"].crop((sx, sy, sx+TW, sy+TH))
    # flips
    if raw & FLIP_D:
        tile = tile.transpose(Image.TRANSPOSE)
    if raw & FLIP_H:
        tile = tile.transpose(Image.FLIP_LEFT_RIGHT)
    if raw & FLIP_V:
        tile = tile.transpose(Image.FLIP_TOP_BOTTOM)
    canvas.alpha_composite(tile, (px, py))

for name, chunks in layers:
    for (cx, cy, cw, chh, nums) in chunks:
        for i, gid in enumerate(nums):
            if gid == 0:
                continue
            col = i % cw
            row = i // cw
            tx = cx + col - minx
            ty = cy + row - miny
            blit(gid, tx*TW, ty*TH)

# Scale up 2x nearest for a crisp preview
scale = 2
out = canvas.resize((W*scale, H*scale), Image.NEAREST)
# Flatten onto a neutral bg so transparent areas are visible
bg = Image.new("RGBA", out.size, (40, 44, 52, 255))
bg.alpha_composite(out)
bg.convert("RGB").save(os.path.join(HERE, "scene_preview.png"))
print("Wrote scene_preview.png")
