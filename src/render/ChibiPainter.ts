import type { ArmamentIconKind, MonsterKind, RelicId, UnitId } from '../data/types';

/**
 * 32x32 SD Wuxia pixel-art renderer ('King God Castle' / 'Guardian Tales' style).
 *
 * Hard artistic rules enforced across every unit & monster:
 * 1. Crisp dark brown-purple outline (#1a1224) + internal chin/collar separation.
 * 2. Cute 1.5-head-tall big-head SD proportions (head y=6..18, body+feet y=19..30).
 * 3. Strictly ZERO white sclera pixels in eyes — dark #1a1224 bean eyes + 1px catchlight only.
 * 4. Asymmetric 3/4 diagonal combat poses & 4-stage cel shading on every material.
 */

const GRID = 32;
export const PIXEL_OUTLINE = '#1a1224';

type Ramp4 = readonly [string, string, string, string]; // [highlight, light, mid, shadow]

const SKIN_WARM: Ramp4 = ['#fff4e8', '#ffdfc4', '#f0b890', '#c9855e'];
const SKIN_TAN: Ramp4 = ['#fae5cf', '#ecc19c', '#d19568', '#9e623c'];
const SKIN_PALE: Ramp4 = ['#fff5eb', '#f5d6be', '#d8a98b', '#a37358'];
const SKIN_ZOMBIE: Ramp4 = ['#d9f2ee', '#9dd6ce', '#63a9a1', '#3b736f'];
const BONE_RAMP: Ramp4 = ['#ffffff', '#f1ede4', '#cfc6b4', '#8f8470'];

const HAIR_BLACK: Ramp4 = ['#584d70', '#392f4f', '#251d38', '#171126'];
const HAIR_BROWN: Ramp4 = ['#8f6249', '#6b442f', '#4a2c1d', '#2e1a11'];
const HAIR_SILVER: Ramp4 = ['#ffffff', '#e2e8f0', '#94a3b8', '#475569'];
const HAIR_CRIMSON: Ramp4 = ['#fda4af', '#f43f5e', '#be123c', '#7f1d1d'];
const HAIR_FLAME: Ramp4 = ['#fef08a', '#fb923c', '#ef4444', '#991b1b'];

const ROBE_GOLD: Ramp4 = ['#fef08a', '#facc15', '#d97706', '#92400e'];
const ROBE_WHITE: Ramp4 = ['#ffffff', '#eef2f6', '#cbd5e1', '#64748b'];
const ROBE_PLUM: Ramp4 = ['#ffe4e6', '#fda4af', '#f43f5e', '#9f1239'];
const ROBE_VIOLET: Ramp4 = ['#f3e8ff', '#c084fc', '#7e22ce', '#4c1d95'];
const ROBE_AZURE: Ramp4 = ['#e0f2fe', '#7dd3fc', '#0284c7', '#1e3a8a'];
const ROBE_COBALT: Ramp4 = ['#dbeafe', '#60a5fa', '#2563eb', '#172554'];
const ROBE_EARTH: Ramp4 = ['#fef3c7', '#d6a86e', '#9a6b3b', '#5c3a1b'];
const ROBE_JADE: Ramp4 = ['#dcfce7', '#4ade80', '#16a34a', '#14532d'];
const ROBE_CRIMSON: Ramp4 = ['#ffe4e6', '#fb7185', '#dc2626', '#7f1d1d'];
const ROBE_OBSIDIAN: Ramp4 = ['#6d4c6b', '#472c4c', '#2b1733', '#190c21'];
const ROBE_DEMON: Ramp4 = ['#881337', '#581028', '#360919', '#1f040e'];
const STRAW_RAMP: Ramp4 = ['#fef9c3', '#eab308', '#a16207', '#633b05'];
const STEEL_RAMP: Ramp4 = ['#ffffff', '#dbeafe', '#94a3b8', '#475569'];
const CYAN_QI: Ramp4 = ['#ffffff', '#a5f3fc', '#06b6d4', '#0e7490'];
const GOLD_QI: Ramp4 = ['#ffffff', '#fef08a', '#f59e0b', '#b45309'];
const VENOM_QI: Ramp4 = ['#ecfccb', '#86efac', '#22c55e', '#15803d'];

const LAYER_BACK = 1;
const LAYER_BODY = 2;
const LAYER_HEAD = 3;
const LAYER_FRONT = 4;
const LAYER_FX = 5;

class PixelCanvas {
  private readonly colors = new Array<string | null>(GRID * GRID).fill(null);
  private readonly layers = new Uint8Array(GRID * GRID);

  public set(x: number, y: number, color: string, layer = LAYER_BODY): void {
    const ix = x | 0;
    const iy = y | 0;
    if (ix < 0 || ix >= GRID || iy < 0 || iy >= GRID) return;
    const idx = iy * GRID + ix;
    if (layer >= this.layers[idx]!) {
      this.colors[idx] = color;
      this.layers[idx] = layer;
    }
  }

  public rect(x: number, y: number, w: number, h: number, color: string, layer = LAYER_BODY): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.set(x + dx, y + dy, color, layer);
      }
    }
  }

  public hline(x0: number, x1: number, y: number, color: string, layer = LAYER_BODY): void {
    const a = Math.min(x0, x1);
    const b = Math.max(x0, x1);
    for (let x = a; x <= b; x++) this.set(x, y, color, layer);
  }

  public vline(x: number, y0: number, y1: number, color: string, layer = LAYER_BODY): void {
    const a = Math.min(y0, y1);
    const b = Math.max(y0, y1);
    for (let y = a; y <= b; y++) this.set(x, y, color, layer);
  }

  public line(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: string,
    layer = LAYER_FRONT,
    thickness = 1,
  ): void {
    let cx = Math.round(x0);
    let cy = Math.round(y0);
    const tx = Math.round(x1);
    const ty = Math.round(y1);
    const dx = Math.abs(tx - cx);
    const dy = Math.abs(ty - cy);
    const sx = cx < tx ? 1 : -1;
    const sy = cy < ty ? 1 : -1;
    let err = dx - dy;
    while (true) {
      if (thickness <= 1) {
        this.set(cx, cy, color, layer);
      } else {
        this.rect(cx, cy, thickness, thickness, color, layer);
      }
      if (cx === tx && cy === ty) break;
      const e2 = err * 2;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
  }

  public disc(cx: number, cy: number, r: number, ramp: Ramp4, layer = LAYER_BODY): void {
    const ir = Math.ceil(r);
    for (let dy = -ir; dy <= ir; dy++) {
      for (let dx = -ir; dx <= ir; dx++) {
        if (dx * dx + dy * dy <= r * r + 0.25) {
          const light = dx * -0.45 + dy * -0.65;
          const tone =
            light > r * 0.35
              ? ramp[0]
              : light > -r * 0.05
                ? ramp[1]
                : light > -r * 0.42
                  ? ramp[2]
                  : ramp[3];
          this.set(Math.round(cx + dx), Math.round(cy + dy), tone, layer);
        }
      }
    }
  }

  public ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    ramp: Ramp4,
    layer = LAYER_BODY,
  ): void {
    const irx = Math.ceil(rx);
    const iry = Math.ceil(ry);
    const rxSq = Math.max(0.5, rx * rx);
    const rySq = Math.max(0.5, ry * ry);
    for (let dy = -iry; dy <= iry; dy++) {
      for (let dx = -irx; dx <= irx; dx++) {
        if ((dx * dx) / rxSq + (dy * dy) / rySq <= 1.05) {
          const light = (dx / Math.max(1, rx)) * -0.45 + (dy / Math.max(1, ry)) * -0.65;
          const tone =
            light > 0.35
              ? ramp[0]
              : light > -0.05
                ? ramp[1]
                : light > -0.42
                  ? ramp[2]
                  : ramp[3];
          this.set(Math.round(cx + dx), Math.round(cy + dy), tone, layer);
        }
      }
    }
  }

  public rampBox(x: number, y: number, w: number, h: number, ramp: Ramp4, layer = LAYER_BODY): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        let tone = ramp[1];
        if (dy === 0 || (dy === 1 && dx < w - 2)) tone = ramp[0];
        else if (dy >= h - 2 || dx >= w - 2) tone = ramp[3];
        else if (dy >= Math.floor(h * 0.6) || dx === 0) tone = ramp[2];
        this.set(x + dx, y + dy, tone, layer);
      }
    }
  }

  public flush(ctx: CanvasRenderingContext2D, canvasSize: number): void {
    const out = this.colors.slice();

    // 1. Internal jawline separation: crisp dark line directly under head chin over torso
    for (let y = 1; y < GRID - 1; y++) {
      for (let x = 1; x < GRID - 1; x++) {
        const idx = y * GRID + x;
        const myLayer = this.layers[idx]!;
        if (myLayer === LAYER_BODY && this.layers[(y - 1) * GRID + x] === LAYER_HEAD) {
          out[idx] = PIXEL_OUTLINE;
        }
      }
    }

    // 2. Outer 4-neighbour silhouette outline (#1a1224)
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const idx = y * GRID + x;
        if (this.layers[idx]! !== 0) continue;
        const hasNeighbor =
          (x > 0 && this.layers[idx - 1]! > 0) ||
          (x < GRID - 1 && this.layers[idx + 1]! > 0) ||
          (y > 0 && this.layers[idx - GRID]! > 0) ||
          (y < GRID - 1 && this.layers[idx + GRID]! > 0);
        if (hasNeighbor) {
          out[idx] = PIXEL_OUTLINE;
        }
      }
    }

    const scale = Math.max(1, Math.floor(canvasSize / GRID));
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    ctx.imageSmoothingEnabled = false;

    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const col = out[y * GRID + x];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }
}

/* ========================================================================== */
/*  Shared 1.5-head-tall 3/4 Chibi Anatomy & Martial Gear Helpers             */
/* ========================================================================== */

interface EyeSpec {
  readonly glint?: string;
  readonly browColor?: string;
  readonly fierce?: boolean;
  readonly blush?: string | null;
  readonly scar?: boolean;
}

/**
 * 3/4 right-facing big chibi head (y=8..18, x=7..19) with 4-stage cel shading.
 * Strictly dark #1a1224 bean eyes + single catchlight pixel (ZERO white sclera).
 */
function paintHead34(p: PixelCanvas, skin: Ramp4, eye: EyeSpec = {}): void {
  // Chubby 3/4 face block (12px wide x 10px tall)
  for (let y = 8; y <= 18; y++) {
    const x0 = y <= 9 || y === 18 ? 9 : 8;
    const x1 = y <= 9 ? 18 : y === 18 ? 17 : 19;
    for (let x = x0; x <= x1; x++) {
      let c = skin[1];
      if (y <= 11 && x >= 10 && x <= 15) c = skin[0]; // Forehead highlight
      else if (x === x0 || y === 17) c = skin[2]; // Left cheek & lower jaw mid-shade
      if (x === x1 || y === 18 || (x <= 9 && y >= 16)) c = skin[3]; // Deep 3/4 shadow
      p.set(x, y, c, LAYER_HEAD);
    }
  }
  // Left ear (3/4 perspective shows left ear clearly)
  p.set(7, 13, skin[2], LAYER_HEAD);
  p.set(7, 14, skin[3], LAYER_HEAD);
  p.set(7, 15, skin[3], LAYER_HEAD);

  // Optional cute cheek blush or battle scar
  if (eye.blush) {
    p.set(10, 16, eye.blush, LAYER_HEAD);
    p.set(11, 16, eye.blush, LAYER_HEAD);
    p.set(18, 16, eye.blush, LAYER_HEAD);
  }
  if (eye.scar) {
    p.set(10, 12, '#9f1239', LAYER_HEAD);
    p.set(11, 13, '#9f1239', LAYER_HEAD);
  }

  // Dark bean eyes (2x3 vertical beans at x=12..13 and x=17..18, shifted right for 3/4 turn)
  const glint = eye.glint ?? '#fef3c7';
  // Left bean eye
  p.rect(12, 13, 2, 3, PIXEL_OUTLINE, LAYER_HEAD);
  p.set(12, 13, glint, LAYER_HEAD); // 1px upper-left catchlight ONLY
  // Right bean eye
  p.rect(17, 13, 2, 3, PIXEL_OUTLINE, LAYER_HEAD);
  p.set(17, 13, glint, LAYER_HEAD); // 1px upper-left catchlight ONLY

  // Expressive eyebrows
  const brow = eye.browColor ?? '#2b1d38';
  if (eye.fierce) {
    p.set(11, 11, brow, LAYER_HEAD);
    p.set(12, 12, brow, LAYER_HEAD);
    p.set(13, 12, brow, LAYER_HEAD);
    p.set(17, 12, brow, LAYER_HEAD);
    p.set(18, 11, brow, LAYER_HEAD);
  } else {
    p.hline(11, 13, 11, brow, LAYER_HEAD);
    p.hline(17, 18, 11, brow, LAYER_HEAD);
  }
}

/**
 * Compact 1.5-head SD martial robe & asymmetric 3/4 combat stride (y=19..30).
 */
function paintMartialBody34(
  p: PixelCanvas,
  robe: Ramp4,
  collar: Ramp4,
  sashColor: string,
  bootColor = '#2d2238',
): void {
  // Asymmetric combat boots (back foot upper-left, front foot lunging lower-right)
  p.rect(8, 28, 3, 2, bootColor, LAYER_BODY);
  p.set(8, 28, '#524163', LAYER_BODY);
  p.rect(16, 29, 4, 2, bootColor, LAYER_BODY);
  p.set(17, 29, '#524163', LAYER_BODY);

  // Upper martial tunic (y=19..24) + flared skirt hem (y=25..28)
  for (let y = 19; y <= 27; y++) {
    const x0 = y <= 22 ? 9 : 8;
    const x1 = y <= 23 ? 18 : 19;
    for (let x = x0; x <= x1; x++) {
      const tone =
        x <= 9 ? robe[3] : x <= 12 ? robe[2] : x <= 15 ? robe[0] : x <= 17 ? robe[1] : robe[2];
      p.set(x, y, tone, LAYER_BODY);
    }
  }

  // Authentic Wuxia diagonal Y-lapel (교령)
  p.set(11, 19, collar[0], LAYER_BODY);
  p.set(12, 20, collar[0], LAYER_BODY);
  p.set(13, 21, collar[1], LAYER_BODY);
  p.set(14, 22, collar[1], LAYER_BODY);
  p.set(16, 19, collar[1], LAYER_BODY);
  p.set(15, 20, collar[2], LAYER_BODY);

  // Back left arm in martial guard
  p.rect(7, 20, 2, 4, robe[2], LAYER_BODY);
  p.set(7, 23, robe[3], LAYER_BODY);

  // Waist sash + trailing ribbon on left
  p.hline(9, 18, 24, sashColor, LAYER_BODY);
  p.set(13, 24, collar[0], LAYER_BODY);
  p.set(7, 25, sashColor, LAYER_BACK);
  p.set(6, 26, sashColor, LAYER_BACK);

  // Front weapon-wielding sleeve & hand reaching right
  p.rect(18, 21, 3, 3, robe[1], LAYER_FRONT);
  p.set(18, 23, robe[2], LAYER_FRONT);
  p.rect(20, 22, 2, 2, SKIN_WARM[1], LAYER_FRONT);
}

