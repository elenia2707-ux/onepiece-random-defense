import type { VfxTrackKind } from '../../data/types';
import { PIXEL_OUTLINE } from '../../render/ChibiPainter';
import type { WeaponMotionStyle } from '../../render/weaponProfiles';
import {
  easeOutCubic,
  type SkillRenderContext,
  type SkillSpawnContext,
  type TrackVfxInstance,
} from '../types';

export type CommonSkillTrack =
  | 'plum_blossom'
  | 'emperor_thunder'
  | 'golden_palm'
  | 'poison_rain'
  | 'blood_slash'
  | 'demonic_flame'
  | 'heavenly_demon';

export function isCommonSkillTrack(kind: string): kind is CommonSkillTrack {
  return (
    kind === 'plum_blossom' ||
    kind === 'emperor_thunder' ||
    kind === 'golden_palm' ||
    kind === 'poison_rain' ||
    kind === 'blood_slash' ||
    kind === 'demonic_flame' ||
    kind === 'heavenly_demon'
  );
}

/** Keep lower-tier sect VFX crisp & compact (visual radius <= 88px for rank <= 4) so heroes stay legible. */
function clampVisualRadius(radius: number, gradeRank: number): number {
  if (gradeRank <= 2) return Math.min(64, Math.max(36, radius * 0.68));
  if (gradeRank <= 4) return Math.min(88, Math.max(48, radius * 0.72));
  return Math.min(126, radius * 0.82);
}

