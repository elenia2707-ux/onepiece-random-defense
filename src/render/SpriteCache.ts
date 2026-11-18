import type { GradeDef, MonsterKind, UnitDef } from '../data/types';
import { paintMonsterChibi, paintUnitChibi } from './ChibiPainter';

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
  private readonly portraitUrls = new Map<string, string>();
  private glyphCanvas: HTMLCanvasElement | null = null;
  private readonly glyphMap = new Map<string, GlyphMetric>();
  private glyphRowHeight = 52;

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
    this.portraitUrls.clear();
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
      grad.addColorStop(0, hexWithAlpha(color, 0.88));
      grad.addColorStop(0.42, hexWithAlpha(color, 0.38));
      grad.addColorStop(1, hexWithAlpha(color, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }
    this.cache.set(key, c);
    return c;
  }

  /**
   * Pre-rendered 160x160 cel-shaded 2-head SD character sprite.
   */
  public unitToken(unit: UnitDef, _grade: GradeDef): HTMLCanvasElement {
    const key = `chibi:${unit.id}`;
    const existing = this.cache.get(key);
    if (existing) return existing;

    const size = 160;
    const c = this.createOffscreen(size, size);
    const ctx = c.getContext('2d');
    if (ctx) {
      paintUnitChibi(ctx, unit.id);
    }
    this.cache.set(key, c);
    return c;
  }

  /**
   * Generates a cached PNG data URL for DOM portrait badges without creating extra DOM canvases.
   */
  public unitPortraitUrl(unit: UnitDef, grade: GradeDef): string {
    const key = `url:${unit.id}:${grade.id}`;
    const existing = this.portraitUrls.get(key);
    if (existing) return existing;

    const sprite = this.unitToken(unit, grade);
    const url = sprite.toDataURL('image/png');
    this.portraitUrls.set(key, url);
    return url;
  }

  /**
   * Pre-rendered SD monster sprite + pure-white hit-flash silhouette (zero ctx.filter).
   */
  public monsterSprite(kind: MonsterKind, hitFlash = false): HTMLCanvasElement {
    const key = `monster:${kind}:${hitFlash ? 'flash' : 'base'}`;
    const existing = this.cache.get(key);
    if (existing) return existing;

    const size = kind === 'sea_king' || kind === 'pacifista' ? 176 : 144;
    const baseKey = `monster:${kind}:base`;
    let baseCanvas = this.cache.get(baseKey);
    if (!baseCanvas) {
      baseCanvas = this.createOffscreen(size, size);
      const bctx = baseCanvas.getContext('2d');
      if (bctx) {
        paintMonsterChibi(bctx, kind, size);
      }
      this.cache.set(baseKey, baseCanvas);
    }

    if (!hitFlash) {
      return baseCanvas;
    }

    const flashCanvas = this.createOffscreen(size, size);
    const fctx = flashCanvas.getContext('2d');
    if (fctx) {
      fctx.drawImage(baseCanvas, 0, 0);
      fctx.globalCompositeOperation = 'source-in';
      fctx.fillStyle = '#ffffff';
      fctx.fillRect(0, 0, size, size);
      fctx.globalCompositeOperation = 'source-over';
    }
    this.cache.set(key, flashCanvas);
    return flashCanvas;
  }

  /**
   * Pre-rendered #overlay-canvas banner (BOSS WAVE warning / Mythic-Legendary craft celebration)
   * so #overlay-canvas never executes fillText per frame (AGENTS.md §2).
   */
  public overlayBanner(
    key: string,
    kind: 'boss' | 'craft',
    title: string,
    subtitle: string,
    accentColor: string,
  ): HTMLCanvasElement {
    const cacheKey = `banner:${key}`;
    const existing = this.cache.get(cacheKey);
    if (existing) return existing;

    const w = 1280;
    const h = 256;
    const c = this.createOffscreen(w, h);
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.save();
      // Drop bevel plate
      ctx.beginPath();
      ctx.roundRect(28, 30, w - 56, h - 50, 34);
      ctx.fillStyle = '#120f1d';
      ctx.fill();

      // Main banner body
      ctx.beginPath();
      ctx.roundRect(28, 20, w - 56, h - 54, 34);
      const bgGrad = ctx.createLinearGradient(0, 20, 0, h - 34);
      if (kind === 'boss') {
        bgGrad.addColorStop(0, '#7f1d1d');
        bgGrad.addColorStop(0.5, '#450a0a');
        bgGrad.addColorStop(1, '#1f070c');
      } else {
        bgGrad.addColorStop(0, '#3b2506');
        bgGrad.addColorStop(0.5, '#1e1b2e');
        bgGrad.addColorStop(1, '#120f1d');
      }
      ctx.fillStyle = bgGrad;
      ctx.fill();

      // Diagonal hazard / celebration stripes inside clip
      ctx.save();
      ctx.clip();
      ctx.fillStyle = hexWithAlpha(accentColor, 0.14);
      for (let sx = -180; sx < w + 180; sx += 92) {
        ctx.beginPath();
        ctx.moveTo(sx, 20);
        ctx.lineTo(sx + 46, 20);
        ctx.lineTo(sx - 34, h);
        ctx.lineTo(sx - 80, h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Thick cartoon border + bright inner accent trim
      ctx.beginPath();
      ctx.roundRect(28, 20, w - 56, h - 54, 34);
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#120f1d';
      ctx.stroke();

      ctx.beginPath();
      ctx.roundRect(36, 28, w - 72, h - 70, 26);
      ctx.lineWidth = 4;
      ctx.strokeStyle = accentColor;
      ctx.stroke();

      // Title text (pre-rendered ONCE)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 54px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
      ctx.lineWidth = 11;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#120f1d';
      ctx.strokeText(title, w * 0.5, 96);
      ctx.fillStyle = kind === 'boss' ? '#fef08a' : accentColor;
      ctx.fillText(title, w * 0.5, 96);

      // Subtitle text
      ctx.font = '800 34px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#120f1d';
      ctx.strokeText(subtitle, w * 0.5, 162);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(subtitle, w * 0.5, 162);

      ctx.restore();
    }

    this.cache.set(cacheKey, c);
    return c;
  }

  /**
   * Pre-builds 2-row glyph atlas once at load time (Row 0: normal white, Row 1: crit gold-orange)
   * so world-canvas never calls fillText per frame.
   */
  public ensureGlyphAtlas(): HTMLCanvasElement {
    if (this.glyphCanvas) return this.glyphCanvas;

    const cellW = 40;
    const cellH = 52;
    this.glyphRowHeight = cellH;
    const cols = GLYPH_CHARS.length;
    const c = this.createOffscreen(cols * cellW, cellH * 2);
    const ctx = c.getContext('2d');

    if (ctx) {
      ctx.font = '900 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';

      for (let i = 0; i < GLYPH_CHARS.length; i++) {
        const ch = GLYPH_CHARS[i]!;
        const cx = i * cellW + cellW * 0.5;

        // Row 0: Normal crisp white digits
        const cy0 = cellH * 0.5;
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#14111f';
        ctx.strokeText(ch, cx, cy0);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(ch, cx, cy0);

        // Row 1: Critical golden-crimson digits
        const cy1 = cellH * 1.5;
        ctx.lineWidth = 8.5;
        ctx.strokeStyle = '#1c0a00';
        ctx.strokeText(ch, cx, cy1);
        const critGrad = ctx.createLinearGradient(cx, cy1 - 16, cx, cy1 + 16);
        critGrad.addColorStop(0, '#fffbeb');
        critGrad.addColorStop(0.45, '#facc15');
        critGrad.addColorStop(1, '#f97316');
        ctx.fillStyle = critGrad;
        ctx.fillText(ch, cx, cy1);

        const measured = ctx.measureText(ch).width;
        this.glyphMap.set(ch, {
          sx: i * cellW,
          sy: 0,
          sw: cellW,
          sh: cellH,
          advance: Math.max(15, Math.ceil(measured) + 2),
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
    isCrit = false,
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
    const rowSy = isCrit ? this.glyphRowHeight : 0;

    for (let i = 0; i < text.length; i++) {
      const m = this.glyphMap.get(text[i]!);
      if (!m) continue;
      const dw = m.sw * scale;
      const dh = m.sh * scale;
      const dx = cursorX - (dw - m.advance * scale) * 0.5;
      const dy = centerY - dh * 0.5;
      ctx.drawImage(atlas, m.sx, rowSy, m.sw, m.sh, dx, dy, dw, dh);
      cursorX += m.advance * scale;
    }

    ctx.globalAlpha = prevAlpha;
  }
}

export function hexWithAlpha(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) {
    return `rgba(255, 255, 255, ${alpha})`;
  }
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
