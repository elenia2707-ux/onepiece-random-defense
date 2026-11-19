import { PIXEL_OUTLINE } from '../../render/ChibiPainter';
import { hexWithAlpha } from '../../render/SpriteCache';
import type { WeaponMotionStyle } from '../../render/weaponProfiles';
import {
  easeOutCubic,
  type SkillRenderContext,
  type SkillSpawnContext,
  type TrackVfxInstance,
} from '../types';

export type TranscendentSkillTrack =
  | 'tx_sword_saint'
  | 'tx_murim_lord'
  | 'tx_mad_demon'
  | 'tx_poison_dragon'
  | 'tx_demon_heir'
  | 'tx_nether_queen'
  | 'tx_ice_empress'
  | 'tx_blood_sovereign';

export function isTranscendentSkillTrack(kind: string): kind is TranscendentSkillTrack {
  return (
    kind === 'tx_sword_saint' ||
    kind === 'tx_murim_lord' ||
    kind === 'tx_mad_demon' ||
    kind === 'tx_poison_dragon' ||
    kind === 'tx_demon_heir' ||
    kind === 'tx_nether_queen' ||
    kind === 'tx_ice_empress' ||
    kind === 'tx_blood_sovereign'
  );
}

export function spawnTranscendentSkillVfx(
  api: SkillSpawnContext,
  track: TranscendentSkillTrack,
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
  const visR = Math.min(122, Math.max(84, radius * 0.68));

  switch (track) {
    case 'tx_sword_saint': {
      // 만검귀종 · 매화절검: 6 converging floating spirit swords + cyan-rose petals
      const c1 = skinPrimary ?? '#38bdf8';
      const c2 = skinSecondary ?? '#f472b6';
      api.pushTrack({
        kind: track,
        weaponStyle,
        startTick,
        durationSec: 0.56,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 18,
        toRadius: visR,
        color: c1,
        secondaryColor: c2,
        lineWidth: 5,
        glowRadius: 86,
        gradeRank,
      });
      api.emitRadialBurst(x, y, c1, 16, 165, 0.38, 12, startTick);
      api.emitRadialBurst(x, y, c2, 12, 120, 0.44, 34, startTick);
      break;
    }

    case 'tx_murim_lord': {
      // 제왕검형 · 천하호령: golden dragon pillar + twin royal thunderbolts
      const c1 = skinPrimary ?? '#eab308';
      const c2 = skinSecondary ?? '#38bdf8';
      api.pushTrack({
        kind: track,
        weaponStyle,
        startTick,
        durationSec: 0.58,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 18,
        toRadius: visR,
        color: c1,
        secondaryColor: c2,
        lineWidth: 5.5,
        glowRadius: 92,
        gradeRank,
      });
      api.emitRadialBurst(x, y, c1, 18, 175, 0.36, -30, startTick);
      api.emitRadialBurst(x, y, c2, 12, 155, 0.34, 0, startTick);
      break;
    }

    case 'tx_mad_demon': {
      // 광마난무 · 적혈천하: triple feral crimson claw rends + golden-blood blast
      const c1 = skinPrimary ?? '#e11d48';
      const c2 = skinSecondary ?? '#fde047';
      api.pushTrack({
        kind: track,
        weaponStyle,
        startTick,
        durationSec: 0.52,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 20,
        toRadius: visR,
        color: c1,
        secondaryColor: c2,
        lineWidth: 5.8,
        glowRadius: 90,
        gradeRank,
      });
      api.emitRadialBurst(x, y, c1, 20, 195, 0.36, 0, startTick);
      api.emitRadialBurst(x, y, c2, 10, 145, 0.32, 0, startTick);
      break;
    }

    case 'tx_poison_dragon': {
      // 만독혈사편 · 독룡출해: coiling emerald-violet dragon whip spiral + fangs
      const c1 = skinPrimary ?? '#22c55e';
      const c2 = skinSecondary ?? '#a855f7';
      api.pushTrack({
        kind: track,
        weaponStyle,
        startTick,
        durationSec: 0.58,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 18,
        toRadius: visR,
        color: c1,
        secondaryColor: c2,
        lineWidth: 5.2,
        glowRadius: 88,
        gradeRank,
      });
      api.emitRadialBurst(x, y, c1, 16, 150, 0.4, 24, startTick);
      api.emitRadialBurst(x, y, c2, 12, 120, 0.38, 16, startTick);
      break;
    }

    case 'tx_demon_heir': {
      // 천마흑도 · 단혼참: diagonal abyssal-violet spatial tear + twin dark arcs
      const c1 = skinPrimary ?? '#9333ea';
      const c2 = skinSecondary ?? '#fb7185';
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
        lineWidth: 5.8,
        glowRadius: 92,
        gradeRank,
      });
      api.emitRadialBurst(x, y, c1, 18, 185, 0.38, 0, startTick);
      api.emitRadialBurst(x, y, c2, 12, 145, 0.34, 0, startTick);
      break;
    }

    case 'tx_nether_queen': {
      // 명혼만화 · 유혼마진: rotating obsidian-magenta phantom lotus + 6 orbiting soul wisps
      const c1 = skinPrimary ?? '#a855f7';
      const c2 = skinSecondary ?? '#fb7185';
      api.pushTrack({
        kind: track,
        weaponStyle,
        startTick,
        durationSec: 0.6,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 18,
        toRadius: visR,
        color: c1,
        secondaryColor: c2,
        lineWidth: 5.2,
        glowRadius: 92,
        gradeRank,
      });
      api.emitRadialBurst(x, y, c1, 16, 148, 0.42, -55, startTick);
      api.emitRadialBurst(x, y, c2, 12, 118, 0.4, -70, startTick);
      break;
    }

    case 'tx_ice_empress': {
      // 북해만년빙결: 6-petal frost lotus crystal bloom + glacial mist shards
      const c1 = skinPrimary ?? '#38bdf8';
      const c2 = skinSecondary ?? '#e0f2fe';
      api.pushTrack({
        kind: track,
        weaponStyle: 'fan',
        startTick,
        durationSec: 0.6,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 18,
        toRadius: visR,
        color: c1,
        secondaryColor: c2,
        lineWidth: 5.4,
        glowRadius: 94,
        gradeRank,
      });
      api.emitRadialBurst(x, y, c1, 18, 162, 0.4, 24, startTick);
      api.emitRadialBurst(x, y, c2, 14, 132, 0.42, 10, startTick);
      break;
    }

    case 'tx_blood_sovereign': {
      // 혈영천참 · 귀왕강림: massive X-shaped crimson phantom cross-slash + blood shadow bursts
      const c1 = skinPrimary ?? '#e11d48';
      const c2 = skinSecondary ?? '#fda4af';
      api.pushTrack({
        kind: track,
        weaponStyle: 'dual_sword',
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
        lineWidth: 5.8,
        glowRadius: 92,
        gradeRank,
      });
      api.emitRadialBurst(x, y, c1, 20, 195, 0.38, 0, startTick);
      api.emitRadialBurst(x, y, PIXEL_OUTLINE, 10, 150, 0.36, 0, startTick);
      break;
    }
  }
}

