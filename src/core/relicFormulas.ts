import type { DifficultyId, RelicId, TrialId } from '../data/types';

export const CLEAR_TARGET_WAVE = 30;

export interface DifficultyConfig {
  readonly id: DifficultyId;
  readonly name: string;
  readonly badge: string;
  readonly desc: string;
  readonly hpMult: number;
  readonly speedMult: number;
  readonly rewardMult: number;
  readonly firstClearGold: number;
  readonly firstClearKeys: number;
}

export const DIFFICULTY_ORDER: readonly DifficultyId[] = ['normal', 'hard', 'hell'];

export const DIFFICULTY_CONFIGS: Readonly<Record<DifficultyId, DifficultyConfig>> = {
  normal: {
    id: 'normal',
    name: '강호 초입',
    badge: '초입 1.0x',
    desc: '표준 무림 전장 · 제30장 마신 토벌 시 『무림 고수』 해금',
    hpMult: 1.0,
    speedMult: 1.0,
    rewardMult: 1.0,
    firstClearGold: 250,
    firstClearKeys: 2,
  },
  hard: {
    id: 'hard',
    name: '무림 고수',
    badge: '고수 1.6x',
    desc: '마물 체력 1.65배 · 이속 증가 · 정산 천하주화 1.6배 보상',
    hpMult: 1.65,
    speedMult: 1.06,
    rewardMult: 1.6,
    firstClearGold: 450,
    firstClearKeys: 3,
  },
  hell: {
    id: 'hell',
    name: '아수라 혈겁',
    badge: '혈겁 2.5x',
    desc: '마물 체력 2.65배 · 보스 강인함 상승 · 정산 천하주화 2.5배 대보상',
    hpMult: 2.65,
    speedMult: 1.12,
    rewardMult: 2.5,
    firstClearGold: 800,
    firstClearKeys: 5,
  },
};

export interface TrialConfig {
  readonly id: TrialId;
  readonly name: string;
  readonly badge: string;
  readonly ruleTag: string;
  readonly desc: string;
  readonly targetWave: number;
  readonly hpMult: number;
  readonly speedMult: number;
  readonly bonusMonsterArmor: number;
  readonly bossCooldownMult: number;
  readonly disableInterest: boolean;
  readonly orthodoxCritMultBonus: number;
  readonly unorthodoxSpeedMult: number;
  readonly unorthodoxBonusShred: number;
  readonly demonicSkillRatioMult: number;
  readonly gambleBonusPct: number;
  readonly trinityAtkBonusPct: number;
  readonly rewardMult: number;
  readonly firstClearGold: number;
  readonly firstClearKeys: number;
  readonly firstClearSilk: number;
}

export const TRIAL_ORDER: readonly TrialId[] = [
  'trial_venom_gale',
  'trial_sword_tomb',
  'trial_crimson_iron',
  'trial_chaos_trinity',
];

