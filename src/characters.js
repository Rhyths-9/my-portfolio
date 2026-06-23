// Player (girl) + follower (dog) for the top-down scene.
// The girl is a side-view sprite, so movement reads as left/right running
// (sprite flips to face travel direction) with an idle pose when still.
// The dog trails her, easing toward her but keeping a small following distance.

const CHAR_DIR = 'assets/char/';

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('load ' + src));
    img.src = src;
  });
}

export async function loadCharacterAssets() {
  const idle = await Promise.all(
    [1, 2, 3, 4].map((i) => loadImage(`${CHAR_DIR}idle/idle${i}.png`))
  );
  const run = await Promise.all(
    [1, 2, 3, 4, 5, 6].map((i) => loadImage(`${CHAR_DIR}run/run${i}.png`))
  );
  const dog = await loadImage(`${CHAR_DIR}dog.png`);
  return { idle, run, dog };
}

// --- tunables ---
const GIRL_SCALE = 0.9;   // 64px frame -> ~58px tall (body ~28px)
const DOG_SCALE = 0.85;   // 16px -> ~14px
const GIRL_SPEED = 70;    // px/sec (native scene px)
const DOG_SPEED = 95;     // a touch faster so it keeps up
const FOLLOW_DIST = 18;   // dog rests this far from the girl
const IDLE_FPS = 6;
const RUN_FPS = 12;

// Collision foot-boxes (centered on the character's ground point).
const GIRL_FOOT = { w: 10, h: 4 };
const DOG_FOOT = { w: 8, h: 3 };

export class World {
  // blocked: Uint8Array grid (1 = solid), cols x rows, tile size TW.
  constructor(blocked, cols, rows, tw) {
    this.blocked = blocked;
    this.cols = cols;
    this.rows = rows;
    this.tw = tw;
    this.w = cols * tw;
    this.h = rows * tw;
  }
  solidAt(px, py) {
    if (px < 0 || py < 0 || px >= this.w || py >= this.h) return true;
    const tx = (px / this.tw) | 0;
    const ty = (py / this.tw) | 0;
    return this.blocked[ty * this.cols + tx] === 1;
  }
  // Is the foot-box (centered at cx,cy) free of solids?
  boxFree(cx, cy, box) {
    const hw = box.w / 2, hh = box.h / 2;
    return !(
      this.solidAt(cx - hw, cy - hh) ||
      this.solidAt(cx + hw, cy - hh) ||
      this.solidAt(cx - hw, cy + hh) ||
      this.solidAt(cx + hw, cy + hh)
    );
  }
}

// Move a point by (dx,dy) against the world, resolving axes separately so the
// character slides along walls instead of sticking.
function moveResolved(world, x, y, dx, dy, box) {
  let nx = x + dx;
  if (!world.boxFree(nx, y, box)) nx = x;
  let ny = y + dy;
  if (!world.boxFree(nx, ny, box)) ny = y;
  return [nx, ny];
}

export class Girl {
  constructor(x, y) {
    this.x = x; this.y = y;       // ground point (feet)
    this.facing = 1;              // 1 = right, -1 = left
    this.moving = false;
    this.animT = 0;
  }
  update(dt, input, world) {
    let dx = 0, dy = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    const len = Math.hypot(dx, dy);
    this.moving = len > 0;
    if (this.moving) {
      dx /= len; dy /= len;
      if (dx < -0.01) this.facing = -1;
      else if (dx > 0.01) this.facing = 1;
      [this.x, this.y] = moveResolved(
        world, this.x, this.y, dx * GIRL_SPEED * dt, dy * GIRL_SPEED * dt, GIRL_FOOT
      );
      this.animT += dt;
    } else {
      this.animT += dt;
    }
  }
  draw(ctx, assets) {
    const frames = this.moving ? assets.run : assets.idle;
    const fps = this.moving ? RUN_FPS : IDLE_FPS;
    const frame = frames[Math.floor(this.animT * fps) % frames.length];
    drawSprite(ctx, frame, this.x, this.y, GIRL_SCALE, this.facing);
  }
}

export class Dog {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.facing = 1;
    this.moving = false;
    this.bobT = 0;
  }
  update(dt, target, world) {
    const tx = target.x, ty = target.y;
    let dx = tx - this.x, dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    this.moving = dist > FOLLOW_DIST + 1;
    if (this.moving) {
      dx /= dist; dy /= dist;
      const step = Math.min(DOG_SPEED * dt, dist - FOLLOW_DIST);
      [this.x, this.y] = moveResolved(world, this.x, this.y, dx * step, dy * step, DOG_FOOT);
      if (dx < -0.05) this.facing = -1;
      else if (dx > 0.05) this.facing = 1;
      this.bobT += dt;
    }
  }
  draw(ctx, assets) {
    const bob = this.moving ? Math.abs(Math.sin(this.bobT * 12)) * 1.5 : 0;
    drawSprite(ctx, assets.dog, this.x, this.y - bob, DOG_SCALE, this.facing);
  }
}

// Draw a sprite anchored at its bottom-center on (x,y), optionally flipped.
function drawSprite(ctx, img, x, y, scale, facing) {
  if (!img) return; // skip a not-yet-decoded frame rather than kill the loop
  const w = img.width * scale;
  const h = img.height * scale;
  if (facing >= 0) {
    ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h), w, h);
  } else {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(-1, 1);
    ctx.drawImage(img, Math.round(-w / 2), -h, w, h);
    ctx.restore();
  }
}
