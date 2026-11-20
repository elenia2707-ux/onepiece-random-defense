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

export const RELIC_STANDARD_CAP = 10;
export const RELIC_MAX_LEVEL = 15;

export type RelicCategoryId = 'economy' | 'combat';

export const RELIC_CATEGORY_MAP: Readonly<Record<RelicId, RelicCategoryId>> = {
  golden_vault: 'economy',
  founding_jade_seal: 'economy',
  heavenly_scroll_chest: 'economy',
  bandit_dagger: 'economy',
  immortal_furnace: 'economy',
  merchant_abacus: 'economy',
  jade_training_manual: 'economy',
  phoenix_luck_pouch: 'economy',
  million_sword_seal: 'combat',
  wind_swift_boots: 'combat',
  crimson_crit_blade: 'combat',
  armor_break_gauntlet: 'combat',
  celestial_skill_jade: 'combat',
  demon_slayer_banner: 'combat',
  dragon_range_mirror: 'combat',
  eight_trigram_mirror: 'combat',
};

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
  'jade_training_manual',
  'phoenix_luck_pouch',
  'dragon_range_mirror',
  'eight_trigram_mirror',
];

function splitRelicTier(lv: number): { readonly base: number; readonly over: number } {
  if (lv <= 0) return { base: 0, over: 0 };
  const clamped = Math.min(RELIC_MAX_LEVEL, Math.floor(lv));
  return {
    base: Math.min(RELIC_STANDARD_CAP, clamped),
    over: Math.max(0, clamped - RELIC_STANDARD_CAP),
  };
}

export function getVaultInterestPct(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return 4 + base + Math.ceil(over * 0.6);
}

export function getVaultInterestCap(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return 120 + base * 80 + over * 120;
}

/** Basis points (100 bps = 1.0%) per 100 currently held coin. */
export function getWealthBpsPer100Coin(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return 50 + base * 20 + over * 10;
}

/** Total wealth ATK bonus in basis points (capped at 120 stacks for Lv.1..10, up to 160 stacks at Lv.15). */
export function getWealthBonusBps(lv: number, coin: number): number {
  if (lv <= 0 || coin < 100) return 0;
  const { over } = splitRelicTier(lv);
  const maxStacks = 120 + over * 8;
  const stacks = Math.min(maxStacks, Math.floor(coin / 100));
  return stacks * getWealthBpsPer100Coin(lv);
}

/** Proc threshold out of 1000 on basic (non-skill) hit. */
export function getBanditProcPer1000(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return 65 + base * 15 + over * 8;
}

export function getBanditPilferCoin(lv: number): number {
  if (lv <= 0) return 0;
  if (lv >= 13) return 4;
  return 1 + Math.floor((lv - 1) / 4);
}

export function getFurnaceChanceBonusPct(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return base + Math.ceil(over * 0.6);
}

export function getFurnaceRefundPct(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return 16 + base * 4 + over * 2;
}

export function getJadeSealStartCoin(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return 40 + base * 30 + over * 20;
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
  if (lv >= 12) return 3;
  return lv >= 6 ? 2 : 1;
}

/** 신행백보화: global attack speed bonus (+3%/lv up to Lv.10 = +30%, +2%/lv for Lv.11..15 = +40%). */
export function getSwiftBootsSpeedPct(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return base * 3 + over * 2;
}

/** 혈영회심검: global crit chance bonus in bps (+1.5%/lv to Lv.10 = +15%, +0.8%/lv Lv.11..15 = +19%). */
export function getCritBladeChanceBps(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return base * 150 + over * 80;
}

/** 혈영회심검: global crit damage multiplier bonus (+0.08x/lv to Lv.10 = +0.80x, +0.05x/lv Lv.11..15 = +1.05x). */
export function getCritBladeMultBonus(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return Number((base * 0.08 + over * 0.05).toFixed(2));
}

/** 파갑금강수: global flat armor shred bonus (+3/lv to Lv.10 = +30, +2/lv Lv.11..15 = +40). */
export function getArmorGauntletShred(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return base * 3 + over * 2;
}

/** 태극절기옥: multiplicative martial art skill damage (+4%/lv to Lv.10 = +40%, +2%/lv Lv.11..15 = +50%). */
export function getSkillJadeDamagePct(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return base * 4 + over * 2;
}

/** 토벌패왕기: bonus damage vs Wave Bosses & Active Bounties (+5%/lv to Lv.10 = +50%, +3%/lv Lv.11..15 = +65%). */
export function getSlayerBannerBossPct(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return base * 5 + over * 3;
}

