import type { UnitId } from './types';

export type ComboSkillId =
  | 'combo_orthodox_masters'
  | 'combo_unorthodox_duo'
  | 'combo_demonic_duo'
  | 'combo_taegeuk_sword'
  | 'combo_demon_blood'
  | 'combo_venom_hellfire'
  | 'combo_thunder_sword';

export interface ComboSkillDef {
  readonly id: ComboSkillId;
  readonly name: string;
  readonly desc: string;
  readonly requiredUnits: readonly [UnitId, UnitId];
  readonly cooldownTicks: number;
  readonly atkMult: number;
  readonly radius: number;
  readonly armorShred: number;
  readonly stunSec: number;
  readonly slowPct: number;
  readonly slowSec: number;
  readonly bossBonusPct: number;
  readonly color: string;
  readonly tierLabel: string;
}

export const COMBO_SKILLS: readonly ComboSkillDef[] = [
  {
    id: 'combo_orthodox_masters',
    name: '정파 쌍절 검진',
    desc: '검성 + 무림맹주 동시 출진 · 22초마다 정파 합일 검기로 광역 피해 및 둔화',
    requiredUnits: ['sword_saint', 'murim_lord'],
    cooldownTicks: 660,
    atkMult: 2.1,
    radius: 215,
    armorShred: 18,
    stunSec: 0.65,
    slowPct: 0.45,
    slowSec: 2.8,
    bossBonusPct: 14,
    color: '#38bdf8',
    tierLabel: '화경 합체',
  },
  {
    id: 'combo_unorthodox_duo',
    name: '사파 혈독 쌍살',
    desc: '광마 + 만독혈룡 동시 출진 · 22초마다 혈풍 독안개로 광역 파갑 및 극감속',
    requiredUnits: ['mad_demon', 'poison_dragon'],
    cooldownTicks: 660,
    atkMult: 2.15,
    radius: 215,
    armorShred: 28,
    stunSec: 0.55,
    slowPct: 0.52,
    slowSec: 3.0,
    bossBonusPct: 14,
    color: '#22c55e',
    tierLabel: '화경 합체',
  },
  {
    id: 'combo_demonic_duo',
    name: '마교 흑염 쌍마',
    desc: '소천마 + 명혼마후 동시 출진 · 22초마다 흑염 유혼폭풍으로 보스 특효 광역 참격',
    requiredUnits: ['heavenly_demon_heir', 'nether_blade_queen'],
    cooldownTicks: 660,
    atkMult: 2.2,
    radius: 220,
    armorShred: 26,
    stunSec: 0.65,
    slowPct: 0.42,
    slowSec: 2.6,
    bossBonusPct: 18,
    color: '#f43f5e',
    tierLabel: '화경 합체',
  },
  {
    id: 'combo_taegeuk_sword',
    name: '태극만검 합일진',
    desc: '태상검선 + 태극무극선 동시 출진 · 22초마다 팔괘 선검진이 전장을 관통·기절',
    requiredUnits: ['sword_immortal', 'wuji_grandmaster'],
    cooldownTicks: 660,
    atkMult: 2.25,
    radius: 245,
    armorShred: 28,
    stunSec: 0.9,
    slowPct: 0.5,
    slowSec: 2.8,
    bossBonusPct: 18,
    color: '#0ea5e9',
    tierLabel: '현경 연환',
  },
  {
    id: 'combo_demon_blood',
    name: '천마 혈해 멸세참',
    desc: '절대천마 + 혈해수라왕 동시 출진 · 22초마다 공간파쇄 혈겁 참격 (보스 +20%)',
    requiredUnits: ['cheonma', 'asura_emperor'],
    cooldownTicks: 660,
    atkMult: 2.35,
    radius: 245,
    armorShred: 30,
    stunSec: 0.8,
    slowPct: 0.48,
    slowSec: 2.6,
    bossBonusPct: 20,
    color: '#e11d48',
    tierLabel: '현경 연환',
  },
  {
    id: 'combo_venom_hellfire',
    name: '만독 구천 업화진',
    desc: '만독신군 + 구천염황 동시 출진 · 24초마다 독염 홍련 폭발로 파갑 36·극감속',
    requiredUnits: ['thousand_venom_lord', 'hell_flame_sovereign'],
    cooldownTicks: 720,
    atkMult: 2.15,
    radius: 255,
    armorShred: 36,
    stunSec: 0.75,
    slowPct: 0.6,
    slowSec: 3.2,
    bossBonusPct: 16,
    color: '#a855f7',
    tierLabel: '현경 연환',
  },
  {
    id: 'combo_thunder_sword',
    name: '구천 벽력 신검진',
    desc: '남궁뇌제 + 태상검선 동시 출진 · 22초마다 신뢰 검옥 낙하 및 1.1초 광역 기절',
    requiredUnits: ['thunder_emperor', 'sword_immortal'],
    cooldownTicks: 660,
    atkMult: 2.15,
    radius: 240,
    armorShred: 24,
    stunSec: 1.1,
    slowPct: 0.52,
    slowSec: 2.8,
    bossBonusPct: 16,
    color: '#facc15',
    tierLabel: '현경 연환',
  },
];

export const COMBO_SKILLS_BY_ID: ReadonlyMap<ComboSkillId, ComboSkillDef> = new Map(
  COMBO_SKILLS.map((c) => [c.id, c]),
);
