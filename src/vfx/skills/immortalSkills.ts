import { PIXEL_OUTLINE } from '../../render/ChibiPainter';
import { hexWithAlpha } from '../../render/SpriteCache';
import type { WeaponMotionStyle } from '../../render/weaponProfiles';
import {
  easeOutCubic,
  type SkillRenderContext,
  type SkillSpawnContext,
  type TrackVfxInstance,
} from '../types';

export type ImmortalSkillTrack =
  | 'im_cheonma'
  | 'im_sword_immortal'
  | 'im_asura_emperor'
  | 'im_venom_lord'
  | 'im_thunder_emperor'
  | 'im_hell_flame'
  | 'im_wuji_grandmaster'
  | 'im_primordial_sword'
  | 'im_chaos_poison'
  | 'im_void_cheonma';

export function isImmortalSkillTrack(kind: string): kind is ImmortalSkillTrack {
  return (
    kind === 'im_cheonma' ||
    kind === 'im_sword_immortal' ||
    kind === 'im_asura_emperor' ||
    kind === 'im_venom_lord' ||
    kind === 'im_thunder_emperor' ||
    kind === 'im_hell_flame' ||
    kind === 'im_wuji_grandmaster' ||
    kind === 'im_primordial_sword' ||
    kind === 'im_chaos_poison' ||
    kind === 'im_void_cheonma'
  );
}

