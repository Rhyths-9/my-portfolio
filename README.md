# Rhythm Sharma — Pixel Portfolio

A 90s-style top-down pixel-art portfolio. The landing scene is the **exact demo
map** from the Craftpix "Main Character's Home" asset pack, rendered live to a
crisp `<canvas>` with the pack's animations (chimney smoke, birds, cat, swaying
trees) playing in real time.

A **walkable character** (the girl) roams the scene with a **dog that follows
her**:

- **WASD** or **arrow keys** to walk. She faces the direction she runs.
- Only the **house and fence** block movement (a **gate** is carved into the
  bottom fence so she can reach the door). **Foliage never blocks** — trees,
  bushes, rocks, mushrooms — so roaming is free.
- **Depth sorting:** standing tiles (trees, bushes, fence, house) and the
  characters are Y-sorted each frame by their bottom edge. Walk *above* a tree
  and its canopy draws over her (she's behind it); walk *below* it and she draws
  in front. Flat ground is baked once; birds/smoke stay on top.
- The dog eases after her along her path and rests a short distance away when
  she stops.

### Interactions

Walk up to a **hotspot** and a floating **E** prompt appears; press **E** /
**Enter** to open a pixel-styled panel (**Esc** or ✕ to close). The first one
is the **house door → About**. Add more (well → Contact, a sign → Work) by
appending to `HOTSPOTS` in `src/interactions.js` with a zone rectangle, a prompt
anchor, and the panel content.

## Run locally

The page fetches the Tiled map (`assets/Exterior.tmx`) and tileset images, so it
must be served over HTTP (not opened via `file://`):

```bash
cd site
python3 -m http.server 8765
# then open http://localhost:8765
```

## How it works

- `assets/Exterior.tmx` — the Tiled map (layers, chunks, animation defs).
- `src/main.js` — parses the TMX, bakes flat ground once, then each frame
  Y-sorts the standing tiles with the characters for correct depth. Builds the
  collision grid + gate, handles input, runs the game loop.
- `src/characters.js` — the girl (player) and dog (follower): movement,
  wall-sliding collision, sprite flipping, and follow behaviour.
- `src/interactions.js` — hotspots, the floating prompt, and the section panel.
- `assets/char/` — the girl's `idle`/`run` frames and `dog.png`.
- `style.css` — framed, full-bleed scene that scales to the viewport while
  keeping crisp pixels (`image-rendering: pixelated`) and the native 27:20 ratio.
- `render_check.py` — optional Pillow script that renders a static `scene_preview.png`
  (handy for verifying the map parses correctly without a browser).

## Next steps (portfolio interactivity)

The scene is built to grow into an explorable portfolio:
- Clickable hotspots on the **house / door / well / sign** → About, Work, Contact.
- A walkable character (the pack includes a cat + bird sprite sheets).
- Section "rooms" using the included `Interior.png` tileset.