export function renderTranscendentSkillGround(
  ctx: CanvasRenderingContext2D,
  inst: TrackVfxInstance,
  radius: number,
  inv: number,
): boolean {
  if (!isTranscendentSkillTrack(inst.kind)) return false;

  ctx.globalAlpha = inv * 0.22;
  ctx.beginPath();
  ctx.arc(inst.x, inst.y, radius * 0.88, 0, Math.PI * 2);
  ctx.fillStyle =
    inst.kind === 'tx_demon_heir' || inst.kind === 'tx_nether_queen' ? PIXEL_OUTLINE : inst.color;
  ctx.fill();

  // Crisp outer & inner Daoist rune rings
  ctx.globalAlpha = inv * 0.88;
  ctx.beginPath();
  ctx.arc(inst.x, inst.y, radius, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, (inst.lineWidth + 3) * inv);
  ctx.strokeStyle = PIXEL_OUTLINE;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(inst.x, inst.y, radius, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1.4, inst.lineWidth * inv);
  ctx.strokeStyle = inst.color;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(inst.x, inst.y, radius * 0.64, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1.2, 2.8 * inv);
  ctx.strokeStyle = inst.secondaryColor;
  ctx.stroke();
  return true;
}

export function renderTranscendentSkillAir(
  ctx: CanvasRenderingContext2D,
  inst: TrackVfxInstance,
  rc: SkillRenderContext,
): boolean {
  if (!isTranscendentSkillTrack(inst.kind)) return false;
  const p = inst.progress;
  const inv = 1 - p;

  switch (inst.kind) {
    case 'tx_sword_saint': {
      // 6 floating spirit blades orbiting & plunging inward + pink-cyan petals + '劍' seal
      const rOuter = inst.toRadius * (1.05 - easeOutCubic(p) * 0.55);
      ctx.globalAlpha = inv * 0.96;
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI * 2) / 6 + p * 1.45;
        const bx = inst.x + Math.cos(ang) * rOuter;
        const by = inst.y + Math.sin(ang) * rOuter;
        const tipX = inst.x + Math.cos(ang) * Math.max(8, rOuter - 38);
        const tipY = inst.y + Math.sin(ang) * Math.max(8, rOuter - 38);

        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(tipX, tipY);
        ctx.lineCap = 'round';
        ctx.lineWidth = 7.5 * inv + 1.5;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 4 * inv + 1;
        ctx.strokeStyle = i % 2 === 0 ? inst.color : inst.secondaryColor;
        ctx.stroke();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      const seal = rc.sprites.kanjiSeal('劍', inst.color);
      const sz = 72 * (0.85 + inv * 0.2);
      ctx.globalAlpha = inv * 0.94;
      ctx.drawImage(seal, inst.x - sz * 0.5, inst.y - 22 - p * 22 - sz * 0.5, sz, sz);
      return true;
    }

    case 'tx_murim_lord': {
      // Golden imperial dragon pillar + twin cyan-gold thunderbolts + '覇' seal
      const colW = Math.max(6, 22 * inv);
      const colH = 160 * easeOutCubic(Math.min(1, p * 2.4));
      ctx.globalAlpha = inv * 0.85;
      ctx.fillStyle = PIXEL_OUTLINE;
      ctx.fillRect(inst.x - colW - 2, inst.y - colH, colW * 2 + 4, colH + 8);
      ctx.fillStyle = inst.color;
      ctx.fillRect(inst.x - colW, inst.y - colH, colW * 2, colH + 6);
      ctx.fillStyle = '#fffbeb';
      ctx.fillRect(inst.x - colW * 0.35, inst.y - colH, colW * 0.7, colH + 4);

      // Twin flanking lightning bolts
      ctx.globalAlpha = inv * 0.96;
      for (const side of [-1, 1]) {
        const ox = inst.x + side * 36;
        const skyY = inst.y - 175;
        ctx.beginPath();
        ctx.moveTo(ox + side * 12, skyY);
        ctx.lineTo(ox - side * 10, skyY + 60);
        ctx.lineTo(ox + side * 14, skyY + 120);
        ctx.lineTo(inst.x + side * 14, inst.y);
        ctx.lineWidth = 7.5 * inv;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 4 * inv;
        ctx.strokeStyle = inst.secondaryColor;
        ctx.stroke();
        ctx.lineWidth = 1.8 * inv;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      const seal = rc.sprites.kanjiSeal('覇', inst.color);
      const sz = 74 * (0.85 + inv * 0.22);
      ctx.globalAlpha = inv * 0.94;
      ctx.drawImage(seal, inst.x - sz * 0.5, inst.y - 26 - p * 22 - sz * 0.5, sz, sz);
      return true;
    }

    case 'tx_mad_demon': {
      // Triple feral crimson claw rends + blood-gold shockwave + '狂' seal
      const r = inst.toRadius * (0.52 + easeOutCubic(p) * 0.45);
      const baseAng = Math.atan2(inst.y - inst.fromY, inst.x - inst.fromX);
      ctx.save();
      ctx.translate(inst.x, inst.y);
      ctx.rotate(baseAng - 0.32);
      ctx.globalAlpha = inv * 0.98;
      for (let k = -1; k <= 1; k++) {
        const oy = k * 19;
        const len = r * (k === 0 ? 1.08 : 0.88);
        const drawClaw = (w: number, col: string): void => {
          ctx.beginPath();
          ctx.moveTo(-len, oy - 12);
          ctx.quadraticCurveTo(0, oy + 10, len, oy - 6);
          ctx.lineCap = 'round';
          ctx.lineWidth = w * inv;
          ctx.strokeStyle = col;
          ctx.stroke();
        };
        drawClaw(11, PIXEL_OUTLINE);
        drawClaw(6.2, inst.color);
        drawClaw(2.4, k === 0 ? '#ffffff' : inst.secondaryColor);
      }
      ctx.restore();

      const seal = rc.sprites.kanjiSeal('狂', inst.color);
      const sz = 74 * (0.86 + inv * 0.2);
      ctx.globalAlpha = inv * 0.94;
      ctx.drawImage(seal, inst.x - sz * 0.5, inst.y - 24 - p * 22 - sz * 0.5, sz, sz);
      return true;
    }

    case 'tx_poison_dragon': {
      // Coiling emerald-violet dragon whip spiral + twin fangs + '龍' seal
      const r = inst.toRadius * (0.36 + easeOutCubic(p) * 0.62);
      ctx.globalAlpha = inv * 0.95;
      const drawSpiral = (w: number, col: string, phaseOff: number): void => {
        ctx.beginPath();
        const segs = 22;
        for (let s = 0; s <= segs; s++) {
          const t = s / segs;
          const a = t * Math.PI * 3.4 + p * 4.5 + phaseOff;
          const sr = r * (0.18 + t * 0.82);
          const sx = inst.x + Math.cos(a) * sr;
          const sy = inst.y + Math.sin(a) * sr * 0.72;
          if (s === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.lineCap = 'round';
        ctx.lineWidth = w * inv;
        ctx.strokeStyle = col;
        ctx.stroke();
      };
      drawSpiral(9.5, PIXEL_OUTLINE, 0);
      drawSpiral(5.5, inst.color, 0);
      drawSpiral(3.2, inst.secondaryColor, Math.PI);

      const seal = rc.sprites.kanjiSeal('龍', inst.color);
      const sz = 72 * (0.85 + inv * 0.2);
      ctx.globalAlpha = inv * 0.94;
      ctx.drawImage(seal, inst.x - sz * 0.5, inst.y - 24 - p * 22 - sz * 0.5, sz, sz);
      return true;
    }

    case 'tx_demon_heir': {
      // Diagonal abyssal-violet spatial tear + twin dark crescent waves + '魔' seal
      const r = inst.toRadius * (0.5 + easeOutCubic(p) * 0.52);
      const ang = -0.62;
      ctx.save();
      ctx.translate(inst.x, inst.y);
      ctx.rotate(ang);
      ctx.globalAlpha = inv * 0.98;

      // Central dimensional fissure diamond
      const tearW = Math.max(3, 18 * inv);
      ctx.beginPath();
      ctx.moveTo(-r * 1.12, 0);
      ctx.lineTo(0, -tearW);
      ctx.lineTo(r * 1.12, 0);
      ctx.lineTo(0, tearW);
      ctx.closePath();
      ctx.fillStyle = PIXEL_OUTLINE;
      ctx.fill();
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = inst.color;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-r * 0.86, 0);
      ctx.lineTo(r * 0.86, 0);
      ctx.lineWidth = Math.max(1.5, 4 * inv);
      ctx.strokeStyle = inst.secondaryColor;
      ctx.stroke();

      // Twin opposing energy arcs
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(0, dir * 18 * p, r * 0.72, dir > 0 ? 0.2 : Math.PI + 0.2, dir > 0 ? Math.PI - 0.2 : Math.PI * 2 - 0.2);
        ctx.lineWidth = 6 * inv;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 3.2 * inv;
        ctx.strokeStyle = inst.color;
        ctx.stroke();
      }
      ctx.restore();

      const seal = rc.sprites.kanjiSeal('魔', inst.color);
      const sz = 74 * (0.85 + inv * 0.22);
      ctx.globalAlpha = inv * 0.94;
      ctx.drawImage(seal, inst.x - sz * 0.5, inst.y - 24 - p * 22 - sz * 0.5, sz, sz);
      return true;
    }

    case 'tx_nether_queen': {
      // Rotating obsidian-magenta phantom lotus (6 petals) + 6 soul wisps + '魂' seal
      const r = inst.toRadius * (0.42 + easeOutCubic(p) * 0.54);
      ctx.save();
      ctx.translate(inst.x, inst.y);
      ctx.rotate(p * 2.2);
      ctx.globalAlpha = inv * 0.92;
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI * 2) / 6;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(r * 0.48, 0, r * 0.42, r * 0.16, 0, 0, Math.PI * 2);
        ctx.fillStyle = hexWithAlpha(i % 2 === 0 ? inst.color : inst.secondaryColor, 0.52);
        ctx.fill();
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.restore();

        // Orbiting soul wisp bead
        const wx = Math.cos(a + 0.52) * r * 0.88;
        const wy = Math.sin(a + 0.52) * r * 0.88;
        ctx.beginPath();
        ctx.arc(wx, wy, 5.6 * inv + 1.8, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 === 0 ? '#fdf4ff' : inst.secondaryColor;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
      }
      ctx.restore();

      const seal = rc.sprites.kanjiSeal('魂', inst.color);
      const sz = 74 * (0.85 + inv * 0.22);
      ctx.globalAlpha = inv * 0.95;
      ctx.drawImage(seal, inst.x - sz * 0.5, inst.y - 24 - p * 22 - sz * 0.5, sz, sz);
      return true;
    }

    case 'tx_ice_empress': {
      // 6-petal glacial crystal lotus + radiating ice spears + '氷' seal
      const r = inst.toRadius * (0.4 + easeOutCubic(p) * 0.58);
      ctx.save();
      ctx.translate(inst.x, inst.y);
      ctx.rotate(-p * 1.4);
      ctx.globalAlpha = inv * 0.96;
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI * 2) / 6;
        ctx.save();
        ctx.rotate(a);
        // Sharp diamond frost crystal petal
        ctx.beginPath();
        ctx.moveTo(r * 0.14, 0);
        ctx.lineTo(r * 0.54, -r * 0.16);
        ctx.lineTo(r * 0.96, 0);
        ctx.lineTo(r * 0.54, r * 0.16);
        ctx.closePath();
        ctx.fillStyle = hexWithAlpha(i % 2 === 0 ? inst.color : inst.secondaryColor, 0.58);
        ctx.fill();
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();

        // Crisp glacial midrib glint
        ctx.beginPath();
        ctx.moveTo(r * 0.22, 0);
        ctx.lineTo(r * 0.88, 0);
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      const seal = rc.sprites.kanjiSeal('氷', inst.color);
      const sz = 74 * (0.85 + inv * 0.22);
      ctx.globalAlpha = inv * 0.95;
      ctx.drawImage(seal, inst.x - sz * 0.5, inst.y - 24 - p * 22 - sz * 0.5, sz, sz);
      return true;
    }

    case 'tx_blood_sovereign': {
      // Colossal X-shaped crimson phantom cross-slash + obsidian shadow edges + '血' seal
      const r = inst.toRadius * (0.5 + easeOutCubic(p) * 0.52);
      ctx.save();
      ctx.translate(inst.x, inst.y);
      ctx.globalAlpha = inv * 0.98;
      for (const ang of [0.72, -0.72]) {
        ctx.save();
        ctx.rotate(ang);
        const drawSlash = (w: number, col: string): void => {
          ctx.beginPath();
          ctx.moveTo(-r * 1.12, -10 * inv);
          ctx.quadraticCurveTo(0, 14 * inv, r * 1.12, -6 * inv);
          ctx.lineCap = 'round';
          ctx.lineWidth = w * inv;
          ctx.strokeStyle = col;
          ctx.stroke();
        };
        drawSlash(13, PIXEL_OUTLINE);
        drawSlash(7.4, inst.color);
        drawSlash(2.8, inst.secondaryColor);
        ctx.restore();
      }
      // Central blood-moon eclipse burst
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(4, 24 * (1 - p * 0.5)), 0, Math.PI * 2);
      ctx.fillStyle = PIXEL_OUTLINE;
      ctx.fill();
      ctx.lineWidth = 3.2 * inv;
      ctx.strokeStyle = inst.color;
      ctx.stroke();
      ctx.restore();

      const seal = rc.sprites.kanjiSeal('血', inst.color);
      const sz = 74 * (0.85 + inv * 0.22);
      ctx.globalAlpha = inv * 0.95;
      ctx.drawImage(seal, inst.x - sz * 0.5, inst.y - 24 - p * 22 - sz * 0.5, sz, sz);
      return true;
    }
  }
}
