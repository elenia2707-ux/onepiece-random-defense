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

/** Display font stack shared by every pre-rendered canvas text (glyph atlas & banners). */
export const DISPLAY_FONT = '"Black Han Sans", "Jua", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
export const BODY_FONT = '"Jua", "Black Han Sans", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';

/** Native pixel-art canvas sizes (grid × integer scale) and the upgraded size for external PNG art. */
const UNIT_PIXEL_SIZE = 160; // 32 × 5
const MOB_PIXEL_SIZE = 144; // 24 × 6
const BOSS_PIXEL_SIZE = 160; // 32 × 5
const EXTERNAL_SPRITE_SIZE = 256;

interface BannerSpec {
  readonly kind: 'boss' | 'craft';
  readonly title: string;
  readonly subtitle: string;
  readonly accent: string;
}

/**
 * Sole factory/owner for offscreen HTMLCanvasElements (AGENTS.md §2 & §6).
 * Releases canvas memory by zeroing width & height.
 *
 * Hybrid sprite loader: every unit / monster first gets an instant procedural pixel-art sprite.
 * In parallel, `public/sprites/{id}.png` is probed once; if it exists the SAME canvas object is
 * repainted with the illustration (so every holder of the reference upgrades transparently) and
 * listeners registered through {@link onSpriteUpdated} are notified (e.g. DOM portraits refresh).
 */
export class SpriteCache {
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private readonly portraitUrls = new Map<string, string>();
  private readonly bannerSpecs = new Map<string, BannerSpec>();
  private readonly smoothSprites = new WeakSet<HTMLCanvasElement>();
  private readonly probed = new Set<string>();
  private readonly spriteListeners: Array<() => void> = [];
  private glyphCanvas: HTMLCanvasElement | null = null;
  private readonly glyphMap = new Map<string, GlyphMetric>();
  private glyphRowHeight = 52;
  private fontsReady = false;

