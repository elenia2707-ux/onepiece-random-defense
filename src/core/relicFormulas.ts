import { loadGameData } from '../data/loader';
import type {
  DifficultyConfig,
  DifficultyId,
  GradeDef,
  RelicId,
  TitleDef,
  TitleId,
  TrialConfig,
  TrialId,
} from '../data/types';

export type { DifficultyConfig, TitleDef, TrialConfig };

export const CLEAR_TARGET_WAVE = 30;

const DATA = loadGameData();

export const DIFFICULTY_ORDER: readonly DifficultyId[] = DATA.difficulties.map((d) => d.id);

export const DIFFICULTY_CONFIGS: Readonly<Record<DifficultyId, DifficultyConfig>> =
  Object.fromEntries(DATA.difficulties.map((d) => [d.id, d])) as unknown as Readonly<
    Record<DifficultyId, DifficultyConfig>
  >;

export const TRIAL_ORDER: readonly TrialId[] = DATA.trials.map((t) => t.id);

export const TRIAL_CONFIGS: Readonly<Record<TrialId, TrialConfig>> = Object.fromEntries(
  DATA.trials.map((t) => [t.id, t]),
) as unknown as Readonly<Record<TrialId, TrialConfig>>;

export const TITLE_DEFS: readonly TitleDef[] = DATA.titles;

export const TITLES_BY_ID: ReadonlyMap<TitleId, TitleDef> = DATA.titlesById;

export interface SellRefundSpec {
  readonly guaranteedLuck: number;
  readonly chancePct: number;
}

export function getUnitSellLuckRefund(gradeDef: GradeDef | undefined): SellRefundSpec {
  if (!gradeDef) {
    return { guaranteedLuck: 0, chancePct: 0 };
  }
  return {
    guaranteedLuck: gradeDef.sellLuckGuaranteed,
    chancePct: gradeDef.sellLuckChancePct,
  };
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
  'wind_swift_boots',
  'crimson_crit_blade',
  'armor_break_gauntlet',
  'celestial_skill_jade',
  'demon_slayer_banner',
  'merchant_abacus',
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

export function getScrollChestGradeBonusCount(lv: number, grade: GradeDef): number {
  if (lv <= 0 || grade.scrollChestUnlockLv <= 0 || lv < grade.scrollChestUnlockLv) {
    return 0;
  }
  let count = 1;
  if (grade.scrollChestBonusLv > 0 && lv >= grade.scrollChestBonusLv) {
    count += 1;
  }
  return count;
}

export function getScrollChestBossLuckBonus(lv: number): number {
  if (lv <= 0) return 0;
  return lv >= 6 ? 2 : 1;
}

/** 신행백보화: global attack speed bonus percentage (+3% per level, max +30%). */
export function getSwiftBootsSpeedPct(lv: number): number {
  return lv > 0 ? lv * 3 : 0;
}

/** 혈영회심검: global crit chance bonus in basis points (150 bps = +1.5% per level, max +15%). */
export function getCritBladeChanceBps(lv: number): number {
  return lv > 0 ? lv * 150 : 0;
}

/** 혈영회심검: global crit damage multiplier bonus (+0.08x per level, max +0.80x). */
export function getCritBladeMultBonus(lv: number): number {
  return lv > 0 ? Number((lv * 0.08).toFixed(2)) : 0;
}

/** 파갑금강수: global flat armor shred bonus (+3 per level, max +30). */
export function getArmorGauntletShred(lv: number): number {
  return lv > 0 ? lv * 3 : 0;
}

/** 태극절기옥: multiplicative martial art skill damage bonus (+4% per level, max +40%). */
export function getSkillJadeDamagePct(lv: number): number {
  return lv > 0 ? lv * 4 : 0;
}

/** 토벌패왕기: bonus damage vs Wave Bosses & Active Bounties (+5% per level, max +50%). */
export function getSlayerBannerBossPct(lv: number): number {
  return lv > 0 ? lv * 5 : 0;
}

/** 토벌패왕기: bonus silver coin reward on Active Bounty kills (+5% per level, max +50%). */
export function getSlayerBannerBountyCoinPct(lv: number): number {
  return lv > 0 ? lv * 5 : 0;
}

/** 만상금주판: flat silver discount on every summon (min summon cost 10). */
export function getAbacusSummonDiscount(lv: number): number {
  if (lv <= 0) return 0;
  if (lv <= 3) return 1;
  if (lv <= 6) return 2;
  if (lv <= 9) return 3;
  return 4;
}

/** 만상금주판: percentage bonus silver coin from slain monsters (+4% per level, max +40%). */
export function getAbacusKillCoinPct(lv: number): number {
  return lv > 0 ? lv * 4 : 0;
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
      const wispParts: string[] = [];
      for (const g of DATA.grades) {
        const cnt = getScrollChestGradeBonusCount(effLv, g);
        if (cnt > 0) {
          wispParts.push(`${g.name}+${cnt}`);
        }
      }
      const wispTxt = wispParts.length > 0 ? wispParts.join('·') : '기연+1';
      return `초기 ${wispTxt} · 영물 토벌 영단 +${getScrollChestBossLuckBonus(effLv)}`;
    }
    case 'wind_swift_boots':
      return `모든 출전 협객 공격 속도 +${getSwiftBootsSpeedPct(effLv)}%`;
    case 'crimson_crit_blade': {
      const critPct = (getCritBladeChanceBps(effLv) / 100).toFixed(1);
      const critMult = getCritBladeMultBonus(effLv).toFixed(2);
      return `전 협객 치명타율 +${critPct}% · 치명타 배율 +${critMult}x`;
    }
    case 'armor_break_gauntlet':
      return `모든 출전 협객 기본 파갑 +${getArmorGauntletShred(effLv)}`;
    case 'celestial_skill_jade':
      return `모든 협객 절기(스킬) 최종 피해 +${getSkillJadeDamagePct(effLv)}%`;
    case 'demon_slayer_banner':
      return `보스·현상수배 피해 +${getSlayerBannerBossPct(effLv)}% · 현상수배 은자 +${getSlayerBannerBountyCoinPct(effLv)}%`;
    case 'merchant_abacus':
      return `소환 비용 -${getAbacusSummonDiscount(effLv)} 은자 할인 · 처치 은자 +${getAbacusKillCoinPct(effLv)}%`;
  }
}