function paintCapeLeft(p: PixelCanvas, ramp: Ramp4, long = false): void {
  const maxY = long ? 29 : 27;
  for (let y = 16; y <= maxY; y++) {
    const leftX = Math.max(2, 8 - Math.floor((y - 15) * 0.55));
    for (let x = leftX; x <= 9; x++) {
      if (y === maxY && (x + y) % 2 === 0) continue; // Tattered dynamic hem
      const tone =
        x === leftX ? ramp[0] : x <= leftX + 2 ? ramp[1] : x <= 7 ? ramp[2] : ramp[3];
      p.set(x, y, tone, LAYER_BACK);
    }
  }
}

function paintHairTopknot(
  p: PixelCanvas,
  hair: Ramp4,
  ribbonColor: string,
  longTail = false,
): void {
  // Voluminous hair framing forehead & left crown + asymmetric manhwa fringe
  for (let y = 6; y <= 13; y++) {
    const x0 = y <= 7 ? 9 : 7;
    const x1 = y <= 7 ? 18 : 19;
    for (let x = x0; x <= x1; x++) {
      if (y >= 10 && x >= 10 && x <= 18) continue; // Face opening
      const tone = y <= 7 && x <= 14 ? hair[0] : x <= 11 ? hair[1] : x <= 16 ? hair[2] : hair[3];
      p.set(x, y, tone, LAYER_HEAD);
    }
  }
  // Asymmetric Wuxia center-right bang lock & left temple sidelock (옆머리)
  p.set(14, 10, hair[1], LAYER_HEAD);
  p.set(15, 10, hair[2], LAYER_HEAD);
  p.set(15, 11, hair[2], LAYER_HEAD);
  p.set(9, 10, hair[1], LAYER_HEAD);
  p.set(8, 13, hair[2], LAYER_HEAD);
  p.set(8, 14, hair[3], LAYER_HEAD);

  // Topknot bun (상투) shifted slightly left-back for 3/4 angle
  p.rect(11, 3, 5, 3, hair[1], LAYER_HEAD);
  p.hline(12, 14, 3, hair[0], LAYER_HEAD);
  p.set(15, 5, hair[3], LAYER_HEAD);
  // Sect ribbon / crown tie + fluttering tail to upper-left
  p.hline(11, 15, 6, ribbonColor, LAYER_HEAD);
  p.set(9, 5, ribbonColor, LAYER_BACK);
  p.set(8, 6, ribbonColor, LAYER_BACK);
  if (longTail) {
    p.set(6, 5, ribbonColor, LAYER_BACK);
    p.set(5, 6, ribbonColor, LAYER_BACK);
    p.set(7, 7, ribbonColor, LAYER_BACK);
    p.line(9, 7, 4, 13, hair[1], LAYER_BACK, 2);
    p.line(8, 9, 4, 15, hair[2], LAYER_BACK, 1);
  }
}

function paintFlowingMane(p: PixelCanvas, hair: Ramp4, crownColor?: string): void {
  // Dramatic cascading Wuxia long hair (백발/혈발 장발) billowing left + swept bangs
  for (let y = 5; y <= 14; y++) {
    const x0 = y <= 6 ? 8 : 6;
    const x1 = y <= 7 ? 19 : 20;
    for (let x = x0; x <= x1; x++) {
      if (y >= 10 && x >= 10 && x <= 18) continue;
      const tone = y <= 7 && x <= 14 ? hair[0] : x <= 12 ? hair[1] : hair[2];
      p.set(x, y, tone, LAYER_HEAD);
    }
  }
  // Swept Wuxia bangs & long temple locks framing cheeks
  p.set(14, 10, hair[0], LAYER_HEAD);
  p.set(15, 10, hair[1], LAYER_HEAD);
  p.set(15, 11, hair[2], LAYER_HEAD);
  p.set(9, 10, hair[1], LAYER_HEAD);
  p.set(8, 14, hair[2], LAYER_HEAD);
  p.set(8, 15, hair[2], LAYER_HEAD);
  p.set(19, 10, hair[2], LAYER_HEAD);

  // Cascading mane behind shoulders (x=2..9, y=10..25)
  for (let y = 10; y <= 25; y++) {
    const lx = Math.max(1, 7 - Math.floor((y - 9) * 0.42));
    for (let x = lx; x <= 8; x++) {
      if (y >= 22 && (x + y) % 2 === 1) continue;
      const tone = x === lx ? hair[0] : x <= lx + 2 ? hair[1] : hair[2];
      p.set(x, y, tone, LAYER_BACK);
    }
  }
  if (crownColor) {
    p.hline(11, 16, 5, crownColor, LAYER_HEAD);
    p.set(13, 3, crownColor, LAYER_HEAD);
    p.set(14, 4, '#ffffff', LAYER_HEAD);
  }
}

/** Forward-lunging horizontal-diagonal sword thrust (검기 찌르기 자세) for variety. */
function paintThrustSword(p: PixelCanvas, blade: Ramp4, hiltColor = '#eab308'): void {
  p.set(18, 22, hiltColor, LAYER_FRONT);
  p.vline(20, 19, 24, hiltColor, LAYER_FRONT);
  for (let i = 0; i <= 9; i++) {
    const bx = 21 + i;
    const by = 21 - Math.floor(i * 0.45);
    p.set(bx, by, blade[0], LAYER_FRONT);
    p.set(bx, by + 1, blade[1], LAYER_FRONT);
    p.set(bx - 1, by + 2, blade[2], LAYER_FRONT);
  }
}

function paintSatgat(p: PixelCanvas, ramp: Ramp4, accentBand = '#dc2626'): void {
  // Wide conical bamboo hat tilted stylishly in 3/4 view
  p.hline(11, 16, 3, ramp[0], LAYER_FRONT);
  p.hline(9, 18, 4, ramp[0], LAYER_FRONT);
  p.hline(7, 20, 5, ramp[1], LAYER_FRONT);
  p.hline(9, 18, 6, accentBand, LAYER_FRONT);
  p.hline(4, 23, 7, ramp[1], LAYER_FRONT);
  p.hline(3, 24, 8, ramp[2], LAYER_FRONT);
  p.hline(5, 22, 9, ramp[3], LAYER_FRONT);
}

/** Crisp 3/4 diagonal straight sword (장검) from front hand (20,22) to upper-right (29,5). */
function paintDiagonalSword(
  p: PixelCanvas,
  blade: Ramp4,
  hiltColor = '#eab308',
  wide = false,
): void {
  // Pommel & grip
  p.set(19, 24, hiltColor, LAYER_FRONT);
  p.set(20, 23, '#7c2d12', LAYER_FRONT);
  // Crossguard
  p.line(18, 20, 23, 23, hiltColor, LAYER_FRONT);
  // Diagonal gleaming blade
  for (let i = 0; i <= 15; i++) {
    const bx = 21 + Math.floor(i * 0.56);
    const by = 20 - i;
    p.set(bx, by, blade[0], LAYER_FRONT);
    p.set(bx + 1, by, blade[1], LAYER_FRONT);
    if (wide) {
      p.set(bx + 1, by + 1, blade[2], LAYER_FRONT);
      p.set(bx + 2, by + 1, blade[3], LAYER_FRONT);
    } else {
      p.set(bx + 1, by + 1, blade[2], LAYER_FRONT);
    }
  }
}

/** Heavy curved unorthodox/demonic saber (혈도/대도) with wide curved belly. */
function paintCurvedSaber(p: PixelCanvas, blade: Ramp4, hiltColor = '#eab308'): void {
  p.set(19, 24, hiltColor, LAYER_FRONT);
  p.line(18, 21, 22, 23, hiltColor, LAYER_FRONT);
  for (let i = 0; i <= 15; i++) {
    const curve = i >= 8 ? Math.floor((i - 7) * 0.45) : 0;
    const bx = 21 + Math.floor(i * 0.5) - curve;
    const by = 20 - i;
    p.set(bx, by, blade[0], LAYER_FRONT);
    p.set(bx + 1, by, blade[1], LAYER_FRONT);
    p.set(bx + 2, by, blade[2], LAYER_FRONT);
    if (i >= 5 && i <= 13) {
      p.set(bx + 3, by + 1, blade[3], LAYER_FRONT);
    }
  }
}

/** Double-bulb waist/back gourd (표주박) with red cord. */
function paintGourd(p: PixelCanvas, x: number, y: number, ramp: Ramp4): void {
  p.disc(x, y - 3, 2.2, ramp, LAYER_BACK);
  p.disc(x, y + 2, 3.3, ramp, LAYER_BACK);
  p.hline(x - 2, x + 2, y - 1, '#dc2626', LAYER_BACK);
  p.set(x, y - 6, '#92400e', LAYER_BACK);
}

/** Floating plum blossom petals around Hwasan masters. */
function paintPlumPetals(p: PixelCanvas): void {
  const spots = [
    [4, 9],
    [27, 13],
    [25, 24],
    [5, 19],
  ] as const;
  for (const [px, py] of spots) {
    p.set(px, py, '#fda4af', LAYER_FX);
    p.set(px + 1, py, '#f43f5e', LAYER_FX);
  }
}

/* ========================================================================== */
/*  30 Wuxia Unit Pixel Painters                                              */
/* ========================================================================== */