  public constructor() {
    this.watchFonts();
  }

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
    this.bannerSpecs.delete(key);
  }

  public disposeAll(): void {
    for (const c of this.cache.values()) {
      c.width = 0;
      c.height = 0;
    }
    this.cache.clear();
    this.portraitUrls.clear();
    this.bannerSpecs.clear();
    if (this.glyphCanvas) {
      this.glyphCanvas.width = 0;
      this.glyphCanvas.height = 0;
      this.glyphCanvas = null;
    }
    this.glyphMap.clear();
  }

  /* ---------------------------------------------------------------- */
  /*  Web fonts: canvas text is re-baked once fonts are really ready   */
  /* ---------------------------------------------------------------- */

  private watchFonts(): void {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    const fonts = document.fonts;
    Promise.all([
      fonts.load(`40px "Black Han Sans"`, 'BOSS 0123456789'),
      fonts.load(`40px "Jua"`, '조합 성공 출현'),
    ])
      .catch(() => undefined)
      .then(() => fonts.ready)
      .then(() => this.onFontsReady())
      .catch(() => undefined);
  }

  private onFontsReady(): void {
    this.fontsReady = true;
    // Re-bake the glyph atlas IN PLACE so existing references stay valid.
    if (this.glyphCanvas) this.paintGlyphAtlas(this.glyphCanvas);
    // Re-bake already-created banners in place (VfxSystem may hold a live reference).
    for (const [key, spec] of this.bannerSpecs) {
      const c = this.cache.get(key);
      if (c) this.paintBanner(c, spec);
    }
  }

  public get areFontsReady(): boolean {
    return this.fontsReady;
  }

  /* ---------------------------------------------------------------- */
  /*  Hybrid external sprite loader                                     */
  /* ---------------------------------------------------------------- */

  /** Registers a callback fired whenever an external PNG replaces a procedural sprite. */
  public onSpriteUpdated(cb: () => void): void {
    this.spriteListeners.push(cb);
  }

  /** True when the canvas holds a smooth illustration (draw with smoothing ON) instead of pixel art. */
  public isSmoothSprite(canvas: HTMLCanvasElement): boolean {
    return this.smoothSprites.has(canvas);
  }

  private probeExternal(id: string, onLoad: (img: HTMLImageElement) => void): void {
    if (this.probed.has(id) || typeof Image === 'undefined') return;
    this.probed.add(id);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) onLoad(img);
    };
    img.onerror = () => {
      /* No custom art for this id — keep the pixel-art sprite. */
    };
    img.src = `${import.meta.env.BASE_URL}sprites/${id}.png`;
  }

  /** Contain-fit, bottom-centred (feet on the bottom edge like the pixel art). */
  private paintExternal(canvas: HTMLCanvasElement, img: HTMLImageElement): void {
    canvas.width = EXTERNAL_SPRITE_SIZE;
    canvas.height = EXTERNAL_SPRITE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const k = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    ctx.drawImage(img, (canvas.width - w) / 2, canvas.height - h, w, h);
    this.smoothSprites.add(canvas);
  }

  private notifySpriteUpdated(): void {
    for (const cb of this.spriteListeners) cb();
  }

  /* ---------------------------------------------------------------- */
  /*  Sprites                                                           */
  /* ---------------------------------------------------------------- */

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
   * Unit sprite: 32×32 retro pixel art at ×5 (160px), or `public/sprites/{id}.png` when present.
   */
  public unitToken(unit: UnitDef, _grade: GradeDef): HTMLCanvasElement {
    const key = `unit:${unit.id}`;
    const existing = this.cache.get(key);
    if (existing) return existing;

    const c = this.createOffscreen(UNIT_PIXEL_SIZE, UNIT_PIXEL_SIZE);
    const ctx = c.getContext('2d');
    if (ctx) paintUnitChibi(ctx, unit.id);
    this.cache.set(key, c);

    this.probeExternal(unit.id, (img) => {
      this.paintExternal(c, img);
      this.portraitUrls.delete(`url:${unit.id}`);
      this.notifySpriteUpdated();
    });
    return c;
  }

  /**
   * Generates a cached PNG data URL for DOM portrait badges without creating extra DOM canvases.
   */
  public unitPortraitUrl(unit: UnitDef, grade: GradeDef): string {
    const key = `url:${unit.id}`;
    const existing = this.portraitUrls.get(key);
    if (existing) return existing;

    const sprite = this.unitToken(unit, grade);
    const url = sprite.width > 0 ? sprite.toDataURL('image/png') : '';
    this.portraitUrls.set(key, url);
    return url;
  }

  /**
   * Pre-rendered monster sprite + pure-white hit-flash silhouette (zero ctx.filter).
   */
  public monsterSprite(kind: MonsterKind, hitFlash = false): HTMLCanvasElement {
    const baseKey = `monster:${kind}:base`;
    const flashKey = `monster:${kind}:flash`;

    let baseCanvas = this.cache.get(baseKey);
    if (!baseCanvas) {
      const size = kind === 'sea_king' || kind === 'pacifista' ? BOSS_PIXEL_SIZE : MOB_PIXEL_SIZE;
      const created = this.createOffscreen(size, size);
      baseCanvas = created;
      const bctx = created.getContext('2d');
      if (bctx) paintMonsterChibi(bctx, kind, size);
      this.cache.set(baseKey, created);

      this.probeExternal(kind, (img) => {
        this.paintExternal(created, img);
        const flash = this.cache.get(flashKey);
        if (flash) this.paintFlash(flash, created);
        this.notifySpriteUpdated();
      });
    }

    if (!hitFlash) return baseCanvas;

    const existingFlash = this.cache.get(flashKey);
    if (existingFlash) return existingFlash;
    const flashCanvas = this.createOffscreen(baseCanvas.width, baseCanvas.height);
    this.paintFlash(flashCanvas, baseCanvas);
    this.cache.set(flashKey, flashCanvas);
    return flashCanvas;
  }

  private paintFlash(target: HTMLCanvasElement, base: HTMLCanvasElement): void {
    target.width = base.width;
    target.height = base.height;
    if (this.smoothSprites.has(base)) this.smoothSprites.add(target);
    const fctx = target.getContext('2d');
    if (!fctx) return;
    fctx.clearRect(0, 0, target.width, target.height);
    fctx.drawImage(base, 0, 0);
    fctx.globalCompositeOperation = 'source-in';
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(0, 0, target.width, target.height);
    fctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------------------------------------------------------- */
  /*  Overlay banners                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * Pre-rendered #overlay-canvas banner (BOSS WAVE warning / Legendary+ craft celebration)
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

    const c = this.createOffscreen(1280, 256);
    const spec: BannerSpec = { kind, title, subtitle, accent: accentColor };
    this.paintBanner(c, spec);
    this.cache.set(cacheKey, c);
    this.bannerSpecs.set(cacheKey, spec);
    return c;
  }

  private paintBanner(c: HTMLCanvasElement, spec: BannerSpec): void {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const w = c.width;
    const h = c.height;
    const { kind, title, subtitle, accent } = spec;
    ctx.clearRect(0, 0, w, h);
    ctx.save();

    // Drop plate (3D lip)
    ctx.beginPath();
    ctx.roundRect(40, 40, w - 80, h - 56, 40);
    ctx.fillStyle = '#060b18';
    ctx.fill();

    // Body
    ctx.beginPath();
    ctx.roundRect(40, 24, w - 80, h - 64, 40);
    const bg = ctx.createLinearGradient(0, 24, 0, h - 40);
    if (kind === 'boss') {
      bg.addColorStop(0, '#d7263d');
      bg.addColorStop(0.55, '#8e0f24');
      bg.addColorStop(1, '#4a0612');
    } else {
      bg.addColorStop(0, '#1e3a6e');
      bg.addColorStop(0.55, '#13254a');
      bg.addColorStop(1, '#0a1530');
    }
    ctx.fillStyle = bg;
    ctx.fill();

    // Diagonal hazard / celebration stripes
    ctx.save();
    ctx.clip();
    ctx.fillStyle = hexWithAlpha(kind === 'boss' ? '#000000' : accent, kind === 'boss' ? 0.18 : 0.16);
    for (let sx = -200; sx < w + 200; sx += 96) {
      ctx.beginPath();
      ctx.moveTo(sx, 24);
      ctx.lineTo(sx + 48, 24);
      ctx.lineTo(sx - 40, h);
      ctx.lineTo(sx - 88, h);
      ctx.closePath();
      ctx.fill();
    }
    // Glossy top band
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(40, 24, w - 80, 46);
    ctx.restore();

    // Thick border + accent trim
    ctx.beginPath();
    ctx.roundRect(40, 24, w - 80, h - 64, 40);
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#060b18';
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(52, 36, w - 104, h - 88, 30);
    ctx.lineWidth = 4;
    ctx.strokeStyle = kind === 'boss' ? '#ffd23f' : accent;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    ctx.font = `64px ${DISPLAY_FONT}`;
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#060b18';
    ctx.strokeText(title, w * 0.5, 98);
    const tg = ctx.createLinearGradient(0, 70, 0, 126);
    if (kind === 'boss') {
      tg.addColorStop(0, '#fffbe0');
      tg.addColorStop(0.5, '#ffe14a');
      tg.addColorStop(1, '#ff9b1f');
    } else {
      tg.addColorStop(0, '#ffffff');
      tg.addColorStop(1, accent);
    }
    ctx.fillStyle = tg;
    ctx.fillText(title, w * 0.5, 98);

    ctx.font = `40px ${BODY_FONT}`;
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#060b18';
    ctx.strokeText(subtitle, w * 0.5, 160);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(subtitle, w * 0.5, 160);

    ctx.restore();
  }

  /* ---------------------------------------------------------------- */
  /*  Damage-number glyph atlas                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Pre-builds 2-row glyph atlas once (Row 0: normal white, Row 1: crit gold-orange)
   * so world-canvas never calls fillText per frame. Re-baked in place after web fonts load.
   */
  public ensureGlyphAtlas(): HTMLCanvasElement {
    if (this.glyphCanvas) return this.glyphCanvas;
    const cellW = 40;
    const cellH = 52;
    this.glyphRowHeight = cellH;
    const c = this.createOffscreen(GLYPH_CHARS.length * cellW, cellH * 2);
    this.paintGlyphAtlas(c);
    this.glyphCanvas = c;
    return c;
  }

  private paintGlyphAtlas(c: HTMLCanvasElement): void {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const cellW = 40;
    const cellH = this.glyphRowHeight;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.font = `36px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    for (let i = 0; i < GLYPH_CHARS.length; i++) {
      const ch = GLYPH_CHARS[i]!;
      const cx = i * cellW + cellW * 0.5;

      const cy0 = cellH * 0.5;
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#0a0f1f';
      ctx.strokeText(ch, cx, cy0);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ch, cx, cy0);

      const cy1 = cellH * 1.5;
      ctx.lineWidth = 9;
      ctx.strokeStyle = '#2a0800';
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
        advance: Math.max(15, Math.ceil(measured) + 3),
      });
    }
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