export const TRIAL_CONFIGS: Readonly<Record<TrialId, TrialConfig>> = {
  trial_venom_gale: {
    id: 'trial_venom_gale',
    name: '만독비경 · 암기폭우',
    badge: '🧪 만독비경',
    ruleTag: '사파 공속+45%·파갑+12 / 적 이속+18%',
    desc: '사파 협객 공격속도 +45% & 기본 파갑 +12! 대신 마물 이동속도 +18% · 제15장 속공 제패',
    targetWave: 15,
    hpMult: 1.45,
    speedMult: 1.18,
    bonusMonsterArmor: 0,
    bossCooldownMult: 1.0,
    disableInterest: false,
    orthodoxCritMultBonus: 0,
    unorthodoxSpeedMult: 1.45,
    unorthodoxBonusShred: 12,
    demonicSkillRatioMult: 1.0,
    gambleBonusPct: 0,
    trinityAtkBonusPct: 0,
    rewardMult: 1.65,
    firstClearGold: 450,
    firstClearKeys: 3,
    firstClearSilk: 60,
  },
  trial_sword_tomb: {
    id: 'trial_sword_tomb',
    name: '검총비경 · 만검쟁명',
    badge: '⚔ 검총비경',
    ruleTag: '정파 치명피해+90% / 금고 이자 봉인',
    desc: '정파 협객 치명타 배율 +0.90x 폭증! 대신 매 장 복리 이자(0%) 완전 봉인 · 제15장 속공 제패',
    targetWave: 15,
    hpMult: 1.55,
    speedMult: 1.05,
    bonusMonsterArmor: 0,
    bossCooldownMult: 1.0,
    disableInterest: true,
    orthodoxCritMultBonus: 0.9,
    unorthodoxSpeedMult: 1.0,
    unorthodoxBonusShred: 0,
    demonicSkillRatioMult: 1.0,
    gambleBonusPct: 0,
    trinityAtkBonusPct: 0,
    rewardMult: 1.75,
    firstClearGold: 500,
    firstClearKeys: 3,
    firstClearSilk: 70,
  },
  trial_crimson_iron: {
    id: 'trial_crimson_iron',
    name: '철혈비경 · 금강불괴',
    badge: '🔥 철혈비경',
    ruleTag: '마교 절기+55%·영약+15% / 적 강기+28',
    desc: '마교 절기 피해 +55% & 영약 성공률 +15%! 대신 마물 호신강기 +28 & 체력 1.6배 · 제15장 속공 제패',
    targetWave: 15,
    hpMult: 1.6,
    speedMult: 1.0,
    bonusMonsterArmor: 28,
    bossCooldownMult: 1.0,
    disableInterest: false,
    orthodoxCritMultBonus: 0,
    unorthodoxSpeedMult: 1.0,
    unorthodoxBonusShred: 0,
    demonicSkillRatioMult: 1.55,
    gambleBonusPct: 15,
    trinityAtkBonusPct: 0,
    rewardMult: 1.85,
    firstClearGold: 550,
    firstClearKeys: 4,
    firstClearSilk: 80,
  },
  trial_chaos_trinity: {
    id: 'trial_chaos_trinity',
    name: '삼재비경 · 정사마 대혈전',
    badge: '☯ 삼재비경',
    ruleTag: '삼재합진 최종공+100% / 체력2.1x·보스가속',
    desc: '삼재합진(정2·사2·마2) 발동 시 전 협객 공격력 +100%! 대신 적 체력 2.1배 & 보스 권능 가속 · 제30장 제패',
    targetWave: 30,
    hpMult: 2.1,
    speedMult: 1.08,
    bonusMonsterArmor: 10,
    bossCooldownMult: 0.75,
    disableInterest: false,
    orthodoxCritMultBonus: 0,
    unorthodoxSpeedMult: 1.0,
    unorthodoxBonusShred: 0,
    demonicSkillRatioMult: 1.0,
    gambleBonusPct: 0,
    trinityAtkBonusPct: 100,
    rewardMult: 2.35,
    firstClearGold: 900,
    firstClearKeys: 5,
    firstClearSilk: 120,
  },
};

export interface SellRefundSpec {
  readonly guaranteedLuck: number;
  readonly chancePct: number;
}

export function getUnitSellLuckRefund(gradeRank: number): SellRefundSpec {
  if (gradeRank >= 6) return { guaranteedLuck: 7, chancePct: 0 };
  if (gradeRank === 5) return { guaranteedLuck: 4, chancePct: 0 };
  if (gradeRank === 4) return { guaranteedLuck: 2, chancePct: 0 };
  if (gradeRank === 3) return { guaranteedLuck: 1, chancePct: 0 };
  if (gradeRank === 2) return { guaranteedLuck: 0, chancePct: 35 };
  return { guaranteedLuck: 0, chancePct: 0 };
}

