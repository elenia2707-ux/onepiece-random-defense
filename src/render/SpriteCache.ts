import type {
  CourtSkinDef,
  FactionId,
  GradeDef,
  HeroSkinDef,
  MonsterKind,
  RelicId,
  UnitDef,
} from '../data/types';
import { type AtlasFrameRect, spriteAtlasLoader } from './AssetLoader';
import {
  paintMonsterChibi,
  paintRelicPixelArt,
  paintUnitChibi,
  PIXEL_OUTLINE,
} from './ChibiPainter';

export interface GlyphMetric {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  readonly advance: number;
}

const GLYPH_CHARS = '0123456789+-x/%!FB:#.KM,';

/** Display font stack shared by every pre-rendered canvas text (glyph atlas, seals & banners). */
export const DISPLAY_FONT =
  '"Black Han Sans", "Jua", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
export const BODY_FONT =
  '"Jua", "Black Han Sans", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';

/** Crisp integer multiples of the 32x32 pixel-art grid (instant placeholder before sheet PNG loads). */
const UNIT_PIXEL_SIZE = 128; // 32 x 4
const MOB_PIXEL_SIZE = 128; // 32 x 4
const BOSS_PIXEL_SIZE = 128; // 32 x 4

export type GlyphStyle = 'normal' | 'skill' | 'crit' | 'shred';
export type HitBadgeKind = 'crit' | 'shred' | 'kill' | 'execute' | 'pierce' | 'boss' | 'corrode';
export type StatusBadgeKind = 'warn' | 'sealed' | 'shield' | 'haste';

interface BannerSpec {
  readonly kind: 'boss' | 'craft';
  readonly title: string;
  readonly subtitle: string;
  readonly accent: string;
}

interface CutInBannerSpec {
  readonly gradeName: string;
  readonly unitName: string;
  readonly skillName: string;
  readonly accent: string;
  readonly faction: FactionId;
}

interface SealSpec {
  readonly char: string;
  readonly accent: string;
}

interface SkillCalloutSpec {
  readonly label: string;
  readonly faction: FactionId;
}

/**
 * Sole factory/owner for offscreen HTMLCanvasElements (AGENTS.md §2 & §6).
 * Releases canvas memory by zeroing width & height.
 *
 * Hybrid pixel-sheet loader: every unit / monster first gets an instant placeholder canvas,
 * then `public/sprites/{id}.png` is loaded with nearest-neighbor (`imageSmoothingEnabled = false`)
 * and listeners are notified cleanly.
 */
