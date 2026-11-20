import type { FactionId, GradeId, MonsterKind, WaveDef } from './types';

export type RunModeId = 'standard' | 'daily_challenge' | 'boss_rush';

export type DailyRuleId =
  | 'daily_demonic_surge'
  | 'daily_orthodox_honor'
  | 'daily_unorthodox_ambush'
  | 'daily_ascetic_vow'
  | 'daily_gale_blood'
  | 'daily_bench_mastery'
  | 'daily_elixir_feast';

export interface DailyRuleModifiers {
  readonly factionAtkMult?: Readonly<Partial<Record<FactionId, number>>>;
  readonly factionSpeedMult?: Readonly<Partial<Record<FactionId, number>>>;
  readonly orthodoxCritMultBonus?: number;
  readonly monsterHpMult?: number;
  readonly bossHpMult?: number;
  readonly monsterSpeedMult?: number;
  readonly bonusBossArmor?: number;
  readonly killCoinPctBonus?: number;
  readonly startCoinBonus?: number;
  readonly startLuckBonus?: number;
  readonly interestPctBonus?: number;
  readonly interestCapBonus?: number;
  readonly disableBoonReroll?: boolean;
  readonly benchPassiveMult?: number;
  readonly gambleBonusPct?: number;
  readonly bossKillBonusLuck?: number;
}

export interface DailyRuleDef {
  readonly id: DailyRuleId;
  readonly name: string;
  readonly badge: string;
  readonly desc: string;
  readonly modifiers: DailyRuleModifiers;
}

export interface DailyChallengeSpec {
  readonly dateKey: string;
  readonly seed: number;
  readonly seedCode: string;
  readonly targetWave: number;
  readonly rule: DailyRuleDef;
}

export const DAILY_CHALLENGE_TARGET_WAVE = 20;

export const DAILY_RULES: readonly DailyRuleDef[] = [
  {
    id: 'daily_demonic_surge',
    name: '천마 강림일',
    badge: '마교 강화',
    desc: '마교 공격력 +35% · 정파 공격력 -18% · 영물 보스 체력 +15%',
    modifiers: {
      factionAtkMult: { demonic: 1.35, orthodox: 0.82 },
      bossHpMult: 1.15,
    },
  },
  {
    id: 'daily_orthodox_honor',
    name: '정파 대무회',
    badge: '정파 극치명',
    desc: '정파 치명피해 +0.55x · 사파 공속 -15% · 보스 격파 시 영단 +3',
    modifiers: {
      orthodoxCritMultBonus: 0.55,
      factionSpeedMult: { unorthodox: 0.85 },
      bossKillBonusLuck: 3,
    },
  },
  {
    id: 'daily_unorthodox_ambush',
    name: '사파 야습일',
    badge: '사파 속공',
    desc: '사파 공격속도 +30% · 처치 은자 +25% · 마교 공격력 -15%',
    modifiers: {
      factionSpeedMult: { unorthodox: 1.3 },
      factionAtkMult: { demonic: 0.85 },
      killCoinPctBonus: 25,
    },
  },
  {
    id: 'daily_ascetic_vow',
    name: '청빈의 도',
    badge: '리롤 금지',
    desc: '기연 다시 뽑기 금지 · 매 장 복리 이자 +5%p · 이자 상한 +150은자',
    modifiers: {
      disableBoonReroll: true,
      interestPctBonus: 5,
      interestCapBonus: 150,
    },
  },
  {
    id: 'daily_gale_blood',
    name: '질풍혈전',
    badge: '고속 돌파',
    desc: '마물 이동속도 +18% · 시작 은자 +80 · 모든 처치 은자 +35%',
    modifiers: {
      monsterSpeedMult: 1.18,
      startCoinBonus: 80,
      killCoinPctBonus: 35,
    },
  },
  {
    id: 'daily_bench_mastery',
    name: '대기진법의 달인',
    badge: '대기진 2배',
    desc: '대기석 진법 패시브 효과 2배 증폭 · 영물 보스 호신강기 +18',
    modifiers: {
      benchPassiveMult: 2,
      bonusBossArmor: 18,
    },
  },
  {
    id: 'daily_elixir_feast',
    name: '신선 영약제',
    badge: '영약 대길',
    desc: '영약 성공률 +15%p · 시작 영단 +5 · 마물 체력 +20%',
    modifiers: {
      gambleBonusPct: 15,
      startLuckBonus: 5,
      monsterHpMult: 1.2,
    },
  },
];