export function paintUnitChibi(
  ctx: CanvasRenderingContext2D,
  unitId: UnitId,
  canvasSize = ctx.canvas.width,
): void {
  const p = new PixelCanvas();

  switch (unitId) {
    /* -------------------- 구파일방 · 정파 (Orthodox) -------------------- */
    case 'shaolin_novice': {
      // Shaved shiny monk head + 6 golden ordination dots + giant prayer beads + wooden staff
      paintHead34(p, SKIN_WARM, { blush: '#f4979c' });
      // Round shaved crown (y=6..8)
      p.hline(10, 17, 7, SKIN_WARM[0], LAYER_HEAD);
      p.hline(11, 16, 6, SKIN_WARM[0], LAYER_HEAD);
      p.rect(10, 7, 2, 2, '#ffffff', LAYER_HEAD); // Cute bald head shine!
      // 6 monk dots (계바)
      p.set(13, 9, '#d97706', LAYER_HEAD);
      p.set(15, 9, '#d97706', LAYER_HEAD);
      p.set(13, 10, '#d97706', LAYER_HEAD);
      p.set(15, 10, '#d97706', LAYER_HEAD);
      paintMartialBody34(p, ROBE_GOLD, ROBE_CRIMSON, '#b45309');
      // Oversized red prayer beads (염주) across torso
      for (let i = 0; i < 4; i++) {
        p.rect(10 + i * 2, 19 + i, 2, 2, i % 2 === 0 ? '#dc2626' : '#fef08a', LAYER_FRONT);
      }
      // Wooden monk staff diagonal right
      p.line(19, 27, 28, 6, '#b45309', LAYER_FRONT, 2);
      p.line(19, 26, 28, 5, '#fde68a', LAYER_FRONT, 1);
      break;
    }

    case 'hwasan_novice': {
      // Hwasan white uniform + pink plum topknot ribbon + steel jian
      paintHead34(p, SKIN_WARM, { blush: '#f4979c' });
      paintHairTopknot(p, HAIR_BLACK, '#f43f5e', false);
      paintMartialBody34(p, ROBE_WHITE, ROBE_PLUM, '#f43f5e');
      paintDiagonalSword(p, STEEL_RAMP, '#f43f5e', false);
      p.set(27, 8, '#fda4af', LAYER_FX);
      break;
    }

    case 'mudang_disciple': {
      // Azure Taoist robe + jade crown + white horsehair whisk (불진) & sword
      paintHead34(p, SKIN_WARM, { blush: '#f4979c' });
      paintHairTopknot(p, HAIR_BLACK, '#38bdf8', false);
      p.rect(12, 3, 3, 3, '#0284c7', LAYER_HEAD);
      p.set(13, 4, '#bae6fd', LAYER_HEAD);
      paintMartialBody34(p, ROBE_AZURE, ROBE_WHITE, '#1e3a8a');
      // White flowing horsetail whisk sweeping right
      p.line(20, 23, 24, 15, '#92400e', LAYER_FRONT, 1);
      p.line(24, 15, 29, 7, '#ffffff', LAYER_FRONT, 2);
      p.line(25, 16, 30, 10, '#bae6fd', LAYER_FRONT, 2);
      break;
    }

    case 'gaebang_beggar': {
      // Messy spiky hair + bandana + big waist gourd (표주박) + green bamboo 타구봉
      paintHead34(p, SKIN_TAN, { fierce: false, blush: '#e8998d' });
      paintHairTopknot(p, HAIR_BROWN, '#16a34a', false);
      // Spiky stray tufts
      p.set(7, 8, HAIR_BROWN[1], LAYER_HEAD);
      p.set(20, 8, HAIR_BROWN[2], LAYER_HEAD);
      paintGourd(p, 5, 22, STRAW_RAMP);
      paintMartialBody34(p, ROBE_EARTH, ROBE_JADE, '#15803d');
      // Emerald bamboo Dog-Beating Staff (타구봉)
      p.line(18, 28, 29, 5, '#16a34a', LAYER_FRONT, 2);
      p.line(18, 27, 29, 4, '#86efac', LAYER_FRONT, 1);
      p.set(23, 16, '#fef08a', LAYER_FRONT);
      p.set(26, 10, '#fef08a', LAYER_FRONT);
      break;
    }

    case 'plum_swordsman': {
      // Flowing ponytail + twin pink plum ribbons + forward lunging plum-sword thrust + petals
      paintCapeLeft(p, ROBE_PLUM, false);
      paintHead34(p, SKIN_WARM, { glint: '#ffe4e6', fierce: true });
      paintHairTopknot(p, HAIR_BLACK, '#f43f5e', true);
      paintMartialBody34(p, ROBE_WHITE, ROBE_PLUM, '#e11d48');
      paintThrustSword(p, ROBE_PLUM, '#facc15');
      paintPlumPetals(p);
      break;
    }

    case 'shaolin_monk': {
      // Muscular warrior monk + giant crimson prayer beads + blazing golden brass staff/fist
      paintCapeLeft(p, ROBE_CRIMSON, false);
      paintHead34(p, SKIN_TAN, { fierce: true, glint: '#fef08a' });
      p.hline(10, 17, 7, SKIN_TAN[0], LAYER_HEAD);
      p.hline(11, 16, 6, SKIN_TAN[0], LAYER_HEAD);
      p.rect(10, 7, 2, 2, '#fffbeb', LAYER_HEAD);
      p.hline(9, 19, 10, '#dc2626', LAYER_HEAD); // Fierce red headband!
      p.set(6, 10, '#dc2626', LAYER_BACK);
      p.set(5, 11, '#dc2626', LAYER_BACK);
      paintMartialBody34(p, ROBE_GOLD, ROBE_CRIMSON, '#7f1d1d');
      // Giant prayer beads around shoulders
      for (let i = 0; i < 5; i++) {
        const bx = 9 + i * 2;
        const by = 19 + (i % 2);
        p.rect(bx, by, 2, 2, i % 2 === 0 ? '#991b1b' : '#fde047', LAYER_FRONT);
      }
      // Blazing golden fist + brass staff
      p.disc(23, 19, 3.2, GOLD_QI, LAYER_FRONT);
      p.line(19, 28, 29, 5, '#f59e0b', LAYER_FRONT, 2);
      p.disc(29, 5, 2.2, GOLD_QI, LAYER_FRONT);
      break;
    }

    case 'namgung_thunder': {
      // Royal cobalt cloak + silver-gold coronet + broad cyan thunder greatsword
      paintCapeLeft(p, ROBE_COBALT, true);
      paintHead34(p, SKIN_WARM, { glint: '#bae6fd', fierce: true });
      paintHairTopknot(p, HAIR_BLACK, '#38bdf8', true);
      p.hline(10, 17, 6, '#facc15', LAYER_HEAD);
      p.set(14, 5, '#38bdf8', LAYER_HEAD);
      paintMartialBody34(p, ROBE_COBALT, ROBE_WHITE, '#facc15');
      paintDiagonalSword(p, CYAN_QI, '#facc15', true);
      // Crackling lightning sparks
      p.set(24, 8, '#ffffff', LAYER_FX);
      p.set(25, 9, '#38bdf8', LAYER_FX);
      p.set(28, 13, '#fef08a', LAYER_FX);
      break;
    }

    case 'plum_elder': {
      // Silver-streaked elder + plum-blossom cloak + crimson-rose elder sword
      paintCapeLeft(p, ROBE_WHITE, true);
      paintHead34(p, SKIN_WARM, { browColor: '#e2e8f0', fierce: true });
      paintHairTopknot(p, HAIR_SILVER, '#e11d48', true);
      // Dignified short white goatee
      p.rect(15, 18, 2, 2, '#f1f5f9', LAYER_FRONT);
      paintMartialBody34(p, ROBE_PLUM, ROBE_WHITE, '#facc15');
      paintDiagonalSword(p, ROBE_PLUM, '#facc15', true);
      paintPlumPetals(p);
      break;
    }

    case 'gaebang_elder': {
      // Wide bamboo satgat + giant golden gourd + jade dragon Dog-Beating Staff
      paintGourd(p, 5, 21, GOLD_QI);
      paintHead34(p, SKIN_TAN, { browColor: '#f1f5f9', fierce: true });
      paintSatgat(p, STRAW_RAMP, '#16a34a');
      p.rect(14, 18, 3, 2, '#e2e8f0', LAYER_FRONT);
      paintMartialBody34(p, ROBE_EARTH, ROBE_JADE, '#eab308');
      p.line(18, 29, 29, 4, '#16a34a', LAYER_FRONT, 2);
      p.line(18, 28, 29, 3, '#bbf7d0', LAYER_FRONT, 1);
      p.disc(29, 5, 2.4, ROBE_JADE, LAYER_FRONT);
      break;
    }

    case 'hwasan_master': {
      // Purple-mist (자하진기) sect leader + golden plum crown + violet-rose divine sword
      paintCapeLeft(p, ROBE_VIOLET, true);
      paintHead34(p, SKIN_WARM, { glint: '#f5d0fe', fierce: true });
      paintFlowingMane(p, HAIR_BLACK, '#facc15');
      p.set(14, 3, '#f43f5e', LAYER_HEAD);
      paintMartialBody34(p, ROBE_WHITE, ROBE_VIOLET, '#f43f5e');
      paintDiagonalSword(p, ROBE_VIOLET, '#facc15', true);
      paintPlumPetals(p);
      p.set(27, 4, '#f43f5e', LAYER_FX);
      p.set(29, 8, '#e879f9', LAYER_FX);
      break;
    }

    case 'mudang_master': {
      // Snowy-haired Taiji Sword Immortal + levitating Yin-Yang orbs + cyan jade sword
      paintCapeLeft(p, ROBE_AZURE, true);
      paintHead34(p, SKIN_WARM, { browColor: '#ffffff', glint: '#bae6fd' });
      paintFlowingMane(p, HAIR_SILVER, '#38bdf8');
      p.rect(15, 18, 2, 3, '#ffffff', LAYER_FRONT); // Long Taoist beard
      paintMartialBody34(p, ROBE_AZURE, ROBE_WHITE, '#eab308');
      paintDiagonalSword(p, CYAN_QI, '#eab308', true);
      // Floating Yin-Yang qi orbs behind shoulders
      p.disc(5, 10, 2.3, ROBE_WHITE, LAYER_FX);
      p.set(5, 10, PIXEL_OUTLINE, LAYER_FX);
      p.disc(25, 5, 2.3, CYAN_QI, LAYER_FX);
      break;
    }

    case 'sword_saint': {
      // Transcendent Sword Saint: snow-white mane + 3 levitating spirit swords (어검) + divine blade
      paintCapeLeft(p, ROBE_AZURE, true);
      paintHead34(p, SKIN_WARM, { browColor: '#ffffff', glint: '#e0f2fe', fierce: true });
      paintFlowingMane(p, HAIR_SILVER, '#bae6fd');
      paintMartialBody34(p, ROBE_WHITE, ROBE_AZURE, '#0284c7');
      paintDiagonalSword(p, CYAN_QI, '#fef08a', true);
      // Floating spirit swords hovering on left & top
      p.line(3, 14, 7, 4, '#7dd3fc', LAYER_FX, 1);
      p.line(4, 14, 8, 4, '#ffffff', LAYER_FX, 1);
      p.line(21, 9, 25, 2, '#7dd3fc', LAYER_FX, 1);
      break;
    }

    case 'murim_lord': {
      // Alliance Lord: imperial dragon crown + crimson-gold cape + blazing Golden Dragon Greatsword
      paintCapeLeft(p, ROBE_CRIMSON, true);
      paintHead34(p, SKIN_WARM, { glint: '#fef08a', fierce: true });
      paintFlowingMane(p, HAIR_BLACK, '#facc15');
      // Tall golden dragon crown
      p.rect(11, 2, 6, 4, '#eab308', LAYER_HEAD);
      p.hline(12, 15, 2, '#fef08a', LAYER_HEAD);
      p.set(13, 4, '#dc2626', LAYER_HEAD);
      paintMartialBody34(p, ROBE_GOLD, ROBE_CRIMSON, '#dc2626');
      paintDiagonalSword(p, GOLD_QI, '#dc2626', true);
      p.set(25, 4, '#fef08a', LAYER_FX);
      p.set(29, 9, '#f59e0b', LAYER_FX);
      break;
    }

    /* ---------------------- 사파 (Unorthodox) ---------------------- */
    case 'nokrim_bandit': {
      // Green bandit bandana + battle scar + fur pauldron + chunky notched saber
      paintHead34(p, SKIN_TAN, { fierce: true, scar: true });
      paintHairTopknot(p, HAIR_BROWN, '#16a34a', false);
      p.hline(8, 19, 9, '#16a34a', LAYER_HEAD);
      paintMartialBody34(p, ROBE_EARTH, ROBE_JADE, '#991b1b');
      paintCurvedSaber(p, STEEL_RAMP, '#b45309');
      break;
    }

    case 'tang_assassin': {
      // Signature purple face mask (보라색 복면) + violet hood + green poison daggers (독침 비수)
      paintCapeLeft(p, ROBE_VIOLET, false);
      paintHead34(p, SKIN_PALE, { glint: '#86efac', fierce: true });
      // Hood & purple ninja mask covering lower face (y=15..18)
      paintHairTopknot(p, HAIR_BLACK, '#9333ea', false);
      p.rect(9, 15, 11, 3, '#6b21a8', LAYER_FRONT);
      p.hline(10, 18, 15, '#a855f7', LAYER_FRONT);
      paintMartialBody34(p, ROBE_VIOLET, ROBE_JADE, '#22c55e');
      // Fan of 3 emerald-venom throwing daggers
      p.line(21, 22, 29, 12, '#4ade80', LAYER_FRONT, 1);
      p.line(21, 22, 30, 17, '#86efac', LAYER_FRONT, 1);
      p.line(21, 23, 29, 22, '#22c55e', LAYER_FRONT, 1);
      p.set(29, 10, '#4ade80', LAYER_FX);
      break;
    }

    case 'haomun_ronin': {
      // Tilted dark straw satgat + tattered wanderer cloak + long drawn katana/dao
      paintCapeLeft(p, ROBE_EARTH, false);
      paintHead34(p, SKIN_TAN, { fierce: true });
      paintSatgat(p, STRAW_RAMP, '#dc2626');
      paintMartialBody34(p, ROBE_OBSIDIAN, ROBE_EARTH, '#eab308');
      paintDiagonalSword(p, STEEL_RAMP, '#eab308', false);
      break;
    }

    case 'poison_healer': {
      // Violet apothecary hat + toxic green calabash gourd + venom mist
      paintGourd(p, 5, 21, VENOM_QI);
      paintHead34(p, SKIN_PALE, { glint: '#86efac', fierce: true });
      paintHairTopknot(p, HAIR_SILVER, '#22c55e', false);
      p.rect(9, 5, 10, 4, '#6b21a8', LAYER_HEAD);
      p.hline(10, 17, 5, '#a855f7', LAYER_HEAD);
      paintMartialBody34(p, ROBE_JADE, ROBE_VIOLET, '#7e22ce');
      // Venom staff + bubbling poison orb
      p.line(19, 28, 28, 8, '#4c1d95', LAYER_FRONT, 2);
      p.disc(28, 8, 3, VENOM_QI, LAYER_FRONT);
      p.set(25, 4, '#86efac', LAYER_FX);
      p.set(30, 12, '#a855f7', LAYER_FX);
      break;
    }

    case 'blood_blade': {
      // Wild crimson-black hair + red scarf + oversized Giant Blood Saber (거대 혈도)
      paintCapeLeft(p, ROBE_CRIMSON, true);
      paintHead34(p, SKIN_TAN, { glint: '#fda4af', fierce: true, scar: true });
      paintHairTopknot(p, HAIR_CRIMSON, '#1f2937', true);
      paintMartialBody34(p, ROBE_OBSIDIAN, ROBE_CRIMSON, '#ef4444');
      paintCurvedSaber(p, ROBE_CRIMSON, '#facc15');
      break;
    }

    case 'nokrim_chief': {
      // Beast-horn pelt crown + tiger-gold mantle + colossal Demon-Head Heavy Saber
      paintCapeLeft(p, STRAW_RAMP, true);
      paintHead34(p, SKIN_TAN, { glint: '#fde047', fierce: true, scar: true });
      paintFlowingMane(p, HAIR_BROWN, '#eab308');
      // Twin beast horns on crown
      p.line(9, 6, 7, 3, '#fef3c7', LAYER_HEAD);
      p.line(18, 6, 20, 3, '#fef3c7', LAYER_HEAD);
      paintMartialBody34(p, ROBE_JADE, STRAW_RAMP, '#dc2626');
      paintCurvedSaber(p, GOLD_QI, '#dc2626');
      break;
    }

    case 'tang_patriarch': {
      // Tang Lord: royal jade-violet robes + unfolded Sichuan Tang poison fan (만독철선 부채)
      paintCapeLeft(p, ROBE_VIOLET, true);
      paintHead34(p, SKIN_PALE, { glint: '#4ade80', fierce: true });
      paintFlowingMane(p, HAIR_BLACK, '#4ade80');
      paintMartialBody34(p, ROBE_VIOLET, ROBE_JADE, '#eab308');
      // Unfolded gold-and-violet Sichuan Tang poison fan (부채) + floating jade poison orbs
      p.line(21, 21, 22, 11, '#eab308', LAYER_FRONT, 2);
      p.line(21, 21, 26, 12, '#d6a86e', LAYER_FRONT, 2);
      p.line(21, 21, 29, 15, '#c084fc', LAYER_FRONT, 2);
      p.line(21, 21, 29, 19, '#eab308', LAYER_FRONT, 2);
      p.set(21, 21, '#4c1d95', LAYER_FRONT);
      p.set(24, 14, '#4ade80', LAYER_FRONT);
      p.set(26, 16, '#4ade80', LAYER_FRONT);
      p.disc(25, 6, 1.8, VENOM_QI, LAYER_FX);
      p.disc(4, 17, 1.8, VENOM_QI, LAYER_FX);
      break;
    }

    case 'blood_demon': {
      // Blood Demon: crimson mane + demonic horns + monstrous blood blade & blood orbs
      paintCapeLeft(p, ROBE_DEMON, true);
      paintHead34(p, SKIN_PALE, { glint: '#fb7185', fierce: true });
      paintFlowingMane(p, HAIR_CRIMSON, '#dc2626');
      p.line(9, 6, 7, 2, '#fda4af', LAYER_HEAD);
      p.line(18, 6, 20, 2, '#fda4af', LAYER_HEAD);
      paintMartialBody34(p, ROBE_CRIMSON, ROBE_DEMON, '#fde047');
      paintCurvedSaber(p, ROBE_CRIMSON, '#fde047');
      p.disc(5, 11, 2.1, ROBE_CRIMSON, LAYER_FX);
      break;
    }

    case 'mad_demon': {
      // Mad Demon (광마): wild snow-white & crimson mane + broken chains + twin berserk blades
      paintCapeLeft(p, ROBE_DEMON, true);
      paintHead34(p, SKIN_PALE, { glint: '#f43f5e', browColor: '#ffffff', fierce: true });
      paintFlowingMane(p, HAIR_SILVER, '#e11d48');
      // Wild spiky hair strands
      p.line(10, 5, 8, 2, '#ffffff', LAYER_HEAD);
      p.line(15, 5, 17, 2, '#fda4af', LAYER_HEAD);
      paintMartialBody34(p, ROBE_OBSIDIAN, ROBE_CRIMSON, '#f43f5e');
      // Twin chaotic crimson-black blades (left & right!)
      paintCurvedSaber(p, ROBE_CRIMSON, '#94a3b8');
      p.line(6, 22, 2, 12, '#f43f5e', LAYER_FRONT, 2);
      p.set(27, 4, '#f43f5e', LAYER_FX);
      break;
    }

    /* -------------------- 마교 · 천마신교 (Demonic Cult) -------------------- */
    case 'cult_initiate': {
      // Horned cult hood + dark crimson robe + jagged demonic scimitar
      paintHead34(p, SKIN_PALE, { glint: '#fda4af', fierce: true });
      paintHairTopknot(p, HAIR_BLACK, '#dc2626', false);
      p.hline(9, 18, 8, '#7f1d1d', LAYER_HEAD);
      paintMartialBody34(p, ROBE_DEMON, ROBE_CRIMSON, '#dc2626');
      paintCurvedSaber(p, STEEL_RAMP, '#dc2626');
      break;
    }

    case 'bone_fiend': {
      // Pale 4-tone skull mask over cowl + bone pauldrons + spiked bone sword
      paintCapeLeft(p, ROBE_OBSIDIAN, false);
      paintHead34(p, BONE_RAMP, { glint: '#f43f5e', fierce: true });
      // Skull jaw teeth detail
      p.set(12, 17, PIXEL_OUTLINE, LAYER_HEAD);
      p.set(14, 17, PIXEL_OUTLINE, LAYER_HEAD);
      p.set(16, 17, PIXEL_OUTLINE, LAYER_HEAD);
      paintMartialBody34(p, ROBE_DEMON, BONE_RAMP, '#94a3b8');
      paintDiagonalSword(p, BONE_RAMP, '#dc2626', true);
      break;
    }

    case 'black_wind': {
      // Black-Wind Trooper: obsidian visor mask + red plume + dark crescent halberd
      paintCapeLeft(p, ROBE_OBSIDIAN, true);
      paintHead34(p, SKIN_PALE, { glint: '#f43f5e', fierce: true });
      paintHairTopknot(p, HAIR_BLACK, '#e11d48', true);
      p.rect(9, 15, 11, 3, '#1f1630', LAYER_FRONT);
      p.hline(10, 18, 15, '#e11d48', LAYER_FRONT);
      paintMartialBody34(p, ROBE_OBSIDIAN, ROBE_CRIMSON, '#e11d48');
      paintCurvedSaber(p, ROBE_OBSIDIAN, '#e11d48');
      break;
    }

    case 'cult_protector': {
      // Horned dark-gold Protector crown + heavy crimson-obsidian armor + demonic palm/blade
      paintCapeLeft(p, ROBE_DEMON, true);
      paintHead34(p, SKIN_PALE, { glint: '#fde047', fierce: true });
      paintHairTopknot(p, HAIR_SILVER, '#eab308', true);
      p.line(9, 6, 7, 3, '#eab308', LAYER_HEAD);
      p.line(18, 6, 20, 3, '#eab308', LAYER_HEAD);
      paintMartialBody34(p, ROBE_DEMON, ROBE_GOLD, '#eab308');
      paintCurvedSaber(p, ROBE_VIOLET, '#eab308');
      break;
    }

    case 'cult_elder': {
      // Silver-haired Cult Elder + crimson diadem + levitating blood-violet orb & staff
      paintCapeLeft(p, ROBE_DEMON, true);
      paintHead34(p, SKIN_PALE, { glint: '#e879f9', browColor: '#ffffff', fierce: true });
      paintFlowingMane(p, HAIR_SILVER, '#e11d48');
      paintMartialBody34(p, ROBE_OBSIDIAN, ROBE_CRIMSON, '#a855f7');
      p.line(19, 28, 27, 9, '#581c87', LAYER_FRONT, 2);
      p.disc(27, 8, 3.2, ROBE_CRIMSON, LAYER_FRONT);
      p.set(27, 7, '#ffffff', LAYER_FX);
      break;
    }

    case 'sword_demon': {
      // Sword Demon (검마): cascading pure white mane + obsidian-crimson cloak + colossal Demonic Greatsword
      paintCapeLeft(p, ROBE_DEMON, true);
      paintHead34(p, SKIN_PALE, { glint: '#f43f5e', browColor: '#ffffff', fierce: true });
      paintFlowingMane(p, HAIR_SILVER, '#f43f5e');
      paintMartialBody34(p, ROBE_OBSIDIAN, ROBE_CRIMSON, '#e11d48');
      paintDiagonalSword(p, ROBE_CRIMSON, '#a855f7', true);
      p.set(24, 5, '#e879f9', LAYER_FX);
      p.set(29, 10, '#f43f5e', LAYER_FX);
      break;
    }

    case 'flame_demon': {
      // Flame Demon (염마): blazing scarlet-gold hair + black horns + roaring hellfire fists
      paintCapeLeft(p, ROBE_CRIMSON, true);
      paintHead34(p, SKIN_TAN, { glint: '#fef08a', fierce: true });
      paintFlowingMane(p, HAIR_FLAME, '#fde047');
      p.line(9, 6, 7, 2, '#271738', LAYER_HEAD);
      p.line(18, 6, 20, 2, '#271738', LAYER_HEAD);
      paintMartialBody34(p, ROBE_DEMON, GOLD_QI, '#f97316');
      // Giant roaring flame orb in front hand + rising flame pillar right
      p.disc(24, 18, 4.2, HAIR_FLAME, LAYER_FRONT);
      p.disc(27, 10, 3.2, GOLD_QI, LAYER_FX);
      p.set(27, 5, '#ef4444', LAYER_FX);
      break;
    }

    case 'cheonma': {
      // Absolute Heavenly Demon (절대천마): waist-length silver hair + black-crimson mantle +
      // heavenly dark-crimson halo + Heavenly Demon Divine Greatsword tearing crimson lightning!
      // Floating dark-crimson halo behind crown
      for (let a = 0; a < 12; a++) {
        const ang = (a * Math.PI * 2) / 12;
        const hx = Math.round(13 + Math.cos(ang) * 9);
        const hy = Math.round(11 + Math.sin(ang) * 8);
        p.set(hx, hy, a % 2 === 0 ? '#f43f5e' : '#a855f7', LAYER_BACK);
      }
      paintCapeLeft(p, ROBE_DEMON, true);
      paintHead34(p, SKIN_PALE, { glint: '#fde047', browColor: '#ffffff', fierce: true });
      paintFlowingMane(p, HAIR_SILVER, '#facc15');
      // Imperial Heavenly Demon horned crown
      p.rect(11, 2, 6, 4, '#eab308', LAYER_HEAD);
      p.line(10, 4, 8, 1, '#f43f5e', LAYER_HEAD);
      p.line(17, 4, 19, 1, '#f43f5e', LAYER_HEAD);
      p.set(14, 3, '#ffffff', LAYER_HEAD);
      paintMartialBody34(p, ROBE_OBSIDIAN, GOLD_QI, '#e11d48');
      paintDiagonalSword(p, ROBE_CRIMSON, '#fde047', true);
      // Black-crimson lightning arcs around sword
      p.line(23, 14, 30, 3, '#fef08a', LAYER_FX, 1);
      p.set(29, 7, '#a855f7', LAYER_FX);
      p.set(4, 8, '#f43f5e', LAYER_FX);
      break;
    }

    case 'sword_immortal': {
      // ORTHODOX IMMORTAL: Grand Sword Immortal (태상검선) — celestial golden halo + floating spirit swords
      for (let a = 0; a < 12; a++) {
        const rad = (a * Math.PI * 2) / 12;
        const hx = Math.round(14 + Math.cos(rad) * 11.5);
        const hy = Math.round(13 + Math.sin(rad) * 10.5);
        p.set(hx, hy, a % 2 === 0 ? '#fde047' : '#38bdf8', LAYER_BACK);
      }
      paintCapeLeft(p, ROBE_AZURE, true);
      paintHead34(p, SKIN_WARM, { glint: '#38bdf8', browColor: '#f8fafc' });
      p.line(14, 17, 16, 22, '#f8fafc', LAYER_HEAD);
      paintFlowingMane(p, HAIR_SILVER, '#facc15');
      p.rect(12, 2, 4, 4, '#facc15', LAYER_HEAD);
      p.set(14, 3, '#67e8f9', LAYER_HEAD);
      paintMartialBody34(p, ROBE_WHITE, GOLD_QI, '#0284c7');
      paintDiagonalSword(p, CYAN_QI, '#fde047', true);
      p.line(4, 15, 7, 4, '#67e8f9', LAYER_FX, 1);
      p.line(26, 17, 30, 6, '#fde047', LAYER_FX, 1);
      break;
    }

    case 'asura_emperor': {
      // UNORTHODOX IMMORTAL: Blood-Sea Asura Emperor (혈해수라왕) — crimson-jade flames + twin curved sabers
      for (let a = 0; a < 12; a++) {
        const rad = (a * Math.PI * 2) / 12;
        const hx = Math.round(14 + Math.cos(rad) * 11.5);
        const hy = Math.round(14 + Math.sin(rad) * 10.5);
        p.set(hx, hy, a % 2 === 0 ? '#e11d48' : '#4ade80', LAYER_BACK);
      }
      paintCapeLeft(p, ROBE_CRIMSON, true);
      paintHead34(p, SKIN_TAN, { glint: '#fef08a', fierce: true, scar: true });
      paintFlowingMane(p, HAIR_CRIMSON, '#facc15');
      p.line(10, 4, 8, 1, '#facc15', LAYER_HEAD);
      p.line(17, 4, 19, 1, '#facc15', LAYER_HEAD);
      paintMartialBody34(p, ROBE_DEMON, GOLD_QI, '#22c55e');
      paintCurvedSaber(p, ROBE_CRIMSON, '#fde047');
      p.line(3, 18, 8, 7, '#4ade80', LAYER_FX, 2);
      break;
    }

    case 'thousand_venom_lord': {
      // UNORTHODOX IMMORTAL: Thousand Venom Sovereign (만독신군) — jade-violet halo + spread poison war fan
      for (let a = 0; a < 12; a++) {
        const rad = (a * Math.PI * 2) / 12;
        const hx = Math.round(14 + Math.cos(rad) * 11.5);
        const hy = Math.round(14 + Math.sin(rad) * 10.5);
        p.set(hx, hy, a % 2 === 0 ? '#22c55e' : '#a855f7', LAYER_BACK);
      }
      paintCapeLeft(p, ROBE_VIOLET, true);
      paintHead34(p, SKIN_PALE, { glint: '#4ade80', fierce: true });
      paintFlowingMane(p, HAIR_BLACK, '#22c55e');
      p.rect(12, 2, 4, 3, '#10b981', LAYER_HEAD);
      paintMartialBody34(p, ROBE_VIOLET, ROBE_JADE, '#facc15');
      // Spread poison iron folding fan (만독천화선)
      for (let i = -3; i <= 3; i++) {
        p.line(20, 21, 27 + Math.abs(i % 2), 14 + i * 2, i % 2 === 0 ? '#4ade80' : '#c084fc', LAYER_FRONT, 1);
      }
      p.disc(27, 10, 2, ROBE_JADE, LAYER_FX);
      break;
    }

    case 'thunder_emperor': {
      // ORTHODOX IMMORTAL: Namgung Thunder Emperor (남궁뇌제) — golden-cyan thunder halo + twin lightning jian
      for (let a = 0; a < 12; a++) {
        const rad = (a * Math.PI * 2) / 12;
        const hx = Math.round(14 + Math.cos(rad) * 11.5);
        const hy = Math.round(14 + Math.sin(rad) * 10.5);
        p.set(hx, hy, a % 2 === 0 ? '#fde047' : '#38bdf8', LAYER_BACK);
      }
      paintCapeLeft(p, ROBE_AZURE, true);
      paintHead34(p, SKIN_WARM, { glint: '#38bdf8', fierce: true });
      paintFlowingMane(p, HAIR_SILVER, '#facc15');
      p.rect(11, 2, 5, 3, '#facc15', LAYER_HEAD);
      paintMartialBody34(p, ROBE_AZURE, GOLD_QI, '#fde047');
      paintDiagonalSword(p, CYAN_QI, '#fde047', true);
      p.line(6, 22, 2, 11, '#38bdf8', LAYER_FRONT, 2);
      break;
    }

    case 'hell_flame_sovereign': {
      // DEMONIC IMMORTAL: Nine-Hells Flame Sovereign (구천염황) — 9 burning demonic orbs + twin palm flames
      for (let a = 0; a < 9; a++) {
        const rad = (a * Math.PI * 2) / 9;
        const hx = Math.round(14 + Math.cos(rad) * 11.5);
        const hy = Math.round(13 + Math.sin(rad) * 10.5);
        p.disc(hx, hy, 1.6, ROBE_CRIMSON, LAYER_BACK);
        p.set(hx, hy, '#fde047', LAYER_BACK);
      }
      paintCapeLeft(p, ROBE_DEMON, true);
      paintHead34(p, SKIN_TAN, { glint: '#ef4444', fierce: true });
      paintFlowingMane(p, HAIR_SILVER, '#f97316');
      paintMartialBody34(p, ROBE_DEMON, GOLD_QI, '#f97316');
      p.disc(6, 18, 2.5, ROBE_CRIMSON, LAYER_FX);
      p.set(6, 18, '#fde047', LAYER_FX);
      p.disc(24, 18, 2.8, ROBE_CRIMSON, LAYER_FX);
      p.set(24, 18, '#fde047', LAYER_FX);
      break;
    }

    case 'tang_elder': {
      // Tang Grand Elder: silver-haired elder in emerald-gold robe + golden poison needle box
      paintCapeLeft(p, ROBE_JADE, true);
      paintHead34(p, SKIN_PALE, { glint: '#4ade80', browColor: '#e2e8f0', fierce: true });
      paintFlowingMane(p, HAIR_SILVER, '#eab308');
      paintMartialBody34(p, ROBE_JADE, ROBE_VIOLET, '#eab308');
      p.rect(20, 19, 6, 4, '#eab308', LAYER_FRONT);
      p.line(25, 20, 30, 14, '#86efac', LAYER_FX, 1);
      p.line(25, 21, 30, 19, '#4ade80', LAYER_FX, 1);
      break;
    }

    case 'blood_bishop': {
      // Blood Cult Guardian Bishop: obsidian-crimson armor + horned coronet + crimson halberd
      paintCapeLeft(p, ROBE_DEMON, true);
      paintHead34(p, SKIN_PALE, { glint: '#fb7185', fierce: true });
      paintFlowingMane(p, HAIR_CRIMSON, '#facc15');
      paintMartialBody34(p, ROBE_DEMON, ROBE_CRIMSON, '#facc15');
      p.line(18, 28, 28, 5, '#94a3b8', LAYER_FRONT, 2);
      p.line(25, 7, 30, 12, '#f43f5e', LAYER_FRONT, 2);
      break;
    }

    case 'poison_dragon': {
      // Poison Dragon: emerald-violet mantle + venom-fang chain whip
      paintCapeLeft(p, ROBE_VIOLET, true);
      paintHead34(p, SKIN_PALE, { glint: '#4ade80', fierce: true });
      paintFlowingMane(p, HAIR_BLACK, '#22c55e');
      paintMartialBody34(p, ROBE_JADE, ROBE_VIOLET, '#4ade80');
      p.line(20, 22, 27, 15, '#22c55e', LAYER_FRONT, 2);
      p.line(27, 15, 29, 7, '#a855f7', LAYER_FX, 2);
      p.disc(28, 6, 1.8, VENOM_QI, LAYER_FX);
      break;
    }

    case 'heavenly_demon_heir': {
      // Young Heavenly Demon: silver-purple mane + violet-crimson greatsword
      paintCapeLeft(p, ROBE_DEMON, true);
      paintHead34(p, SKIN_PALE, { glint: '#c084fc', browColor: '#ffffff', fierce: true });
      paintFlowingMane(p, HAIR_SILVER, '#a855f7');
      paintMartialBody34(p, ROBE_OBSIDIAN, ROBE_VIOLET, '#f43f5e');
      paintDiagonalSword(p, ROBE_VIOLET, '#fde047', true);
      p.line(23, 14, 29, 4, '#c084fc', LAYER_FX, 1);
      break;
    }

    case 'blood_acolyte': {
      // Blood Shadow Acolyte: dark crimson hood + twin shadow daggers
      paintHead34(p, SKIN_PALE, { glint: '#fb7185', fierce: true });
      paintHairTopknot(p, HAIR_BLACK, '#be123c', false);
      paintMartialBody34(p, ROBE_DEMON, ROBE_VIOLET, '#f43f5e');
      p.line(20, 22, 29, 15, '#e11d48', LAYER_FRONT, 2);
      p.line(21, 24, 28, 22, '#c084fc', LAYER_FRONT, 2);
      break;
    }

    case 'nether_blade_queen': {
      // Nether Blade Queen: obsidian-magenta empress robe + floating soul orbs & lotus halo
      paintCapeLeft(p, ROBE_VIOLET, true);
      paintHead34(p, SKIN_PALE, { glint: '#fb7185', browColor: '#f5d0fe', fierce: true });
      paintFlowingMane(p, HAIR_BLACK, '#facc15');
      paintMartialBody34(p, ROBE_OBSIDIAN, ROBE_CRIMSON, '#facc15');
      p.disc(26, 12, 2.6, ROBE_VIOLET, LAYER_FX);
      p.disc(28, 20, 2.2, ROBE_CRIMSON, LAYER_FX);
      p.line(20, 21, 29, 10, '#c084fc', LAYER_FRONT, 2);
      break;
    }

    case 'ice_palace_empress': {
      // North Sea Ice Palace Empress (북해 빙궁주): snow-white hair, frost-lotus diadem & sapphire ice folding fan
      paintCapeLeft(p, ROBE_AZURE, true);
      paintHead34(p, SKIN_PALE, { glint: '#38bdf8', browColor: '#e0f2fe', blush: '#fbcfe8' });
      paintFlowingMane(p, HAIR_SILVER, '#38bdf8');
      // Ice-lotus crystal tiara
      p.set(14, 2, '#ffffff', LAYER_HEAD);
      p.set(12, 3, '#7dd3fc', LAYER_HEAD);
      p.set(16, 3, '#7dd3fc', LAYER_HEAD);
      paintMartialBody34(p, ROBE_WHITE, ROBE_AZURE, '#38bdf8');
      // Unfolded frost-lotus crystal war fan
      for (let i = -3; i <= 3; i++) {
        p.line(
          20,
          21,
          28 - Math.abs(i % 2),
          14 + i * 2,
          i % 2 === 0 ? '#e0f2fe' : '#38bdf8',
          LAYER_FRONT,
          1,
        );
      }
      p.set(27, 8, '#ffffff', LAYER_FX);
      p.set(5, 11, '#7dd3fc', LAYER_FX);
      p.set(28, 23, '#bae6fd', LAYER_FX);
      break;
    }

    case 'blood_shadow_sovereign': {
      // Blood-Shadow Sovereign (혈영귀왕): obsidian shinobi mask + blazing crimson shadow blades
      paintCapeLeft(p, ROBE_DEMON, true);
      paintHead34(p, SKIN_PALE, { glint: '#f43f5e', fierce: true });
      paintHairTopknot(p, HAIR_BLACK, '#e11d48', true);
      // Crimson-trimmed shadow face mask
      p.rect(9, 15, 11, 3, '#1f1630', LAYER_FRONT);
      p.hline(10, 18, 15, '#e11d48', LAYER_FRONT);
      p.hline(9, 18, 9, '#facc15', LAYER_HEAD);
      paintMartialBody34(p, ROBE_OBSIDIAN, ROBE_CRIMSON, '#e11d48');
      // Twin blood-shadow curved blades
      paintCurvedSaber(p, ROBE_CRIMSON, '#facc15');
      p.line(7, 22, 2, 13, '#e11d48', LAYER_FRONT, 2);
      p.set(27, 6, '#fda4af', LAYER_FX);
      p.set(4, 10, '#f43f5e', LAYER_FX);
      break;
    }

    case 'wuji_grandmaster': {
      // IMMORTAL: Taiji Wuji Grandmaster (태극무극선) — celestial jade-gold halo + five-element orbs + jade divine sword
      for (let a = 0; a < 12; a++) {
        const rad = (a * Math.PI * 2) / 12;
        const hx = Math.round(14 + Math.cos(rad) * 11.5);
        const hy = Math.round(13 + Math.sin(rad) * 10.5);
        p.set(hx, hy, a % 2 === 0 ? '#2dd4bf' : '#fde047', LAYER_BACK);
      }
      paintCapeLeft(p, ROBE_JADE, true);
      paintHead34(p, SKIN_WARM, { glint: '#2dd4bf', browColor: '#ffffff' });
      paintFlowingMane(p, HAIR_SILVER, '#fde047');
      p.rect(12, 2, 4, 3, '#fde047', LAYER_HEAD);
      p.set(14, 2, '#2dd4bf', LAYER_HEAD);
      paintMartialBody34(p, ROBE_WHITE, GOLD_QI, '#0d9488');
      paintDiagonalSword(p, CYAN_QI, '#fde047', true);
      // Orbiting elemental pearls
      p.disc(5, 7, 1.8, GOLD_QI, LAYER_FX);
      p.disc(25, 7, 1.8, CYAN_QI, LAYER_FX);
      break;
    }

    case 'primordial_sword_god': {
      // PRIMORDIAL MYTHIC: 태고검신 (Primordial Sword God) — golden-cyan genesis halo + 4 spirit swords + celestial jade-gold greatsword
      for (let a = 0; a < 16; a++) {
        const rad = (a * Math.PI * 2) / 16;
        const hx = Math.round(14 + Math.cos(rad) * 12);
        const hy = Math.round(13 + Math.sin(rad) * 11);
        p.set(hx, hy, a % 2 === 0 ? '#fde047' : '#38bdf8', LAYER_BACK);
      }
      // 4 levitating spirit blades fanning behind shoulders
      p.line(5, 13, 2, 4, '#38bdf8', LAYER_BACK, 2);
      p.line(8, 9, 5, 2, '#fde047', LAYER_BACK, 1);
      p.line(22, 9, 26, 2, '#fde047', LAYER_BACK, 1);
      p.line(24, 13, 29, 5, '#38bdf8', LAYER_BACK, 2);
      paintCapeLeft(p, ROBE_AZURE, true);
      paintHead34(p, SKIN_WARM, { glint: '#fef08a', browColor: '#ffffff' });
      paintFlowingMane(p, HAIR_SILVER, '#facc15');
      // Genesis golden sword-crown
      p.rect(11, 2, 6, 3, '#facc15', LAYER_HEAD);
      p.vline(14, 1, 4, '#38bdf8', LAYER_HEAD);
      paintMartialBody34(p, ROBE_WHITE, GOLD_QI, '#0284c7');
      paintDiagonalSword(p, CYAN_QI, '#fde047', true);
      p.line(18, 22, 29, 13, '#fef08a', LAYER_FX, 1);
      p.disc(4, 18, 1.8, GOLD_QI, LAYER_FX);
      p.disc(27, 19, 1.8, CYAN_QI, LAYER_FX);
      break;
    }

    case 'chaos_poison_emperor': {
      // PRIMORDIAL MYTHIC: 혼원만독제 (Chaos Poison Emperor) — emerald-violet galaxy halo + sovereign venom war-fan + miasma orbs
      for (let a = 0; a < 16; a++) {
        const rad = (a * Math.PI * 2) / 16;
        const hx = Math.round(14 + Math.cos(rad) * 12);
        const hy = Math.round(13 + Math.sin(rad) * 11);
        p.set(hx, hy, a % 2 === 0 ? '#4ade80' : '#c084fc', LAYER_BACK);
      }
      paintCapeLeft(p, ROBE_VIOLET, true);
      paintHead34(p, SKIN_PALE, { glint: '#86efac', browColor: '#d8b4fe', fierce: true });
      paintFlowingMane(p, HAIR_BLACK, '#4ade80');
      // Chaos jade-amethyst dragon crown
      p.rect(11, 2, 6, 3, '#a855f7', LAYER_HEAD);
      p.set(14, 2, '#4ade80', LAYER_HEAD);
      p.line(10, 4, 7, 2, '#fde047', LAYER_HEAD, 1);
      p.line(18, 4, 21, 2, '#fde047', LAYER_HEAD, 1);
      paintMartialBody34(p, ROBE_OBSIDIAN, VENOM_QI, '#a855f7');
      // Unfolded emerald-amethyst Chaos Sovereign War-Fan
      for (let i = -3; i <= 3; i++) {
        p.line(
          19,
          21,
          29 - Math.abs(i % 2),
          14 + i * 2,
          i % 2 === 0 ? '#4ade80' : '#c084fc',
          LAYER_FRONT,
          1,
        );
      }
      p.disc(5, 9, 2.2, VENOM_QI, LAYER_FX);
      p.disc(26, 7, 2.2, ROBE_VIOLET, LAYER_FX);
      break;
    }

    case 'void_heavenly_demon': {
      // PRIMORDIAL MYTHIC: 무극태상천마 (Void Heavenly Demon) — crimson-gold eclipse ring + demon god horns + colossal eclipse greatsword
      for (let a = 0; a < 16; a++) {
        const rad = (a * Math.PI * 2) / 16;
        const hx = Math.round(14 + Math.cos(rad) * 12);
        const hy = Math.round(13 + Math.sin(rad) * 11);
        p.set(hx, hy, a % 2 === 0 ? '#f43f5e' : '#fde047', LAYER_BACK);
      }
      paintCapeLeft(p, ROBE_DEMON, true);
      paintHead34(p, SKIN_PALE, { glint: '#fde047', browColor: '#fda4af', fierce: true });
      paintFlowingMane(p, HAIR_SILVER, '#e11d48');
      // Twin golden-obsidian primordial demon horns + forehead crimson third-eye gem
      p.line(9, 6, 5, 2, '#facc15', LAYER_HEAD, 2);
      p.line(19, 6, 23, 2, '#facc15', LAYER_HEAD, 2);
      p.set(14, 9, '#f43f5e', LAYER_FRONT);
      paintMartialBody34(p, ROBE_DEMON, GOLD_QI, '#e11d48');
      paintDiagonalSword(p, ROBE_CRIMSON, '#fde047', true);
      p.line(17, 22, 29, 10, '#fde047', LAYER_FX, 1);
      p.disc(4, 12, 2.2, ROBE_CRIMSON, LAYER_FX);
      p.disc(27, 20, 2.2, GOLD_QI, LAYER_FX);
      break;
    }

    default: {
      paintHead34(p, SKIN_WARM);
      paintHairTopknot(p, HAIR_BLACK, '#38bdf8', false);
      paintMartialBody34(p, ROBE_WHITE, ROBE_AZURE, '#0284c7');
      paintDiagonalSword(p, STEEL_RAMP, '#eab308', false);
      break;
    }
  }

  p.flush(ctx, canvasSize);
}

