import type { MonsterKind } from '../data/types';

/**
 * Retro pixel-art sprite painter.
 *
 * Every character is authored on a small logical grid (32x32 for units & bosses, 24x24 for mobs),
 * auto-shaded with a 4-tone cel ramp (light / base / shade / deep — light from top-left) and wrapped
 * in a 1-cell dark outline. The grid is rasterised ONCE into an offscreen canvas owned by SpriteCache
 * with plain fillRect calls (no filters, no shadowBlur) and is then blitted nearest-neighbour.
 */

const OUTLINE = '#140d1c';

type Ramp = readonly [string, string, string, string];

const RAMPS = {
  skin: ['#ffe2c4', '#f9c49a', '#e09a6e', '#b06a48'],
  skinFlush: ['#ffc4b0', '#f79a86', '#d9675e', '#a8413f'],
  skinTan: ['#f2c49b', '#d9a06e', '#b07448', '#7f4d2e'],
  fur: ['#c98a5a', '#a8653a', '#7f4626', '#5a2e18'],
  furLight: ['#fff0dc', '#f4d9b8', '#d9b08a', '#ad8160'],
  hairBlack: ['#4a4560', '#2c2838', '#1c1926', '#100e17'],
  hairGreen: ['#8fe39a', '#3fbf6a', '#23874a', '#145c34'],
  hairOrange: ['#ffc07a', '#ff8c2e', '#dd5f14', '#a8400c'],
  hairBlond: ['#fff3a8', '#ffd94a', '#e0a91f', '#a8760e'],
  hairRed: ['#ff7a6a', '#e0332e', '#a81e24', '#701219'],
  hairWhite: ['#ffffff', '#eef2ff', '#c5cde8', '#8f9bc4'],
  straw: ['#fff2a6', '#f7d354', '#d9a72a', '#a8761a'],
  red: ['#ff7b7b', '#e8323c', '#b41f2e', '#7c1424'],
  orange: ['#ffb366', '#ff8a1f', '#d9620e', '#9c410a'],
  yellow: ['#fff38a', '#ffd31f', '#e0a20e', '#a8700a'],
  blue: ['#7cc4ff', '#2f8cf0', '#1f5fc0', '#163e86'],
  denim: ['#8fb4f0', '#4f7fd0', '#355aa8', '#233c78'],
  navy: ['#5468a8', '#2e3f7c', '#1f2a5a', '#141c3e'],
  white: ['#ffffff', '#eef1f8', '#c9d0e2', '#9aa3bd'],
  black: ['#5a5670', '#33303f', '#221f2c', '#14121b'],
  green: ['#9fe870', '#5cc23c', '#3a8f28', '#26621c'],
  darkGreen: ['#5fa86a', '#2f7a45', '#1f5532', '#133a22'],
  olive: ['#c9c26a', '#9a9440', '#6f6a2a', '#4a461a'],
  brown: ['#c08a5a', '#8f5a32', '#6a3e20', '#472914'],
  wood: ['#d9a066', '#b07438', '#84522a', '#5a361a'],
  pink: ['#ffb3d1', '#ff7aa8', '#e04a83', '#a82e5e'],
  purple: ['#d9a8ff', '#a35cff', '#7433d9', '#4d1fa0'],
  gold: ['#fff2a0', '#ffd23f', '#e0a020', '#a86e10'],
  steel: ['#ffffff', '#dbe4f0', '#9fb0c8', '#6a7a94'],
  gray: ['#c8ccd8', '#9aa0b4', '#6f7590', '#4a4f66'],
  metal: ['#e6ecf5', '#aab6c8', '#76849c', '#4c586e'],
  fire: ['#fff6b0', '#ffc93c', '#ff7a1a', '#d7261e'],
  steam: ['#ffffff', '#e6ebf5', '#c3cbdc', '#9aa4ba'],
  cloud: ['#ffffff', '#f4f6ff', '#d6dcf5', '#aab3dc'],
  cloudGray: ['#9aa3b8', '#6f7890', '#4f566c', '#363b4c'],
  haki: ['#5a3a6e', '#2e1f3c', '#1c1328', '#100a18'],
  hakiRed: ['#ff6a6a', '#d81f3a', '#9a1028', '#5c0818'],
  seaKing: ['#7fe3cf', '#2fb59c', '#1f8070', '#14544c'],
  belly: ['#fff3c4', '#f2d98a', '#d1b25c', '#a8873a'],
  water: ['#7fd6ff', '#2f9be0', '#1f6aad', '#16477a'],
  pxCoat: ['#6a6080', '#433b56', '#2e283c', '#1e1a28'],
} as const satisfies Record<string, Ramp>;

const FLATS = {
  eye: '#1a1024',
  glint: '#ffffff',
  irisBrown: '#6b3a1f',
  redIris: '#ff2a3c',
  mouth: '#6e1f2e',
  tongue: '#ff6f7f',
  teeth: '#ffffff',
  blush: '#ff8fa8',
  scar: '#9b2d3b',
  freckle: '#b9643a',
  lens: '#9ee7ff',
  redEye: '#ff2a2a',
  ember: '#ff5a1f',
  smoke: '#cfd6e4',
  eyeBag: '#8a6a8a',
} as const satisfies Record<string, string>;

type RampMat = keyof typeof RAMPS;
type FlatMat = keyof typeof FLATS;
type Mat = RampMat | FlatMat;
type Pt = readonly [number, number];

const NO_OUTLINE: ReadonlySet<Mat> = new Set<Mat>(['smoke']);

function isRamp(m: Mat): m is RampMat {
  return Object.prototype.hasOwnProperty.call(RAMPS, m);
}

/* ------------------------------------------------------------------ */
/*  Pixel grid with auto cel-shading + outline pass                    */
/* ------------------------------------------------------------------ */

class PixelGrid {
  public readonly w: number;
  public readonly h: number;
  private readonly cells: (Mat | null)[];
  private readonly forced: Int8Array;
  private readonly groups: Int16Array;
  private group = 0;

