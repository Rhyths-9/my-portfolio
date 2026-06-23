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

import { loadCharacterAssets, World, Girl, Dog } from './characters.js';
import { Interactions } from './interactions.js';

const ASSET_DIR = 'assets/';
const TMX_URL = ASSET_DIR + 'Exterior.tmx';

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
  const layers = [];
  for (const layer of doc.querySelectorAll('map > layer')) {
    const placements = [];
    for (const chunk of layer.querySelectorAll('data > chunk')) {
      const cx = +chunk.getAttribute('x');
      const cy = +chunk.getAttribute('y');
      const cw = +chunk.getAttribute('width');
      const nums = chunk.textContent.match(/-?\d+/g) || [];
      for (let i = 0; i < nums.length; i++) {
        const raw = Number(nums[i]) >>> 0; // unsigned
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
  const [scene, charAssets] = await Promise.all([
    parseTmx(TMX_URL),
    loadCharacterAssets(),
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
  function treeGroupAnchorY(dx, dy) {
    let y = dy;
    while (treePxSet.has(`${dx},${y + TH}`)) y += TH;
    return y + TH;
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
        // Trees use the trunk-bottom anchor so the whole tree occludes at once.
        const anchorY = tsName === 'Trees_animation'
          ? treeGroupAnchorY(dx, dy)
          : dy + TH;
        sortedTiles.push({ raw: p.raw, dx, dy, anchorY });
      }
    }
  }

  const world = new World(blocked, cols, rows, TW);

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

  // --- interactions (door -> About, etc.) ---
  const $ = (id) => document.getElementById(id);
  const ui = new Interactions({
    W, H,
    prompt: $('prompt'),
    panel: $('panel'),
    panelTitle: $('panel-title'),
    panelBody: $('panel-body'),
    panelClose: $('panel-close'),
  });
  const noInput = { left: false, right: false, up: false, down: false };

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

    // Freeze the girl while a panel is open; the dog keeps ambling to her.
    girl.update(dt, ui.isOpen ? noInput : input, world);
    dog.update(dt, girl, world);
    ui.update(girl);

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(baked, 0, 0); // flat ground

    // Y-sort standing tiles + characters by bottom edge, then draw. A character
    // tied with a tile draws in front (epsilon), so she stands just ahead of a
    // tile on the same row but behind a tile whose base is lower (closer).
    girlItem.anchorY = girl.y + 0.5;
    dogItem.anchorY = dog.y + 0.5;
    const order = [...sortedTiles, girlItem, dogItem].sort((a, b) => a.anchorY - b.anchorY);
    for (const it of order) {
      if (it.isChar) it.draw(t);
      else drawTile(ctx, scene, it.raw, it.dx, it.dy, t);
    }

    // Birds, smoke, cat above everything.
    for (const a of topTiles) drawTile(ctx, scene, a.raw, a.dx, a.dy, t);

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