/* ========================================================================== */
/*  6 Wuxia Wave Monster & Boss Pixel Painters (32x32)                        */
/* ========================================================================== */

export function paintMonsterChibi(
  ctx: CanvasRenderingContext2D,
  kind: MonsterKind,
  canvasSize = ctx.canvas.width,
): void {
  const p = new PixelCanvas();

  switch (kind) {
    case 'bandit_minion': {
      // Mountain Bandit Minion (산적 졸개): green headband + cheeky grin + spiked club
      paintHead34(p, SKIN_TAN, { fierce: true, scar: true });
      p.hline(8, 19, 8, '#15803d', LAYER_HEAD);
      p.hline(9, 18, 7, '#4ade80', LAYER_HEAD);
      p.set(6, 8, '#15803d', LAYER_BACK);
      paintMartialBody34(p, ROBE_EARTH, STRAW_RAMP, '#7f1d1d');
      // Heavy wooden spiked club
      p.line(20, 23, 28, 10, '#92400e', LAYER_FRONT, 3);
      p.line(20, 22, 27, 10, '#d97706', LAYER_FRONT, 1);
      p.set(29, 11, '#e2e8f0', LAYER_FRONT);
      p.set(26, 8, '#e2e8f0', LAYER_FRONT);
      break;
    }

    case 'jiangshi': {
      // Hopping Jiangshi (강시): Qing mandarin cap + yellow talisman (부적) + outstretched arms!
      paintHead34(p, SKIN_ZOMBIE, { glint: '#fda4af', blush: '#fb7185' });
      // Black Qing mandarin hat + red pom-pom
      p.hline(7, 20, 8, '#1e1b4b', LAYER_HEAD);
      p.rect(9, 5, 10, 3, '#312e81', LAYER_HEAD);
      p.rect(13, 3, 3, 2, '#ef4444', LAYER_HEAD);
      // Iconic yellow paper talisman dangling down center-right of forehead!
      p.rect(14, 8, 3, 7, '#fde047', LAYER_FRONT);
      p.vline(15, 9, 13, '#dc2626', LAYER_FRONT);
      paintMartialBody34(p, ROBE_VIOLET, ROBE_CRIMSON, '#eab308');
      // Both stiff hopping arms stretched straight out right!
      p.rect(19, 19, 9, 3, '#4c1d95', LAYER_FRONT);
      p.hline(19, 27, 19, '#a855f7', LAYER_FRONT);
      p.rect(28, 19, 2, 2, SKIN_ZOMBIE[1], LAYER_FRONT);
      break;
    }

    case 'blood_zealot': {
      // Blood Cult Zealot (혈교 광신도): pointed crimson hood + ritual curved blood dagger
      paintCapeLeft(p, ROBE_DEMON, false);
      paintHead34(p, SKIN_PALE, { glint: '#f43f5e', fierce: true });
      // Pointed crimson cult cowl
      p.hline(8, 19, 8, '#991b1b', LAYER_HEAD);
      p.hline(9, 17, 6, '#dc2626', LAYER_HEAD);
      p.hline(10, 15, 4, '#ef4444', LAYER_HEAD);
      p.set(11, 3, '#fca5a5', LAYER_HEAD);
      paintMartialBody34(p, ROBE_DEMON, ROBE_CRIMSON, '#fde047');
      paintCurvedSaber(p, ROBE_CRIMSON, '#fde047');
      break;
    }

    case 'white_tiger': {
      // BOSS: Spirit Beast White Tiger (영물 백호) — fierce 32x32 quadrupedal/rearing guardian beast
      // Thick muscular white-fur body + black stripes + cyan spirit flames
      p.disc(13, 21, 8, ROBE_WHITE, LAYER_BODY);
      p.disc(16, 13, 7.5, ROBE_WHITE, LAYER_HEAD);
      // Tiger ears
      p.rect(9, 5, 3, 3, '#ffffff', LAYER_HEAD);
      p.set(10, 6, '#fda4af', LAYER_HEAD);
      p.rect(20, 5, 3, 3, '#cbd5e1', LAYER_HEAD);
      // Forehead '王' tiger mark in dark outline
      p.hline(14, 18, 7, PIXEL_OUTLINE, LAYER_HEAD);
      p.hline(15, 17, 9, PIXEL_OUTLINE, LAYER_HEAD);
      p.vline(16, 7, 10, PIXEL_OUTLINE, LAYER_HEAD);
      // Fierce dark bean eyes with cyan spirit glint (zero white sclera!)
      p.rect(13, 11, 2, 3, PIXEL_OUTLINE, LAYER_HEAD);
      p.set(13, 11, '#38bdf8', LAYER_HEAD);
      p.rect(19, 11, 2, 3, PIXEL_OUTLINE, LAYER_HEAD);
      p.set(19, 11, '#38bdf8', LAYER_HEAD);
      // Roaring maw & fangs
      p.rect(14, 15, 6, 3, '#9f1239', LAYER_HEAD);
      p.set(14, 15, '#fef08a', LAYER_HEAD);
      p.set(19, 15, '#fef08a', LAYER_HEAD);
      // Black tiger stripes on body & tail
      p.hline(7, 10, 19, PIXEL_OUTLINE, LAYER_BODY);
      p.hline(8, 11, 22, PIXEL_OUTLINE, LAYER_BODY);
      p.line(5, 22, 2, 12, '#e2e8f0', LAYER_BACK, 2);
      // Giant swiping forepaws + cyan celestial flames
      p.rect(9, 27, 4, 3, '#e2e8f0', LAYER_BODY);
      p.rect(19, 26, 6, 4, '#ffffff', LAYER_FRONT);
      p.set(25, 27, '#38bdf8', LAYER_FRONT);
      p.set(25, 29, '#38bdf8', LAYER_FRONT);
      p.disc(6, 13, 2.5, CYAN_QI, LAYER_FX);
      p.disc(26, 15, 2.5, CYAN_QI, LAYER_FX);
      break;
    }

    case 'black_serpent': {
      // BOSS: Obsidian-Scale Black Serpent Dragon (묵린흑사) — coiled horned poison cobra-dragon
      // Coiled S-body with bright jade-obsidian scale highlights
      p.disc(10, 24, 6.5, ROBE_OBSIDIAN, LAYER_BACK);
      p.disc(20, 25, 5.8, ROBE_OBSIDIAN, LAYER_BODY);
      p.disc(14, 18, 6.2, ROBE_JADE, LAYER_BODY);
      // Scale shine spots on coils
      p.rect(8, 22, 3, 2, '#4ade80', LAYER_BACK);
      p.rect(18, 23, 3, 2, '#4ade80', LAYER_BODY);
      // Flared emerald-violet cobra hood behind head!
      p.disc(17, 11, 8.2, ROBE_VIOLET, LAYER_BACK);
      p.disc(18, 10, 6.2, ROBE_OBSIDIAN, LAYER_HEAD);
      // Golden dragon horns + crown crest
      p.line(13, 6, 8, 2, '#facc15', LAYER_HEAD, 2);
      p.line(21, 6, 26, 2, '#facc15', LAYER_HEAD, 2);
      p.set(18, 4, '#4ade80', LAYER_HEAD);
      // Fierce dark bean eyes with toxic green glint
      p.rect(15, 9, 2, 3, PIXEL_OUTLINE, LAYER_HEAD);
      p.set(15, 9, '#86efac', LAYER_HEAD);
      p.rect(20, 9, 2, 3, PIXEL_OUTLINE, LAYER_HEAD);
      p.set(20, 9, '#86efac', LAYER_HEAD);
      // Venomous fangs & forked crimson tongue
      p.rect(16, 13, 6, 2, '#9f1239', LAYER_FRONT);
      p.set(16, 13, '#ffffff', LAYER_FRONT);
      p.set(21, 13, '#ffffff', LAYER_FRONT);
      p.line(22, 14, 29, 16, '#f43f5e', LAYER_FX, 1);
      p.set(29, 15, '#f43f5e', LAYER_FX);
      p.set(29, 17, '#f43f5e', LAYER_FX);
      // Segmented golden-emerald belly plates
      p.hline(11, 17, 17, '#fef08a', LAYER_BODY);
      p.hline(12, 18, 19, '#86efac', LAYER_BODY);
      p.hline(13, 18, 21, '#22c55e', LAYER_BODY);
      break;
    }

    case 'blood_patriarch': {
      // BOSS: Blood-Sea Demon Patriarch (혈교주) — towering horned overlord with giant blood halberd
      paintCapeLeft(p, ROBE_CRIMSON, true);
      // Extra wide boss mantle
      p.disc(14, 22, 8.5, ROBE_DEMON, LAYER_BODY);
      paintHead34(p, SKIN_PALE, { glint: '#fef08a', browColor: '#fda4af', fierce: true });
      paintFlowingMane(p, HAIR_CRIMSON, '#facc15');
      // Giant twin blood horns
      p.line(8, 7, 4, 2, '#facc15', LAYER_HEAD, 2);
      p.line(19, 7, 23, 2, '#facc15', LAYER_HEAD, 2);
      paintMartialBody34(p, ROBE_DEMON, GOLD_QI, '#facc15');
      // Colossal crimson halberd + floating blood orbs
      p.line(19, 29, 29, 3, '#eab308', LAYER_FRONT, 2);
      paintCurvedSaber(p, ROBE_CRIMSON, '#fde047');
      p.disc(5, 11, 2.6, ROBE_CRIMSON, LAYER_FX);
      p.disc(27, 19, 2.4, ROBE_CRIMSON, LAYER_FX);
      break;
    }

    case 'azure_dragon': {
      // 창궁청룡 — Coiling celestial azure-cyan dragon guardian clutching a golden thunder pearl
      const DRAGON_AZURE: Ramp4 = ['#bae6fd', '#38bdf8', '#0284c7', '#0c4a6e'];
      const DRAGON_GOLD: Ramp4 = ['#fef9c3', '#facc15', '#d97706', '#92400e'];
      // Coiling tail & dorsal ridge behind body
      p.disc(8, 22, 5.2, DRAGON_AZURE, LAYER_BACK);
      p.disc(6, 15, 4.4, DRAGON_AZURE, LAYER_BACK);
      p.line(4, 12, 9, 8, '#fde047', LAYER_BACK, 2);
      // Serpentine scaled torso + golden imperial belly plates
      p.ellipse(15.5, 22.5, 7.6, 5.8, DRAGON_AZURE, LAYER_BODY);
      p.ellipse(16, 23, 4.4, 3.8, DRAGON_GOLD, LAYER_BODY);
      p.hline(13, 18, 21, '#ca8a04', LAYER_BODY);
      p.hline(13, 18, 24, '#ca8a04', LAYER_BODY);
      // Fierce horned dragon head (3/4 forward gaze)
      p.ellipse(16, 12.5, 6.8, 5.6, DRAGON_AZURE, LAYER_HEAD);
      // Twin golden imperial dragon antlers + flowing silver-azure mane
      p.line(11, 8, 6, 2, '#fde047', LAYER_HEAD, 2);
      p.line(8, 4, 10, 2, '#facc15', LAYER_HEAD, 1);
      p.line(20, 8, 26, 2, '#fde047', LAYER_HEAD, 2);
      p.line(24, 4, 22, 2, '#facc15', LAYER_HEAD, 1);
      // Snout ridge, flowing whiskers & fierce bean eyes with cyan-gold catchlights
      p.rect(13, 14, 8, 3, '#0284c7', LAYER_HEAD);
      p.line(11, 15, 4, 18, '#e0f2fe', LAYER_FRONT, 1);
      p.line(22, 15, 29, 17, '#e0f2fe', LAYER_FRONT, 1);
      p.rect(12, 11, 2, 2, PIXEL_OUTLINE, LAYER_HEAD);
      p.set(12, 11, '#fde047', LAYER_HEAD);
      p.rect(19, 11, 2, 2, PIXEL_OUTLINE, LAYER_HEAD);
      p.set(19, 11, '#fde047', LAYER_HEAD);
      // Claws + crackling Thunder Dragon Pearl (여의뇌주)
      p.disc(10, 27, 2.5, DRAGON_GOLD, LAYER_FRONT);
      p.disc(21, 27, 2.5, DRAGON_GOLD, LAYER_FRONT);
      p.disc(25, 19, 3.4, ['#ffffff', '#fef08a', '#38bdf8', '#0284c7'], LAYER_FX);
      p.line(25, 14, 28, 10, '#fef08a', LAYER_FX, 1);
      p.set(5, 8, '#67e8f9', LAYER_FX);
      break;
    }

    case 'vermilion_bird': {
      // 남명주작 — Blazing crimson-gold sacred phoenix with spread solar wings & 3-plume crown
      const PHOENIX_RED: Ramp4 = ['#fed7aa', '#fb923c', '#ef4444', '#991b1b'];
      const PHOENIX_GOLD: Ramp4 = ['#ffffff', '#fef08a', '#f59e0b', '#b45309'];
      // Sweeping spread solar wings (left & right layered pinions)
      p.line(12, 19, 2, 8, '#ef4444', LAYER_BACK, 4);
      p.line(11, 21, 3, 15, '#fb923c', LAYER_BACK, 3);
      p.line(9, 14, 2, 8, '#fde047', LAYER_BACK, 2);
      p.line(20, 19, 30, 8, '#ef4444', LAYER_BACK, 4);
      p.line(21, 21, 29, 15, '#fb923c', LAYER_BACK, 3);
      p.line(23, 14, 30, 8, '#fde047', LAYER_BACK, 2);
      // Three trailing Nirvana tail ribbons
      p.line(13, 25, 8, 30, '#f97316', LAYER_BACK, 2);
      p.line(16, 26, 16, 30, '#fde047', LAYER_BACK, 2);
      p.line(19, 25, 24, 30, '#f97316', LAYER_BACK, 2);
      // Sacred avian chest & solar core jewel
      p.ellipse(16, 21.5, 5.8, 5.4, PHOENIX_RED, LAYER_BODY);
      p.disc(16, 21, 2.8, PHOENIX_GOLD, LAYER_FRONT);
      // Regal phoenix head + 3-plume imperial flame crest + golden hooked beak
      p.ellipse(16, 12.5, 5.6, 5.0, PHOENIX_RED, LAYER_HEAD);
      p.line(16, 7, 16, 1, '#fde047', LAYER_HEAD, 2);
      p.line(13, 8, 10, 3, '#fb923c', LAYER_HEAD, 2);
      p.line(19, 8, 22, 3, '#fb923c', LAYER_HEAD, 2);
      p.rect(12, 12, 2, 2, PIXEL_OUTLINE, LAYER_HEAD);
      p.set(12, 12, '#fef08a', LAYER_HEAD);
      p.rect(19, 12, 2, 2, PIXEL_OUTLINE, LAYER_HEAD);
      p.set(19, 12, '#fef08a', LAYER_HEAD);
      // Golden beak
      p.rect(15, 14, 3, 2, '#facc15', LAYER_FRONT);
      p.set(16, 16, '#eab308', LAYER_FRONT);
      // Orbiting Nirvana embers
      p.disc(5, 22, 1.8, PHOENIX_GOLD, LAYER_FX);
      p.disc(27, 22, 1.8, PHOENIX_GOLD, LAYER_FX);
      break;
    }
  }

  p.flush(ctx, canvasSize);
}