export function spawnImmortalSkillVfx(
  api: SkillSpawnContext,
  track: ImmortalSkillTrack,
  fromX: number,
  fromY: number,
  x: number,
  y: number,
  radius: number,
  gradeRank: number,
  startTick: number,
  skinPrimary?: string,
  skinSecondary?: string,
  weaponStyle: WeaponMotionStyle = 'sword',
): void {
  const visR = Math.min(156, Math.max(110, radius * 0.72));

  switch (track) {
    case 'im_cheonma': {
      // 천마군림보: deep obsidian-crimson dimensional shatter + 8-point imperial bloodstar + '天'
      const c1 = skinPrimary ?? '#e11d48';
      const c2 = skinSecondary ?? '#fde047';
      api.pushTrack({
        kind: track,
        weaponStyle,
        startTick,
        durationSec: 0.66,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 22,
        toRadius: visR,
        color: c1,
        secondaryColor: c2,
        lineWidth: 6.5,
        glowRadius: 112,
        gradeRank,
        isLargeUltimate: true,
      });
      api.emitRadialBurst(x, y, c1, 24, 215, 0.44, 0, startTick);
      api.emitRadialBurst(x, y, PIXEL_OUTLINE, 14, 175, 0.4, 0, startTick);
      api.triggerScreenFlash(c1, 0.11, 0.16, startTick);
      break;
    }

    case 'im_sword_immortal': {
      // 태상무극: celestial sword array ring raining 9 cyan-gold spirit swords + '仙'
      const c1 = skinPrimary ?? '#38bdf8';
      const c2 = skinSecondary ?? '#fde047';
      api.pushTrack({
        kind: track,
        weaponStyle,
        startTick,
        durationSec: 0.64,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 22,
        toRadius: visR,
        color: c1,
        secondaryColor: c2,
        lineWidth: 6,
        glowRadius: 108,
        gradeRank,
        isLargeUltimate: true,
      });
      api.emitRadialBurst(x, y, c1, 20, 195, 0.4, 14, startTick);
      api.emitRadialBurst(x, y, c2, 14, 160, 0.38, 10, startTick);
      api.triggerScreenFlash(c1, 0.09, 0.14, startTick);
      break;
    }

    case 'im_asura_emperor': {
      // 수라혈겁: massive crossed crimson-jade Asura twin crescent blades + blood cyclone + '修'
      const c1 = skinPrimary ?? '#e11d48';
      const c2 = skinSecondary ?? '#4ade80';
      api.pushTrack({
        kind: track,
        weaponStyle,
        startTick,
        durationSec: 0.56,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 22,
        toRadius: visR,
        color: c1,
        secondaryColor: c2,
        lineWidth: 6.5,
        glowRadius: 108,
        gradeRank,
        isLargeUltimate: true,
      });
      api.emitRadialBurst(x, y, c1, 22, 210, 0.38, 0, startTick);
      api.emitRadialBurst(x, y, c2, 14, 170, 0.36, 0, startTick);
      api.triggerScreenFlash(c1, 0.09, 0.14, startTick);
      break;
    }

    case 'im_venom_lord': {
      // 만독천화: grand 9-rib imperial jade-violet war fan snapping open + cascading toxic rain + '毒'
      const c1 = skinPrimary ?? '#10b981';
      const c2 = skinSecondary ?? '#a855f7';
      api.pushTrack({
        kind: track,
        weaponStyle: 'fan',
        startTick,
        durationSec: 0.66,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 22,
        toRadius: visR,
        color: c1,
        secondaryColor: c2,
        lineWidth: 5.8,
        glowRadius: 106,
        gradeRank,
        isLargeUltimate: true,
      });
      api.emitRadialBurst(x, y, c1, 18, 165, 0.42, 28, startTick);
      api.emitRadialBurst(x, y, c2, 14, 130, 0.4, 22, startTick);
      break;
    }

    case 'im_thunder_emperor': {
      // 제왕벽력: tri-bolt golden-cyan sky thunder cage + crackling hex rune + '雷'
      const c1 = skinPrimary ?? '#0ea5e9';
      const c2 = skinSecondary ?? '#fde047';
      api.pushTrack({
        kind: track,
        weaponStyle,
        startTick,
        durationSec: 0.56,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 20,
        toRadius: visR,
        color: c1,
        secondaryColor: c2,
        lineWidth: 6,
        glowRadius: 106,
        gradeRank,
        isLargeUltimate: true,
      });
      api.emitRadialBurst(x, y, c1, 20, 195, 0.34, 12, startTick);
      api.emitRadialBurst(x, y, c2, 14, 165, 0.32, 0, startTick);
      api.triggerScreenFlash(c2, 0.08, 0.13, startTick);
      break;
    }

    case 'im_hell_flame': {
      // 구천겁화: 9 orbiting crimson-gold hellfire orbs collapsing into a lotus inferno + '炎'
      const c1 = skinPrimary ?? '#f97316';
      const c2 = skinSecondary ?? '#e11d48';
      api.pushTrack({
        kind: track,
        weaponStyle,
        startTick,
        durationSec: 0.68,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 24,
        toRadius: visR,
        color: c1,
        secondaryColor: c2,
        lineWidth: 6.5,
        glowRadius: 114,
        gradeRank,
        isLargeUltimate: true,
      });
      api.emitRadialBurst(x, y, c1, 22, 190, 0.42, -90, startTick);
      api.emitRadialBurst(x, y, c2, 16, 155, 0.38, -110, startTick);
      api.triggerScreenFlash(c1, 0.1, 0.16, startTick);
      break;
    }

    case 'im_wuji_grandmaster': {
      // 태극무극진 · 팔괘파천: giant rotating Yin-Yang Taiji ring + 8 Bagua cyan-gold beams + '極'
      const c1 = skinPrimary ?? '#2dd4bf';
      const c2 = skinSecondary ?? '#fde047';
      api.pushTrack({
        kind: track,
        weaponStyle: 'sword',
        startTick,
        durationSec: 0.68,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 24,
        toRadius: visR,
        color: c1,
        secondaryColor: c2,
        lineWidth: 6.4,
        glowRadius: 114,
        gradeRank,
        isLargeUltimate: true,
      });
      api.emitRadialBurst(x, y, c1, 22, 195, 0.42, -16, startTick);
      api.emitRadialBurst(x, y, c2, 16, 165, 0.4, 8, startTick);
      api.triggerScreenFlash(c1, 0.09, 0.15, startTick);
      break;
    }

    case 'im_primordial_sword': {
      // 개벽만검 · 천지일섬: 12 celestial golden-cyan genesis swords + horizon rift + '神'
      const c1 = skinPrimary ?? '#fde047';
      const c2 = skinSecondary ?? '#38bdf8';
      api.pushTrack({
        kind: track,
        weaponStyle,
        startTick,
        durationSec: 0.72,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 26,
        toRadius: Math.min(168, visR * 1.08),
        color: c1,
        secondaryColor: c2,
        lineWidth: 6.8,
        glowRadius: 122,
        gradeRank,
        isLargeUltimate: true,
      });
      api.emitRadialBurst(x, y, c1, 26, 220, 0.44, 0, startTick);
      api.emitRadialBurst(x, y, c2, 18, 185, 0.4, 0, startTick);
      api.triggerScreenFlash(c1, 0.11, 0.16, startTick);
      break;
    }

    case 'im_chaos_poison': {
      // 혼원멸세 · 만독성하: swirling emerald-amethyst nebula vortex + 8 chaos stars + '混'
      const c1 = skinPrimary ?? '#4ade80';
      const c2 = skinSecondary ?? '#c084fc';
      api.pushTrack({
        kind: track,
        weaponStyle,
        startTick,
        durationSec: 0.7,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 26,
        toRadius: Math.min(168, visR * 1.08),
        color: c1,
        secondaryColor: c2,
        lineWidth: 6.6,
        glowRadius: 120,
        gradeRank,
        isLargeUltimate: true,
      });
      api.emitRadialBurst(x, y, c1, 24, 205, 0.44, -25, startTick);
      api.emitRadialBurst(x, y, c2, 18, 175, 0.42, 12, startTick);
      api.triggerScreenFlash(c2, 0.1, 0.16, startTick);
      break;
    }

    case 'im_void_cheonma': {
      // 무극천마 · 귀원멸세겁: crimson-gold total solar eclipse eye + 10 dimensional rifts + '無'
      const c1 = skinPrimary ?? '#f43f5e';
      const c2 = skinSecondary ?? '#fde047';
      api.pushTrack({
        kind: track,
        weaponStyle,
        startTick,
        durationSec: 0.74,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 28,
        toRadius: Math.min(172, visR * 1.1),
        color: c1,
        secondaryColor: c2,
        lineWidth: 7,
        glowRadius: 126,
        gradeRank,
        isLargeUltimate: true,
      });
      api.emitRadialBurst(x, y, c1, 28, 230, 0.46, 0, startTick);
      api.emitRadialBurst(x, y, c2, 18, 190, 0.42, 0, startTick);
      api.triggerScreenFlash(c1, 0.12, 0.18, startTick);
      break;
    }
  }
}