export function spawnCommonSkillVfx(
  api: SkillSpawnContext,
  track: CommonSkillTrack,
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
  const visR = clampVisualRadius(radius, gradeRank);
  const pScale = gradeRank <= 2 ? 0.55 : gradeRank <= 4 ? 0.72 : 1;

  switch (track) {
    case 'plum_blossom': {
      const plumColor = skinPrimary ?? (gradeRank >= 4 ? '#db2777' : '#f43f5e');
      const petalLight = skinSecondary ?? '#fda4af';
      api.pushTrack({
        kind: 'plum_blossom',
        weaponStyle,
        startTick,
        durationSec: 0.4,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 14,
        toRadius: visR,
        color: plumColor,
        secondaryColor: petalLight,
        lineWidth: gradeRank <= 2 ? 3.5 : 4.2,
        glowRadius: Math.min(62, visR * 0.68),
        gradeRank,
      });
      api.emitRadialBurst(
        x,
        y,
        skinPrimary ?? '#fb7185',
        Math.round(12 * pScale),
        128,
        0.38,
        32,
        startTick,
      );
      api.emitRadialBurst(x, y, petalLight, Math.round(8 * pScale), 88, 0.42, 40, startTick);
      break;
    }

    case 'emperor_thunder': {
      const boltMain = skinPrimary ?? '#0284c7';
      const boltSub = skinSecondary ?? '#7dd3fc';
      api.pushTrack({
        kind: 'emperor_thunder',
        weaponStyle,
        startTick,
        durationSec: 0.4,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 12,
        toRadius: visR,
        color: boltMain,
        secondaryColor: boltSub,
        lineWidth: gradeRank <= 2 ? 3.5 : 4.2,
        glowRadius: Math.min(64, visR * 0.7),
        gradeRank,
      });
      api.emitRadialBurst(
        x,
        y,
        skinPrimary ?? '#38bdf8',
        Math.round(14 * pScale),
        155,
        0.28,
        18,
        startTick,
      );
      break;
    }

    case 'golden_palm': {
      const palmMain = skinPrimary ?? '#d97706';
      const palmSub = skinSecondary ?? '#facc15';
      api.pushTrack({
        kind: 'golden_palm',
        weaponStyle,
        startTick,
        durationSec: 0.42,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 12,
        toRadius: visR,
        color: palmMain,
        secondaryColor: palmSub,
        lineWidth: gradeRank <= 2 ? 3.6 : 4.5,
        glowRadius: Math.min(64, visR * 0.7),
        gradeRank,
      });
      api.emitRadialBurst(
        x,
        y,
        skinPrimary ?? '#f59e0b',
        Math.round(14 * pScale),
        140,
        0.3,
        0,
        startTick,
      );
      break;
    }

    case 'poison_rain': {
      const poisonMain = skinPrimary ?? '#16a34a';
      const poisonSub = skinSecondary ?? '#a855f7';
      api.pushTrack({
        kind: 'poison_rain',
        weaponStyle,
        startTick,
        durationSec: weaponStyle === 'fan' ? 0.48 : 0.42,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 14,
        toRadius: visR,
        color: poisonMain,
        secondaryColor: poisonSub,
        lineWidth: gradeRank <= 2 ? 3.2 : 4,
        glowRadius: Math.min(62, visR * 0.66),
        gradeRank,
      });
      api.emitRadialBurst(
        x,
        y,
        skinPrimary ?? '#22c55e',
        Math.round(12 * pScale),
        125,
        0.32,
        28,
        startTick,
      );
      api.emitRadialBurst(
        x,
        y,
        skinSecondary ?? '#7e22ce',
        Math.round(6 * pScale),
        90,
        0.3,
        18,
        startTick,
      );
      break;
    }

    case 'blood_slash': {
      const slashMain = skinPrimary ?? '#e11d48';
      const slashSub = skinSecondary ?? '#ffe4e6';
      api.pushTrack({
        kind: 'blood_slash',
        weaponStyle,
        startTick,
        durationSec: 0.38,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 14,
        toRadius: visR,
        color: skinPrimary ?? '#be123c',
        secondaryColor: slashSub,
        lineWidth: gradeRank <= 2 ? 3.6 : 4.5,
        glowRadius: Math.min(64, visR * 0.7),
        gradeRank,
      });
      api.emitRadialBurst(x, y, slashMain, Math.round(15 * pScale), 155, 0.3, 0, startTick);
      break;
    }

    case 'demonic_flame': {
      const flameMain = skinPrimary ?? '#dc2626';
      const flameSub = skinSecondary ?? '#a855f7';
      api.pushTrack({
        kind: 'demonic_flame',
        weaponStyle,
        startTick,
        durationSec: 0.44,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 14,
        toRadius: visR,
        color: flameMain,
        secondaryColor: flameSub,
        lineWidth: gradeRank <= 2 ? 3.8 : 4.6,
        glowRadius: Math.min(68, visR * 0.72),
        gradeRank,
      });
      api.emitRadialBurst(x, y, flameMain, Math.round(14 * pScale), 135, 0.34, -85, startTick);
      api.emitRadialBurst(
        x,
        y,
        skinSecondary ?? '#9333ea',
        Math.round(8 * pScale),
        95,
        0.3,
        -95,
        startTick,
      );
      break;
    }

    case 'heavenly_demon': {
      const demonMain = skinPrimary ?? '#be123c';
      const demonSub = skinSecondary ?? '#fde047';
      api.pushTrack({
        kind: 'heavenly_demon',
        weaponStyle,
        startTick,
        durationSec: 0.46,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 16,
        toRadius: visR,
        color: demonMain,
        secondaryColor: demonSub,
        lineWidth: gradeRank <= 2 ? 4 : 5.2,
        glowRadius: Math.min(72, visR * 0.76),
        gradeRank,
      });
      api.emitRadialBurst(
        x,
        y,
        skinPrimary ?? '#e11d48',
        Math.round(16 * pScale),
        175,
        0.36,
        0,
        startTick,
      );
      api.emitRadialBurst(x, y, PIXEL_OUTLINE, Math.round(10 * pScale), 140, 0.32, 0, startTick);
      break;
    }
  }
}