/* ========================================================================== */
/*  12 Bespoke 32x32 Wuxia Relic Treasure Pixel-Art Icons (무림 12대 신물)    */
/* ========================================================================== */

export function paintRelicPixelArt(
  ctx: CanvasRenderingContext2D,
  relicId: RelicId,
  canvasSize: number,
  level = 1,
): void {
  const p = new PixelCanvas();

  // Mastery level 10 radiant celestial halo behind treasure
  if (level >= 15) {
    for (let a = 0; a < 16; a++) {
      const rad = (a * Math.PI * 2) / 16;
      const hx = Math.round(15.5 + Math.cos(rad) * 13);
      const hy = Math.round(15.5 + Math.sin(rad) * 13);
      const col = a % 3 === 0 ? '#e879f9' : a % 3 === 1 ? '#fde047' : '#38bdf8';
      p.set(hx, hy, col, LAYER_BACK);
    }
    p.set(15, 2, '#f0abfc', LAYER_FX);
    p.set(16, 2, '#ffffff', LAYER_FX);
  } else if (level >= 10) {
    for (let a = 0; a < 12; a++) {
      const rad = (a * Math.PI * 2) / 12;
      const hx = Math.round(15.5 + Math.cos(rad) * 12);
      const hy = Math.round(15.5 + Math.sin(rad) * 12);
      p.set(hx, hy, a % 2 === 0 ? '#fde047' : '#fb7185', LAYER_BACK);
    }
  }

  switch (relicId) {
    case 'golden_vault': {
      // 천하제일 전장 금고 — Vermilion-lacquered golden treasury chest overflowing with sycee ingots & brass coins
      // Carved pedestal feet
      p.rect(6, 26, 4, 2, '#92400e', LAYER_BACK);
      p.rect(22, 26, 4, 2, '#92400e', LAYER_BACK);
      // Lower vermilion chest box with 4-stage shading
      p.rampBox(6, 15, 20, 11, ROBE_CRIMSON, LAYER_BODY);
      // Golden corner brackets & horizontal band
      p.rect(6, 15, 3, 11, '#eab308', LAYER_BODY);
      p.rect(23, 15, 3, 11, '#d97706', LAYER_BODY);
      p.rect(6, 17, 20, 2, '#facc15', LAYER_FRONT);
      // Overflowing sycee gold ingots & coins inside open chest mouth (y=9..15)
      p.disc(11, 13, 3.2, GOLD_QI, LAYER_HEAD);
      p.disc(16, 11, 3.8, GOLD_QI, LAYER_HEAD);
      p.disc(21, 13, 3.2, GOLD_QI, LAYER_HEAD);
      // Boat-shaped sycee ears & gleaming white-gold highlights
      p.hline(9, 13, 11, '#fef08a', LAYER_FX);
      p.hline(14, 18, 9, '#ffffff', LAYER_FX);
      p.hline(19, 23, 11, '#fef08a', LAYER_FX);
      // Arched open lid behind ingots
      p.rampBox(7, 5, 18, 5, ['#fb7185', '#e11d48', '#be123c', '#881337'], LAYER_BACK);
      p.hline(7, 24, 5, '#fde047', LAYER_BACK);
      // Imperial ruby-gold lock plate in front
      p.rect(13, 16, 6, 6, '#fde047', LAYER_FX);
      p.rect(14, 17, 4, 4, '#e11d48', LAYER_FX);
      p.set(15, 18, '#ffffff', LAYER_FX);
      // Floating square-holed coin above chest
      p.disc(25, 7, 2.5, GOLD_QI, LAYER_FX);
      p.set(25, 7, PIXEL_OUTLINE, LAYER_FX);
      break;
    }

    case 'million_sword_seal': {
      // 만금쾌검패 — Octagonal imperial gold command medallion crossed by a radiant divine jian sword
      // Twin crimson silk tassels hanging below
      p.line(12, 23, 9, 28, '#e11d48', LAYER_BACK, 2);
      p.line(19, 23, 22, 28, '#be123c', LAYER_BACK, 2);
      p.set(9, 28, '#facc15', LAYER_BACK);
      p.set(22, 28, '#facc15', LAYER_BACK);
      // Octagonal imperial gold medallion
      p.disc(15.5, 15.5, 8.8, ['#fef08a', '#facc15', '#d97706', '#92400e'], LAYER_BODY);
      p.disc(15.5, 15.5, 6.2, ROBE_CRIMSON, LAYER_BODY);
      p.rect(13, 13, 5, 5, '#f59e0b', LAYER_BODY);
      // Radiant sky-cyan divine sword piercing diagonally/vertically across medallion
      p.line(16, 3, 16, 27, '#e0f2fe', LAYER_FRONT, 2);
      p.line(15, 4, 15, 26, '#38bdf8', LAYER_FRONT, 1);
      p.line(16, 3, 16, 18, '#ffffff', LAYER_FX, 1);
      // Ornate winged golden sword guard & pommel
      p.hline(10, 21, 9, '#fde047', LAYER_FX);
      p.hline(11, 20, 10, '#d97706', LAYER_FX);
      p.rect(15, 5, 2, 4, '#b45309', LAYER_FX);
      p.disc(15.5, 3.5, 1.8, GOLD_QI, LAYER_FX);
      // Gleaming sword-qi cross sparks
      p.set(7, 12, '#fef08a', LAYER_FX);
      p.set(24, 19, '#67e8f9', LAYER_FX);
      break;
    }

    case 'bandit_dagger': {
      // 야행도적의 비수 — Nocturnal jade-cyan curved assassin stiletto slashing past stolen gold coins
      // Indigo night-shadow cloak swirl backdrop
      p.disc(15, 17, 7.8, ROBE_VIOLET, LAYER_BACK);
      // Curved jade-steel dagger blade (bottom-left hilt -> top-right razor tip)
      p.line(9, 22, 25, 5, '#67e8f9', LAYER_FRONT, 3);
      p.line(10, 21, 26, 4, '#ecfeff', LAYER_FX, 1);
      p.line(12, 22, 24, 9, '#0284c7', LAYER_FRONT, 1);
      // Golden S-guard + wrapped ebony grip + crimson silk tassel
      p.line(7, 19, 13, 25, '#facc15', LAYER_FX, 2);
      p.line(6, 25, 9, 22, '#475569', LAYER_FRONT, 2);
      p.line(5, 26, 3, 29, '#f43f5e', LAYER_FX, 1);
      // Stolen brass coins & gold sycee tumbling beside blade
      p.disc(22, 21, 3.6, GOLD_QI, LAYER_HEAD);
      p.rect(21, 20, 2, 2, PIXEL_OUTLINE, LAYER_FX);
      p.disc(9, 10, 2.8, GOLD_QI, LAYER_HEAD);
      p.set(9, 10, PIXEL_OUTLINE, LAYER_FX);
      p.set(26, 13, '#ffffff', LAYER_FX);
      break;
    }

    case 'immortal_furnace': {
      // 태상노군 만년단로 — Three-legged bronze-gold Taoist alchemy cauldron with rising nine-turn elixir fire
      // Rising violet-gold immortal alchemy flames at top
      p.disc(16, 7, 3.8, ['#fef08a', '#fb923c', '#e11d48', '#881337'], LAYER_BACK);
      p.disc(16, 6, 2.2, ['#ffffff', '#fef08a', '#facc15', '#ea580c'], LAYER_FX);
      p.set(11, 6, '#c084fc', LAYER_FX);
      p.set(21, 5, '#fde047', LAYER_FX);
      // Three sturdy tripod legs
      p.line(10, 23, 8, 28, '#92400e', LAYER_BACK, 2);
      p.line(21, 23, 23, 28, '#78350f', LAYER_BACK, 2);
      p.line(16, 24, 16, 28, '#b45309', LAYER_BACK, 2);
      // Dragon-ear side handles
      p.rect(5, 13, 3, 6, '#facc15', LAYER_BACK);
      p.rect(24, 13, 3, 6, '#d97706', LAYER_BACK);
      // Round copper-gold cauldron belly
      p.disc(15.5, 17.5, 8.2, ['#fde047', '#ea580c', '#b45309', '#7c2d12'], LAYER_BODY);
      // Crowned furnace rim
      p.rampBox(9, 10, 14, 3, GOLD_QI, LAYER_HEAD);
      // Glowing crimson-gold Taiji hearth window in center of cauldron
      p.disc(15.5, 18, 3.4, ['#ffffff', '#fef08a', '#f97316', '#dc2626'], LAYER_FX);
      break;
    }

    case 'founding_jade_seal': {
      // 전설의 개국옥새 — Imperial white-celadon jade dragon seal on a vermilion cinnabar ink base
      // Vermilion cinnabar ink bottom stamp pad
      p.rampBox(6, 23, 20, 4, ROBE_CRIMSON, LAYER_BODY);
      p.hline(7, 25, 23, '#fda4af', LAYER_FX);
      // Square carved celadon-white imperial jade block (y=14..23)
      p.rampBox(6, 14, 20, 9, ['#f0fdfa', '#99f6e4', '#2dd4bf', '#0f766e'], LAYER_BODY);
      // Golden imperial border inlay & seal glyph strokes
      p.hline(7, 24, 15, '#fef08a', LAYER_FRONT);
      p.rect(13, 17, 6, 4, '#0d9488', LAYER_FRONT);
      p.rect(14, 18, 4, 2, '#facc15', LAYER_FX);
      // Coiled golden-horned jade dragon knob (반룡 손잡이) atop the seal (y=5..14)
      p.disc(15.5, 10, 5.2, ['#ccfbf1', '#5eead4', '#14b8a6', '#115e59'], LAYER_HEAD);
      p.line(12, 6, 9, 3, '#fde047', LAYER_FX, 2);
      p.line(19, 6, 22, 3, '#facc15', LAYER_FX, 2);
      p.set(14, 9, PIXEL_OUTLINE, LAYER_FX);
      p.set(18, 9, PIXEL_OUTLINE, LAYER_FX);
      p.disc(16, 5, 1.6, GOLD_QI, LAYER_FX);
      break;
    }

    case 'heavenly_scroll_chest': {
      // 천기비급함 — Celestial azure brocade casket with levitating golden martial scroll & talisman
      // Azure-lacquered treasure casket (y=15..26)
      p.rampBox(5, 15, 22, 11, ROBE_AZURE, LAYER_BODY);
      // Gold trim bands & cinnabar talisman seal strip
      p.hline(5, 26, 17, '#facc15', LAYER_FRONT);
      p.rect(13, 16, 6, 9, '#fef08a', LAYER_FRONT);
      p.line(16, 17, 16, 23, '#e11d48', LAYER_FX, 2);
      // Unfurled radiant jade-gold martial arts scroll floating above casket (y=5..13)
      p.rampBox(8, 6, 16, 8, ['#fffbeb', '#fef3c7', '#fde68a', '#d97706'], LAYER_HEAD);
      // Jade scroll rollers on left & right ends
      p.rect(6, 5, 3, 10, '#2dd4bf', LAYER_FX);
      p.rect(23, 5, 3, 10, '#14b8a6', LAYER_FX);
      p.set(7, 6, '#ffffff', LAYER_FX);
      // Mysterious heavenly sword-script runes on scroll
      p.line(11, 9, 15, 9, '#0284c7', LAYER_FX, 1);
      p.line(17, 11, 21, 11, '#e11d48', LAYER_FX, 1);
      p.set(13, 11, '#0284c7', LAYER_FX);
      break;
    }

    case 'wind_swift_boots': {
      // 신행백보화 — Azure-jade winged cloud-stepping martial boot with swirling wind-qi ribbons
      // Swirling sky-cyan wind-qi currents behind boot
      p.line(4, 21, 10, 17, '#67e8f9', LAYER_BACK, 2);
      p.line(3, 16, 9, 12, '#38bdf8', LAYER_BACK, 1);
      p.line(5, 25, 11, 23, '#a5f3fc', LAYER_BACK, 1);
      // Boot shaft & sole (deep indigo-azure leather + golden trim)
      p.rampBox(11, 8, 9, 13, ROBE_AZURE, LAYER_BODY);
      p.rampBox(11, 20, 16, 6, ['#38bdf8', '#0284c7', '#0369a1', '#0c4a6e'], LAYER_BODY);
      // Upturned wuxia cloud toe & golden sole rim
      p.rect(24, 18, 4, 4, '#0284c7', LAYER_BODY);
      p.hline(11, 26, 25, '#facc15', LAYER_FRONT);
      p.hline(11, 19, 9, '#fde047', LAYER_FRONT);
      p.rect(12, 13, 7, 2, '#facc15', LAYER_FRONT);
      // Radiant white-cyan feathered wind wings sweeping off heel
      p.line(11, 14, 5, 7, '#e0f2fe', LAYER_FX, 3);
      p.line(11, 16, 4, 11, '#67e8f9', LAYER_FX, 2);
      p.line(11, 18, 6, 15, '#ffffff', LAYER_FX, 1);
      p.set(25, 19, '#e0f2fe', LAYER_FX);
      break;
    }

    case 'crimson_crit_blade': {
      // 혈영회심검 — Razor-thin blood-crimson assassin sword piercing a glowing bullseye acupoint seal
      // Glowing golden-crimson target acupoint ring backdrop
      p.disc(16, 16, 9, ['#fda4af', '#e11d48', '#9f1239', '#4c0519'], LAYER_BACK);
      p.disc(16, 16, 6, ['#1e1b4b', '#1e1b4b', '#0f172a', '#0f172a'], LAYER_BACK);
      p.disc(16, 16, 2.6, GOLD_QI, LAYER_BACK);
      // Diagonal razor blood-crimson blade (bottom-left hilt -> top-right tip)
      p.line(7, 24, 26, 5, '#fb7185', LAYER_FRONT, 3);
      p.line(8, 23, 27, 4, '#ffffff', LAYER_FX, 1);
      p.line(10, 23, 25, 8, '#be123c', LAYER_FRONT, 1);
      // Ornate gold crossguard, obsidian hilt & blood-ruby pommel
      p.line(6, 19, 13, 26, '#facc15', LAYER_FX, 2);
      p.line(5, 26, 8, 23, '#334155', LAYER_FRONT, 2);
      p.disc(4.5, 27, 1.8, ['#fda4af', '#e11d48', '#be123c', '#881337'], LAYER_FX);
      // Critical cross-spark flash at impact center
      p.hline(12, 20, 16, '#fef08a', LAYER_FX);
      p.vline(16, 12, 20, '#fef08a', LAYER_FX);
      p.set(16, 16, '#ffffff', LAYER_FX);
      break;
    }

    case 'armor_break_gauntlet': {
      // 파갑금강수 — Golden vajra iron-breaker gauntlet shattering a dark steel shield plate
      // Cracked steel armor plate shard flying off top-right
      p.rampBox(20, 5, 8, 9, ['#cbd5e1', '#64748b', '#334155', '#0f172a'], LAYER_BACK);
      p.line(22, 6, 26, 13, '#fef08a', LAYER_FX, 1);
      // Sturdy bronze-gold forearm cuff
      p.rampBox(7, 20, 14, 7, ['#fde047', '#d97706', '#92400e', '#451a03'], LAYER_BODY);
      p.hline(7, 20, 22, '#fef08a', LAYER_FRONT);
      // Clenched armored golden vajra fist (y=9..20)
      p.rampBox(6, 10, 16, 10, GOLD_QI, LAYER_HEAD);
      // Four iron-breaking knuckle spikes + crimson inner-qi gem
      p.rect(7, 8, 3, 3, '#fef08a', LAYER_FX);
      p.rect(11, 7, 3, 4, '#ffffff', LAYER_FX);
      p.rect(15, 7, 3, 4, '#fef08a', LAYER_FX);
      p.rect(19, 8, 3, 3, '#facc15', LAYER_FX);
      p.disc(14, 15, 2.5, ROBE_CRIMSON, LAYER_FX);
      p.set(13, 14, '#ffffff', LAYER_FX);
      // Shatter impact sparks
      p.set(24, 16, '#fde047', LAYER_FX);
      p.set(18, 5, '#ffffff', LAYER_FX);
      break;
    }

    case 'celestial_skill_jade': {
      // 태극절기옥 — Radiant Yin-Yang Taiji jade orb ringed by celestial purple-gold qi arcs
      // Outer golden-violet celestial halo ring
      p.disc(15.5, 15.5, 10.6, ['#e9d5ff', '#a855f7', '#7e22ce', '#3b0764'], LAYER_BACK);
      p.disc(15.5, 15.5, 8.6, GOLD_QI, LAYER_BODY);
      // Yin-Yang Taiji inner jade sphere (azure-white Yang left/top + crimson-violet Yin right/bottom)
      p.disc(15.5, 15.5, 6.8, ['#f0fdfa', '#67e8f9', '#0284c7', '#1e3a8a'], LAYER_HEAD);
      p.rampBox(15, 9, 7, 13, ['#fb7185', '#e11d48', '#9f1239', '#4c0519'], LAYER_HEAD);
      p.disc(15.5, 12, 3.2, ['#f0fdfa', '#67e8f9', '#38bdf8', '#0284c7'], LAYER_HEAD);
      p.disc(15.5, 19, 3.2, ['#fb7185', '#e11d48', '#be123c', '#881337'], LAYER_HEAD);
      // Contrasting Taiji eyes
      p.disc(15.5, 12, 1.3, ['#be123c', '#be123c', '#881337', '#881337'], LAYER_FX);
      p.disc(15.5, 19, 1.3, ['#ffffff', '#e0f2fe', '#67e8f9', '#38bdf8'], LAYER_FX);
      // Orbiting starlight motes
      p.set(5, 8, '#fef08a', LAYER_FX);
      p.set(26, 7, '#67e8f9', LAYER_FX);
      p.set(26, 24, '#f0abfc', LAYER_FX);
      p.set(5, 24, '#fef08a', LAYER_FX);
      break;
    }

    case 'demon_slayer_banner': {
      // 토벌패왕기 — Imperial vermilion-black war banner topped by a golden dragon spearhead
      // Ebony spear shaft with gleaming gold spearhead (x=8)
      p.rect(8, 5, 2, 24, '#92400e', LAYER_BODY);
      p.rect(8, 3, 2, 5, '#fef08a', LAYER_FX);
      p.set(8, 2, '#ffffff', LAYER_FX);
      // Horizontal golden crossbar
      p.hline(7, 25, 8, '#facc15', LAYER_FRONT);
      p.set(25, 8, '#fef08a', LAYER_FX);
      // Flowing crimson-obsidian war banner cloth (x=10..24, y=9..24)
      p.rampBox(10, 9, 14, 15, ROBE_CRIMSON, LAYER_BODY);
      p.hline(10, 23, 9, '#facc15', LAYER_FRONT);
      p.vline(23, 9, 23, '#d97706', LAYER_FRONT);
      // Swallowtail banner notches & golden tassels at bottom
      p.rect(10, 24, 4, 3, '#be123c', LAYER_BODY);
      p.rect(20, 24, 4, 3, '#9f1239', LAYER_BODY);
      p.set(11, 27, '#facc15', LAYER_FX);
      p.set(22, 27, '#facc15', LAYER_FX);
      // Embroidered golden conqueror crest (패왕 인장) in center of banner
      p.disc(17, 16, 3.8, GOLD_QI, LAYER_FX);
      p.rect(16, 14, 2, 4, '#881337', LAYER_FX);
      p.hline(14, 19, 16, '#881337', LAYER_FX);
      break;
    }

    case 'merchant_abacus': {
      // 만상금주판 — Rosewood & imperial gold merchant abacus with gleaming jade & gold counting beads
      // Outer carved rosewood-and-gold abacus frame (x=4..27, y=7..24)
      p.rampBox(4, 7, 24, 18, ['#b45309', '#92400e', '#78350f', '#451a03'], LAYER_BODY);
      p.rect(6, 9, 20, 14, '#1e1b4b', LAYER_BODY);
      // Golden corner clasps & central divider beam
      p.rect(4, 7, 3, 3, '#fde047', LAYER_FRONT);
      p.rect(25, 7, 3, 3, '#fde047', LAYER_FRONT);
      p.rect(4, 22, 3, 3, '#facc15', LAYER_FRONT);
      p.rect(25, 22, 3, 3, '#facc15', LAYER_FRONT);
      p.hline(5, 26, 13, '#facc15', LAYER_FRONT);
      // Vertical brass rods
      for (const rx of [9, 13, 18, 22]) {
        p.vline(rx, 9, 22, '#cbd5e1', LAYER_BODY);
      }
      // Upper heaven beads (gold) & lower earth beads (jade + gold)
      for (const rx of [9, 13, 18, 22]) {
        p.rect(rx - 1, 10, 3, 2, '#fde047', LAYER_FX);
        p.rect(rx - 1, 15, 3, 2, '#2dd4bf', LAYER_FX);
        p.rect(rx - 1, 18, 3, 2, '#facc15', LAYER_FX);
        p.rect(rx - 1, 20, 3, 2, '#fde047', LAYER_FX);
      }
      // Floating gleaming silver coin sparkle on top-right
      p.disc(25, 6, 2.4, ['#ffffff', '#e2e8f0', '#94a3b8', '#475569'], LAYER_FX);
      p.set(25, 6, PIXEL_OUTLINE, LAYER_FX);
      break;
    }

    case 'jade_training_manual': {
      // 무림비전 수련서 — Emerald-jade stitched martial manual with golden spine clasps & qi aura
      // Back pages depth
      p.rect(8, 6, 17, 20, '#fef3c7', LAYER_BODY);
      p.rect(24, 7, 2, 19, '#d97706', LAYER_BODY);
      // Front emerald jade silk cover (x=6..23, y=5..25)
      p.rampBox(6, 5, 18, 21, ['#34d399', '#10b981', '#047857', '#064e3b'], LAYER_BODY);
      // Traditional 4-stitch golden binding cord on left spine
      p.vline(9, 6, 24, '#064e3b', LAYER_FRONT);
      for (const sy of [8, 12, 17, 21]) {
        p.hline(6, 9, sy, '#fde047', LAYER_FRONT);
      }
      // Ivory title slip on right cover with crimson brush mark
      p.rect(14, 8, 6, 13, '#fef9c3', LAYER_FRONT);
      p.rect(16, 10, 2, 3, '#b91c1c', LAYER_FX);
      p.rect(16, 14, 2, 2, '#065f46', LAYER_FX);
      p.rect(16, 17, 2, 2, '#065f46', LAYER_FX);
      // Rising jade qi sparkles
      p.set(25, 5, '#6ee7b7', LAYER_FX);
      p.set(5, 25, '#fde047', LAYER_FX);
      break;
    }

    case 'phoenix_luck_pouch': {
      // 봉황기연낭 — Imperial crimson brocade fortune pouch with golden drawstring & phoenix plume
      // Gathered top ruffle (y=6..9)
      p.rampBox(12, 6, 8, 4, ROBE_CRIMSON, LAYER_BODY);
      // Golden braided drawstring & side tassels
      p.hline(11, 20, 10, '#fde047', LAYER_FRONT);
      p.line(11, 10, 8, 15, '#facc15', LAYER_FRONT, 1);
      p.line(20, 10, 23, 15, '#facc15', LAYER_FRONT, 1);
      p.set(8, 16, '#fb923c', LAYER_FX);
      p.set(23, 16, '#fb923c', LAYER_FX);
      // Plump crimson silk pouch body (y=11..25)
      p.disc(15.5, 18.5, 7.6, ROBE_CRIMSON, LAYER_BODY);
      // Golden phoenix emblem stitched on belly
      p.disc(15.5, 18.5, 3.6, GOLD_QI, LAYER_FX);
      p.set(15, 17, '#be123c', LAYER_FX);
      p.set(16, 18, '#be123c', LAYER_FX);
      p.hline(14, 17, 20, '#9a3412', LAYER_FX);
      // Radiant luck-stone orb floating above pouch mouth
      p.disc(15.5, 4.5, 2.3, ['#ffffff', '#a5f3fc', '#38bdf8', '#0284c7'], LAYER_FX);
      break;
    }

    case 'dragon_range_mirror': {
      // 천리안 영경 — Ancient bronze-and-azure celestial clairvoyance mirror with dragon rim
      // Carved ornate bronze handle at bottom
      p.rect(14, 21, 4, 7, '#b45309', LAYER_BODY);
      p.hline(13, 18, 22, '#fde047', LAYER_FRONT);
      p.hline(13, 18, 27, '#facc15', LAYER_FRONT);
      // Outer gilded dragon bronze rim
      p.disc(15.5, 13.5, 8.6, GOLD_QI, LAYER_BODY);
      // Deep celestial sapphire mirror face
      p.disc(15.5, 13.5, 6.2, ['#e0f2fe', '#38bdf8', '#0284c7', '#1e3a8a'], LAYER_FRONT);
      // Sightline reticle / clairvoyance eye gleam inside lens
      p.hline(11, 20, 13, '#bae6fd', LAYER_FX);
      p.vline(15, 9, 18, '#bae6fd', LAYER_FX);
      p.disc(15.5, 13.5, 2.1, ['#ffffff', '#fef08a', '#38bdf8', '#0369a1'], LAYER_FX);
      // Four cardinal bronze dragon lugs
      p.rect(14, 4, 3, 2, '#fde047', LAYER_FX);
      p.rect(6, 12, 2, 3, '#facc15', LAYER_FX);
      p.rect(23, 12, 2, 3, '#facc15', LAYER_FX);
      break;
    }

    case 'eight_trigram_mirror': {
      // 팔괘진법경 — Octagonal imperial Bagua formation mirror with gleaming yin-yang core
      // Outer obsidian-gold octagonal frame
      p.disc(15.5, 15.5, 10.6, ['#fde047', '#eab308', '#a16207', '#422006'], LAYER_BODY);
      p.disc(15.5, 15.5, 8.4, ['#312e81', '#1e1b4b', '#17153b', '#0f0d24'], LAYER_BODY);
      // Eight golden trigram dashes around the octagonal ring
      p.hline(13, 18, 8, '#fde047', LAYER_FRONT);
      p.hline(13, 18, 23, '#fde047', LAYER_FRONT);
      p.vline(8, 13, 18, '#fde047', LAYER_FRONT);
      p.vline(23, 13, 18, '#fde047', LAYER_FRONT);
      p.rect(10, 10, 2, 2, '#facc15', LAYER_FRONT);
      p.rect(20, 10, 2, 2, '#facc15', LAYER_FRONT);
      p.rect(10, 20, 2, 2, '#facc15', LAYER_FRONT);
      p.rect(20, 20, 2, 2, '#facc15', LAYER_FRONT);
      // Central Yin-Yang core (crimson/gold yang vs cyan/indigo yin)
      p.disc(15.5, 15.5, 4.6, ['#ffffff', '#fef08a', '#f59e0b', '#b45309'], LAYER_FX);
      p.rect(15, 16, 4, 4, '#0f172a', LAYER_FX);
      p.rect(16, 11, 3, 5, '#0f172a', LAYER_FX);
      p.set(14, 13, '#0f172a', LAYER_FX);
      p.set(17, 17, '#fef08a', LAYER_FX);
      break;
    }
  }

  // Level 5+ auspicious spirit sparkles
  if (level >= 5) {
    p.set(4, 9, '#fef08a', LAYER_FX);
    p.set(3, 10, '#ffffff', LAYER_FX);
    p.set(27, 8, '#fef08a', LAYER_FX);
    p.set(28, 9, '#67e8f9', LAYER_FX);
  }

  // Locked (Lv.0) diagonal paper talisman seal overlay so unowned vs unlocked is unmistakable
  if (level <= 0) {
    p.line(7, 24, 24, 7, '#fef3c7', LAYER_FX, 2);
    p.line(9, 22, 22, 9, '#dc2626', LAYER_FX, 1);
  }

  p.flush(ctx, canvasSize);
}