function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0 || 0x20261119;
}

export function getDailyChallengeSpec(dateKey: string): DailyChallengeSpec {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : '2026-11-19';
  const seed = fnv1a32(`murim-daily-seed:${safeDate}`);
  const ruleIdx = fnv1a32(`murim-daily-rule:${safeDate}`) % DAILY_RULES.length;
  const rule = DAILY_RULES[ruleIdx]!;
  const seedCode = `#${seed.toString(36).toUpperCase().slice(0, 6).padStart(6, '0')}`;
  return {
    dateKey: safeDate,
    seed,
    seedCode,
    targetWave: DAILY_CHALLENGE_TARGET_WAVE,
    rule,
  };
}

export function computeDailyChallengeScore(
  wave: number,
  bossesSlain: number,
  victory: boolean,
  elapsedTicks: number,
): number {
  const base = Math.max(0, wave) * 1000 + Math.max(0, bossesSlain) * 350;
  const speedBonus = victory ? Math.max(0, 6000 - Math.floor(Math.max(0, elapsedTicks) / 5)) : 0;
  return base + speedBonus;
}

export interface BossRushStageDef {
  readonly stage: number;
  readonly bossName: string;
  readonly monsterKind: MonsterKind;
  readonly monsterHp: number;
  readonly armorBonus: number;
  readonly durationSec: number;
  readonly rewardCoin: number;
  readonly rewardLuck: number;
  readonly rewardWispGrade: GradeId;
  readonly offersBoon: boolean;
}

export const BOSS_RUSH_STAGES: readonly BossRushStageDef[] = [
  {
    stage: 1,
    bossName: '제1관문 · 호산 백호 선봉',
    monsterKind: 'white_tiger',
    monsterHp: 9500,
    armorBonus: 8,
    durationSec: 45,
    rewardCoin: 220,
    rewardLuck: 3,
    rewardWispGrade: 'uncommon',
    offersBoon: true,
  },
  {
    stage: 2,
    bossName: '제2관문 · 만년 독사왕',
    monsterKind: 'black_serpent',
    monsterHp: 21000,
    armorBonus: 16,
    durationSec: 48,
    rewardCoin: 260,
    rewardLuck: 3,
    rewardWispGrade: 'uncommon',
    offersBoon: false,
  },
  {
    stage: 3,
    bossName: '제3관문 · 혈교 대호법',
    monsterKind: 'blood_patriarch',
    monsterHp: 46000,
    armorBonus: 24,
    durationSec: 50,
    rewardCoin: 310,
    rewardLuck: 3,
    rewardWispGrade: 'rare',
    offersBoon: true,
  },
  {
    stage: 4,
    bossName: '제4관문 · 광풍 백호군주',
    monsterKind: 'white_tiger',
    monsterHp: 98000,
    armorBonus: 32,
    durationSec: 52,
    rewardCoin: 360,
    rewardLuck: 4,
    rewardWispGrade: 'rare',
    offersBoon: false,
  },
  {
    stage: 5,
    bossName: '제5관문 · 구천 현무신수',
    monsterKind: 'black_serpent',
    monsterHp: 210000,
    armorBonus: 42,
    durationSec: 55,
    rewardCoin: 420,
    rewardLuck: 4,
    rewardWispGrade: 'rare',
    offersBoon: true,
  },
  {
    stage: 6,
    bossName: '제6관문 · 혈옥 대마두',
    monsterKind: 'blood_patriarch',
    monsterHp: 430000,
    armorBonus: 52,
    durationSec: 55,
    rewardCoin: 480,
    rewardLuck: 4,
    rewardWispGrade: 'epic',
    offersBoon: false,
  },
  {
    stage: 7,
    bossName: '제7관문 · 태고 백호황',
    monsterKind: 'white_tiger',
    monsterHp: 850000,
    armorBonus: 62,
    durationSec: 58,
    rewardCoin: 560,
    rewardLuck: 5,
    rewardWispGrade: 'epic',
    offersBoon: true,
  },
  {
    stage: 8,
    bossName: '제8관문 · 심연 만독현무',
    monsterKind: 'black_serpent',
    monsterHp: 1650000,
    armorBonus: 72,
    durationSec: 60,
    rewardCoin: 650,
    rewardLuck: 5,
    rewardWispGrade: 'epic',
    offersBoon: false,
  },
  {
    stage: 9,
    bossName: '제9관문 · 적월 혈마교주',
    monsterKind: 'blood_patriarch',
    monsterHp: 3100000,
    armorBonus: 84,
    durationSec: 62,
    rewardCoin: 750,
    rewardLuck: 6,
    rewardWispGrade: 'epic',
    offersBoon: true,
  },
  {
    stage: 10,
    bossName: '최종관문 · 천마신군 극(極)',
    monsterKind: 'blood_patriarch',
    monsterHp: 5800000,
    armorBonus: 96,
    durationSec: 70,
    rewardCoin: 1000,
    rewardLuck: 8,
    rewardWispGrade: 'epic',
    offersBoon: false,
  },
];

