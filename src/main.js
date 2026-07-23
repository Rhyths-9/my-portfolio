// Renders the Exterior.tmx pixel-art scene to a crisp canvas with the pack's
// animations (smoke, birds, cat, swaying trees) playing live.
//
// Depth model: flat ground is baked once (always background). "Standing" tiles
// (trees, bushes, rocks, fence, house) are drawn each frame and Y-SORTED with
// the characters by their bottom edge — so she walks BEHIND a tree/bush and its
// canopy covers her, instead of drawing on top. Birds/smoke stay above all.
//
// Only the house and fence block movement; foliage never blocks (she passes
// through/behind it), which keeps roaming free.

import { loadCharacterAssets, World, Girl, Dog } from './characters.js?v=2';
import { Interactions } from './interactions.js?v=16';

const ASSET_DIR = 'assets/';
const TMX_URL      = ASSET_DIR + 'Exterior.tmx';
const INTERIOR_URL = ASSET_DIR + 'Interior1.tmx?v=1';

// Flat ground — baked once, always behind everything.
const BG_LAYERS = new Set([
  'Ground', 'Spots', 'Road', 'Plates', 'Grass',
  'Grass_detail6', 'Grass_details3', 'Grass_details4', 'Grass_details5',
  'Grass_top_details',
]);
// Always-on-top layers (birds fly overhead; the cat is ambient).
const TOP_LAYERS = new Set(['Birds', 'cat']);
// Solid structures (everything else is Y-sorted but non-blocking foliage).
const STRUCT_LAYERS = new Set([
  'Fence', 'House_wall', 'House_roof', 'windows1', 'windows2',
]);
// Carved 2-tile gate (absolute map tile coords) on the path through the fence.
const GATE = new Set(['-4,6', '-3,6']);

const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;
const FLIP_D = 0x20000000;
const GID_MASK = 0x1fffffff;

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load ' + src));
    img.src = src;
  });
}

async function parseTmx(url) {
  const xml = await (await fetch(url)).text();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const map = doc.querySelector('map');
  const TW = +map.getAttribute('tilewidth');
  const TH = +map.getAttribute('tileheight');

  // --- tilesets ---
  const tilesets = [];
  for (const ts of doc.querySelectorAll('map > tileset')) {
    const firstgid = +ts.getAttribute('firstgid');
    const columns = +ts.getAttribute('columns');
    const imgEl = ts.querySelector('image');
    const source = ASSET_DIR + imgEl.getAttribute('source').split('/').pop();
    const anim = new Map(); // localId -> [{tileid, duration}]
    for (const tile of ts.querySelectorAll('tile')) {
      const a = tile.querySelector('animation');
      if (!a) continue;
      const frames = [...a.querySelectorAll('frame')].map((f) => ({
        tileid: +f.getAttribute('tileid'),
        duration: +f.getAttribute('duration'),
      }));
      anim.set(+tile.getAttribute('id'), frames);
    }
    const name = ts.getAttribute('name');
    tilesets.push({ firstgid, columns, source, anim, image: null, name });
  }
  tilesets.sort((a, b) => a.firstgid - b.firstgid);
  await Promise.all(
    tilesets.map(async (t) => { t.image = await loadImage(t.source); })
  );

  const findTileset = (gid) => {
    let chosen = null;
    for (const t of tilesets) {
      if (gid >= t.firstgid) chosen = t; else break;
    }
    return chosen;
  };

  // --- layers / chunks, collecting placements + content bounds ---
  let minTileX = Infinity, minTileY = Infinity, maxTileX = -Infinity, maxTileY = -Infinity;
  const mapW = +map.getAttribute('width');
  const layers = [];
  for (const layer of doc.querySelectorAll('map > layer')) {
    const placements = [];
    const dataEl = layer.querySelector('data');
    const chunks = dataEl ? [...dataEl.querySelectorAll('chunk')] : [];
    if (chunks.length > 0) {
      // infinite map — data lives in <chunk> elements
      for (const chunk of chunks) {
        const cx = +chunk.getAttribute('x');
        const cy = +chunk.getAttribute('y');
        const cw = +chunk.getAttribute('width');
        const nums = chunk.textContent.match(/-?\d+/g) || [];
        for (let i = 0; i < nums.length; i++) {
          const raw = Number(nums[i]) >>> 0;
          if ((raw & GID_MASK) === 0) continue;
          const tx = cx + (i % cw);
          const ty = cy + Math.floor(i / cw);
          if (tx < minTileX) minTileX = tx;
          if (ty < minTileY) minTileY = ty;
          if (tx > maxTileX) maxTileX = tx;
          if (ty > maxTileY) maxTileY = ty;
          placements.push({ raw, tx, ty });
        }
      }
    } else if (dataEl) {
      // fixed map — data is flat CSV directly inside <data>
      const nums = dataEl.textContent.match(/-?\d+/g) || [];
      for (let i = 0; i < nums.length; i++) {
        const raw = Number(nums[i]) >>> 0;
        if ((raw & GID_MASK) === 0) continue;
        const tx = i % mapW;
        const ty = Math.floor(i / mapW);
        if (tx < minTileX) minTileX = tx;
        if (ty < minTileY) minTileY = ty;
        if (tx > maxTileX) maxTileX = tx;
        if (ty > maxTileY) maxTileY = ty;
        placements.push({ raw, tx, ty });
      }
    }
    layers.push({ name: layer.getAttribute('name'), placements });
  }

  return { TW, TH, tilesets, findTileset, layers, minTileX, minTileY, maxTileX, maxTileY };
}