export function renderImmortalSkillGround(
  ctx: CanvasRenderingContext2D,
  inst: TrackVfxInstance,
  radius: number,
  inv: number,
): boolean {
  if (!isImmortalSkillTrack(inst.kind)) return false;

  // Ground arcane/crater formation ring (distinct per Immortal!)
  ctx.globalAlpha = inv * 0.25;
  ctx.beginPath();
  ctx.arc(inst.x, inst.y, radius * 0.9, 0, Math.PI * 2);
  ctx.fillStyle =
    inst.kind === 'im_cheonma' || inst.kind === 'im_hell_flame' ? PIXEL_OUTLINE : inst.color;
  ctx.fill();

  // Outer dark-ink bordered shock ring
  ctx.globalAlpha = inv * 0.92;
  ctx.beginPath();
  ctx.arc(inst.x, inst.y, radius, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2.2, (inst.lineWidth + 3.2) * inv);
  ctx.strokeStyle = PIXEL_OUTLINE;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(inst.x, inst.y, radius, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1.5, inst.lineWidth * inv);
  ctx.strokeStyle = inst.color;
  ctx.stroke();

  // Inscribed sacred polygon (8-gon for Bagua/Cheonma/Hellfire, 6-gon for Thunder/Sword)
  const sides =
    inst.kind === 'im_cheonma' ||
    inst.kind === 'im_hell_flame' ||
    inst.kind === 'im_wuji_grandmaster'
      ? 8
      : 6;
  const polyR = radius * 0.72;
  const rot = inst.progress * 1.4;
  ctx.beginPath();
  for (let i = 0; i <= sides; i++) {
    const a = (i * Math.PI * 2) / sides + rot;
    const px = inst.x + Math.cos(a) * polyR;
    const py = inst.y + Math.sin(a) * polyR;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.lineWidth = Math.max(1.4, 3 * inv);
  ctx.strokeStyle = inst.secondaryColor;
  ctx.stroke();
  return true;
}

export function renderImmortalSkillAir(
  ctx: CanvasRenderingContext2D,
  inst: TrackVfxInstance,
  rc: SkillRenderContext,
): boolean {
  if (!isImmortalSkillTrack(inst.kind)) return false;
  const p = inst.progress;
  const inv = 1 - p;

  switch (inst.kind) {
    case 'im_cheonma': {
      // 8-point obsidian-crimson imperial bloodstar spatial shatter + '天' seal
      const maxR = inst.toRadius * (0.42 + easeOutCubic(p) * 0.62);
      ctx.globalAlpha = inv * 0.98;
      const traceStar = (w: number, col: string): void => {
        ctx.beginPath();
        for (let b = 0; b < 8; b++) {
          const ang = (b * Math.PI * 2) / 8 + (inst.startTick % 9) * 0.14;
          const midR = maxR * 0.48;
          const x1 = inst.x + Math.cos(ang + 0.14) * midR;
          const y1 = inst.y + Math.sin(ang + 0.14) * midR;
          ctx.moveTo(inst.x, inst.y);
          ctx.lineTo(x1, y1);
          ctx.lineTo(
            x1 + Math.cos(ang - 0.18) * (maxR * 0.56),
            y1 + Math.sin(ang - 0.18) * (maxR * 0.56),
          );
          if (b % 2 === 0) {
            ctx.moveTo(x1, y1);
            ctx.lineTo(
              x1 + Math.cos(ang + 0.44) * (maxR * 0.34),
              y1 + Math.sin(ang + 0.44) * (maxR * 0.34),
            );
          }
        }
        ctx.lineCap = 'round';
        ctx.lineWidth = w * inv;
        ctx.strokeStyle = col;
        ctx.stroke();
      };
      traceStar(11, PIXEL_OUTLINE);
      traceStar(5.8, inst.color);
      traceStar(2.2, inst.secondaryColor);

      const seal = rc.sprites.kanjiSeal('天', inst.color);
      const sz = 86 * (0.85 + inv * 0.25);
      ctx.globalAlpha = inv * 0.96;
      ctx.drawImage(seal, inst.x - sz * 0.5, inst.y - 28 - p * 26 - sz * 0.5, sz, sz);
      return true;
    }

    case 'im_sword_immortal': {
      // Celestial halo gate above target raining 9 cyan-gold spirit swords + '仙' seal
      const haloY = inst.y - 108;
      const haloR = 54 + easeOutCubic(p) * 28;
      ctx.globalAlpha = inv * 0.92;
      ctx.beginPath();
      ctx.ellipse(inst.x, haloY, haloR, haloR * 0.32, 0, 0, Math.PI * 2);
      ctx.lineWidth = 6 * inv;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 3 * inv;
      ctx.strokeStyle = inst.secondaryColor;
      ctx.stroke();

      // 9 plunging spirit swords from halo onto target area
      const fallT = easeOutCubic(Math.min(1, p * 1.6));
      for (let s = 0; s < 9; s++) {
        const spread = ((s - 4) / 4) * inst.toRadius * 0.72;
        const jitterY = ((s * 29) % 24) - 12;
        const sx = inst.x + spread * 0.58;
        const sy = haloY + (inst.y + jitterY - haloY) * Math.max(0, fallT - (s % 3) * 0.08);
        const ex = inst.x + spread;
        const ey = Math.min(inst.y + jitterY + 14, sy + 44);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.lineCap = 'round';
        ctx.lineWidth = 7 * inv + 1.4;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 3.8 * inv + 0.8;
        ctx.strokeStyle = s % 2 === 0 ? inst.color : inst.secondaryColor;
        ctx.stroke();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }

      const seal = rc.sprites.kanjiSeal('仙', inst.color);
      const sz = 84 * (0.85 + inv * 0.24);
      ctx.globalAlpha = inv * 0.96;
      ctx.drawImage(seal, inst.x - sz * 0.5, inst.y - 30 - p * 24 - sz * 0.5, sz, sz);
      return true;
    }

    case 'im_asura_emperor': {
      // Twin colossal crossed crimson & jade crescent sabers + swirling blood cyclone + '修' seal
      const r = inst.toRadius * (0.48 + easeOutCubic(p) * 0.54);
      ctx.globalAlpha = inv * 0.98;
      for (let k = 0; k < 2; k++) {
        ctx.save();
        ctx.translate(inst.x, inst.y);
        ctx.rotate((k === 0 ? 0.58 : -0.58) + (k === 0 ? p * 0.7 : -p * 0.7));
        ctx.beginPath();
        ctx.arc(0, 0, r, -Math.PI * 0.45, Math.PI * 0.45);
        ctx.quadraticCurveTo(
          r * 0.36,
          0,
          Math.cos(-Math.PI * 0.45) * r,
          Math.sin(-Math.PI * 0.45) * r,
        );
        ctx.closePath();
        ctx.fillStyle = k === 0 ? inst.color : inst.secondaryColor;
        ctx.fill();
        ctx.lineWidth = 3.4;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.restore();
      }
      // Swirling cyclone arc
      ctx.beginPath();
      ctx.arc(inst.x, inst.y, r * 0.76, p * 6, p * 6 + Math.PI * 1.35);
      ctx.lineWidth = 6 * inv;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      const seal = rc.sprites.kanjiSeal('修', inst.color);
      const sz = 84 * (0.85 + inv * 0.24);
      ctx.globalAlpha = inv * 0.96;
      ctx.drawImage(seal, inst.x - sz * 0.5, inst.y - 26 - p * 24 - sz * 0.5, sz, sz);
      return true;
    }

    case 'im_venom_lord': {
      // Grand 9-rib Imperial Emerald-Violet War Fan snapping open + 18 cascading needles + '毒' seal
      ctx.globalAlpha = inv * 0.96;
      const openT = easeOutCubic(Math.min(1, p * 2.1));
      const halfSpan = 0.28 + openT * 1.24;
      const fanR = 52 + openT * 26;
      const innerR = 10;
      const fx = inst.x;
      const fy = inst.y - 48 - p * 10;
      const centerA = Math.PI * 0.5;
      const a0 = centerA - halfSpan;
      const a1 = centerA + halfSpan;

      ctx.save();
      ctx.translate(fx, fy);
      ctx.beginPath();
      ctx.arc(0, 0, fanR, a0, a1);
      ctx.arc(0, 0, innerR, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = '#3b0764';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, fanR * 0.86, a0, a1);
      ctx.arc(0, 0, fanR * 0.38, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = inst.color;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, fanR, a0, a1);
      ctx.arc(0, 0, fanR * 0.86, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = '#fde047';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, fanR, a0, a1);
      ctx.arc(0, 0, innerR, a1, a0, true);
      ctx.closePath();
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();

      for (let rIdx = 0; rIdx < 9; rIdx++) {
        const ra = a0 + ((a1 - a0) * rIdx) / 8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ra) * 4, Math.sin(ra) * 4);
        ctx.lineTo(Math.cos(ra) * (fanR + 3), Math.sin(ra) * (fanR + 3));
        ctx.lineWidth = 2.8;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = '#fef08a';
        ctx.stroke();
      }
      ctx.restore();

      // Cascading needle curtain
      const seed = inst.startTick * 19;
      for (let n = 0; n < 18; n++) {
        const spreadX = (((seed + n * 29) % 72) - 36) * (inst.toRadius / 80);
        const spreadY = (((seed + n * 41) % 48) - 24) * (inst.toRadius / 80);
        const fall = (1 - p) * 52;
        const tx = inst.x + spreadX;
        const ty = inst.y + spreadY;
        ctx.beginPath();
        ctx.moveTo(tx - spreadX * 0.22, ty - fall);
        ctx.lineTo(tx, ty);
        ctx.lineWidth = 4.6;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = n % 3 === 0 ? '#ffffff' : n % 2 === 0 ? inst.color : inst.secondaryColor;
        ctx.stroke();
      }

      const seal = rc.sprites.kanjiSeal('毒', inst.color);
      const sz = 82 * (0.85 + inv * 0.22);
      ctx.globalAlpha = inv * 0.95;
      ctx.drawImage(seal, inst.x - sz * 0.5, inst.y - 20 - p * 22 - sz * 0.5, sz, sz);
      return true;
    }

    case 'im_thunder_emperor': {
      // Tri-bolt golden-cyan sky thunder cage + crackling horizontal arcs + '雷' seal
      ctx.globalAlpha = inv * 0.98;
      const skyY = inst.y - 205;
      const seed = inst.startTick * 23;
      const offsets = [-44, 0, 44];
      for (let idx = 0; idx < offsets.length; idx++) {
        const ox = offsets[idx]!;
        const trace = (w: number, col: string): void => {
          ctx.beginPath();
          ctx.moveTo(inst.x + ox * 0.7, skyY);
          for (let s = 1; s < 6; s++) {
            const frac = s / 6;
            const jx = (((seed + idx * 17 + s * 37) % 26) - 13) * (1 - frac * 0.35);
            ctx.lineTo(inst.x + ox + jx, skyY + (inst.y - skyY) * frac);
          }
          ctx.lineTo(inst.x + ox * 0.85, inst.y + (idx === 1 ? 8 : -6));
          ctx.lineWidth = w * inv;
          ctx.strokeStyle = col;
          ctx.stroke();
        };
        trace(idx === 1 ? 13 : 9, PIXEL_OUTLINE);
        trace(idx === 1 ? 8 : 5.5, idx === 1 ? inst.secondaryColor : inst.color);
        trace(idx === 1 ? 3.5 : 2, '#ffffff');
      }

      // Horizontal cage lightning ring
      const cageR = inst.toRadius * (0.45 + p * 0.4);
      ctx.beginPath();
      ctx.ellipse(inst.x, inst.y - 14, cageR, cageR * 0.36, 0, 0, Math.PI * 2);
      ctx.lineWidth = 5 * inv;
      ctx.strokeStyle = inst.secondaryColor;
      ctx.stroke();

      const seal = rc.sprites.kanjiSeal('雷', inst.secondaryColor);
      const sz = 84 * (0.85 + inv * 0.24);
      ctx.globalAlpha = inv * 0.96;
      ctx.drawImage(seal, inst.x - sz * 0.5, inst.y - 28 - p * 24 - sz * 0.5, sz, sz);
      return true;
    }

    case 'im_hell_flame': {
      // 9 orbiting crimson-gold hellfire orbs converging into a blazing lotus inferno + '炎' seal
      const maxR = inst.toRadius * 0.85;
      const orbDist = p < 0.45 ? maxR * (1 - (p / 0.45) * 0.72) : maxR * (0.28 + ((p - 0.45) / 0.55) * 0.72);
      ctx.globalAlpha = inv * 0.96;

      // Central lotus inferno petals
      const coreR = inst.toRadius * (0.28 + easeOutCubic(p) * 0.48);
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI * 2) / 6 - p * 2.4;
        ctx.save();
        ctx.translate(inst.x, inst.y);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(coreR * 0.46, 0, coreR * 0.44, coreR * 0.18, 0, 0, Math.PI * 2);
        ctx.fillStyle = hexWithAlpha(k % 2 === 0 ? inst.color : inst.secondaryColor, 0.58);
        ctx.fill();
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.restore();
      }

      // 9 Hellfire Orbs (구천마염주)
      for (let i = 0; i < 9; i++) {
        const a = (i * Math.PI * 2) / 9 + p * 3.8;
        const ox = inst.x + Math.cos(a) * orbDist;
        const oy = inst.y + Math.sin(a) * orbDist * 0.78;
        const or = (7.2 - (i % 2) * 1.4) * inv + 2;
        ctx.beginPath();
        ctx.arc(ox, oy, or, 0, Math.PI * 2);
        ctx.fillStyle = i % 3 === 0 ? '#fef08a' : i % 2 === 0 ? inst.color : inst.secondaryColor;
        ctx.fill();
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
      }

      const seal = rc.sprites.kanjiSeal('炎', inst.color);
      const sz = 86 * (0.85 + inv * 0.25);
      ctx.globalAlpha = inv * 0.96;
      ctx.drawImage(seal, inst.x - sz * 0.5, inst.y - 28 - p * 26 - sz * 0.5, sz, sz);
      return true;
    }

    case 'im_wuji_grandmaster': {
      // Giant rotating Yin-Yang Taiji ring + 8 Bagua cyan-gold radial beams + '極' seal
      const r = inst.toRadius * (0.44 + easeOutCubic(p) * 0.54);
      const taijiR = r * 0.44;
      ctx.save();
      ctx.translate(inst.x, inst.y);
      ctx.rotate(p * 3.2);
      ctx.globalAlpha = inv * 0.95;

      // 8 Bagua radial jade-gold qi beams
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI * 2) / 8;
        const inner = taijiR * 1.05;
        const outer = r * (i % 2 === 0 ? 1.06 : 0.88);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
        ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
        ctx.lineCap = 'round';
        ctx.lineWidth = 8 * inv + 1.5;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 4.2 * inv + 1;
        ctx.strokeStyle = i % 2 === 0 ? inst.color : inst.secondaryColor;
        ctx.stroke();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }

      // Yin-Yang Taiji disc
      ctx.beginPath();
      ctx.arc(0, 0, taijiR, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();

      // Dark Yin half + S-curve
      ctx.beginPath();
      ctx.arc(0, 0, taijiR, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.arc(0, taijiR * 0.5, taijiR * 0.5, Math.PI * 0.5, -Math.PI * 0.5, true);
      ctx.arc(0, -taijiR * 0.5, taijiR * 0.5, Math.PI * 0.5, -Math.PI * 0.5, false);
      ctx.closePath();
      ctx.fillStyle = PIXEL_OUTLINE;
      ctx.fill();

      // Twin opposing eyes
      ctx.beginPath();
      ctx.arc(0, -taijiR * 0.5, Math.max(2.5, taijiR * 0.16), 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, taijiR * 0.5, Math.max(2.5, taijiR * 0.16), 0, Math.PI * 2);
      ctx.fillStyle = PIXEL_OUTLINE;
      ctx.fill();

      // Golden outer Taiji rim
      ctx.beginPath();
      ctx.arc(0, 0, taijiR, 0, Math.PI * 2);
      ctx.lineWidth = 3.6;
      ctx.strokeStyle = inst.secondaryColor;
      ctx.stroke();
      ctx.restore();

      const seal = rc.sprites.kanjiSeal('極', inst.color);
      const sz = 86 * (0.85 + inv * 0.25);
      ctx.globalAlpha = inv * 0.96;
      ctx.drawImage(seal, inst.x - sz * 0.5, inst.y - 28 - p * 26 - sz * 0.5, sz, sz);
      return true;
    }

    case 'im_primordial_sword': {
      // 12 Celestial Genesis Swords raining onto impact + golden horizon cleave + '神'
      const r = inst.toRadius * (0.48 + easeOutCubic(p) * 0.56);
      ctx.save();
      ctx.translate(inst.x, inst.y);
      ctx.globalAlpha = inv * 0.96;

      // Blinding golden-cyan horizon cleave
      ctx.beginPath();
      ctx.moveTo(-r * 1.15, -r * 0.22);
      ctx.lineTo(r * 1.15, r * 0.22);
      ctx.lineCap = 'round';
      ctx.lineWidth = 11 * inv + 2;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 6 * inv + 1.5;
      ctx.strokeStyle = inst.color;
      ctx.stroke();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // 12 radial genesis spirit swords
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI * 2) / 12 + p * 2.6;
        const inner = r * 0.34;
        const outer = r * (i % 2 === 0 ? 1.04 : 0.84);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
        ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
        ctx.lineWidth = 6.5 * inv + 1.4;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 3.4 * inv + 1;
        ctx.strokeStyle = i % 2 === 0 ? inst.color : inst.secondaryColor;
        ctx.stroke();
      }
      ctx.restore();

      const seal = rc.sprites.kanjiSeal('神', inst.color);
      const sz = 92 * (0.86 + inv * 0.26);
      ctx.globalAlpha = inv * 0.98;
      ctx.drawImage(seal, inst.x - sz * 0.5, inst.y - 30 - p * 28 - sz * 0.5, sz, sz);
      return true;
    }

    case 'im_chaos_poison': {
      // Swirling emerald-amethyst Chaos Miasma Nebula + 8 venom stars + '混'
      const r = inst.toRadius * (0.46 + easeOutCubic(p) * 0.56);
      ctx.save();
      ctx.translate(inst.x, inst.y);
      ctx.rotate(-p * 4.2);
      ctx.globalAlpha = inv * 0.95;

      for (let arm = 0; arm < 4; arm++) {
        const baseA = (arm * Math.PI) / 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.58 + (arm % 2) * 0.24), baseA, baseA + Math.PI * 0.95);
        ctx.lineCap = 'round';
        ctx.lineWidth = 8 * inv + 2;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 4.4 * inv + 1;
        ctx.strokeStyle = arm % 2 === 0 ? inst.color : inst.secondaryColor;
        ctx.stroke();
      }

      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI * 2) / 8 + p * 3.5;
        const ox = Math.cos(a) * r * 0.78;
        const oy = Math.sin(a) * r * 0.78;
        ctx.beginPath();
        ctx.arc(ox, oy, 6.2 * inv + 2, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 === 0 ? inst.color : inst.secondaryColor;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
      }
      ctx.restore();

      const seal = rc.sprites.kanjiSeal('混', inst.color);
      const sz = 92 * (0.86 + inv * 0.26);
      ctx.globalAlpha = inv * 0.98;
      ctx.drawImage(seal, inst.x - sz * 0.5, inst.y - 30 - p * 28 - sz * 0.5, sz, sz);
      return true;
    }

    case 'im_void_cheonma': {
      // Total Void Eclipse Eye + 10 crimson-gold dimensional lightning rifts + '無'
      const r = inst.toRadius * (0.48 + easeOutCubic(p) * 0.56);
      const coreR = r * 0.42;
      ctx.save();
      ctx.translate(inst.x, inst.y);
      ctx.globalAlpha = inv * 0.96;

      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI * 2) / 10 + p * 1.8;
        const midR = r * 0.7;
        const outR = r * (i % 2 === 0 ? 1.08 : 0.88);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * coreR, Math.sin(a) * coreR);
        ctx.lineTo(Math.cos(a + 0.16) * midR, Math.sin(a + 0.16) * midR);
        ctx.lineTo(Math.cos(a - 0.08) * outR, Math.sin(a - 0.08) * outR);
        ctx.lineCap = 'round';
        ctx.lineWidth = 7 * inv + 1.5;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 3.6 * inv + 1;
        ctx.strokeStyle = i % 2 === 0 ? inst.color : inst.secondaryColor;
        ctx.stroke();
      }

      // Eclipse black-sun core with golden corona rim
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, Math.PI * 2);
      ctx.fillStyle = PIXEL_OUTLINE;
      ctx.fill();
      ctx.lineWidth = 4.2;
      ctx.strokeStyle = inst.secondaryColor;
      ctx.stroke();
      ctx.restore();

      const seal = rc.sprites.kanjiSeal('無', inst.color);
      const sz = 92 * (0.86 + inv * 0.26);
      ctx.globalAlpha = inv * 0.98;
      ctx.drawImage(seal, inst.x - sz * 0.5, inst.y - 30 - p * 28 - sz * 0.5, sz, sz);
      return true;
    }
  }
}