export class SpriteCache {
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private readonly portraitUrls = new Map<string, string>();
  private readonly bannerSpecs = new Map<string, BannerSpec>();
  private readonly cutInSpecs = new Map<string, CutInBannerSpec>();
  private readonly sealSpecs = new Map<string, SealSpec>();
  private readonly skillCalloutSpecs = new Map<string, SkillCalloutSpec>();
  private readonly hitBadgeSpecs = new Map<string, HitBadgeKind>();
  private readonly statusBadgeSpecs = new Map<string, StatusBadgeKind>();
  private readonly skinnedVariants = new Map<string, Array<{ key: string; skin: HeroSkinDef }>>();
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
    this.cutInSpecs.delete(key);
    this.sealSpecs.delete(key);
    this.skillCalloutSpecs.delete(key);
    this.hitBadgeSpecs.delete(key);
    this.statusBadgeSpecs.delete(key);
  }

  public disposeAll(): void {
    for (const c of this.cache.values()) {
      c.width = 0;
      c.height = 0;
    }
    this.cache.clear();
    this.portraitUrls.clear();
    this.bannerSpecs.clear();
    this.cutInSpecs.clear();
    this.sealSpecs.clear();
    this.skillCalloutSpecs.clear();
    this.hitBadgeSpecs.clear();
    this.statusBadgeSpecs.clear();
    this.skinnedVariants.clear();
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
      fonts.load(
        `40px "Black Han Sans"`,
        'BOSS 0123456789 剛破天魔毒血雷龍劍覇狂仙修炎魂 회심 파갑 참살 처형 관통 패왕 부식',
      ),
      fonts.load(`40px "Jua"`, '초출강호 합공 등선 환골탈태 주화입마 출현 매화만개 천마군림보 화경 현경 강림'),
    ])
      .catch(() => undefined)
      .then(() => fonts.ready)
      .then(() => this.onFontsReady())
      .catch(() => undefined);
  }

  private onFontsReady(): void {
    this.fontsReady = true;
    if (this.glyphCanvas) this.paintGlyphAtlas(this.glyphCanvas);
    for (const [key, spec] of this.bannerSpecs) {
      const c = this.cache.get(key);
      if (c) this.paintBanner(c, spec);
    }
    for (const [key, spec] of this.cutInSpecs) {
      const c = this.cache.get(key);
      if (c) this.paintCutInBanner(c, spec);
    }
    for (const [key, spec] of this.sealSpecs) {
      const c = this.cache.get(key);
      if (c) this.paintKanjiSeal(c, spec);
    }
    for (const [key, spec] of this.skillCalloutSpecs) {
      const c = this.cache.get(key);
      if (c) this.paintSkillCallout(c, spec);
    }
    for (const [key, kind] of this.hitBadgeSpecs) {
      const c = this.cache.get(key);
      if (c) this.paintHitBadge(c, kind);
    }
  }

  public get areFontsReady(): boolean {
    return this.fontsReady;
  }

  /* ---------------------------------------------------------------- */
  /*  Hybrid WebP atlas loader (`public/assets/sprites_atlas.webp`)     */
  /* ---------------------------------------------------------------- */

  public onSpriteUpdated(cb: () => void): void {
    this.spriteListeners.push(cb);
  }

  private probeExternal(
    id: string,
    onLoad: (img: HTMLImageElement, frame: AtlasFrameRect) => void,
  ): void {
    if (this.probed.has(id) || typeof Image === 'undefined') return;
    this.probed.add(id);
    spriteAtlasLoader.requestFrame(id, onLoad);
  }

  /** Nearest-neighbor atlas slice, bottom-anchored so pixel edges never blur. */
  private paintExternal(
    canvas: HTMLCanvasElement,
    atlasImg: HTMLImageElement,
    frame: AtlasFrameRect,
  ): void {
    const targetSize = Math.max(UNIT_PIXEL_SIZE, frame.w, frame.h);
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    const k = Math.min(canvas.width / frame.w, canvas.height / frame.h);
    const w = Math.round(frame.w * k);
    const h = Math.round(frame.h * k);
    ctx.drawImage(
      atlasImg,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      Math.round((canvas.width - w) * 0.5),
      canvas.height - h,
      w,
      h,
    );
  }

  private notifySpriteUpdated(): void {
    for (const cb of this.spriteListeners) cb();
  }

  /* ---------------------------------------------------------------- */
  /*  Sprites                                                           */
  /* ---------------------------------------------------------------- */

  /** Pre-rendered radial glow sprite (replaces forbidden shadowBlur / ctx.filter). */
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
      grad.addColorStop(0, hexWithAlpha(color, 0.72));
      grad.addColorStop(0.45, hexWithAlpha(color, 0.3));
      grad.addColorStop(1, hexWithAlpha(color, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }
    this.cache.set(key, c);
    return c;
  }

  /**
   * Pre-rendered Hanja martial stamp (e.g. '剛' for 소림 금강권) so VfxSystem never calls fillText per frame.
   */
  public kanjiSeal(char: string, accentColor = '#f59e0b'): HTMLCanvasElement {
    const key = `seal:${char}:${accentColor}`;
    const existing = this.cache.get(key);
    if (existing) return existing;

    const c = this.createOffscreen(96, 96);
    const spec: SealSpec = { char, accent: accentColor };
    this.paintKanjiSeal(c, spec);
    this.cache.set(key, c);
    this.sealSpecs.set(key, spec);
    return c;
  }

  private paintKanjiSeal(c: HTMLCanvasElement, spec: SealSpec): void {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.font = `bold 64px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 11;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.strokeText(spec.char, 48, 50);

    const g = ctx.createLinearGradient(0, 18, 0, 80);
    g.addColorStop(0, '#fffbeb');
    g.addColorStop(0.5, '#fde047');
    g.addColorStop(1, spec.accent);
    ctx.fillStyle = g;
    ctx.fillText(spec.char, 48, 50);
    ctx.restore();
  }

  /**
   * Pre-rendered Oriental scroll skill callout plaque (e.g. 「매화만개」, 「천마군림보」)
   * styled per faction (정파 청옥·금, 사파 취록·혈, 마교 흑적·마염) with zero per-frame fillText.
   */
  public skillCallout(skillName: string, faction: FactionId): HTMLCanvasElement {
    const concise =
      skillName.length > 9 && skillName.includes('·')
        ? skillName.split('·')[0]!.trim()
        : skillName;
    const key = `callout:${faction}:${concise}`;
    const existing = this.cache.get(key);
    if (existing) return existing;

    const c = this.createOffscreen(284, 52);
    const spec: SkillCalloutSpec = { label: concise, faction };
    this.paintSkillCallout(c, spec);
    this.cache.set(key, c);
    this.skillCalloutSpecs.set(key, spec);
    return c;
  }

  private paintSkillCallout(c: HTMLCanvasElement, spec: SkillCalloutSpec): void {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();

    const text = `「${spec.label}」`;
    ctx.font = `bold 25px ${BODY_FONT}`;
    const measuredW = Math.min(252, Math.max(116, Math.ceil(ctx.measureText(text).width) + 28));
    const pillX = Math.round((c.width - measuredW) * 0.5);
    const pillY = 8;
    const pillH = 34;

    // Subtle 3D ink drop shadow
    ctx.beginPath();
    ctx.roundRect(pillX, pillY + 4, measuredW, pillH, 10);
    ctx.fillStyle = 'rgba(26, 18, 36, 0.72)';
    ctx.fill();

    // Sleek semi-translucent faction lacquer scroll body
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, measuredW, pillH, 10);
    const bg = ctx.createLinearGradient(0, pillY, 0, pillY + pillH);
    let rimColor = '#fde047';
    let textTop = '#ffffff';
    let textBot = '#bae6fd';
    if (spec.faction === 'orthodox') {
      bg.addColorStop(0, 'rgba(7, 89, 133, 0.88)');
      bg.addColorStop(1, 'rgba(8, 47, 73, 0.9)');
      rimColor = '#fde047';
      textTop = '#fffbeb';
      textBot = '#7dd3fc';
    } else if (spec.faction === 'unorthodox') {
      bg.addColorStop(0, 'rgba(22, 101, 52, 0.88)');
      bg.addColorStop(1, 'rgba(5, 46, 22, 0.9)');
      rimColor = '#4ade80';
      textTop = '#fefce8';
      textBot = '#86efac';
    } else {
      bg.addColorStop(0, 'rgba(136, 19, 55, 0.88)');
      bg.addColorStop(1, 'rgba(42, 4, 16, 0.9)');
      rimColor = '#fb7185';
      textTop = '#fff1f2';
      textBot = '#fda4af';
    }
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 3.8;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(pillX + 2.5, pillY + 2.5, measuredW - 5, pillH - 5, 8);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = rimColor;
    ctx.stroke();

    // Traditional scroll gold end-spindles on left & right
    for (const rx of [pillX - 3, pillX + measuredW - 3]) {
      ctx.fillStyle = PIXEL_OUTLINE;
      ctx.fillRect(rx - 1.5, pillY + 3, 9, pillH - 6);
      ctx.fillStyle = rimColor;
      ctx.fillRect(rx, pillY + 5, 6, pillH - 10);
    }

    // Crisp ink-outlined martial skill name
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.strokeText(text, c.width * 0.5, pillY + pillH * 0.5 + 1);

    const tg = ctx.createLinearGradient(0, pillY + 5, 0, pillY + pillH - 5);
    tg.addColorStop(0, textTop);
    tg.addColorStop(1, textBot);
    ctx.fillStyle = tg;
    ctx.fillText(text, c.width * 0.5, pillY + pillH * 0.5 + 1);

    ctx.restore();
  }

  /**
   * Unit sprite: 32x32 SD pixel art at x4 (128px), or `public/sprites/{id}.png` when present.
   * When `skin` is supplied, bakes a cached pixel-palette variant + custom pixel crest (`ctx.filter` = 0).
   */
  public unitToken(
    unit: UnitDef,
    _grade: GradeDef,
    skin?: HeroSkinDef | null,
  ): HTMLCanvasElement {
    const baseKey = `unit:${unit.id}`;
    let baseCanvas = this.cache.get(baseKey);
    if (!baseCanvas) {
      const created = this.createOffscreen(UNIT_PIXEL_SIZE, UNIT_PIXEL_SIZE);
      baseCanvas = created;
      const ctx = created.getContext('2d');
      if (ctx) paintUnitChibi(ctx, unit.id, UNIT_PIXEL_SIZE);
      this.cache.set(baseKey, created);

      this.probeExternal(unit.id, (img, frame) => {
        this.paintExternal(created, img, frame);
        this.portraitUrls.delete(`url:${unit.id}`);
        const variants = this.skinnedVariants.get(unit.id);
        if (variants) {
          for (const v of variants) {
            const vc = this.cache.get(v.key);
            if (vc) {
              this.paintSkinnedUnit(vc, created, v.skin);
            }
            this.portraitUrls.delete(`url:${unit.id}:skin:${v.skin.id}`);
          }
        }
        this.notifySpriteUpdated();
      });
    }

    if (!skin) return baseCanvas;

    const skinKey = `unit:${unit.id}:skin:${skin.id}`;
    const existingSkin = this.cache.get(skinKey);
    if (existingSkin) return existingSkin;

    const skinnedCanvas = this.createOffscreen(baseCanvas.width, baseCanvas.height);
    this.paintSkinnedUnit(skinnedCanvas, baseCanvas, skin);
    this.cache.set(skinKey, skinnedCanvas);

    let list = this.skinnedVariants.get(unit.id);
    if (!list) {
      list = [];
      this.skinnedVariants.set(unit.id, list);
    }
    if (!list.some((item) => item.key === skinKey)) {
      list.push({ key: skinKey, skin });
    }
    return skinnedCanvas;
  }

  /** Cached PNG data URL for DOM portrait badges without creating extra DOM canvases. */
  public unitPortraitUrl(
    unit: UnitDef,
    grade: GradeDef,
    skin?: HeroSkinDef | null,
  ): string {
    const key = skin ? `url:${unit.id}:skin:${skin.id}` : `url:${unit.id}`;
    const existing = this.portraitUrls.get(key);
    if (existing) return existing;

    const sprite = this.unitToken(unit, grade, skin);
    const url = sprite.width > 0 ? sprite.toDataURL('image/png') : '';
    this.portraitUrls.set(key, url);
    return url;
  }

  /** Cached PNG data URL for courtyard theme skin cards in the wardrobe sheet. */
  public courtPreviewUrl(court: CourtSkinDef): string {
    const urlKey = `url:court:${court.id}`;
    const existingUrl = this.portraitUrls.get(urlKey);
    if (existingUrl) return existingUrl;

    const canvasKey = `court_icon:${court.id}`;
    let c = this.cache.get(canvasKey);
    if (!c) {
      c = this.createOffscreen(96, 96);
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        const p = 3; // 32x32 grid -> 96x96
        const dot = (gx: number, gy: number, gw: number, gh: number, col: string): void => {
          ctx.fillStyle = col;
          ctx.fillRect(gx * p, gy * p, gw * p, gh * p);
        };
        // Sky backdrop
        dot(0, 0, 32, 32, '#0f172a');
        dot(1, 1, 30, 14, court.tintAlpha > 0 ? hexWithAlpha(court.tintColor, 0.55) : '#1e293b');
        // Moon / Sun disk
        dot(21, 3, 6, 6, court.lanternColor);
        dot(22, 4, 4, 4, '#fffbeb');
        // Pagoda tiled roof silhouette
        dot(3, 10, 26, 2, PIXEL_OUTLINE);
        dot(5, 8, 22, 2, PIXEL_OUTLINE);
        dot(6, 9, 20, 1, court.petalPrimary);
        // Jade arena courtyard floor
        dot(2, 13, 28, 17, PIXEL_OUTLINE);
        dot(3, 14, 26, 15, '#cbd5e1');
        dot(5, 16, 22, 11, '#f1f5f9');
        if (court.tintAlpha > 0) {
          dot(3, 14, 26, 15, hexWithAlpha(court.tintColor, Math.min(0.42, court.tintAlpha * 2.4)));
        }
        // Inner tile grid lines
        dot(15, 16, 2, 11, '#94a3b8');
        dot(5, 21, 22, 1, '#94a3b8');
        // Twin glowing lanterns
        for (const lx of [4, 25]) {
          dot(lx, 12, 3, 4, PIXEL_OUTLINE);
          dot(lx + 1, 13, 1, 2, court.lanternColor);
        }
        // Drifting blossom / ember petals
        dot(9, 18, 2, 2, court.petalPrimary);
        dot(20, 23, 2, 2, court.petalPrimary);
        dot(13, 25, 2, 1, court.petalSecondary);
        dot(23, 17, 1, 2, court.petalSecondary);
      }
      this.cache.set(canvasKey, c);
    }

    const url = c.width > 0 ? c.toDataURL('image/png') : '';
    this.portraitUrls.set(urlKey, url);
    return url;
  }

  /**
   * One-time offscreen pixel palette remapping + custom pixel crest synthesis.
   * Preserves dark ink outlines (`#1a1224`), warm skin tones, and pure white glints; zero `ctx.filter`.
   */
  private paintSkinnedUnit(
    target: HTMLCanvasElement,
    base: HTMLCanvasElement,
    skin: HeroSkinDef,
  ): void {
    const w = Math.max(1, base.width);
    const h = Math.max(1, base.height);
    target.width = w;
    target.height = h;
    const ctx = target.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(base, 0, 0);

    try {
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      const minX = w * 0.22;
      const maxX = w * 0.78;
      const minY = h * 0.16;
      const maxY = h * 0.72;

      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3]!;
        if (a < 16) continue;

        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;
        const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
        const minC = r < g ? (r < b ? r : b) : g < b ? g : b;

        // Keep dark ink outlines intact
        if (maxC <= 56) continue;
        // Keep pure specular white glints crisp
        if (minC >= 242) continue;

        // Preserve central face/hand warm skin tones
        const pIdx = i >> 2;
        const px = pIdx % w;
        const py = (pIdx - px) / w;
        if (
          px >= minX &&
          px <= maxX &&
          py >= minY &&
          py <= maxY &&
          r >= 165 &&
          g >= 115 &&
          b >= 85 &&
          r > g &&
          g >= b &&
          r - b >= 22 &&
          r - b <= 98 &&
          r - g >= 8 &&
          r - g <= 58
        ) {
          continue;
        }

        const [origH, origS, origL] = rgbToHsl(r, g, b);
        const shiftedH = (((skin.robeHue + (origH - 180) * 0.18) % 360) + 360) % 360;
        const shiftedS =
          origS < 0.09
            ? origL > 0.88
              ? origS
              : Math.min(0.92, Math.max(0.28, 0.44 * skin.satMult))
            : Math.min(1, Math.max(0.14, origS * skin.satMult));
        const shiftedL = Math.min(0.94, Math.max(0.12, origL + skin.lumOffset));
        const [nr, ng, nb] = hslToRgb(shiftedH, shiftedS, shiftedL);
        data[i] = nr;
        data[i + 1] = ng;
        data[i + 2] = nb;
      }

      ctx.putImageData(imgData, 0, 0);
    } catch {
      // Safe fallback in non-pixel headless test contexts
    }

    // Composite bespoke pixel-art crest behind the hero silhouette
    const step = Math.max(2, Math.round(w / 32));
    const block = (gx: number, gy: number, gw: number, gh: number, col: string): void => {
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(gx * step), Math.round(gy * step), Math.round(gw * step), Math.round(gh * step));
    };

    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    switch (skin.crestKind) {
      case 'halo': {
        // Radiant pixel Dharma/Immortal ring behind upper torso & head
        const ringPts: ReadonlyArray<readonly [number, number]> = [
          [12, 3], [13, 3], [14, 2], [15, 2], [16, 2], [17, 2], [18, 3], [19, 3],
          [9, 5], [10, 4], [21, 4], [22, 5],
          [7, 7], [8, 6], [23, 6], [24, 7],
          [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
          [25, 9], [25, 10], [25, 11], [25, 12], [25, 13], [25, 14],
          [7, 15], [8, 16], [23, 16], [24, 15],
        ];
        for (const [rx, ry] of ringPts) {
          block(rx, ry, 1, 1, (rx + ry) % 2 === 0 ? skin.secondaryColor : skin.primaryColor);
        }
        // Cardinal rays + dark pixel outline behind ring
        block(15, 0, 2, 2, skin.secondaryColor);
        block(4, 11, 2, 2, skin.secondaryColor);
        block(26, 11, 2, 2, skin.secondaryColor);
        for (const [rx, ry] of ringPts) {
          block(rx - 1, ry, 3, 1, PIXEL_OUTLINE);
          block(rx, ry - 1, 1, 3, PIXEL_OUTLINE);
        }
        block(14, 0, 4, 3, PIXEL_OUTLINE);
        block(3, 10, 3, 4, PIXEL_OUTLINE);
        block(26, 10, 3, 4, PIXEL_OUTLINE);
        break;
      }

      case 'crown': {
        // Sovereign 5-prong imperial crest floating above/behind crown
        block(11, 4, 10, 3, skin.secondaryColor);
        block(10, 2, 2, 3, skin.secondaryColor);
        block(15, 1, 2, 4, skin.secondaryColor);
        block(20, 2, 2, 3, skin.secondaryColor);
        block(15, 3, 2, 2, skin.primaryColor);
        // Outline
        block(9, 1, 4, 6, PIXEL_OUTLINE);
        block(14, 0, 4, 7, PIXEL_OUTLINE);
        block(19, 1, 4, 6, PIXEL_OUTLINE);
        block(10, 3, 12, 5, PIXEL_OUTLINE);
        break;
      }

      case 'blades': {
        // Twin levitating spirit swords flanking left & right shoulders
        for (const bx of [4, 26]) {
          block(bx, 6, 2, 2, '#ffffff');
          block(bx, 8, 2, 9, skin.primaryColor);
          block(bx - 1, 17, 4, 1, skin.secondaryColor);
          block(bx, 18, 2, 2, skin.secondaryColor);
          // Outline
          block(bx - 1, 5, 4, 16, PIXEL_OUTLINE);
          block(bx - 2, 16, 6, 3, PIXEL_OUTLINE);
        }
        break;
      }

      case 'orbs': {
        // Four celestial spirit pearls orbiting in an arc
        const orbCenters: ReadonlyArray<readonly [number, number]> = [
          [5, 15],
          [7, 7],
          [23, 7],
          [25, 15],
        ];
        for (const [ox, oy] of orbCenters) {
          block(ox, oy, 2, 2, skin.primaryColor);
          block(ox, oy, 1, 1, skin.secondaryColor);
          block(ox - 1, oy - 1, 4, 4, PIXEL_OUTLINE);
        }
        break;
      }
    }
    ctx.restore();
  }

  /** Cached 96x96 pixel-art treasure portrait URL for the 6 Wuxia Relics (무림 6대 신물). */
  public relicPortraitUrl(relicId: RelicId, level: number): string {
    const tier = level >= 10 ? 10 : level >= 5 ? 5 : level > 0 ? 1 : 0;
    const key = `url:relic:${relicId}:${tier}`;
    const existing = this.portraitUrls.get(key);
    if (existing) return existing;

    const canvasKey = `relic:${relicId}:${tier}`;
    let c = this.cache.get(canvasKey);
    if (!c) {
      c = this.createOffscreen(96, 96);
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        paintRelicPixelArt(ctx, relicId, 96, tier);
      }
      this.cache.set(canvasKey, c);
    }

    const url = c.width > 0 ? c.toDataURL('image/png') : '';
    this.portraitUrls.set(key, url);
    return url;
  }

  /** Pre-rendered mini combat hit stamp ('회심!', '파갑!', '참살!') with zero per-frame fillText. */
  public hitBadge(kind: HitBadgeKind): HTMLCanvasElement {
    const key = `hitbadge:${kind}`;
    const existing = this.cache.get(key);
    if (existing) return existing;

    const c = this.createOffscreen(112, 38);
    this.paintHitBadge(c, kind);
    this.cache.set(key, c);
    this.hitBadgeSpecs.set(key, kind);
    return c;
  }

  private paintHitBadge(c: HTMLCanvasElement, kind: HitBadgeKind): void {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();

    let label = '참살!';
    let topCol = '#fb7185';
    let botCol = '#be123c';
    if (kind === 'crit') {
      label = '회심!';
      topCol = '#fde047';
      botCol = '#ea580c';
    } else if (kind === 'shred') {
      label = '파갑!';
      topCol = '#e879f9';
      botCol = '#9333ea';
    } else if (kind === 'execute') {
      label = '처형!';
      topCol = '#f43f5e';
      botCol = '#881337';
    } else if (kind === 'pierce') {
      label = '관통!';
      topCol = '#38bdf8';
      botCol = '#0369a1';
    } else if (kind === 'boss') {
      label = '패왕!';
      topCol = '#fbbf24';
      botCol = '#b45309';
    } else if (kind === 'corrode') {
      label = '부식!';
      topCol = '#4ade80';
      botCol = '#15803d';
    }

    ctx.beginPath();
    ctx.roundRect(8, 5, c.width - 16, c.height - 10, 12);
    const bg = ctx.createLinearGradient(0, 5, 0, c.height - 5);
    bg.addColorStop(0, topCol);
    bg.addColorStop(1, botCol);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();

    ctx.font = `20px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.strokeText(label, c.width * 0.5, c.height * 0.5 + 1);
    ctx.fillStyle = '#fffbeb';
    ctx.fillText(label, c.width * 0.5, c.height * 0.5 + 1);
    ctx.restore();
  }

  /** Pre-rendered world status plaque ('주박예고!', '봉인!', '현무독갑', '광풍질주') with zero per-frame fillText. */
  public statusBadge(kind: StatusBadgeKind): HTMLCanvasElement {
    const key = `statusbadge:${kind}`;
    const existing = this.cache.get(key);
    if (existing) return existing;

    const c = this.createOffscreen(132, 36);
    this.paintStatusBadge(c, kind);
    this.cache.set(key, c);
    this.statusBadgeSpecs.set(key, kind);
    return c;
  }

  private paintStatusBadge(c: HTMLCanvasElement, kind: StatusBadgeKind): void {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();

    let label = '봉인!';
    let topCol = '#9333ea';
    let botCol = '#7f1d1d';
    let borderAccent = '#fda4af';

    if (kind === 'warn') {
      label = '주박예고!';
      topCol = '#f59e0b';
      botCol = '#dc2626';
      borderAccent = '#fef08a';
    } else if (kind === 'shield') {
      label = '현무독갑';
      topCol = '#14b8a6';
      botCol = '#0f766e';
      borderAccent = '#99f6e4';
    } else if (kind === 'haste') {
      label = '광풍질주';
      topCol = '#facc15';
      botCol = '#d97706';
      borderAccent = '#fef9c3';
    }

    ctx.beginPath();
    ctx.roundRect(6, 4, c.width - 12, c.height - 8, 10);
    const bg = ctx.createLinearGradient(0, 4, 0, c.height - 4);
    bg.addColorStop(0, topCol);
    bg.addColorStop(1, botCol);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 4.2;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = borderAccent;
    ctx.stroke();

    ctx.font = `18px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.strokeText(label, c.width * 0.5, c.height * 0.5 + 1);
    ctx.fillStyle = '#fffbeb';
    ctx.fillText(label, c.width * 0.5, c.height * 0.5 + 1);
    ctx.restore();
  }

  /** Cached PNG data URL for boss / monster pixel portrait badges in DOM HUD. */
  public monsterPortraitUrl(kind: MonsterKind): string {
    const key = `url:monster:${kind}`;
    const existing = this.portraitUrls.get(key);
    if (existing) return existing;

    const sprite = this.monsterSprite(kind, false);
    const url = sprite.width > 0 ? sprite.toDataURL('image/png') : '';
    this.portraitUrls.set(key, url);
    return url;
  }

  /** Pre-rendered monster pixel sprite + pure-white hit-flash silhouette (zero ctx.filter). */
  public monsterSprite(kind: MonsterKind, hitFlash = false): HTMLCanvasElement {
    const baseKey = `monster:${kind}:base`;
    const flashKey = `monster:${kind}:flash`;

    let baseCanvas = this.cache.get(baseKey);
    if (!baseCanvas) {
      const isBoss =
        kind === 'white_tiger' || kind === 'black_serpent' || kind === 'blood_patriarch';
      const size = isBoss ? BOSS_PIXEL_SIZE : MOB_PIXEL_SIZE;
      const created = this.createOffscreen(size, size);
      baseCanvas = created;
      const bctx = created.getContext('2d');
      if (bctx) paintMonsterChibi(bctx, kind, size);
      this.cache.set(baseKey, created);

      this.probeExternal(kind, (img, frame) => {
        this.paintExternal(created, img, frame);
        const flash = this.cache.get(flashKey);
        if (flash) this.paintFlash(flash, created);
        this.portraitUrls.delete(`url:monster:${kind}`);
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
    const fctx = target.getContext('2d');
    if (!fctx) return;
    fctx.imageSmoothingEnabled = false;
    fctx.clearRect(0, 0, target.width, target.height);
    fctx.drawImage(base, 0, 0);
    fctx.globalCompositeOperation = 'source-in';
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(0, 0, target.width, target.height);
    fctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------------------------------------------------------- */
  /*  Overlay banners (Oriental Dancheong Plaque)                       */
  /* ---------------------------------------------------------------- */

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

    // 3D drop shadow lip
    ctx.beginPath();
    ctx.roundRect(40, 40, w - 80, h - 56, 36);
    ctx.fillStyle = PIXEL_OUTLINE;
    ctx.fill();

    // Oriental lacquer plaque body
    ctx.beginPath();
    ctx.roundRect(40, 24, w - 80, h - 64, 36);
    const bg = ctx.createLinearGradient(0, 24, 0, h - 40);
    if (kind === 'boss') {
      bg.addColorStop(0, '#b91c1c');
      bg.addColorStop(0.55, '#7f1d1d');
      bg.addColorStop(1, '#3b0808');
    } else {
      bg.addColorStop(0, '#134e4a');
      bg.addColorStop(0.55, '#0f3936');
      bg.addColorStop(1, '#092220');
    }
    ctx.fillStyle = bg;
    ctx.fill();

    // Subtle silk diagonal sheen
    ctx.save();
    ctx.clip();
    ctx.fillStyle = hexWithAlpha(kind === 'boss' ? '#000000' : accent, 0.16);
    for (let sx = -200; sx < w + 200; sx += 96) {
      ctx.beginPath();
      ctx.moveTo(sx, 24);
      ctx.lineTo(sx + 48, 24);
      ctx.lineTo(sx - 40, h);
      ctx.lineTo(sx - 88, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(40, 24, w - 80, 42);
    ctx.restore();

    // Outer dark ink border + inner golden dancheong frame
    ctx.beginPath();
    ctx.roundRect(40, 24, w - 80, h - 64, 36);
    ctx.lineWidth = 9;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(54, 38, w - 108, h - 92, 26);
    ctx.lineWidth = 4;
    ctx.strokeStyle = kind === 'boss' ? '#facc15' : accent;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    ctx.font = `62px ${DISPLAY_FONT}`;
    ctx.lineWidth = 14;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.strokeText(title, w * 0.5, 96);
    const tg = ctx.createLinearGradient(0, 68, 0, 126);
    if (kind === 'boss') {
      tg.addColorStop(0, '#fffbeb');
      tg.addColorStop(0.5, '#fde047');
      tg.addColorStop(1, '#f97316');
    } else {
      tg.addColorStop(0, '#fffbeb');
      tg.addColorStop(1, accent);
    }
    ctx.fillStyle = tg;
    ctx.fillText(title, w * 0.5, 96);

    ctx.font = `40px ${BODY_FONT}`;
    ctx.lineWidth = 10;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.strokeText(subtitle, w * 0.5, 160);
    ctx.fillStyle = '#fffbeb';
    ctx.fillText(subtitle, w * 0.5, 160);

    ctx.restore();
  }

  /** Pre-rendered ascension cut-in calligraphy sash (leaves left slot open for crisp hero portrait). */
  public cutInBanner(
    unitId: string,
    gradeName: string,
    unitName: string,
    skillName: string,
    accentColor: string,
    faction: FactionId,
  ): HTMLCanvasElement {
    const cacheKey = `cutin:${unitId}`;
    const existing = this.cache.get(cacheKey);
    if (existing) return existing;

    const c = this.createOffscreen(1280, 240);
    const spec: CutInBannerSpec = {
      gradeName,
      unitName,
      skillName,
      accent: accentColor,
      faction,
    };
    this.paintCutInBanner(c, spec);
    this.cache.set(cacheKey, c);
    this.cutInSpecs.set(cacheKey, spec);
    return c;
  }

  private paintCutInBanner(c: HTMLCanvasElement, spec: CutInBannerSpec): void {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const w = c.width;
    const h = c.height;
    const { gradeName, unitName, skillName, accent, faction } = spec;
    ctx.clearRect(0, 0, w, h);
    ctx.save();

    // Slanted martial lacquer ribbon across full width
    ctx.beginPath();
    ctx.moveTo(24, 34);
    ctx.lineTo(w - 18, 18);
    ctx.lineTo(w - 34, h - 18);
    ctx.lineTo(10, h - 32);
    ctx.closePath();

    const bg = ctx.createLinearGradient(0, 0, w, 0);
    if (faction === 'orthodox') {
      bg.addColorStop(0, '#0c4a6e');
      bg.addColorStop(0.55, '#0f2942');
      bg.addColorStop(1, '#081b2e');
    } else if (faction === 'unorthodox') {
      bg.addColorStop(0, '#064e3b');
      bg.addColorStop(0.55, '#1b1e3b');
      bg.addColorStop(1, '#120d26');
    } else {
      bg.addColorStop(0, '#7f1d1d');
      bg.addColorStop(0.55, '#3b0764');
      bg.addColorStop(1, '#180524');
    }
    ctx.fillStyle = bg;
    ctx.fill();

    ctx.save();
    ctx.clip();
    // Dynamic martial speed rays
    ctx.fillStyle = hexWithAlpha(accent, 0.22);
    for (let sx = -120; sx < w + 180; sx += 110) {
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx + 44, 0);
      ctx.lineTo(sx - 64, h);
      ctx.lineTo(sx - 108, h);
      ctx.closePath();
      ctx.fill();
    }
    // Left portrait medallion halo
    const halo = ctx.createRadialGradient(210, h * 0.5, 16, 210, h * 0.5, 160);
    halo.addColorStop(0, hexWithAlpha('#fef08a', 0.55));
    halo.addColorStop(0.55, hexWithAlpha(accent, 0.34));
    halo.addColorStop(1, hexWithAlpha(accent, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 420, h);
    ctx.restore();

    // Crisp outer dark-ink outline + golden inner speed trim
    ctx.beginPath();
    ctx.moveTo(24, 34);
    ctx.lineTo(w - 18, 18);
    ctx.lineTo(w - 34, h - 18);
    ctx.lineTo(10, h - 32);
    ctx.closePath();
    ctx.lineWidth = 10;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();

    ctx.lineWidth = 4;
    ctx.strokeStyle = '#fde047';
    ctx.stroke();

    // Right-aligned calligraphy text block (x=370..1210, portrait sits cleanly at x=90..310)
    const textX = 385;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    ctx.font = `36px ${BODY_FONT}`;
    ctx.lineWidth = 9;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.strokeText(`✦ ${gradeName} 강림 ✦`, textX, 62);
    ctx.fillStyle = '#fde047';
    ctx.fillText(`✦ ${gradeName} 강림 ✦`, textX, 62);

    ctx.font = `74px ${DISPLAY_FONT}`;
    ctx.lineWidth = 15;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.strokeText(unitName, textX, 126);
    const ng = ctx.createLinearGradient(0, 88, 0, 164);
    ng.addColorStop(0, '#fffbeb');
    ng.addColorStop(0.65, '#fef08a');
    ng.addColorStop(1, accent);
    ctx.fillStyle = ng;
    ctx.fillText(unitName, textX, 126);

    ctx.font = `34px ${BODY_FONT}`;
    ctx.lineWidth = 8;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.strokeText(`절기 「${skillName}」`, textX, 188);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(`절기 「${skillName}」`, textX, 188);

    ctx.restore();
  }

  /* ---------------------------------------------------------------- */
  /*  Damage-number glyph atlas                                         */
  /* ---------------------------------------------------------------- */

  public ensureGlyphAtlas(): HTMLCanvasElement {
    if (this.glyphCanvas) return this.glyphCanvas;
    const cellW = 50;
    const cellH = 64;
    this.glyphRowHeight = cellH;
    const c = this.createOffscreen(GLYPH_CHARS.length * cellW, cellH * 4);
    this.paintGlyphAtlas(c);
    this.glyphCanvas = c;
    return c;
  }

  private paintGlyphAtlas(c: HTMLCanvasElement): void {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const cellW = 50;
    const cellH = this.glyphRowHeight;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.font = `bold 44px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    for (let i = 0; i < GLYPH_CHARS.length; i++) {
      const ch = GLYPH_CHARS[i]!;
      const cx = i * cellW + cellW * 0.5;

      // Row 0: Normal attack — crisp ivory-white with heavy dark ink outline & 3D bottom extrusion
      const cy0 = cellH * 0.5;
      ctx.lineWidth = 12;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.strokeText(ch, cx, cy0 + 2.5);
      ctx.strokeText(ch, cx, cy0);
      const normGrad = ctx.createLinearGradient(cx, cy0 - 20, cx, cy0 + 20);
      normGrad.addColorStop(0, '#ffffff');
      normGrad.addColorStop(0.68, '#f8fafc');
      normGrad.addColorStop(1, '#cbd5e1');
      ctx.fillStyle = normGrad;
      ctx.fillText(ch, cx, cy0);

      // Row 1: Martial skill hit (non-crit) — radiant celadon-azure qi gradient
      const cy1 = cellH * 1.5;
      ctx.lineWidth = 12.5;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.strokeText(ch, cx, cy1 + 2.5);
      ctx.strokeText(ch, cx, cy1);
      const skillGrad = ctx.createLinearGradient(cx, cy1 - 20, cx, cy1 + 20);
      skillGrad.addColorStop(0, '#ffffff');
      skillGrad.addColorStop(0.45, '#67e8f9');
      skillGrad.addColorStop(1, '#0284c7');
      ctx.fillStyle = skillGrad;
      ctx.fillText(ch, cx, cy1);

      // Row 2: Critical strike (회심일격!) — blazing imperial gold-to-vermilion gradient
      const cy2 = cellH * 2.5;
      ctx.lineWidth = 13.5;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.strokeText(ch, cx, cy2 + 3);
      ctx.strokeText(ch, cx, cy2);
      const critGrad = ctx.createLinearGradient(cx, cy2 - 21, cx, cy2 + 21);
      critGrad.addColorStop(0, '#fffbeb');
      critGrad.addColorStop(0.38, '#fde047');
      critGrad.addColorStop(0.76, '#f97316');
      critGrad.addColorStop(1, '#dc2626');
      ctx.fillStyle = critGrad;
      ctx.fillText(ch, cx, cy2);

      // Row 3: Armor-broken amplified strike (파갑·강기격파!) — radiant amethyst-magenta-to-crimson gradient
      const cy3 = cellH * 3.5;
      ctx.lineWidth = 13.5;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.strokeText(ch, cx, cy3 + 3);
      ctx.strokeText(ch, cx, cy3);
      const shredGrad = ctx.createLinearGradient(cx, cy3 - 21, cx, cy3 + 21);
      shredGrad.addColorStop(0, '#fdf4ff');
      shredGrad.addColorStop(0.4, '#e879f9');
      shredGrad.addColorStop(0.78, '#f43f5e');
      shredGrad.addColorStop(1, '#9f1239');
      ctx.fillStyle = shredGrad;
      ctx.fillText(ch, cx, cy3);

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

  public drawGlyphString(
    ctx: CanvasRenderingContext2D,
    text: string,
    centerX: number,
    centerY: number,
    scale = 0.5,
    alpha = 1,
    style: boolean | GlyphStyle = false,
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
    const resolved: GlyphStyle =
      typeof style === 'boolean' ? (style ? 'crit' : 'normal') : style;
    const rowSy =
      resolved === 'shred'
        ? this.glyphRowHeight * 3
        : resolved === 'crit'
          ? this.glyphRowHeight * 2
          : resolved === 'skill'
            ? this.glyphRowHeight
            : 0;

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

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) * 0.5;
  if (max === min) {
    return [0, 0, l];
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) {
    h = (gn - bn) / d + (gn < bn ? 6 : 0);
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s <= 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = (((h % 360) + 360) % 360) / 360;
  const hue2rgb = (tIn: number): number => {
    let t = tIn;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(hue2rgb(hk + 1 / 3) * 255),
    Math.round(hue2rgb(hk) * 255),
    Math.round(hue2rgb(hk - 1 / 3) * 255),
  ];
}