export function renderCommonSkillGround(
  ctx: CanvasRenderingContext2D,
  inst: TrackVfxInstance,
  radius: number,
  inv: number,
): boolean {
  if (!isCommonSkillTrack(inst.kind)) return false;

  if (inst.kind === 'poison_rain') {
    ctx.globalAlpha = inv * 0.2;
    ctx.beginPath();
    ctx.arc(inst.x, inst.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = inst.color;
    ctx.fill();
  } else if (inst.kind === 'heavenly_demon') {
    ctx.globalAlpha = inv * 0.24;
    ctx.beginPath();
    ctx.arc(inst.x, inst.y, radius * 0.84, 0, Math.PI * 2);
    ctx.fillStyle = PIXEL_OUTLINE;
    ctx.fill();
  }

  ctx.globalAlpha = inv * 0.78;
  ctx.beginPath();
  ctx.arc(inst.x, inst.y, radius, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1.8, (inst.lineWidth + 2.6) * inv);
  ctx.strokeStyle = PIXEL_OUTLINE;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(inst.x, inst.y, radius, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1.1, inst.lineWidth * inv);
  ctx.strokeStyle = inst.color;
  ctx.stroke();

  if (inst.kind === 'golden_palm' || inst.kind === 'heavenly_demon') {
    ctx.beginPath();
    ctx.arc(inst.x, inst.y, radius * 0.62, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, inst.lineWidth * 0.65 * inv);
    ctx.strokeStyle = inst.secondaryColor;
    ctx.stroke();
  }
  return true;
}

export function renderCommonSkillAir(
  ctx: CanvasRenderingContext2D,
  inst: TrackVfxInstance,
  rc: SkillRenderContext,
): boolean {
  if (!isCommonSkillTrack(inst.kind)) return false;
  const p = inst.progress;
  const inv = 1 - p;

  switch (inst.kind) {
    case 'plum_blossom': {
      const ang = Math.atan2(inst.y - inst.fromY, inst.x - inst.fromX);
      const arcR = inst.toRadius * (0.45 + easeOutCubic(p) * 0.5);
      ctx.save();
      ctx.translate(inst.x, inst.y);
      ctx.rotate(ang);
      ctx.globalAlpha = inv * 0.92;

      ctx.beginPath();
      ctx.arc(0, 0, arcR, -Math.PI * 0.42, Math.PI * 0.42);
      ctx.quadraticCurveTo(
        arcR * 0.44,
        0,
        Math.cos(-Math.PI * 0.42) * arcR,
        Math.sin(-Math.PI * 0.42) * arcR,
      );
      ctx.fillStyle = inst.color;
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.restore();

      ctx.globalAlpha = inv * 0.9;
      for (let b = 0; b < 5; b++) {
        const ba = (b * Math.PI * 2) / 5 + p * 2.2 + (inst.startTick % 7);
        const br = arcR * (0.35 + p * 0.62);
        const bx = inst.x + Math.cos(ba) * br;
        const by = inst.y + Math.sin(ba) * br;
        ctx.beginPath();
        ctx.arc(bx, by, 4.4 * inv + 1.4, 0, Math.PI * 2);
        ctx.fillStyle = b % 2 === 0 ? inst.color : inst.secondaryColor;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
      }
      return true;
    }

    case 'emperor_thunder': {
      ctx.globalAlpha = inv * 0.92;
      const skyY = inst.y - 165;
      const seed = inst.startTick * 17;
      const traceBolt = (w: number, col: string): void => {
        ctx.beginPath();
        ctx.moveTo(inst.x + ((seed % 17) - 8), skyY);
        const steps = 6;
        for (let s = 1; s < steps; s++) {
          const frac = s / steps;
          const jx = (((seed + s * 31) % 25) - 12) * (1 - frac * 0.4);
          ctx.lineTo(inst.x + jx, skyY + (inst.y - skyY) * frac);
        }
        ctx.lineTo(inst.x, inst.y);
        ctx.lineWidth = w * inv;
        ctx.strokeStyle = col;
        ctx.stroke();
      };
      traceBolt(10, PIXEL_OUTLINE);
      traceBolt(6.5, inst.color);
      traceBolt(3.2, inst.secondaryColor);
      traceBolt(1.6, '#ffffff');

      if (inst.gradeRank >= 4) {
        const seal = rc.sprites.kanjiSeal('雷', inst.color);
        const size = 54 * (0.82 + inv * 0.2);
        ctx.globalAlpha = inv * 0.86;
        ctx.drawImage(seal, inst.x - size * 0.5, inst.y - 22 - p * 18 - size * 0.5, size, size);
      }
      return true;
    }

    case 'golden_palm': {
      const hanja = inst.gradeRank >= 3 ? '龍' : '剛';
      const seal = rc.sprites.kanjiSeal(hanja, inst.color);
      const pop = p < 0.25 ? 0.72 + (p / 0.25) * 0.38 : 1.1 - (p - 0.25) * 0.2;
      const size = (inst.gradeRank >= 3 ? 62 : 52) * pop;
      const liftY = inst.y - 14 - easeOutCubic(p) * 22;
      ctx.globalAlpha = inv * 0.92;
      ctx.drawImage(seal, inst.x - size * 0.5, liftY - size * 0.5, size, size);
      return true;
    }

    case 'poison_rain': {
      ctx.globalAlpha = inv * 0.94;
      if (inst.weaponStyle === 'fan') {
        const openT = easeOutCubic(Math.min(1, p * 2.2));
        const halfSpan = 0.22 + openT * 1.05;
        const fanR = 34 + openT * 15;
        const innerR = 7;
        const fx = inst.x;
        const fy = inst.y - 34 - p * 8;
        const centerA = Math.PI * 0.5;
        const a0 = centerA - halfSpan;
        const a1 = centerA + halfSpan;

        ctx.save();
        ctx.translate(fx, fy);
        ctx.beginPath();
        ctx.arc(0, 0, fanR, a0, a1);
        ctx.arc(0, 0, innerR, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = '#4c1d95';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, 0, fanR * 0.84, a0, a1);
        ctx.arc(0, 0, fanR * 0.44, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = inst.color;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, 0, fanR, a0, a1);
        ctx.arc(0, 0, fanR * 0.84, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = '#facc15';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, 0, fanR, a0, a1);
        ctx.arc(0, 0, innerR, a1, a0, true);
        ctx.closePath();
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();

        for (let rIdx = 0; rIdx < 7; rIdx++) {
          const ra = a0 + ((a1 - a0) * rIdx) / 6;
          ctx.beginPath();
          ctx.moveTo(Math.cos(ra) * 3, Math.sin(ra) * 3);
          ctx.lineTo(Math.cos(ra) * (fanR + 2), Math.sin(ra) * (fanR + 2));
          ctx.lineWidth = 2.4;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();
          ctx.lineWidth = 1.1;
          ctx.strokeStyle = '#fde68a';
          ctx.stroke();
        }
        ctx.restore();
      }

      const seed = inst.startTick * 13;
      const needleCount = inst.weaponStyle === 'fan' ? 12 : 9;
      for (let n = 0; n < needleCount; n++) {
        const spreadX = (((seed + n * 23) % 52) - 26) * (inst.toRadius / 70);
        const spreadY = (((seed + n * 37) % 36) - 18) * (inst.toRadius / 70);
        const fall = (1 - p) * 40;
        const tx = inst.x + spreadX;
        const ty = inst.y + spreadY;
        const sx = tx - (inst.weaponStyle === 'fan' ? spreadX * 0.24 : fall * 0.52);
        const sy = ty - fall;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.lineWidth = 4;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle =
          n % 3 === 0 ? '#ffffff' : n % 2 === 0 ? inst.color : inst.secondaryColor;
        ctx.stroke();
      }
      if (inst.gradeRank >= 3) {
        const seal = rc.sprites.kanjiSeal('毒', inst.color);
        const size = 52 * (0.85 + inv * 0.18);
        ctx.globalAlpha = inv * 0.86;
        ctx.drawImage(seal, inst.x - size * 0.5, inst.y - 16 - p * 16 - size * 0.5, size, size);
      }
      return true;
    }

    case 'blood_slash': {
      const r = inst.toRadius * (0.55 + easeOutCubic(p) * 0.4);
      ctx.globalAlpha = inv * 0.92;
      const drawSlash = (w: number, col: string): void => {
        ctx.beginPath();
        ctx.moveTo(inst.x - r, inst.y - r * 0.52);
        ctx.quadraticCurveTo(inst.x, inst.y - 5, inst.x + r, inst.y + r * 0.52);
        ctx.moveTo(inst.x - r * 0.82, inst.y + r * 0.62);
        ctx.quadraticCurveTo(inst.x, inst.y + 5, inst.x + r * 0.82, inst.y - r * 0.62);
        ctx.lineCap = 'round';
        ctx.lineWidth = w * inv;
        ctx.strokeStyle = col;
        ctx.stroke();
      };
      drawSlash(9.5, PIXEL_OUTLINE);
      drawSlash(5.6, inst.color);
      drawSlash(2.2, inst.secondaryColor);

      if (inst.gradeRank >= 4) {
        const seal = rc.sprites.kanjiSeal('血', inst.color);
        const size = 56 * (0.85 + inv * 0.18);
        ctx.globalAlpha = inv * 0.86;
        ctx.drawImage(seal, inst.x - size * 0.5, inst.y - 20 - p * 18 - size * 0.5, size, size);
      }
      return true;
    }

    case 'demonic_flame': {
      const r = inst.toRadius * (0.35 + p * 0.55);
      ctx.globalAlpha = inv * 0.88;
      ctx.beginPath();
      ctx.arc(inst.x, inst.y, r * 0.48, 0, Math.PI * 2);
      ctx.fillStyle = PIXEL_OUTLINE;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(inst.x, inst.y, r * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = inst.secondaryColor;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(inst.x, inst.y, r, p * 4.4, p * 4.4 + Math.PI * 1.4);
      ctx.lineWidth = 6 * inv;
      ctx.strokeStyle = inst.color;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(inst.x, inst.y, r * 0.8, -p * 3.8, -p * 3.8 + Math.PI * 1.15);
      ctx.lineWidth = 3.8 * inv;
      ctx.strokeStyle = inst.secondaryColor;
      ctx.stroke();

      if (inst.gradeRank >= 4) {
        const seal = rc.sprites.kanjiSeal('魔', inst.secondaryColor);
        const size = 56 * (0.85 + inv * 0.18);
        ctx.globalAlpha = inv * 0.86;
        ctx.drawImage(seal, inst.x - size * 0.5, inst.y - 20 - p * 18 - size * 0.5, size, size);
      }
      return true;
    }

    case 'heavenly_demon': {
      const maxR = inst.toRadius * (0.45 + easeOutCubic(p) * 0.55);
      ctx.globalAlpha = inv * 0.94;
      const traceFractures = (w: number, col: string): void => {
        ctx.beginPath();
        for (let b = 0; b < 6; b++) {
          const ang = (b * Math.PI * 2) / 6 + (inst.startTick % 9) * 0.18;
          const r1 = maxR * 0.46;
          const x1 = inst.x + Math.cos(ang + 0.18) * r1;
          const y1 = inst.y + Math.sin(ang + 0.18) * r1;
          ctx.moveTo(inst.x, inst.y);
          ctx.lineTo(x1, y1);
          ctx.lineTo(
            x1 + Math.cos(ang - 0.24) * (maxR * 0.54),
            y1 + Math.sin(ang - 0.24) * (maxR * 0.54),
          );
        }
        ctx.lineCap = 'round';
        ctx.lineWidth = w * inv;
        ctx.strokeStyle = col;
        ctx.stroke();
      };
      traceFractures(8.2, PIXEL_OUTLINE);
      traceFractures(4.4, inst.color);
      traceFractures(1.6, inst.secondaryColor);

      if (inst.gradeRank >= 4) {
        const seal = rc.sprites.kanjiSeal('天', inst.color);
        const size = 60 * (0.85 + inv * 0.2);
        ctx.globalAlpha = inv * 0.9;
        ctx.drawImage(seal, inst.x - size * 0.5, inst.y - 22 - p * 20 - size * 0.5, size, size);
      }
      return true;
    }
  }
}

export function isCommonTrackKind(track: VfxTrackKind): track is CommonSkillTrack {
  return isCommonSkillTrack(track);
}