export const BOSS_RUSH_TARGET_STAGE = BOSS_RUSH_STAGES.length;

export function resolveBossRushWaveDef(stage: number): WaveDef {
  const clamped = Math.max(1, Math.floor(stage));
  if (clamped <= BOSS_RUSH_STAGES.length) {
    const def = BOSS_RUSH_STAGES[clamped - 1]!;
    return {
      wave: clamped,
      durationTicks: def.durationSec * 30,
      spawnCount: 1,
      spawnIntervalTicks: 60,
      monsterHp: def.monsterHp,
      monsterSpeedPerTick: clamped >= 7 ? 2.15 : 1.95,
      monsterRadius: 24,
      rewardCoin: def.rewardCoin,
      monsterKind: def.monsterKind,
      isBoss: true,
      bossName: def.bossName,
      rewardWispGrade: def.rewardWispGrade,
    };
  }
  // Endless Boss Rush (stage 11+)
  const extra = clamped - BOSS_RUSH_STAGES.length;
  const last = BOSS_RUSH_STAGES[BOSS_RUSH_STAGES.length - 1]!;
  const kinds: readonly MonsterKind[] = ['white_tiger', 'black_serpent', 'blood_patriarch'];
  return {
    wave: clamped,
    durationTicks: 65 * 30,
    spawnCount: 1,
    spawnIntervalTicks: 60,
    monsterHp: Math.round(last.monsterHp * Math.pow(1.65, extra)),
    monsterSpeedPerTick: 2.25,
    monsterRadius: 25,
    rewardCoin: 900 + extra * 120,
    monsterKind: kinds[(clamped - 1) % kinds.length]!,
    isBoss: true,
    bossName: `무한 보스 러시 제 ${clamped} 관문`,
    rewardWispGrade: 'epic',
  };
}

export interface EndlessMilestoneDef {
  readonly wave: number;
  readonly label: string;
  readonly rewardGold: number;
  readonly rewardKeys: number;
  readonly rewardSilk: number;
  readonly inRunCoin: number;
  readonly inRunLuck: number;
}

export const ENDLESS_MILESTONES: readonly EndlessMilestoneDef[] = [
  { wave: 40, label: '무한 40장 · 강호 전설', rewardGold: 200, rewardKeys: 1, rewardSilk: 20, inRunCoin: 350, inRunLuck: 4 },
  { wave: 50, label: '무한 50장 · 절세 패왕', rewardGold: 350, rewardKeys: 2, rewardSilk: 35, inRunCoin: 450, inRunLuck: 5 },
  { wave: 60, label: '무한 60장 · 천하무적', rewardGold: 500, rewardKeys: 3, rewardSilk: 50, inRunCoin: 600, inRunLuck: 6 },
  { wave: 70, label: '무한 70장 · 무림지존', rewardGold: 700, rewardKeys: 4, rewardSilk: 70, inRunCoin: 750, inRunLuck: 7 },
  { wave: 80, label: '무한 80장 · 등선경', rewardGold: 1000, rewardKeys: 5, rewardSilk: 100, inRunCoin: 950, inRunLuck: 8 },
  { wave: 100, label: '무한 100장 · 태극신화', rewardGold: 1800, rewardKeys: 8, rewardSilk: 180, inRunCoin: 1500, inRunLuck: 12 },
];

export const ENDLESS_MILESTONES_BY_WAVE: ReadonlyMap<number, EndlessMilestoneDef> = new Map(
  ENDLESS_MILESTONES.map((m) => [m.wave, m]),
);