// Draw a single tile (handles animation frame + flip flags).
function drawTile(target, scene, raw, dx, dy, timeMs) {
  const { TW, TH, findTileset } = scene;
  const gid = raw & GID_MASK;
  const ts = findTileset(gid);
  if (!ts) return;
  let local = gid - ts.firstgid;

  const frames = ts.anim.get(local);
  if (frames) {
    const total = frames.reduce((s, f) => s + f.duration, 0);
    let t = timeMs % total;
    for (const f of frames) {
      if (t < f.duration) { local = f.tileid; break; }
      t -= f.duration;
    }
  }

  const sx = (local % ts.columns) * TW;
  const sy = Math.floor(local / ts.columns) * TH;

  const fh = raw & FLIP_H, fv = raw & FLIP_V, fd = raw & FLIP_D;
  if (!fh && !fv && !fd) {
    target.drawImage(ts.image, sx, sy, TW, TH, dx, dy, TW, TH);
    return;
  }
  target.save();
  target.translate(dx + TW / 2, dy + TH / 2);
  if (fd) { target.rotate(Math.PI / 2); target.scale(1, -1); } // anti-diagonal
  if (fh) target.scale(-1, 1);
  if (fv) target.scale(1, -1);
  target.drawImage(ts.image, sx, sy, TW, TH, -TW / 2, -TH / 2, TW, TH);
  target.restore();
}