export function formatCompactNumber(val: number): string {
  const n = Math.max(0, Math.round(val));
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M`;
  }
  if (n >= 10_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return n.toLocaleString('ko-KR');
}

export const RELIC_IDS_ORDERED: readonly RelicId[] = [
  'golden_vault',
  'million_sword_seal',
  'bandit_dagger',
  'immortal_furnace',
  'founding_jade_seal',
  'heavenly_scroll_chest',
];

export function getVaultInterestPct(lv: number): number {
  return lv > 0 ? 4 + lv : 0;
}

export function getVaultInterestCap(lv: number): number {
  return lv > 0 ? 120 + lv * 80 : 0;
}

/** Basis points (100 bps = 1.0%) per 100 currently held coin. */
export function getWealthBpsPer100Coin(lv: number): number {
  return lv > 0 ? 50 + lv * 20 : 0;
}

/** Total wealth ATK bonus in basis points (capped at 120 stacks = 12,000 coin). */
export function getWealthBonusBps(lv: number, coin: number): number {
  if (lv <= 0 || coin < 100) return 0;
  const stacks = Math.min(120, Math.floor(coin / 100));
  return stacks * getWealthBpsPer100Coin(lv);
}

/** Proc threshold out of 1000 on basic (non-skill) hit. */
export function getBanditProcPer1000(lv: number): number {
  return lv > 0 ? 65 + lv * 15 : 0;
}

export function getBanditPilferCoin(lv: number): number {
  return lv > 0 ? 1 + Math.floor((lv - 1) / 4) : 0;
}

export function getFurnaceChanceBonusPct(lv: number): number {
  return lv > 0 ? lv : 0;
}

export function getFurnaceRefundPct(lv: number): number {
  return lv > 0 ? 16 + lv * 4 : 0;
}

export function getJadeSealStartCoin(lv: number): number {
  return lv > 0 ? 40 + lv * 30 : 0;
}

export function getScrollChestStartWisps(lv: number): {
  readonly common: number;
  readonly uncommon: number;
} {
  if (lv <= 0) return { common: 0, uncommon: 0 };
  return {
    common: lv >= 8 ? 2 : 1,
    uncommon: lv >= 4 ? 1 : 0,
  };
}

export function getScrollChestBossLuckBonus(lv: number): number {
  if (lv <= 0) return 0;
  return lv >= 6 ? 2 : 1;
}

export function formatRelicStatSummary(id: RelicId, lv: number): string {
  const effLv = Math.max(1, lv);
  switch (id) {
    case 'golden_vault':
      return `복리 이자 +${getVaultInterestPct(effLv)}% (장당 한도 ${getVaultInterestCap(effLv)})`;
    case 'million_sword_seal': {
      const pctPer100 = (getWealthBpsPer100Coin(effLv) / 100).toFixed(1);
      return `보유 은자 100당 전 협객 최종공격력 +${pctPer100}%`;
    }
    case 'bandit_dagger': {
      const procPct = (getBanditProcPer1000(effLv) / 10).toFixed(1);
      return `평타 적중 시 ${procPct}% 확률로 은자 +${getBanditPilferCoin(effLv)} 강탈`;
    }
    case 'immortal_furnace':
      return `환골탈태 성공률 +${getFurnaceChanceBonusPct(effLv)}% · 실패 시 ${getFurnaceRefundPct(effLv)}% 영단 환급`;
    case 'founding_jade_seal':
      return `출정 초기 군자금 +${getJadeSealStartCoin(effLv)} 은자`;
    case 'heavenly_scroll_chest': {
      const w = getScrollChestStartWisps(effLv);
      const wispTxt =
        w.uncommon > 0 ? `삼류+${w.common}·이류+${w.uncommon}` : `삼류 기연 +${w.common}`;
      return `초기 ${wispTxt} · 영물 토벌 영단 +${getScrollChestBossLuckBonus(effLv)}`;
    }
  }
}
