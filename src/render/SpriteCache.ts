import type { EmblemKind, GradeDef, UnitDef } from '../data/types';

export interface GlyphMetric {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  readonly advance: number;
}

const GLYPH_CHARS = '0123456789+-x/%!FB:#.';

/**
 * Sole factory/owner for offscreen HTMLCanvasElements (AGENTS.md §2 & §6).
 * Releases canvas memory by zeroing width & height.
 */
export class SpriteCache {
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private glyphCanvas: HTMLCanvasElement | null = null;
  private readonly glyphMap = new Map<string, GlyphMetric>();

  private createOffscreen(width: number, height: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }

  public release(key: string): void {
    const c = this.cache.get(key);
    if (c) {
      c.width = 0;
      c.height = 0;
      this.cache.delete(key);
    }
  }

  public disposeAll(): void {
    for (const c of this.cache.values()) {
      c.width = 0;
      c.height = 0;
    }
    this.cache.clear();
    if (this.glyphCanvas) {
      this.glyphCanvas.width = 0;
      this.glyphCanvas.height = 0;
      this.glyphCanvas = null;
    }
    this.glyphMap.clear();
  }

  /**
   * Pre-rendered radial glow sprite (replaces forbidden shadowBlur / ctx.filter).
   */
  public glow(color: string, radiusLogical: number): HTMLCanvasElement {
    const r = Math.max(8, Math.round(radiusLogical));
    const key = `glow:${color}:${r}`;
    const existing = this.cache.get(key);
    if (existing) return existing;

    const size = r * 2;
    const c = this.createOffscreen(size, size);
    const ctx = c.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
      grad.addColorStop(0, hexWithAlpha(color, 0.85));
      grad.addColorStop(0.42, hexWithAlpha(color, 0.35));
      grad.addColorStop(1, hexWithAlpha(color, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }
    this.cache.set(key, c);
    return c;
  }

  /**
   * Pre-rendered 128x128 (2x crisp logical 64x64) unit token sprite.
   */
  public unitToken(unit: UnitDef, grade: GradeDef): HTMLCanvasElement {
    const key = `unit:${unit.id}:${grade.id}`;
    const existing = this.cache.get(key);
    if (existing) return existing;

    const size = 128;
    const half = 64;
    const c = this.createOffscreen(size, size);
    const ctx = c.getContext('2d');
    if (!ctx) {
      this.cache.set(key, c);
      return c;
    }

    // Outer metallic ring
    ctx.beginPath();
    ctx.arc(half, half, 54, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1526';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = grade.color;
    ctx.stroke();

    // Inner beveled face
    const innerGrad = ctx.createRadialGradient(half, half - 14, 6, half, half, 48);
    innerGrad.addColorStop(0, hexWithAlpha(grade.color, 0.34));
    innerGrad.addColorStop(0.7, '#152238');
    innerGrad.addColorStop(1, '#0b1220');
    ctx.beginPath();
    ctx.arc(half, half, 46, 0, Math.PI * 2);
    ctx.fillStyle = innerGrad;
    ctx.fill();

    // Subtle inner rim
    ctx.beginPath();
    ctx.arc(half, half, 42, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.stroke();

    // Distinct crisp vector emblem
    drawEmblem(ctx, unit.emblem, half, half, grade.color);

    // Grade rank pips along bottom arc
    const pipCount = Math.min(6, Math.max(1, grade.rank));
    const span = (pipCount - 1) * 0.22;
    for (let i = 0; i < pipCount; i++) {
      const angle = Math.PI * 0.5 - span * 0.5 + i * 0.22;
      const px = half + Math.cos(angle) * 46;
      const py = half + Math.sin(angle) * 46;
      ctx.beginPath();
      ctx.arc(px, py, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = '#0b1220';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = grade.color;
      ctx.fill();
    }

    this.cache.set(key, c);
    return c;
  }

  /**
   * Pre-builds glyph atlas once at load time so world-canvas never calls fillText per frame.
   */
  public ensureGlyphAtlas(): HTMLCanvasElement {
    if (this.glyphCanvas) return this.glyphCanvas;

    const cellW = 36;
    const cellH = 48;
    const cols = GLYPH_CHARS.length;
    const c = this.createOffscreen(cols * cellW, cellH);
    const ctx = c.getContext('2d');

    if (ctx) {
      ctx.font = '900 32px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < GLYPH_CHARS.length; i++) {
        const ch = GLYPH_CHARS[i]!;
        const cx = i * cellW + cellW * 0.5;
        const cy = cellH * 0.5;

        ctx.lineWidth = 6;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#080d18';
        ctx.strokeText(ch, cx, cy);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(ch, cx, cy);

        const measured = ctx.measureText(ch).width;
        this.glyphMap.set(ch, {
          sx: i * cellW,
          sy: 0,
          sw: cellW,
          sh: cellH,
          advance: Math.max(14, Math.ceil(measured) + 2),
        });
      }
    }

    this.glyphCanvas = c;
    return c;
  }

  public drawGlyphString(
    ctx: CanvasRenderingContext2D,
    text: string,
    centerX: number,
    centerY: number,
    scale = 0.5,
    alpha = 1,
  ): void {
    const atlas = this.ensureGlyphAtlas();
    let totalW = 0;
    for (let i = 0; i < text.length; i++) {
      const m = this.glyphMap.get(text[i]!);
      if (m) totalW += m.advance * scale;
    }

    let cursorX = centerX - totalW * 0.5;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * alpha;

    for (let i = 0; i < text.length; i++) {
      const m = this.glyphMap.get(text[i]!);
      if (!m) continue;
      const dw = m.sw * scale;
      const dh = m.sh * scale;
      const dx = cursorX - (dw - m.advance * scale) * 0.5;
      const dy = centerY - dh * 0.5;
      ctx.drawImage(atlas, m.sx, m.sy, m.sw, m.sh, dx, dy, dw, dh);
      cursorX += m.advance * scale;
    }

    ctx.globalAlpha = prevAlpha;
  }
}

function hexWithAlpha(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) {
    return `rgba(255, 255, 255, ${alpha})`;
  }
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawEmblem(
  ctx: CanvasRenderingContext2D,
  emblem: EmblemKind,
  cx: number,
  cy: number,
  accent: string,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#f4f7fc';
  ctx.fillStyle = accent;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (emblem) {
    case 'sword': {
      ctx.beginPath();
      ctx.moveTo(-16, 18);
      ctx.lineTo(18, -18);
      ctx.moveTo(-10, 4);
      ctx.lineTo(4, 18);
      ctx.moveTo(-18, 20);
      ctx.lineTo(-10, 12);
      ctx.stroke();
      break;
    }
    case 'twinblade': {
      ctx.beginPath();
      ctx.moveTo(-18, 16);
      ctx.lineTo(16, -18);
      ctx.moveTo(18, 16);
      ctx.lineTo(-16, -18);
      ctx.stroke();
      break;
    }
    case 'crosshair': {
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.moveTo(-22, 0);
      ctx.lineTo(22, 0);
      ctx.moveTo(0, -22);
      ctx.lineTo(0, 22);
      ctx.stroke();
      break;
    }
    case 'compass': {
      ctx.beginPath();
      ctx.moveTo(0, -21);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 21);
      ctx.lineTo(-8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'shield': {
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(18, -12);
      ctx.lineTo(14, 8);
      ctx.lineTo(0, 22);
      ctx.lineTo(-14, 8);
      ctx.lineTo(-18, -12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'fist': {
      ctx.beginPath();
      ctx.roundRect(-16, -14, 32, 28, 8);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-14, -2);
      ctx.lineTo(14, -2);
      ctx.stroke();
      break;
    }
    case 'flame': {
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.quadraticCurveTo(20, -4, 12, 16);
      ctx.quadraticCurveTo(0, 24, -12, 16);
      ctx.quadraticCurveTo(-20, -4, 0, -22);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'bow': {
      ctx.beginPath();
      ctx.arc(-4, 0, 18, -Math.PI * 0.42, Math.PI * 0.42);
      ctx.moveTo(-18, 0);
      ctx.lineTo(20, 0);
      ctx.lineTo(12, -7);
      ctx.moveTo(20, 0);
      ctx.lineTo(12, 7);
      ctx.stroke();
      break;
    }
    case 'crest': {
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(19, 0);
      ctx.lineTo(0, 22);
      ctx.lineTo(-19, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'bolt': {
      ctx.beginPath();
      ctx.moveTo(4, -22);
      ctx.lineTo(-12, 2);
      ctx.lineTo(2, 2);
      ctx.lineTo(-6, 22);
      ctx.lineTo(14, -4);
      ctx.lineTo(0, -4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'sun': {
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 16, Math.sin(a) * 16);
        ctx.lineTo(Math.cos(a) * 23, Math.sin(a) * 23);
        ctx.stroke();
      }
      break;
    }
    case 'crown': {
      ctx.beginPath();
      ctx.moveTo(-20, 14);
      ctx.lineTo(-18, -12);
      ctx.lineTo(-6, 2);
      ctx.lineTo(0, -16);
      ctx.lineTo(6, 2);
      ctx.lineTo(18, -12);
      ctx.lineTo(20, 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'star': {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 22 : 10;
        const a = -Math.PI * 0.5 + (i * Math.PI) / 5;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}