/* ========================================================================== */
/*  6 Bespoke 32x32 Divine Armament Pixel-Art Icons (신병이기 6대 명병)          */
/* ========================================================================== */

export function paintArmamentPixelArt(
  ctx: CanvasRenderingContext2D,
  iconKind: ArmamentIconKind,
  primary: string,
  secondary: string,
  canvasSize: number,
): void {
  const p = new PixelCanvas();

  // Subtle sacred forge halo behind weapon
  for (let a = 0; a < 12; a++) {
    const rad = (a * Math.PI * 2) / 12;
    const hx = Math.round(15.5 + Math.cos(rad) * 12);
    const hy = Math.round(15.5 + Math.sin(rad) * 12);
    p.set(hx, hy, a % 2 === 0 ? primary : secondary, LAYER_BACK);
  }

  switch (iconKind) {
    case 'sword': {
      // 자하신검 — Radiant violet-azure Mount Hua jian with plum-blossom guard
      p.line(7, 25, 11, 21, '#92400e', LAYER_BODY, 2);
      p.disc(6, 26, 2.0, ['#fde047', '#eab308', '#a16207', '#422006'], LAYER_FRONT);
      p.line(9, 17, 15, 23, '#facc15', LAYER_FRONT, 2);
      p.line(12, 20, 26, 6, primary, LAYER_BODY, 3);
      p.line(13, 19, 27, 5, '#ffffff', LAYER_FX, 1);
      p.disc(12, 20, 2.2, [secondary, primary, '#be185d', '#4c0519'], LAYER_FX);
      break;
    }
    case 'greatsword': {
      // 흑철현중검 — Heavy edgeless obsidian-gold colossal greatsword
      p.line(6, 26, 11, 21, '#78350f', LAYER_BODY, 2);
      p.line(9, 17, 16, 24, '#f59e0b', LAYER_FRONT, 3);
      p.line(13, 19, 25, 7, '#334155', LAYER_BODY, 5);
      p.line(14, 18, 25, 7, '#64748b', LAYER_BODY, 2);
      p.line(13, 19, 24, 8, secondary, LAYER_FX, 1);
      break;
    }
    case 'needles': {
      // 만천화우침 — Tang Clan fan of 5 gleaming emerald-jade flying needles
      const tips: ReadonlyArray<readonly [number, number]> = [
        [7, 7],
        [13, 4],
        [20, 5],
        [26, 10],
        [27, 17],
      ];
      for (const [tx, ty] of tips) {
        p.line(8, 24, tx, ty, primary, LAYER_BODY, 2);
        p.set(tx, ty, '#ffffff', LAYER_FX);
      }
      p.disc(8, 24, 3.2, ['#fef08a', '#10b981', '#047857', '#064e3b'], LAYER_FRONT);
      break;
    }
    case 'saber': {
      // 수라혈마도 — Broad curved crimson-obsidian Asura dadao cleaver
      p.line(6, 26, 11, 21, '#450a0a', LAYER_BODY, 2);
      p.line(9, 18, 15, 24, '#facc15', LAYER_FRONT, 2);
      p.line(12, 20, 25, 6, '#991b1b', LAYER_BODY, 4);
      p.line(14, 16, 26, 6, primary, LAYER_FRONT, 3);
      p.line(16, 13, 27, 5, '#ffffff', LAYER_FX, 1);
      break;
    }
    case 'fan': {
      // 한빙백옥선 — Spread frost-jade war fan with 5 icy crystal ribs
      p.ellipse(16, 15, 10.5, 7.5, ['#ffffff', secondary, primary, '#0e7490'], LAYER_BODY);
      for (const tx of [7, 11, 16, 21, 25]) {
        p.line(16, 25, tx, 9, '#f8fafc', LAYER_FRONT, 1);
      }
      p.disc(16, 25, 2.4, ['#fde047', '#38bdf8', '#0284c7', '#0c4a6e'], LAYER_FX);
      break;
    }
    case 'halberd': {
      // 뇌제파천창 — Thunder Emperor crescent dragon-halberd crackling with gold lightning
      p.line(6, 26, 24, 8, '#ca8a04', LAYER_BODY, 2);
      p.line(21, 11, 27, 5, '#ffffff', LAYER_FRONT, 3);
      p.line(19, 9, 25, 15, primary, LAYER_FRONT, 3);
      p.line(16, 12, 22, 18, secondary, LAYER_FX, 1);
      break;
    }
  }

  p.flush(ctx, canvasSize);
}

