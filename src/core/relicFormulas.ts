import type { RelicId } from '../data/types';

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