async function main() {
  const [scene, intScene, charAssets, phoneImg] = await Promise.all([
    parseTmx(TMX_URL),
    parseTmx(INTERIOR_URL),
    loadCharacterAssets(),
    loadImage(ASSET_DIR + 'telephone.png?v=3'),
  ]);
  const { TW, TH, minTileX, minTileY, maxTileX, maxTileY, layers } = scene;

  const ox = minTileX, oy = minTileY;
  const cols = maxTileX - minTileX + 1;
  const rows = maxTileY - minTileY + 1;
  const W = cols * TW;
  const H = rows * TH;
  canvas.width = W;
  canvas.height = H;
  ctx.imageSmoothingEnabled = false;

  // Collision: only the house + fence block (minus the gate). Foliage never
  // blocks — she walks through/behind it.
  const blocked = new Uint8Array(cols * rows);

  // Render buckets:
  //   baked   — flat ground, drawn once.
  //   sorted  — standing tiles, Y-sorted with the characters every frame.
  //   top     — birds / smoke / cat, drawn above everything.
  const baked = document.createElement('canvas');
  baked.width = W; baked.height = H;
  const bctx = baked.getContext('2d');
  bctx.imageSmoothingEnabled = false;
  const sortedTiles = [];
  const topTiles = [];

  // Door/window setup:
  //   - Door local IDs 0,1,17,18 in Doors_windows_animation = the 2×2 door.
  //   - All other tiles in that tileset are windows — strip their animation so
  //     they stay permanently closed (first frame).
  //   - The door's animation is driven by a separate clock (see frame loop).
  const DOOR_LOCAL_IDS = new Set([0, 1, 17, 18]);
  const dwTs = scene.tilesets.find(ts => ts.name === 'Doors_windows_animation');
  if (dwTs) {
    for (const id of [...dwTs.anim.keys()]) {
      if (!DOOR_LOCAL_IDS.has(id)) dwTs.anim.delete(id);
    }
  }

  // Pass 1: collect all Trees_animation pixel positions so we can compute
  // "stack anchors" — all tiles in the same vertical tree stack share the
  // anchor of the bottommost trunk tile, so the whole tree occludes the
  // character at once instead of just the trunk covering her legs.
  const treePxSet = new Set();
  for (const layer of layers) {
    if (BG_LAYERS.has(layer.name) || TOP_LAYERS.has(layer.name)) continue;
    for (const p of layer.placements) {
      const ts = scene.findTileset(p.raw & GID_MASK);
      if (ts && ts.name === 'Trees_animation') {
        treePxSet.add(`${(p.tx - ox) * TW},${(p.ty - oy) * TH}`);
      }
    }
  }
  // Group connected tree tiles into whole-tree clusters (4-connectivity). Every
  // tile in a cluster shares the cluster's bottom edge as its sort anchor, so the
  // ENTIRE tree (trunk + full canopy width) occludes the character at once — she
  // hides completely behind it instead of showing in front of the side leaves.
  const treeAnchorByPx = new Map();
  {
    const visited = new Set();
    for (const key of treePxSet) {
      if (visited.has(key)) continue;
      const cluster = [key];
      const stack = [key];
      visited.add(key);
      let maxY = -Infinity;
      while (stack.length) {
        const k = stack.pop();
        const [cx, cy] = k.split(',').map(Number);
        if (cy > maxY) maxY = cy;
        for (const [ox, oy] of [[TW, 0], [-TW, 0], [0, TH], [0, -TH]]) {
          const nk = `${cx + ox},${cy + oy}`;
          if (treePxSet.has(nk) && !visited.has(nk)) { visited.add(nk); stack.push(nk); cluster.push(nk); }
        }
      }
      const anchorY = maxY + TH;
      for (const k of cluster) treeAnchorByPx.set(k, anchorY);
    }
  }

  // Pass 2: normal tile categorisation + placement.
  for (const layer of layers) {
    const isBG = BG_LAYERS.has(layer.name);
    const isTopLayer = TOP_LAYERS.has(layer.name);
    const isStruct = STRUCT_LAYERS.has(layer.name);
    for (const p of layer.placements) {
      const isGate = GATE.has(p.tx + ',' + p.ty);
      // Carve the gate: don't render the fence rails there, don't block it.
      if (layer.name === 'Fence' && isGate) continue;
      if (isStruct && !isGate) blocked[(p.ty - oy) * cols + (p.tx - ox)] = 1;

      const dx = (p.tx - ox) * TW;
      const dy = (p.ty - oy) * TH;
      const tsName = scene.findTileset(p.raw & GID_MASK).name;
      if (isBG) {
        drawTile(bctx, scene, p.raw, dx, dy, 0); // bake flat ground once
      } else if (isTopLayer || tsName === 'Smoke_animation') {
        topTiles.push({ raw: p.raw, dx, dy });
      } else {
        // Trees use the whole-cluster bottom anchor so the entire tree occludes
        // at once (character hides completely behind it).
        const anchorY = tsName === 'Trees_animation'
          ? treeAnchorByPx.get(`${dx},${dy}`)
          : dy + TH;
        // Tag door tiles so the frame loop can drive them with the door clock.
        const isDoor = dwTs && tsName === 'Doors_windows_animation'
          && DOOR_LOCAL_IDS.has((p.raw & GID_MASK) - dwTs.firstgid);
        sortedTiles.push({ raw: p.raw, dx, dy, anchorY, isDoor });
      }
    }
  }

  const world = new World(blocked, cols, rows, TW);

  // ---- Interior scene ------------------------------------------------
  // Use ACTUAL content bounds (non-empty tiles only) so the room fills the
  // canvas at 1:1 tile scale (16×16 px per tile, no vertical squish).
  // Measured from Interior1.tmx: content lives at abs tiles x=19..57, y=4..36.
  const intCOX = 19, intCOY = 4;         // content origin (absolute tile coords)
  const intGridCols = 39, intGridRows = 33; // 57-19+1, 36-4+1
  const INT_PW = intGridCols * TW;        // 624 px — canvas width for interior
  const INT_PH = intGridRows * TH;        // 528 px — canvas height for interior

  // Rendering split:
  //   intBaked   — flat floor + carpet + rug, baked once (always below the character)
  //   intFgTiles — walls/objects, Y-sorted with the character each frame
  const FLOOR_GID = 104;
  // Foreground: walls + wall-attached objects (occlude character, sit in front of walls).
  // Boxes (carpet-level furniture) stays in background so character is visible on carpet.
  const INT_FG_LAYERS = new Set(['Walls', 'Windows', 'Objects1', 'Objects2']);
  // The large central rug lives in the Objects1 layer but is floor, not furniture:
  // it must be walkable AND rendered below the character (so she walks over it).
  const INT_RUG_GIDS = new Set([
    403, 404, 405, 406, 407, 416, 417, 418, 419, 420, 421, 422,
    430, 431, 432, 433, 434, 435, 436, 444, 445, 446, 447, 448, 449, 450,
    459, 460, 461, 462, 463, 464, 473, 474, 475, 476,
  ]);
  // Hidden doorways into otherwise-sealed rooms. Each wall stays fully drawn and
  // solid-looking, but is walkable — the character passes through it and is
  // hidden behind the wall/furniture while doing so (a secret-passage effect).
  //   CARVE   — content cells forced walkable (the passage through the barrier).
  //   OVERLAY — foreground tiles here are drawn ON TOP of the character every
  //             frame, so she's occluded while crossing (bands are wider than the
  //             passage since her sprite overhangs it).
  // Cells are 'col,row' in interior content coordinates.
  //   Room 1: bottom-left "potions" room — vertical passage down through the arch.
  //   Room 2: far-right "pantry" — vertical passage up through the arched doorway
  //           at the top-right of the desk room (cols 32-33) into the pantry.
  const INT_DOOR_CARVE = new Set([
    '12,9', '13,9', '12,10', '13,10', '12,11', '13,11',
    '12,12', '13,12', '12,13', '13,13',
    // Arch between desk room (below) and pantry (above): cols 32-33, rows 7-10.
    '32,7', '33,7', '32,8', '33,8', '32,9', '33,9', '32,10', '33,10',
  ]);
  const INT_DOOR_OVERLAY = new Set([
    '11,9', '12,9', '13,9', '14,9', '11,10', '12,10', '13,10', '14,10',
    '11,11', '12,11', '13,11', '14,11', '11,12', '12,12', '13,12', '14,12',
    '11,13', '12,13', '13,13', '14,13',
    // Arch wall band (cols 31-34, rows 7-10), drawn over the character so she's
    // hidden behind the wall/arch while passing through the doorway.
    '31,7', '32,7', '33,7', '34,7', '31,8', '32,8', '33,8', '34,8',
    '31,9', '32,9', '33,9', '34,9', '31,10', '32,10', '33,10', '34,10',
  ]);

  const intBaked = document.createElement('canvas');
  intBaked.width = INT_PW; intBaked.height = INT_PH;
  const ictx = intBaked.getContext('2d');
  ictx.imageSmoothingEnabled = false;

  // Flood-fill base floor into the background canvas
  for (let r = 0; r < intGridRows; r++) {
    for (let c = 0; c < intGridCols; c++) {
      drawTile(ictx, intScene, FLOOR_GID, c * TW, r * TH, 900);
    }
  }
  // Split tiles: flat ground/carpet/rug → baked background; walls + objects →
  // a Y-sorted foreground list so the character is drawn in front of anything
  // whose base is above her feet, and behind anything whose base is below.
  const intFgTiles = [];
  const intDoorOverlay = [];  // doorway wall/arch tiles, always drawn over the character
  for (const layer of intScene.layers) {
    const layerFg = INT_FG_LAYERS.has(layer.name);
    for (const p of layer.placements) {
      const cx = p.tx - intCOX, cy = p.ty - intCOY;
      const isRug = INT_RUG_GIDS.has(p.raw & GID_MASK);
      const dx = cx * TW;
      const dy = cy * TH;
      if (dx < 0 || dy < 0 || dx >= INT_PW || dy >= INT_PH) continue;
      // Doorway wall/furniture tiles: render on top of the character so she
      // vanishes behind them while walking through the secret passage.
      if (layerFg && INT_DOOR_OVERLAY.has(cx + ',' + cy)) {
        intDoorOverlay.push({ raw: p.raw, dx, dy });
      } else if (layerFg && !isRug) {
        intFgTiles.push({ raw: p.raw, dx, dy, anchorY: dy + TH });
      } else {
        drawTile(ictx, intScene, p.raw, dx, dy, 900);
      }
    }
  }
  // Telephone sprite (custom PNG, not a tileset tile) on the bedside nightstand
  // (content col 18, rows 3-4). Centered on the stand, base resting on its top
  // surface, Y-sorted at the nightstand's base edge (row 4 bottom).
  intFgTiles.push({
    img: phoneImg,
    w: phoneImg.width,
    h: phoneImg.height,
    dx: Math.round(18 * TW + TW / 2 - phoneImg.width / 2),
    dy: 55 - phoneImg.height,
    anchorY: 5 * TH,
  });

  // Draw order is stable per frame; sort once by base edge (feet line).
  intFgTiles.sort((a, b) => a.anchorY - b.anchorY);

  // Interior collision — floor-based confinement:
  //   1. Block everything by default (this walls off the empty exterior void,
  //      which has no floor tiles, so the character can never leave the room).
  //   2. Open up designed floor tiles (Floor / Tile Layer 6 / Boxes carpet).
  //   3. Re-block walls and furniture/objects.
  // Doorways in this map are floor archways (open floor with a decorative arch),
  // so they're already walkable via step 2. The Doors_windows tiles are WINDOWS
  // set into the walls — they must stay solid, so we do NOT carve them.
  const INT_FLOOR_LAYERS = new Set(['Floor', 'Tile Layer 6', 'Boxes']);
  const INT_SOLID_LAYERS = new Set(['Walls', 'Objects1', 'Objects2']);
  const intBlocked = new Uint8Array(intGridCols * intGridRows).fill(1);
  const setCell = (p, v) => {
    const cx = p.tx - intCOX, cy = p.ty - intCOY;
    if (cx < 0 || cy < 0 || cx >= intGridCols || cy >= intGridRows) return;
    intBlocked[cy * intGridCols + cx] = v;
  };
  for (const layer of intScene.layers) {
    if (INT_FLOOR_LAYERS.has(layer.name)) for (const p of layer.placements) setCell(p, 0);
  }
  for (const layer of intScene.layers) {
    if (!INT_SOLID_LAYERS.has(layer.name)) continue;
    // Rug tiles stay walkable even though they live in a solid layer.
    for (const p of layer.placements) {
      if (!INT_RUG_GIDS.has(p.raw & GID_MASK)) setCell(p, 1);
    }
  }
  // 4. Carve doorway passages into otherwise-sealed rooms.
  for (const key of INT_DOOR_CARVE) {
    const [cx, cy] = key.split(',').map(Number);
    intBlocked[cy * intGridCols + cx] = 0;
  }
  const intWorld = new World(intBlocked, intGridCols, intGridRows, TW);

  // Interior spawn: on the red carpet (content tile 30,16 = px 480,256), a
  // couple tiles above the exit strip so she doesn't exit on arrival.
  const intSpawnX = 30 * TW;  // 480
  const intSpawnY = 16 * TH;  // 256
  // Exit zone = the entrance carpet (content cols 27-33, rows 16-18) where the
  // character first spawns. The exit prompt only shows here; pressing E returns
  // to the exterior (main) scene.
  const INT_EXIT = { x0: 27 * TW, y0: 16 * TH, x1: 34 * TW, y1: 19 * TH };
  // Camera: how many content-px are scrolled off the top-left edge.
  let intCamX = 0, intCamY = 0;
  // ---- End interior setup --------------------------------------------

  // Spawn on open ground just below the gate; dog a little behind.
  const spawnX = (-3.5 - ox) * TW;
  const spawnY = (8 - oy) * TH + 8; // tile-centered so she isn't wedged
  const girl = new Girl(spawnX, spawnY);
  const dog = new Dog(spawnX - 14, spawnY + 4);

  // --- input ---
  const input = { left: false, right: false, up: false, down: false };
  const KEYMAP = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
  };
  addEventListener('keydown', (e) => {
    const k = KEYMAP[e.key];
    if (k) { input[k] = true; e.preventDefault(); }
  });
  addEventListener('keyup', (e) => {
    const k = KEYMAP[e.key];
    if (k) { input[k] = false; e.preventDefault(); }
  });

  // --- scene state & fade transition ---
  const $ = (id) => document.getElementById(id);
  const fadeEl = $('fade');
  let activeScene = 'exterior';
  let transitioning = false;

  const hudHint = document.querySelector('.hud-hint');
  const hudTop = $('hud-top');
  const sceneFrame = canvas.closest('.scene-frame');

  async function switchScene(to) {
    if (transitioning) return;
    transitioning = true;
    fadeEl.classList.add('active');
    await new Promise(r => setTimeout(r, 380));

    if (to === 'interior') {
      // Keep canvas at W×H — no resize. Camera crops a W×H viewport from intBaked
      // so tiles appear at the same visual scale as the exterior.
      girl.x = intSpawnX; girl.y = intSpawnY;
      intCamX = 128; intCamY = 0;
      // Pre-draw so the bitmap has content before the first rAF fires.
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(intBaked, intCamX, intCamY, W, H, 0, 0, W, H);
      // Reset any inline CSS left by a previous scene switch.
      sceneFrame.style.aspectRatio = '';
      sceneFrame.style.width = '';
      ui.refs.W = W;
      ui.refs.H = H;
      // Prompt anchors are world-space; subtract camera offset to get screen %.
      ui.refs.anchorCSS = (ax, ay) => [
        ((ax - intCamX) / W * 100) + '%',
        ((ay - intCamY) / H * 100) + '%',
      ];
      hudHint.innerHTML = '&#9654; <b>WASD</b> to explore &mdash; <b>E</b> to interact &mdash; walk down to exit';
      hudTop.hidden = true;
    } else {
      girl.x = spawnX; girl.y = spawnY + 4;
      sceneFrame.style.aspectRatio = '';
      sceneFrame.style.width = '';
      ui.refs.W = W;
      ui.refs.H = H;
      ui.refs.anchorCSS = null;
      hudHint.innerHTML = '&#9654; use <b>WASD</b> or <b>arrow keys</b> to move around';
      hudTop.hidden = false;
    }
    dog.x = girl.x - 14; dog.y = girl.y + 4;
    activeScene = to;
    fadeEl.classList.remove('active');
    await new Promise(r => setTimeout(r, 380));
    transitioning = false;
  }

  // --- interactions (door -> enter house) ---
  const ui = new Interactions({
    W, H,
    prompt: $('prompt'),
    panel: $('panel'),
    panelTitle: $('panel-title'),
    panelBody: $('panel-body'),
    panelClose: $('panel-close'),
  }, (hotspot) => {
    if (hotspot.id === 'door') switchScene('interior');
  });
  const noInput = { left: false, right: false, up: false, down: false };

  // Interior exit: E key while in the exit zone and no hotspot panel active.
  let intNearExit = false;
  addEventListener('keydown', (e) => {
    if (activeScene === 'interior' && intNearExit && !ui.active && !ui.isOpen &&
        (e.key === 'e' || e.key === 'E' || e.key === 'Enter')) {
      switchScene('exterior');
      e.preventDefault();
    }
  });

  // Door state machine: closed → opening → open → closing → closed …
  // Reopens every time the character approaches; closes when they leave.
  const DOOR_OPEN_MS = 900; // ms to travel closed→open (or open→closed)
  let doorState = 'closed';  // 'closed' | 'opening' | 'open' | 'closing'
  let doorPhaseStart = 0;    // game-time when current phase began
  let doorT = 0;             // current draw-time fed to drawTile for door tiles

  // Characters appear in the Y-sorted draw list as renderable items.
  const girlItem = { anchorY: 0, isChar: true, draw: (tt) => girl.draw(ctx, charAssets) };
  const dogItem = { anchorY: 0, isChar: true, draw: (tt) => dog.draw(ctx, charAssets) };

  document.getElementById('loading').classList.add('hidden');

  const start = performance.now();
  let last = start;
  function frame(now) {
    const t = now - start;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (activeScene === 'exterior') {
      // Freeze girl while panel open; dog keeps following.
      girl.update(dt, ui.isOpen ? noInput : input, world);
      dog.update(dt, girl, world);
      ui.update(girl);

      // Door state machine: opens when near, closes when far.
      const nearDoor = ui.active?.id === 'door';
      if (doorState === 'closed'  &&  nearDoor) { doorState = 'opening'; doorPhaseStart = t; }
      if (doorState === 'open'    && !nearDoor) { doorState = 'closing'; doorPhaseStart = t; }
      if (doorState === 'opening') {
        doorT = Math.min(t - doorPhaseStart, DOOR_OPEN_MS);
        if (doorT >= DOOR_OPEN_MS) doorState = 'open';
      } else if (doorState === 'open') {
        doorT = DOOR_OPEN_MS;
      } else if (doorState === 'closing') {
        doorT = Math.max(DOOR_OPEN_MS - (t - doorPhaseStart), 0);
        if (doorT <= 0) doorState = 'closed';
      } else {
        doorT = 0;
      }

      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(baked, 0, 0);

      girlItem.anchorY = girl.y + 0.5;
      dogItem.anchorY  = dog.y  + 0.5;
      const order = [...sortedTiles, girlItem, dogItem].sort((a, b) => a.anchorY - b.anchorY);
      for (const it of order) {
        if (it.isChar) it.draw(t);
        else drawTile(ctx, scene, it.raw, it.dx, it.dy, it.isDoor ? doorT : t);
      }
      for (const a of topTiles) drawTile(ctx, scene, a.raw, a.dx, a.dy, t);

    } else {
      // ---- Interior ----
      girl.update(dt, ui.isOpen ? noInput : input, intWorld);

      // Hotspot detection — sets ui.active and shows/hides the floating prompt.
      ui.updateInterior(girl);

      // Camera locked — no follow.

      // Background (floor + carpet + rug) is baked; walls/objects are Y-sorted
      // with the character so she's drawn in front of anything whose base is
      // above her feet, and behind anything whose base is below.
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(intBaked, intCamX, intCamY, W, H, 0, 0, W, H);
      ctx.save();
      ctx.translate(-intCamX, -intCamY);
      let girlDrawn = false;
      for (const it of intFgTiles) {
        if (!girlDrawn && it.anchorY > girl.y) { girl.draw(ctx, charAssets); girlDrawn = true; }
        if (it.img) ctx.drawImage(it.img, it.dx, it.dy, it.w, it.h);
        else drawTile(ctx, intScene, it.raw, it.dx, it.dy, 900);
      }
      if (!girlDrawn) girl.draw(ctx, charAssets);
      // Doorway wall/arch tiles always on top — hides her while she passes through.
      for (const it of intDoorOverlay) drawTile(ctx, intScene, it.raw, it.dx, it.dy, 900);
      ctx.restore();

      // Exit prompt: only while the character is standing on the entrance carpet.
      intNearExit = girl.x >= INT_EXIT.x0 && girl.x <= INT_EXIT.x1 &&
                    girl.y >= INT_EXIT.y0 && girl.y <= INT_EXIT.y1;
      const pr = $('prompt');
      if (intNearExit && !ui.active && !ui.isOpen) {
        // Fixed over the carpet centre — it does not hover on the character.
        const ex = (INT_EXIT.x0 + INT_EXIT.x1) / 2;
        pr.style.left = ((ex - intCamX) / W * 100) + '%';
        pr.style.top  = ((INT_EXIT.y0 - intCamY) / H * 100) + '%';
        pr.querySelector('.prompt-label').textContent = 'Exit';
        pr.hidden = false;
      } else if (!ui.active) {
        pr.hidden = true;
      }
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // expose for quick scripted testing
  window.__game = { girl, dog, world, input };
}

main().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading');
  el.classList.remove('hidden');
  el.innerHTML = '<span style="color:#e0744f">LOAD ERROR — see console</span>';
});