  public constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.cells = new Array<Mat | null>(w * h).fill(null);
    this.forced = new Int8Array(w * h).fill(-1);
    this.groups = new Int16Array(w * h);
  }

  /** Starts a new shading region: cells only shade against neighbours of the same region. */
  public newGroup(): this {
    this.group++;
    return this;
  }

  public set(x: number, y: number, m: Mat, tone = -1): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
    const i = iy * this.w + ix;
    this.cells[i] = m;
    this.forced[i] = tone;
    this.groups[i] = this.group;
  }

  public clear(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.cells[y * this.w + x] = null;
  }

  public rect(x: number, y: number, w: number, h: number, m: Mat, tone = -1): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, m, tone);
    }
  }

  /** Inclusive horizontal span. */
  public span(y: number, x0: number, x1: number, m: Mat, tone = -1): void {
    for (let x = x0; x <= x1; x++) this.set(x, y, m, tone);
  }

  public ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    m: Mat,
    yMin = -Infinity,
    yMax = Infinity,
    tone = -1,
  ): void {
    const y0 = Math.max(0, Math.floor(cy - ry - 1));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + ry + 1));
    const x0 = Math.max(0, Math.floor(cx - rx - 1));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + rx + 1));
    for (let y = y0; y <= y1; y++) {
      if (y < yMin || y > yMax) continue;
      for (let x = x0; x <= x1; x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.set(x, y, m, tone);
      }
    }
  }

  /** Bresenham line; returns plotted points. */
  public line(ax: number, ay: number, bx: number, by: number, m: Mat, tone = -1): Pt[] {
    let x0 = Math.round(ax);
    let y0 = Math.round(ay);
    const x1 = Math.round(bx);
    const y1 = Math.round(by);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const out: Pt[] = [];
    for (;;) {
      this.set(x0, y0, m, tone);
      out.push([x0, y0]);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
    return out;
  }

  public polyline(pts: readonly Pt[], m: Mat, tone = -1): void {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      this.line(a[0], a[1], b[0], b[1], m, tone);
    }
  }

  public pts(list: readonly Pt[], m: Mat, tone = -1): void {
    for (const p of list) this.set(p[0], p[1], m, tone);
  }

  private at(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return y * this.w + x;
  }

  private same(x: number, y: number, m: Mat, g: number): boolean {
    const i = this.at(x, y);
    return i >= 0 && this.cells[i] === m && this.groups[i] === g;
  }

  private filled(x: number, y: number): Mat | null {
    const i = this.at(x, y);
    return i >= 0 ? (this.cells[i] ?? null) : null;
  }

  public render(ctx: CanvasRenderingContext2D, ox: number, oy: number, s: number): void {
    // 1) Outline pass — every empty cell 4-adjacent to an outlined material.
    ctx.fillStyle = OUTLINE;
    for (let y = -1; y <= this.h; y++) {
      for (let x = -1; x <= this.w; x++) {
        if (this.filled(x, y)) continue;
        const n = [this.filled(x - 1, y), this.filled(x + 1, y), this.filled(x, y - 1), this.filled(x, y + 1)];
        let hit = false;
        for (const c of n) {
          if (c && !NO_OUTLINE.has(c)) {
            hit = true;
            break;
          }
        }
        if (hit) ctx.fillRect(ox + x * s, oy + y * s, s, s);
      }
    }

    // 2) Fill pass with auto 4-tone cel shading.
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        const m = this.cells[i];
        if (!m) continue;
        let color: string;
        if (isRamp(m)) {
          let tone = this.forced[i]!;
          if (tone < 0) {
            const g = this.groups[i]!;
            let score = 0;
            if (!this.same(x, y - 1, m, g)) {
              // Open sky above → rim light; something else above → cast shadow.
              score += this.filled(x, y - 1) ? 1 : -1;
            }
            if (!this.same(x - 1, y, m, g)) score -= 1;
            if (!this.same(x + 1, y, m, g)) score += 1;
            if (!this.same(x, y + 1, m, g)) {
              score += 1;
            } else if (
              !this.same(x, y + 2, m, g) &&
              this.same(x, y - 1, m, g) &&
              this.same(x, y - 2, m, g)
            ) {
              score += 1;
            }
            tone = Math.max(0, Math.min(3, score + 1));
          }
          color = RAMPS[m][tone as 0 | 1 | 2 | 3];
        } else {
          color = FLATS[m];
        }
        ctx.fillStyle = color;
        ctx.fillRect(ox + x * s, oy + y * s, s, s);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Shared 32-grid unit template                                       */
/* ------------------------------------------------------------------ */

/** Mirror x around the 32-grid unit axis (column 16). */
const mx = (x: number): number => 32 - x;

interface BodyOpts {
  readonly skin: Mat;
  readonly shirt: Mat;
  readonly pants: Mat;
  readonly shoes: Mat;
  readonly sleeve?: Mat;
  readonly chest?: Mat;
  readonly belt?: Mat;
  readonly shorts?: boolean;
  readonly noRightArm?: boolean;
}

function body(g: PixelGrid, o: BodyOpts): void {
  g.newGroup();
  g.span(26, 12, 20, o.pants);
  g.rect(12, 27, 4, 2, o.pants);
  g.rect(17, 27, 4, 2, o.pants);
  if (o.shorts) {
    g.newGroup().rect(12, 28, 4, 1, o.skin);
    g.newGroup().rect(17, 28, 4, 1, o.skin);
  }
  g.newGroup().rect(11, 29, 5, 2, o.shoes);
  g.newGroup().rect(17, 29, 5, 2, o.shoes);

  g.newGroup();
  g.span(20, 12, 20, o.shirt);
  g.rect(11, 21, 11, 5, o.shirt);
  if (o.chest) {
    g.newGroup();
    g.rect(15, 20, 3, 4, o.chest);
    g.set(16, 24, o.chest);
  }
  if (o.belt) g.newGroup().span(25, 11, 21, o.belt);

  const sl = o.sleeve ?? o.skin;
  g.newGroup().rect(9, 21, 2, 3, sl);
  if (!o.noRightArm) g.newGroup().rect(22, 21, 2, 3, sl);
  hands(g, o.skin, true, !o.noRightArm);
}

function hands(g: PixelGrid, skin: Mat, left = true, right = true): void {
  if (left) g.newGroup().rect(9, 24, 2, 2, skin);
  if (right) g.newGroup().rect(22, 24, 2, 2, skin);
}

function head(g: PixelGrid, skin: Mat): void {
  g.newGroup().ellipse(16.5, 14, 7.5, 7, skin);
  g.newGroup().rect(8, 14, 1, 2, skin);
  g.newGroup().rect(24, 14, 1, 2, skin);
}

type EyeStyle = 'normal' | 'angry' | 'laugh' | 'closedR' | 'hiddenL';

function eyes(g: PixelGrid, style: EyeStyle, iris: Mat = 'irisBrown'): void {
  const eye = (x0: number): void => {
    g.rect(x0, 14, 2, 3, 'eye');
    g.set(x0, 14, 'glint');
    g.set(x0 + 1, 16, iris);
  };
  switch (style) {
    case 'normal':
      eye(12);
      eye(19);
      break;
    case 'angry':
      eye(12);
      eye(19);
      g.pts([[11, 12], [12, 12], [13, 13], [14, 13]], 'eye');
      g.pts([[21, 12], [20, 12], [19, 13], [18, 13]], 'eye');
      break;
    case 'laugh':
      g.pts([[11, 16], [12, 15], [13, 15], [14, 16]], 'eye');
      g.pts([[18, 16], [19, 15], [20, 15], [21, 16]], 'eye');
      break;
    case 'closedR':
      eye(12);
      g.pts([[11, 12], [12, 12], [13, 13]], 'eye');
      g.span(15, 18, 21, 'eye');
      g.line(20, 11, 19, 18, 'scar');
      break;
    case 'hiddenL':
      eye(19);
      break;
  }
}

type MouthStyle = 'smile' | 'grin' | 'flat' | 'smirk' | 'teeth' | 'open';

function mouth(g: PixelGrid, style: MouthStyle): void {
  switch (style) {
    case 'smile':
      g.pts([[14, 18], [18, 18]], 'mouth');
      g.span(19, 15, 17, 'mouth');
      break;
    case 'grin':
      g.pts([[14, 18], [18, 18]], 'mouth');
      g.span(18, 15, 17, 'teeth');
      g.pts([[15, 19], [17, 19]], 'mouth');
      g.set(16, 19, 'tongue');
      break;
    case 'flat':
      g.span(19, 15, 17, 'mouth');
      break;
    case 'smirk':
      g.pts([[15, 19], [16, 19], [17, 19], [18, 18]], 'mouth');
      break;
    case 'teeth':
      g.pts([[13, 18], [19, 18]], 'mouth');
      g.span(18, 14, 18, 'teeth');
      g.span(19, 14, 18, 'mouth');
      break;
    case 'open':
      g.pts([[13, 18], [19, 18], [14, 19], [18, 19]], 'mouth');
      g.span(18, 14, 18, 'teeth');
      g.span(19, 15, 17, 'tongue');
      g.span(20, 15, 17, 'mouth');
      break;
  }
}

function blush(g: PixelGrid, left = true, right = true): void {
  if (left) g.span(17, 10, 11, 'blush');
  if (right) g.span(17, 21, 22, 'blush');
}

interface SwordOpts {
  readonly blade?: Mat;
  readonly hilt?: Mat;
  readonly guard?: Mat;
  readonly hiltLen?: number;
}

/** Katana / saber: guard point → tip, with hilt extending opposite the blade. */
function sword(g: PixelGrid, gx: number, gy: number, tx: number, ty: number, o: SwordOpts = {}): void {
  const dx = tx - gx;
  const dy = ty - gy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  g.newGroup();
  const pts = g.line(gx + ux * 1.2, gy + uy * 1.2, tx, ty, o.blade ?? 'steel', 1);
  for (let i = 0; i < pts.length; i += 3) {
    const p = pts[i]!;
    g.set(p[0], p[1], o.blade ?? 'steel', 0);
  }
  g.newGroup();
  const hl = o.hiltLen ?? 3;
  for (let k = 1; k <= hl; k++) g.set(gx - ux * k, gy - uy * k, o.hilt ?? 'black');
  g.newGroup();
  const px = -uy;
  const py = ux;
  g.set(gx, gy, o.guard ?? 'gold');
  g.set(gx + px, gy + py, o.guard ?? 'gold');
  g.set(gx - px, gy - py, o.guard ?? 'gold');
}

/** Pixel flame with forced inner tones (white-hot core → crimson tips). */
function flame(g: PixelGrid, cx: number, baseY: number, h: number, hw: number): void {
  g.newGroup();
  for (let i = 0; i < h; i++) {
    const y = baseY - i;
    const t = i / h;
    const w = Math.max(0, Math.round(hw * (1 - t * t) * (i < 1 ? 0.75 : 1)));
    const wob = Math.round(Math.sin(i * 1.3 + cx) * 0.7);
    for (let dx = -w; dx <= w; dx++) {
      const edge = w === 0 ? 1 : Math.abs(dx) / w;
      let tone = edge > 0.7 ? 2 : edge > 0.34 ? 1 : 0;
      if (t > 0.62) tone = Math.min(3, tone + 1);
      g.set(cx + dx + wob, y, 'fire', tone);
    }
  }
  g.set(cx, baseY - h, 'fire', 3);
  g.set(cx - hw, baseY - Math.round(h * 0.55), 'fire', 2);
  g.set(cx + hw, baseY - Math.round(h * 0.45), 'fire', 2);
}

function puff(g: PixelGrid, cx: number, cy: number, m: Mat = 'steam'): void {
  g.newGroup().ellipse(cx, cy, 1.7, 1.3, m);
}

/* ------------------------------------------------------------------ */
/*  Hair & hats                                                        */
/* ------------------------------------------------------------------ */

function strawHat(g: PixelGrid): void {
  g.newGroup();
  g.span(3, 13, 19, 'straw');
  g.span(4, 12, 20, 'straw');
  g.rect(11, 5, 11, 3, 'straw');
  g.pts([[13, 5], [17, 6], [20, 5]], 'straw', 2);
  g.newGroup().span(8, 11, 21, 'red');
  g.newGroup();
  g.span(9, 7, 25, 'straw');
  g.span(10, 6, 26, 'straw');
  g.pts([[9, 10], [14, 10], [19, 10], [24, 10]], 'straw', 3);
}

function luffyHair(g: PixelGrid): void {
  g.newGroup();
  g.span(11, 9, 23, 'hairBlack');
  g.pts(
    [[9, 12], [10, 12], [12, 12], [15, 12], [16, 12], [20, 12], [22, 12], [23, 12], [9, 13], [23, 13]],
    'hairBlack',
  );
}

function buzzHair(g: PixelGrid, m: Mat): void {
  g.newGroup();
  g.ellipse(16.5, 12.5, 8, 6.2, m, -Infinity, 10);
  g.pts([[9, 11], [10, 11], [22, 11], [23, 11], [9, 12], [23, 12], [14, 11]], m);
  g.pts([[12, 5], [16, 5], [20, 5]], m);
}

function marineCap(g: PixelGrid): void {
  g.newGroup().pts([[9, 11], [9, 12], [23, 11], [23, 12], [10, 11], [22, 11]], 'brown');
  g.newGroup();
  g.span(5, 12, 20, 'white');
  g.rect(10, 6, 13, 4, 'white');
  g.newGroup().span(10, 9, 23, 'navy');
  g.newGroup().pts([[16, 6], [16, 7], [16, 8], [15, 8], [17, 8], [15, 7], [17, 7]], 'blue', 1);
}

/* ------------------------------------------------------------------ */
/*  Unit designs                                                       */
/* ------------------------------------------------------------------ */

interface LuffyOpts {
  readonly skin: Mat;
  readonly shirt: Mat;
  readonly sleeve?: Mat;
  readonly sash?: Mat;
  readonly chestScar?: boolean;
  readonly eyes: EyeStyle;
  readonly mouth: MouthStyle;
}

function luffyBase(g: PixelGrid, o: LuffyOpts): void {
  body(g, {
    skin: o.skin,
    shirt: o.shirt,
    chest: o.skin,
    pants: 'blue',
    shorts: true,
    shoes: 'wood',
    ...(o.sleeve ? { sleeve: o.sleeve } : {}),
    ...(o.sash ? { belt: o.sash } : {}),
  });
  if (o.chestScar) g.pts([[15, 21], [17, 21], [16, 22], [15, 23], [17, 23]], 'scar');
  head(g, o.skin);
  eyes(g, o.eyes);
  mouth(g, o.mouth);
  blush(g, true, false);
  g.span(17, 19, 20, 'scar');
  luffyHair(g);
  strawHat(g);
}

function paintLuffy(g: PixelGrid): void {
  luffyBase(g, { skin: 'skin', shirt: 'red', eyes: 'normal', mouth: 'grin' });
}

function paintLuffyGear2(g: PixelGrid): void {
  luffyBase(g, { skin: 'skinFlush', shirt: 'red', eyes: 'angry', mouth: 'teeth' });
  puff(g, 4, 19);
  puff(g, 6, 15);
  puff(g, 27, 13);
  puff(g, 28, 21);
  puff(g, 26, 26);
}

function paintLuffyTs(g: PixelGrid): void {
  luffyBase(g, {
    skin: 'skin',
    shirt: 'red',
    sleeve: 'red',
    sash: 'yellow',
    chestScar: true,
    eyes: 'normal',
    mouth: 'grin',
  });
}

function paintLuffyGear4(g: PixelGrid): void {
  g.newGroup();
  g.span(26, 11, 21, 'blue');
  g.rect(11, 27, 5, 2, 'blue');
  g.rect(17, 27, 5, 2, 'blue');
  g.newGroup().rect(10, 29, 6, 2, 'haki');
  g.newGroup().rect(17, 29, 6, 2, 'haki');

  g.newGroup();
  g.span(19, 11, 21, 'skin');
  g.rect(9, 20, 15, 5, 'skin');
  g.newGroup().rect(9, 20, 3, 4, 'haki');
  g.newGroup().rect(21, 20, 3, 4, 'haki');
  g.pts([[10, 21], [11, 22], [22, 21], [21, 22], [14, 23], [18, 23]], 'hakiRed', 1);
  g.newGroup().rect(12, 20, 2, 5, 'red');
  g.newGroup().rect(19, 20, 2, 5, 'red');
  g.newGroup().span(25, 10, 22, 'yellow');

  // Huge haki-coated fists
  g.newGroup().rect(2, 17, 7, 8, 'haki');
  g.pts([[3, 19], [4, 19], [5, 19], [6, 19], [7, 19], [3, 21], [7, 21], [3, 23], [7, 23]], 'hakiRed', 1);
  g.newGroup().rect(24, 17, 7, 8, 'haki');
  g.pts([[25, 19], [26, 19], [27, 19], [28, 19], [29, 19], [25, 21], [29, 21], [25, 23], [29, 23]], 'hakiRed', 1);

  head(g, 'skin');
  eyes(g, 'angry');
  mouth(g, 'teeth');
  g.span(17, 19, 20, 'scar');
  luffyHair(g);
  strawHat(g);
  puff(g, 4, 13);
  puff(g, 28, 13);
  puff(g, 2, 27);
  puff(g, 30, 27);
}

function paintLuffyNika(g: PixelGrid): void {
  body(g, { skin: 'skin', shirt: 'white', chest: 'skin', pants: 'white', shorts: true, shoes: 'wood' });
  head(g, 'skin');
  eyes(g, 'normal', 'redIris');
  g.pts([[12, 15], [19, 15]], 'redIris');
  mouth(g, 'open');
  blush(g);
  g.span(17, 19, 20, 'scar');
  // Wild cloud-flame hair
  g.newGroup();
  g.ellipse(16.5, 10, 10, 6.5, 'hairWhite', -Infinity, 12);
  g.line(10, 5, 8, 1, 'hairWhite');
  g.line(13, 4, 12, 0, 'hairWhite');
  g.line(16, 4, 16, 0, 'hairWhite');
  g.line(20, 4, 21, 0, 'hairWhite');
  g.line(23, 5, 25, 1, 'hairWhite');
  g.pts([[6, 12], [7, 13], [26, 12], [25, 13], [10, 12], [13, 12], [19, 12], [22, 12]], 'hairWhite');
  // Cloud scarf
  g.newGroup();
  g.span(19, 10, 22, 'cloud');
  g.span(20, 9, 23, 'cloud');
  g.span(21, 10, 22, 'cloud');
  g.rect(24, 20, 2, 2, 'cloud');
  g.rect(25, 22, 2, 2, 'cloud');
  g.rect(26, 24, 3, 2, 'cloud');
  g.newGroup().pts([[9, 20], [23, 20], [28, 25], [26, 21]], 'purple', 1);
  // Purple haki bolts
  g.newGroup().polyline([[3, 7], [5, 10], [3, 11], [5, 15]], 'purple', 1);
  g.newGroup().polyline([[29, 3], [27, 6], [29, 7], [27, 10]], 'purple', 1);
}

function paintZoro(g: PixelGrid): void {
  body(g, { skin: 'skin', shirt: 'white', sleeve: 'skin', pants: 'black', shoes: 'black', belt: 'darkGreen' });
  g.newGroup().span(24, 11, 21, 'darkGreen');
  sword(g, 9, 23, 3, 9, { hilt: 'white' });
  hands(g, 'skin', true, false);
  head(g, 'skin');
  eyes(g, 'angry');
  mouth(g, 'flat');
  buzzHair(g, 'hairGreen');
  g.newGroup().pts([[24, 16], [24, 17]], 'gold', 1);
}

function paintZoroDual(g: PixelGrid): void {
  body(g, { skin: 'skin', shirt: 'white', pants: 'black', shoes: 'black', belt: 'darkGreen' });
  g.newGroup().span(24, 11, 21, 'darkGreen');
  sword(g, 9, 23, 2, 12, { hilt: 'white' });
  sword(g, 23, 25, 30, 30, { hilt: 'black' });
  hands(g, 'skin');
  head(g, 'skin');
  eyes(g, 'angry');
  // Wado Ichimonji clenched in the teeth
  g.newGroup().span(18, 9, 12, 'white');
  g.newGroup().pts([[13, 17], [13, 18], [13, 19]], 'gold');
  g.newGroup();
  g.span(18, 14, 29, 'steel', 1);
  g.pts([[17, 18], [21, 18], [25, 18]], 'steel', 0);
  // Black bandana
  g.newGroup();
  g.ellipse(16.5, 12.5, 8, 6.2, 'black', -Infinity, 10);
  g.pts([[9, 11], [23, 11]], 'black');
  g.newGroup().pts([[24, 8], [25, 9], [25, 10], [26, 10]], 'black');
  g.newGroup().pts([[24, 16], [24, 17]], 'gold', 1);
}

function paintZoroTs(g: PixelGrid): void {
  // Sheathed swords at the hip
  g.newGroup().line(9, 25, 5, 30, 'black');
  g.newGroup().line(10, 25, 7, 30, 'red');
  body(g, {
    skin: 'skin',
    shirt: 'darkGreen',
    chest: 'skin',
    sleeve: 'darkGreen',
    pants: 'black',
    shoes: 'black',
    belt: 'red',
  });
  sword(g, 23, 23, 30, 9, { hilt: 'white' });
  hands(g, 'skin');
  head(g, 'skin');
  eyes(g, 'closedR');
  mouth(g, 'smirk');
  buzzHair(g, 'hairGreen');
  g.pts([[11, 5], [21, 5]], 'hairGreen');
  g.newGroup().pts([[8, 16], [8, 17]], 'gold', 1);
}

function paintZoroAshura(g: PixelGrid): void {
  // Purple ashura aura
  g.newGroup().pts(
    [[4, 3], [6, 1], [9, 2], [24, 2], [27, 1], [29, 4], [2, 14], [30, 15], [3, 27], [29, 28]],
    'purple',
    1,
  );
  body(g, { skin: 'skin', shirt: 'darkGreen', chest: 'skin', sleeve: 'darkGreen', pants: 'black', shoes: 'black', belt: 'red' });
  // Upper extra arms + swords
  g.newGroup().rect(6, 19, 3, 2, 'darkGreen');
  g.newGroup().rect(24, 19, 3, 2, 'darkGreen');
  sword(g, 5, 18, 1, 5, { hilt: 'white', hiltLen: 2 });
  sword(g, 27, 18, 31, 5, { hilt: 'white', hiltLen: 2 });
  g.newGroup().rect(4, 18, 2, 2, 'skin');
  g.newGroup().rect(27, 18, 2, 2, 'skin');
  // Lower extra arms + swords
  g.newGroup().rect(7, 26, 2, 2, 'darkGreen');
  g.newGroup().rect(24, 26, 2, 2, 'darkGreen');
  sword(g, 5, 27, 1, 31, { hilt: 'black', hiltLen: 2 });
  sword(g, 27, 27, 31, 31, { hilt: 'black', hiltLen: 2 });
  g.newGroup().rect(5, 26, 2, 2, 'skin');
  g.newGroup().rect(26, 26, 2, 2, 'skin');
  // Middle arms + swords
  sword(g, 8, 24, 1, 22, { hilt: 'red', hiltLen: 2 });
  sword(g, 24, 24, 31, 22, { hilt: 'red', hiltLen: 2 });
  hands(g, 'skin');
  head(g, 'skin');
  eyes(g, 'angry', 'redIris');
  g.pts([[13, 15], [20, 15]], 'redIris');
  mouth(g, 'teeth');
  buzzHair(g, 'hairGreen');
  g.newGroup().pts([[24, 16], [24, 17]], 'gold', 1);
}

function namiBase(g: PixelGrid): void {
  // Long back hair
  g.newGroup().ellipse(16.5, 15, 9, 9.5, 'hairOrange', 6, 24);
  // Clima-Tact staff
  g.newGroup();
  g.line(8, 12, 8, 30, 'blue');
  g.newGroup().rect(7, 11, 3, 2, 'blue');
  g.newGroup();
  g.span(20, 12, 20, 'white');
  g.rect(11, 21, 11, 3, 'white');
  g.span(21, 11, 21, 'blue');
  g.span(23, 11, 21, 'blue');
  g.newGroup().rect(12, 24, 9, 1, 'skin');
  g.newGroup();
  g.span(25, 12, 20, 'denim');
  g.rect(12, 26, 4, 3, 'denim');
  g.rect(17, 26, 4, 3, 'denim');
  g.newGroup().rect(11, 29, 5, 2, 'orange');
  g.newGroup().rect(17, 29, 5, 2, 'orange');
  g.newGroup().rect(9, 21, 2, 3, 'skin');
  g.newGroup().rect(22, 21, 2, 3, 'skin');
  hands(g, 'skin');
  g.newGroup().pts([[9, 26], [10, 26]], 'gold', 1);
  head(g, 'skin');
  eyes(g, 'normal');
  mouth(g, 'smile');
  blush(g);
  // Front hair + bangs
  g.newGroup();
  g.ellipse(16.5, 12.8, 8.2, 6.6, 'hairOrange', -Infinity, 10);
  g.span(11, 9, 14, 'hairOrange');
  g.span(11, 18, 23, 'hairOrange');
  g.pts([[9, 12], [10, 12], [11, 12], [21, 12], [22, 12], [23, 12]], 'hairOrange');
  g.rect(8, 12, 2, 8, 'hairOrange');
  g.rect(23, 12, 2, 8, 'hairOrange');
}

function paintNami(g: PixelGrid): void {
  namiBase(g);
}

function paintNamiClima(g: PixelGrid): void {
  namiBase(g);
  g.newGroup();
  g.ellipse(24, 4, 6, 2.6, 'cloudGray');
  g.ellipse(20, 5, 3, 2, 'cloudGray');
  g.newGroup().polyline([[25, 7], [23, 10], [26, 11], [24, 15]], 'yellow', 0);
  g.newGroup().polyline([[20, 7], [19, 9]], 'yellow', 0);
  g.newGroup().pts([[6, 10], [10, 10], [8, 9]], 'yellow', 0);
}

function paintUsopp(g: PixelGrid): void {
  body(g, { skin: 'skinTan', shirt: 'olive', chest: 'skinTan', pants: 'brown', shoes: 'brown', belt: 'yellow' });
  // Slingshot (Kabuto)
  g.newGroup();
  g.line(25, 21, 25, 26, 'wood');
  g.pts([[24, 20], [26, 20], [24, 19], [26, 19]], 'wood');
  g.newGroup().set(25, 19, 'black');
  hands(g, 'skinTan');
  head(g, 'skinTan');
  eyes(g, 'normal');
  mouth(g, 'grin');
  // Signature long nose
  g.newGroup();
  g.span(17, 16, 27, 'skinTan');
  g.set(27, 16, 'skinTan');
  // Big curly hair
  g.newGroup();
  g.ellipse(16.5, 10, 9.5, 6, 'hairBlack', -Infinity, 12);
  g.pts([[6, 7], [27, 7], [8, 3], [12, 3], [16, 3], [21, 3], [25, 4], [6, 12], [26, 12]], 'hairBlack');
  // Goggles
  g.newGroup().span(10, 8, 24, 'brown');
  g.newGroup().rect(11, 8, 3, 3, 'gold');
  g.newGroup().rect(19, 8, 3, 3, 'gold');
  g.pts([[12, 9], [20, 9]], 'lens');
}

function sanjiBase(g: PixelGrid, kick: boolean): void {
  g.newGroup();
  g.span(26, 12, 20, 'black');
  g.rect(12, 27, 4, 2, 'black');
  g.newGroup().rect(11, 29, 5, 2, 'black');
  if (kick) {
    g.newGroup().rect(20, 26, 8, 2, 'fire', 1);
    g.pts([[20, 26], [21, 26], [22, 26], [23, 26], [24, 26], [25, 26], [26, 26], [27, 26]], 'fire', 0);
    g.newGroup().rect(28, 25, 2, 3, 'black');
  } else {
    g.newGroup().rect(17, 27, 4, 2, 'black');
    g.newGroup().rect(17, 29, 5, 2, 'black');
  }
  g.newGroup();
  g.span(20, 12, 20, 'black');
  g.rect(11, 21, 11, 5, 'black');
  g.newGroup().rect(15, 20, 3, 3, 'white');
  g.newGroup().pts([[16, 21], [16, 22], [16, 23], [16, 24]], 'blue', 1);
  g.newGroup().rect(9, 21, 2, 3, 'black');
  g.newGroup().rect(22, 21, 2, 3, 'black');
  hands(g, 'skin');
  head(g, 'skin');
  eyes(g, 'hiddenL');
  mouth(g, 'smirk');
  g.newGroup().pts([[18, 18], [19, 18], [20, 18]], 'white', 0);
  g.set(21, 18, 'ember');
  g.newGroup().pts([[22, 16], [23, 15], [23, 14], [24, 13], [25, 12], [24, 11]], 'smoke');
  // Blond hair curtain over one eye
  g.newGroup();
  g.ellipse(16.5, 12.5, 8, 6.2, 'hairBlond', -Infinity, 11);
  g.rect(9, 11, 6, 6, 'hairBlond');
  g.span(17, 10, 13, 'hairBlond');
  g.pts([[23, 11], [23, 12], [23, 13], [22, 11]], 'hairBlond');
  // Curly brow
  g.pts([[19, 12], [20, 12], [21, 12], [21, 11], [20, 11]], 'hairBlond', 3);
}

function paintSanji(g: PixelGrid): void {
  sanjiBase(g, false);
}

function paintSanjiDiable(g: PixelGrid): void {
  flame(g, 24, 25, 9, 3);
  flame(g, 29, 24, 6, 2);
  sanjiBase(g, true);
  g.newGroup().pts([[19, 23], [26, 22], [30, 19]], 'fire', 0);
}

function paintChopper(g: PixelGrid): void {
  body(g, { skin: 'fur', shirt: 'fur', pants: 'pink', shorts: true, shoes: 'black' });
  g.newGroup().rect(9, 24, 2, 2, 'black');
  g.newGroup().rect(22, 24, 2, 2, 'black');
  head(g, 'furLight');
  g.newGroup().rect(8, 14, 1, 2, 'fur');
  g.newGroup().rect(24, 14, 1, 2, 'fur');
  eyes(g, 'normal');
  g.newGroup().span(17, 15, 17, 'blue', 1);
  g.set(16, 18, 'blue', 2);
  g.pts([[15, 19], [17, 19]], 'mouth');
  blush(g);
  g.newGroup().span(11, 9, 23, 'fur');
  // Antlers
  g.newGroup();
  g.polyline([[10, 8], [7, 5], [7, 2]], 'wood');
  g.line(7, 5, 4, 4, 'wood');
  g.newGroup();
  g.polyline([[mx(10), 8], [mx(7), 5], [mx(7), 2]], 'wood');
  g.line(mx(7), 5, mx(4), 4, 'wood');
  // Pink top hat with white cross
  g.newGroup();
  g.span(2, 13, 19, 'pink');
  g.rect(12, 3, 9, 6, 'pink');
  g.newGroup().pts(
    [[14, 3], [18, 3], [15, 4], [17, 4], [16, 5], [15, 6], [17, 6], [14, 7], [18, 7]],
    'white',
    0,
  );
  g.newGroup();
  g.span(9, 9, 23, 'pink');
  g.span(10, 10, 22, 'pink');
}

function marineBase(g: PixelGrid, angry: boolean): void {
  body(g, { skin: 'skin', shirt: 'white', sleeve: 'white', pants: 'navy', shoes: 'black' });
  g.newGroup().pts([[12, 20], [13, 21], [20, 20], [19, 21], [14, 22], [18, 22]], 'navy', 1);
  g.newGroup().pts([[16, 21], [16, 22], [15, 22], [17, 22], [16, 23]], 'blue', 1);
  head(g, 'skin');
  eyes(g, angry ? 'angry' : 'normal');
  mouth(g, angry ? 'teeth' : 'flat');
  marineCap(g);
}

function paintMarineGunner(g: PixelGrid): void {
  marineBase(g, false);
  // Musket across the body
  g.newGroup().line(5, 28, 11, 24, 'wood');
  g.newGroup().line(12, 23, 27, 13, 'gray');
  g.set(27, 13, 'gray', 3);
  hands(g, 'skin');
}

function paintMarineSaber(g: PixelGrid): void {
  marineBase(g, true);
  sword(g, 23, 23, 29, 6, { hilt: 'navy', guard: 'gold' });
  hands(g, 'skin');
}

function paintLaw(g: PixelGrid): void {
  // Kikoku nodachi
  g.newGroup().line(26, 3, 26, 22, 'black');
  g.pts([[26, 6], [26, 10], [26, 14], [26, 18]], 'white', 1);
  g.newGroup().span(23, 25, 27, 'gold');
  g.newGroup().line(26, 24, 26, 29, 'white');
  body(g, { skin: 'skin', shirt: 'yellow', sleeve: 'black', pants: 'denim', shoes: 'black' });
  g.pts([[13, 27], [18, 27], [14, 28], [19, 28], [16, 26]], 'navy', 3);
  g.newGroup().pts([[15, 22], [17, 22], [15, 23], [16, 24], [17, 23], [16, 22]], 'black', 1);
  hands(g, 'skin');
  head(g, 'skin');
  eyes(g, 'normal');
  g.span(17, 12, 13, 'eyeBag');
  g.span(17, 19, 20, 'eyeBag');
  mouth(g, 'smirk');
  g.newGroup().span(20, 15, 17, 'hairBlack');
  g.newGroup().pts([[9, 12], [9, 13], [9, 14], [23, 12], [23, 13], [23, 14], [10, 12], [22, 12]], 'hairBlack');
  // Fluffy spotted hat
  g.newGroup().ellipse(16.5, 8.2, 9.2, 4.6, 'white', -Infinity, 10);
  g.pts([[12, 5], [16, 4], [20, 6], [14, 8], [19, 8], [10, 8], [23, 8]], 'brown', 1);
  g.newGroup();
  g.span(11, 8, 24, 'white');
  for (let x = 8; x <= 24; x += 2) g.set(x, 12, 'white');
}

function aceHat(g: PixelGrid): void {
  g.newGroup();
  g.span(3, 12, 20, 'orange');
  g.rect(11, 4, 11, 4, 'orange');
  g.set(16, 3, 'orange', 3);
  g.newGroup().span(8, 11, 21, 'black');
  g.newGroup().set(13, 8, 'blue', 0);
  g.newGroup().set(19, 8, 'red', 0);
  g.newGroup();
  g.span(9, 5, 27, 'orange');
  g.span(10, 7, 25, 'orange');
  g.pts([[4, 8], [5, 8], [27, 8], [28, 8]], 'orange');
}

function aceBase(g: PixelGrid): void {
  body(g, { skin: 'skin', shirt: 'skin', pants: 'black', shoes: 'black', belt: 'brown' });
  g.newGroup().span(25, 15, 17, 'gold');
  g.newGroup().pts([[12, 20], [13, 21], [15, 21], [17, 21], [19, 21], [20, 20]], 'red', 1);
  head(g, 'skin');
  eyes(g, 'normal');
  mouth(g, 'grin');
  g.pts([[11, 17], [12, 18], [10, 18], [21, 17], [20, 18], [22, 18]], 'freckle');
  g.newGroup();
  g.span(11, 9, 23, 'hairBlack');
  g.pts([[9, 12], [10, 12], [13, 12], [17, 12], [21, 12], [22, 12], [23, 12]], 'hairBlack');
  g.rect(8, 12, 2, 6, 'hairBlack');
  g.rect(23, 12, 2, 6, 'hairBlack');
  aceHat(g);
}

function paintAce(g: PixelGrid): void {
  aceBase(g);
  flame(g, 9, 27, 9, 3);
  g.newGroup().rect(9, 24, 2, 2, 'fire', 0);
}

function paintAceFlame(g: PixelGrid): void {
  flame(g, 3, 31, 17, 3);
  flame(g, 29, 31, 17, 3);
  aceBase(g);
  g.newGroup().rect(9, 21, 2, 3, 'fire', 1);
  g.newGroup().rect(22, 21, 2, 3, 'fire', 1);
  flame(g, 9, 27, 10, 3);
  flame(g, 23, 27, 10, 3);
  g.newGroup().pts([[6, 3], [26, 5], [12, 1], [21, 2]], 'ember');
}

function paintShanks(g: PixelGrid): void {
  // Black captain's cape behind
  g.newGroup().rect(7, 20, 19, 9, 'black');
  body(g, { skin: 'skin', shirt: 'white', chest: 'skin', pants: 'brown', shoes: 'wood', belt: 'black', noRightArm: true });
  // Cape drape over the missing arm side
  g.newGroup();
  g.rect(21, 19, 5, 10, 'black');
  g.span(19, 18, 21, 'black');
  g.newGroup().pts([[21, 19], [21, 20]], 'red', 1);
  sword(g, 9, 24, 2, 11, { hilt: 'black', guard: 'gold' });
  hands(g, 'skin', true, false);
  head(g, 'skin');
  eyes(g, 'normal');
  mouth(g, 'smile');
  g.pts([[18, 12], [19, 13], [20, 12], [21, 13], [19, 17], [20, 18], [21, 17]], 'scar');
  g.newGroup().span(20, 15, 17, 'hairRed', 3);
  g.newGroup();
  g.ellipse(16.5, 12.3, 8.3, 6.4, 'hairRed', -Infinity, 11);
  g.rect(8, 11, 2, 7, 'hairRed');
  g.rect(23, 11, 2, 7, 'hairRed');
  g.pts([[8, 18], [24, 18], [12, 12], [13, 12], [20, 12], [7, 9], [25, 9]], 'hairRed');
  // Conqueror's haki bolts
  g.newGroup().polyline([[3, 2], [5, 5], [3, 6], [5, 9]], 'hakiRed', 1);
  g.newGroup().polyline([[29, 6], [27, 9], [29, 10], [27, 14]], 'hakiRed', 1);
}

function paintWhitebeard(g: PixelGrid): void {
  // Bisento
  g.newGroup().line(27, 6, 27, 30, 'wood');
  g.newGroup();
  g.rect(26, 1, 3, 5, 'steel');
  g.pts([[29, 2], [29, 3], [29, 4], [25, 1]], 'steel');
  g.newGroup().span(6, 26, 28, 'gold');
  // Captain coat cape
  g.newGroup().rect(6, 19, 21, 11, 'white');
  body(g, { skin: 'skinTan', shirt: 'skinTan', pants: 'brown', shoes: 'black', belt: 'blue' });
  g.newGroup().rect(7, 20, 3, 10, 'white');
  g.newGroup().rect(23, 20, 3, 10, 'white');
  g.pts([[13, 22], [14, 23], [18, 22], [19, 23], [16, 21]], 'scar');
  g.newGroup().rect(26, 23, 2, 3, 'skinTan');
  head(g, 'skinTan');
  eyes(g, 'angry');
  // Giant crescent moustache
  g.newGroup();
  g.span(18, 12, 20, 'white');
  g.span(17, 10, 12, 'white');
  g.span(17, 20, 22, 'white');
  g.span(16, 8, 10, 'white');
  g.span(16, 22, 24, 'white');
  g.pts([[6, 15], [7, 15], [25, 15], [26, 15], [5, 14], [27, 14]], 'white');
  // Black bandana
  g.newGroup();
  g.ellipse(16.5, 12.5, 8, 6, 'black', -Infinity, 10);
  g.pts([[9, 11], [23, 11]], 'black');
  g.newGroup().pts([[24, 8], [25, 9], [26, 9], [25, 10]], 'black');
}

function paintGenericPirate(g: PixelGrid): void {
  body(g, { skin: 'skin', shirt: 'white', pants: 'brown', shoes: 'black', belt: 'black' });
  g.span(22, 11, 21, 'red');
  head(g, 'skin');
  eyes(g, 'normal');
  mouth(g, 'smile');
  g.newGroup().ellipse(16.5, 12, 8, 5.5, 'red', -Infinity, 10);
}

const UNIT_PAINTERS: Readonly<Record<string, (g: PixelGrid) => void>> = {
  luffy: paintLuffy,
  luffy_gear2: paintLuffyGear2,
  luffy_ts: paintLuffyTs,
  luffy_gear4: paintLuffyGear4,
  luffy_nika: paintLuffyNika,
  zoro: paintZoro,
  zoro_dual: paintZoroDual,
  zoro_ts: paintZoroTs,
  zoro_ashura: paintZoroAshura,
  nami: paintNami,
  nami_clima: paintNamiClima,
  usopp: paintUsopp,
  sanji: paintSanji,
  sanji_diable: paintSanjiDiable,
  chopper: paintChopper,
  marine_gunner: paintMarineGunner,
  marine_saber: paintMarineSaber,
  law: paintLaw,
  ace: paintAce,
  ace_flame: paintAceFlame,
  shanks: paintShanks,
  whitebeard: paintWhitebeard,
};

/* ------------------------------------------------------------------ */
/*  Monster designs                                                    */
/* ------------------------------------------------------------------ */

function mobBody(g: PixelGrid, shirt: Mat, pants: Mat, skin: Mat): void {
  g.newGroup();
  g.span(18, 8, 14, pants);
  g.rect(8, 19, 3, 2, pants);
  g.rect(12, 19, 3, 2, pants);
  g.newGroup().rect(7, 21, 4, 2, 'black');
  g.newGroup().rect(12, 21, 4, 2, 'black');
  g.newGroup();
  g.span(14, 9, 13, shirt);
  g.rect(8, 15, 7, 3, shirt);
  g.newGroup().rect(6, 15, 2, 2, shirt);
  g.newGroup().rect(15, 15, 2, 2, shirt);
  g.newGroup().span(17, 6, 7, skin);
  g.newGroup().span(17, 15, 16, skin);
  g.newGroup().ellipse(11.5, 9, 5.5, 5, skin);
  g.newGroup().rect(5, 9, 1, 2, skin);
  g.newGroup().rect(17, 9, 1, 2, skin);
}

function paintMarineGrunt(g: PixelGrid): void {
  g.newGroup().line(3, 20, 8, 17, 'wood');
  g.newGroup().line(9, 16, 19, 9, 'gray');
  mobBody(g, 'white', 'navy', 'skin');
  g.newGroup().pts([[9, 14], [10, 15], [13, 14], [12, 15]], 'navy', 1);
  g.newGroup().pts([[11, 15], [11, 16]], 'blue', 1);
  g.rect(8, 9, 2, 2, 'eye');
  g.set(8, 9, 'glint');
  g.rect(13, 9, 2, 2, 'eye');
  g.set(13, 9, 'glint');
  g.span(12, 10, 12, 'mouth');
  g.newGroup().pts([[6, 7], [6, 8], [16, 7], [16, 8]], 'brown');
  g.newGroup();
  g.span(2, 8, 14, 'white');
  g.rect(7, 3, 9, 3, 'white');
  g.newGroup().span(6, 6, 16, 'navy');
  g.newGroup().pts([[11, 3], [11, 4], [10, 4], [12, 4]], 'blue', 1);
}

function paintPirateRaider(g: PixelGrid): void {
  g.newGroup().polyline([[5, 16], [3, 13], [2, 9], [3, 6]], 'steel', 1);
  mobBody(g, 'white', 'brown', 'skinTan');
  g.newGroup().span(15, 8, 14, 'red');
  g.span(17, 8, 14, 'red');
  g.newGroup().span(18, 8, 14, 'black');
  g.newGroup().set(11, 18, 'gold', 0);
  g.newGroup().pts([[5, 17], [6, 16], [7, 16]], 'gold');
  g.rect(8, 9, 2, 2, 'eye');
  g.set(8, 9, 'glint');
  g.pts([[7, 8], [8, 7], [9, 8]], 'eye');
  g.newGroup().rect(13, 9, 2, 2, 'black');
  g.newGroup().polyline([[12, 8], [14, 7], [16, 7]], 'black');
  g.span(12, 9, 13, 'mouth');
  g.pts([[10, 12], [12, 12]], 'teeth');
  g.pts([[9, 13], [11, 13], [13, 13]], 'eyeBag');
  g.newGroup();
  g.ellipse(11.5, 7.5, 6, 4.5, 'red', -Infinity, 6);
  g.span(6, 6, 16, 'red');
  g.newGroup().pts([[17, 5], [18, 6], [18, 7], [19, 7]], 'red');
  g.newGroup().pts([[9, 4], [13, 3], [15, 5]], 'white', 0);
}

function paintSeaKing(g: PixelGrid): void {
  // Coiled neck rising from the sea
  g.newGroup();
  for (let y = 12; y <= 27; y++) {
    const cx = 11 + Math.round((27 - y) * 0.3);
    g.span(y, cx - 4, cx + 4, 'seaKing');
  }
  g.newGroup();
  for (let y = 15; y <= 27; y++) {
    const cx = 11 + Math.round((27 - y) * 0.3);
    g.span(y, cx + 2, cx + 4, 'belly', y % 2 === 0 ? 1 : 2);
  }
  // Head
  g.newGroup().ellipse(18.5, 8.5, 10, 5.5, 'seaKing');
  g.newGroup().rect(22, 7, 9, 4, 'seaKing');
  g.newGroup().rect(15, 11, 15, 3, 'mouth');
  g.newGroup();
  g.span(14, 14, 29, 'seaKing');
  g.span(15, 15, 28, 'seaKing');
  g.span(16, 17, 26, 'seaKing');
  g.pts([[17, 11], [19, 11], [21, 11], [23, 11], [25, 11], [27, 11], [29, 11]], 'teeth');
  g.pts([[18, 13], [20, 13], [22, 13], [24, 13], [26, 13], [28, 13]], 'teeth');
  g.newGroup().rect(19, 5, 3, 2, 'yellow', 0);
  g.pts([[20, 5], [20, 6]], 'eye');
  g.newGroup().span(4, 18, 22, 'seaKing', 3);
  g.set(29, 8, 'eye');
  // Red fins
  g.newGroup();
  g.line(11, 4, 9, 0, 'red');
  g.line(14, 3, 13, 0, 'red');
  g.line(17, 3, 17, 0, 'red');
  g.line(20, 3, 21, 1, 'red');
  g.newGroup();
  g.rect(5, 8, 3, 4, 'red');
  g.pts([[4, 9], [4, 10], [3, 10]], 'red');
  // Sea + foam
  g.newGroup().ellipse(16, 29.5, 15.5, 3.5, 'water');
  g.newGroup().pts(
    [[4, 27], [5, 26], [6, 27], [16, 26], [17, 26], [18, 27], [25, 27], [26, 26], [27, 27], [10, 28], [22, 28]],
    'white',
    0,
  );
}

function paintPacifista(g: PixelGrid): void {
  g.newGroup().rect(11, 27, 4, 2, 'pxCoat');
  g.newGroup().rect(18, 27, 4, 2, 'pxCoat');
  g.newGroup().rect(10, 29, 6, 2, 'black');
  g.newGroup().rect(17, 29, 6, 2, 'black');
  g.newGroup();
  g.span(19, 10, 22, 'pxCoat');
  g.rect(7, 20, 19, 7, 'pxCoat');
  g.newGroup().rect(13, 21, 7, 5, 'metal');
  g.pts([[14, 22], [14, 23], [14, 24], [15, 22], [15, 23]], 'red', 1);
  g.pts([[17, 22], [19, 22], [18, 23], [17, 24], [19, 24]], 'red', 1);
  // Metal paws
  g.newGroup().rect(4, 20, 3, 3, 'pxCoat');
  g.newGroup().rect(26, 20, 3, 3, 'pxCoat');
  g.newGroup().rect(2, 23, 6, 5, 'metal');
  g.newGroup().rect(25, 23, 6, 5, 'metal');
  g.newGroup().rect(3, 25, 4, 2, 'pink', 1);
  g.newGroup().rect(26, 25, 4, 2, 'pink', 1);
  g.pts([[3, 23], [5, 23], [7, 23], [25, 23], [27, 23], [29, 23]], 'pink', 1);
  // Head
  g.newGroup().ellipse(16.5, 13.5, 7.5, 6.5, 'skinTan');
  g.newGroup();
  g.span(12, 10, 22, 'black');
  g.span(13, 10, 22, 'black');
  g.rect(11, 12, 3, 2, 'redEye');
  g.rect(19, 12, 3, 2, 'redEye');
  g.span(16, 15, 17, 'mouth');
  g.newGroup().span(18, 14, 18, 'black', 2);
  // Bear-ear cap
  g.newGroup().ellipse(16.5, 8.5, 8.5, 4.5, 'black', -Infinity, 9);
  g.newGroup().ellipse(9.5, 4, 2.3, 2.3, 'black');
  g.newGroup().ellipse(23.5, 4, 2.3, 2.3, 'black');
  g.pts([[9, 4], [23, 4]], 'gray', 2);
}

function paintMonsterGrid(kind: MonsterKind): PixelGrid {
  switch (kind) {
    case 'marine_grunt': {
      const g = new PixelGrid(24, 24);
      paintMarineGrunt(g);
      return g;
    }
    case 'pirate_raider': {
      const g = new PixelGrid(24, 24);
      paintPirateRaider(g);
      return g;
    }
    case 'sea_king': {
      const g = new PixelGrid(32, 32);
      paintSeaKing(g);
      return g;
    }
    case 'pacifista': {
      const g = new PixelGrid(32, 32);
      paintPacifista(g);
      return g;
    }
    default: {
      const g = new PixelGrid(24, 24);
      paintPirateRaider(g);
      return g;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Public API (consumed exclusively by SpriteCache)                   */
/* ------------------------------------------------------------------ */

function blitGrid(ctx: CanvasRenderingContext2D, g: PixelGrid, size: number): void {
  const scale = Math.max(1, Math.floor(size / g.w));
  const ox = Math.floor((size - g.w * scale) / 2);
  const oy = size - g.h * scale;
  g.render(ctx, ox, oy, scale);
}

/** Paints a unit's pixel-art sprite into a square canvas (feet on the bottom edge). */
export function paintUnitChibi(ctx: CanvasRenderingContext2D, unitId: string): void {
  const g = new PixelGrid(32, 32);
  (UNIT_PAINTERS[unitId] ?? paintGenericPirate)(g);
  blitGrid(ctx, g, ctx.canvas.width);
}

/** Paints a monster's pixel-art sprite into a square canvas of `size` pixels. */
export function paintMonsterChibi(ctx: CanvasRenderingContext2D, kind: MonsterKind, size: number): void {
  blitGrid(ctx, paintMonsterGrid(kind), size);
}