/** 토벌패왕기: bonus silver coin reward on Active Bounty kills (+5%/lv to Lv.10 = +50%, +3%/lv Lv.11..15 = +65%). */
export function getSlayerBannerBountyCoinPct(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return base * 5 + over * 3;
}

/** 만상금주판: flat silver discount on every summon (min summon cost 10; reaches -5 at Lv.13..15). */
export function getAbacusSummonDiscount(lv: number): number {
  if (lv <= 0) return 0;
  if (lv <= 3) return 1;
  if (lv <= 6) return 2;
  if (lv <= 9) return 3;
  if (lv <= 12) return 4;
  return 5;
}

/** 만상금주판: percentage bonus silver coin from slain monsters (+4%/lv to Lv.10 = +40%, +2%/lv Lv.11..15 = +50%). */
export function getAbacusKillCoinPct(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return base * 4 + over * 2;
}

/** 무림비전 수련서: faction upgrade cost discount (-3%/lv to Lv.10 = -30%, -2%/lv Lv.11..15 = -40%). */
export function getTrainingManualCostDiscountPct(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return base * 3 + over * 2;
}

/** 무림비전 수련서: wave-clear base silver coin bonus (+3%/lv to Lv.10 = +30%, +2%/lv Lv.11..15 = +40%). */
export function getTrainingManualWaveCoinPct(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return base * 3 + over * 2;
}

/** 봉황기연낭: bonus starter luck stones at run start (+1..+4 across Lv.1..15). */
export function getLuckPouchStartLuck(lv: number): number {
  if (lv <= 0) return 0;
  if (lv <= 4) return 1;
  if (lv <= 8) return 2;
  if (lv <= 12) return 3;
  return 4;
}

/** 봉황기연낭: percentage bonus silver coin when selling/dismissing heroes (+5%/lv to Lv.10 = +50%, +3%/lv Lv.11..15 = +65%). */
export function getLuckPouchSellCoinPct(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return base * 5 + over * 3;
}

/** 천리안 영경: global flat attack range bonus (+4/lv to Lv.10 = +40, +3/lv Lv.11..15 = +55). */
export function getRangeMirrorRangeBonus(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return base * 4 + over * 3;
}

/** 천리안 영경: global stun & slow CC duration bonus (+4%/lv to Lv.10 = +40%, +2%/lv Lv.11..15 = +50%). */
export function getRangeMirrorCcPct(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return base * 4 + over * 2;
}

/** 팔괘진법경: global final ATK bonus in bps (+2.5%/lv to Lv.10 = +25%, +1.5%/lv Lv.11..15 = +32.5%). */
export function getTrigramMirrorAtkBps(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return base * 250 + over * 150;
}

/** 팔괘진법경: support totem tile aura boost (+5%/lv to Lv.10 = +50%, +3%/lv Lv.11..15 = +65%). */
export function getTrigramMirrorAuraPct(lv: number): number {
  if (lv <= 0) return 0;
  const { base, over } = splitRelicTier(lv);
  return base * 5 + over * 3;
}

export function formatRelicStatSummary(id: RelicId, lv: number): string {
  const effLv = Math.max(1, lv);
  switch (id) {
    case 'golden_vault':
      return `복리 이자 +${getVaultInterestPct(effLv)}% (장당 한도 ${getVaultInterestCap(effLv)})`;
    case 'million_sword_seal': {
      const pctPer100 = (getWealthBpsPer100Coin(effLv) / 100).toFixed(1);
      const { over } = splitRelicTier(effLv);
      const capStr = over > 0 ? ` · 상한 ${(120 + over * 8) * 100}은자` : '';
      return `보유 은자 100당 전 협객 최종공격력 +${pctPer100}%${capStr}`;
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
    case 'jade_training_manual':
      return `내공 수련 비용 -${getTrainingManualCostDiscountPct(effLv)}% · 장 클리어 은자 +${getTrainingManualWaveCoinPct(effLv)}%`;
    case 'phoenix_luck_pouch':
      return `출정 초기 영단 +${getLuckPouchStartLuck(effLv)} · 협객 방출 은자 +${getLuckPouchSellCoinPct(effLv)}%`;
    case 'dragon_range_mirror':
      return `전 협객 사거리 +${getRangeMirrorRangeBonus(effLv)} · 기절·둔화 제어 +${getRangeMirrorCcPct(effLv)}%`;
    case 'eight_trigram_mirror': {
      const atkPct = (getTrigramMirrorAtkBps(effLv) / 100).toFixed(1);
      return `전 협객 최종공격력 +${atkPct}% · 진법 서포터 버프 +${getTrigramMirrorAuraPct(effLv)}%`;
    }
  }
}

export type RelicSetId =
  | 'set_merchant_tycoon'
  | 'set_elixir_fortune'
  | 'set_martial_god'
  | 'set_demon_slayer';

export interface RelicSetDef {
  readonly id: RelicSetId;
  readonly name: string;
  readonly badge: string;
  readonly color: string;
  readonly members: readonly [RelicId, RelicId, RelicId, RelicId];
  readonly tier1Desc: string;
  readonly tier2Desc: string;
  readonly tier3Desc: string;
}

export interface RelicSetStatus {
  readonly def: RelicSetDef;
  readonly ownedCount: number;
  readonly minLevel: number;
  readonly tier: 0 | 1 | 2 | 3;
}

export interface RelicSetBonuses {
  readonly activeSetCount: number;
  readonly mythicSetCount: number;
  readonly interestPct: number;
  readonly interestCap: number;
  readonly killCoinPct: number;
  readonly summonDiscount: number;
  readonly gambleBonusPct: number;
  readonly upgradeDiscountPct: number;
  readonly startLuck: number;
  readonly sellCoinPct: number;
  readonly speedPct: number;
  readonly atkBps: number;
  readonly skillDamagePct: number;
  readonly critMultBonus: number;
  readonly bossDamagePct: number;
  readonly armorShred: number;
  readonly rangeBonus: number;
  readonly ccPct: number;
}

export const RELIC_SETS: readonly RelicSetDef[] = [
  {
    id: 'set_merchant_tycoon',
    name: '거상재벌 세트',
    badge: '재물공명',
    color: '#f59e0b',
    members: ['golden_vault', 'founding_jade_seal', 'merchant_abacus', 'bandit_dagger'],
    tier1Desc: '이자 +2%p · 한도 +80',
    tier2Desc: '이자 +4%p · 한도 +200 · 처치은자 +12%',
    tier3Desc: '이자 +6%p · 한도 +400 · 처치은자 +25% · 소환 -1',
  },
  {
    id: 'set_elixir_fortune',
    name: '기연단전 세트',
    badge: '단전공명',
    color: '#10b981',
    members: ['immortal_furnace', 'heavenly_scroll_chest', 'jade_training_manual', 'phoenix_luck_pouch'],
    tier1Desc: '영약 +4%p · 수련비 -5%',
    tier2Desc: '영약 +8%p · 수련비 -10% · 초기영단 +1',
    tier3Desc: '영약 +12%p · 수련비 -15% · 초기영단 +2 · 방출 +20%',
  },
  {
    id: 'set_martial_god',
    name: '절세무신 세트',
    badge: '무신공명',
    color: '#ef4444',
    members: ['wind_swift_boots', 'crimson_crit_blade', 'celestial_skill_jade', 'eight_trigram_mirror'],
    tier1Desc: '공속 +6% · 최종공 +6%',
    tier2Desc: '공속 +12% · 최종공 +14% · 절기 +12%',
    tier3Desc: '공속 +18% · 최종공 +24% · 절기 +22% · 치명 +0.25x',
  },
  {
    id: 'set_demon_slayer',
    name: '천마토벌 세트',
    badge: '토벌공명',
    color: '#a855f7',
    members: ['million_sword_seal', 'armor_break_gauntlet', 'demon_slayer_banner', 'dragon_range_mirror'],
    tier1Desc: '보스피해 +10% · 파갑 +6',
    tier2Desc: '보스피해 +22% · 파갑 +14 · 사거리 +15',
    tier3Desc: '보스피해 +38% · 파갑 +24 · 사거리 +30 · 제어 +18%',
  },
];

export function computeRelicSetStatuses(
  relics: Readonly<Partial<Record<RelicId, number>>>,
): readonly RelicSetStatus[] {
  return RELIC_SETS.map((def) => {
    let ownedCount = 0;
    let minLevel = RELIC_MAX_LEVEL;
    for (let i = 0; i < def.members.length; i++) {
      const lv = Math.max(0, Math.floor(relics[def.members[i]!] ?? 0));
      if (lv > 0) ownedCount++;
      if (lv < minLevel) minLevel = lv;
    }
    const tier: 0 | 1 | 2 | 3 =
      ownedCount < 4 ? 0 : minLevel >= RELIC_MAX_LEVEL ? 3 : minLevel >= RELIC_STANDARD_CAP ? 2 : 1;
    return { def, ownedCount, minLevel, tier };
  });
}

export function computeRelicSetBonuses(
  relics: Readonly<Partial<Record<RelicId, number>>>,
): RelicSetBonuses {
  const statuses = computeRelicSetStatuses(relics);
  let activeSetCount = 0;
  let mythicSetCount = 0;
  let interestPct = 0;
  let interestCap = 0;
  let killCoinPct = 0;
  let summonDiscount = 0;
  let gambleBonusPct = 0;
  let upgradeDiscountPct = 0;
  let startLuck = 0;
  let sellCoinPct = 0;
  let speedPct = 0;
  let atkBps = 0;
  let skillDamagePct = 0;
  let critMultBonus = 0;
  let bossDamagePct = 0;
  let armorShred = 0;
  let rangeBonus = 0;
  let ccPct = 0;

  for (let i = 0; i < statuses.length; i++) {
    const st = statuses[i]!;
    if (st.tier <= 0) continue;
    activeSetCount++;
    if (st.tier >= 3) mythicSetCount++;

    switch (st.def.id) {
      case 'set_merchant_tycoon':
        interestPct += st.tier === 3 ? 6 : st.tier === 2 ? 4 : 2;
        interestCap += st.tier === 3 ? 400 : st.tier === 2 ? 200 : 80;
        killCoinPct += st.tier === 3 ? 25 : st.tier === 2 ? 12 : 0;
        summonDiscount += st.tier === 3 ? 1 : 0;
        break;
      case 'set_elixir_fortune':
        gambleBonusPct += st.tier === 3 ? 12 : st.tier === 2 ? 8 : 4;
        upgradeDiscountPct += st.tier === 3 ? 15 : st.tier === 2 ? 10 : 5;
        startLuck += st.tier === 3 ? 2 : st.tier === 2 ? 1 : 0;
        sellCoinPct += st.tier === 3 ? 20 : 0;
        break;
      case 'set_martial_god':
        speedPct += st.tier === 3 ? 18 : st.tier === 2 ? 12 : 6;
        atkBps += st.tier === 3 ? 2400 : st.tier === 2 ? 1400 : 600;
        skillDamagePct += st.tier === 3 ? 22 : st.tier === 2 ? 12 : 0;
        critMultBonus += st.tier === 3 ? 0.25 : 0;
        break;
      case 'set_demon_slayer':
        bossDamagePct += st.tier === 3 ? 38 : st.tier === 2 ? 22 : 10;
        armorShred += st.tier === 3 ? 24 : st.tier === 2 ? 14 : 6;
        rangeBonus += st.tier === 3 ? 30 : st.tier === 2 ? 15 : 0;
        ccPct += st.tier === 3 ? 18 : 0;
        break;
    }
  }

  return {
    activeSetCount,
    mythicSetCount,
    interestPct,
    interestCap,
    killCoinPct,
    summonDiscount,
    gambleBonusPct,
    upgradeDiscountPct,
    startLuck,
    sellCoinPct,
    speedPct,
    atkBps,
    skillDamagePct,
    critMultBonus,
    bossDamagePct,
    armorShred,
    rangeBonus,
    ccPct,
  };
}

export interface CodexMilestoneDef {
  readonly target: number;
  readonly name: string;
  readonly rewardGold: number;
  readonly rewardKeys: number;
  readonly rewardSilk: number;
  readonly atkBonusPct: number;
}

export const CODEX_MILESTONES: readonly CodexMilestoneDef[] = [
  { target: 10, name: '초출명숙 (10인)', rewardGold: 150, rewardKeys: 1, rewardSilk: 0, atkBonusPct: 2 },
  { target: 20, name: '강호박식 (20인)', rewardGold: 300, rewardKeys: 2, rewardSilk: 15, atkBonusPct: 4 },
  { target: 30, name: '무림명감 (30인)', rewardGold: 500, rewardKeys: 3, rewardSilk: 30, atkBonusPct: 5 },
  { target: 44, name: '천하대도감 (44인)', rewardGold: 1200, rewardKeys: 6, rewardSilk: 80, atkBonusPct: 9 },
];

export const CODEX_MILESTONES_BY_TARGET: ReadonlyMap<number, CodexMilestoneDef> = new Map(
  CODEX_MILESTONES.map((m) => [m.target, m]),
);

export function computeCodexAtkBonusPct(claimedTargets: ReadonlySet<number> | readonly number[]): number {
  const set = claimedTargets instanceof Set ? claimedTargets : new Set(claimedTargets);
  let total = 0;
  for (let i = 0; i < CODEX_MILESTONES.length; i++) {
    const ms = CODEX_MILESTONES[i]!;
    if (set.has(ms.target)) {
      total += ms.atkBonusPct;
    }
  }
  return total;
}

