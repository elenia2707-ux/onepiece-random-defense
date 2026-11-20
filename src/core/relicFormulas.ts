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
  { target: 47, name: '태고삼신록 (47인)', rewardGold: 800, rewardKeys: 4, rewardSilk: 60, atkBonusPct: 5 },
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

// =========================================================
// v3.0 Post-Max Endgame Sinks: Mythic Relic Engraving & 강호 경지 단련
// =========================================================
export const RELIC_ENGRAVE_GOLD_COST = 600;
export const RELIC_ENGRAVE_SILK_COST = 40;
export const RELIC_ENGRAVE_ATK_PCT_EACH = 2;
export const RELIC_ENGRAVE_SKILL_PCT_EACH = 2;

export type MasteryId = 'atk' | 'econ' | 'crit' | 'boss';

export const MASTERY_MAX_LEVEL = 20;

export interface MasteryDef {
  readonly id: MasteryId;
  readonly name: string;
  readonly badge: string;
  readonly color: string;
  readonly descPerLv: string;
}

export const MASTERY_DEFS: readonly MasteryDef[] = [
  {
    id: 'atk',
    name: '무극 내공 단련',
    badge: '공격',
    color: '#ef4444',
    descPerLv: 'Lv당 전 협객 공격력 +1.5%',
  },
  {
    id: 'econ',
    name: '만금 상단 수련',
    badge: '경제',
    color: '#f59e0b',
    descPerLv: 'Lv당 처치 은자 +2% · 시작 은자 +5',
  },
  {
    id: 'crit',
    name: '파천 회심 수련',
    badge: '치명',
    color: '#a855f7',
    descPerLv: 'Lv당 치명타율 +0.5%p · 치명피해 +0.04x',
  },
  {
    id: 'boss',
    name: '영물 토벌 비결',
    badge: '토벌',
    color: '#0ea5e9',
    descPerLv: 'Lv당 영물·수배범 피해 +2.5%',
  },
];

export const MASTERY_ORDER: readonly MasteryId[] = ['atk', 'econ', 'crit', 'boss'];

export type MasteryLevels = Readonly<Record<MasteryId, number>>;

export type MeridianId =
  | 'ren'
  | 'du'
  | 'chong'
  | 'dai'
  | 'yangqiao'
  | 'yinqiao'
  | 'yangwei'
  | 'yinwei';

export const MERIDIAN_MAX_LEVEL = 5;

export interface MeridianDef {
  readonly id: MeridianId;
  readonly name: string;
  readonly acupointTitle: string;
  readonly badge: string;
  readonly color: string;
  readonly descPerLv: string;
  readonly maxSummary: string;
}

export const MERIDIAN_DEFS: readonly MeridianDef[] = [
  {
    id: 'ren',
    name: '임맥 · 단전원기',
    acupointTitle: '기해혈(氣海穴)',
    badge: '임맥',
    color: '#f59e0b',
    descPerLv: 'Lv당 시작 은자 +8 · 처치 은자 +2%',
    maxSummary: '극의: 시작 +40은자 · 처치 +10%',
  },
  {
    id: 'du',
    name: '독맥 · 파천강기',
    acupointTitle: '백회혈(百會穴)',
    badge: '독맥',
    color: '#ef4444',
    descPerLv: 'Lv당 전 협객 공격력 +2%',
    maxSummary: '극의: 전 협객 공격력 +10%',
  },
  {
    id: 'chong',
    name: '충맥 · 질풍혈도',
    acupointTitle: '혈해혈(血海穴)',
    badge: '충맥',
    color: '#10b981',
    descPerLv: 'Lv당 전 협객 공격속도 +2.5%',
    maxSummary: '극의: 전 협객 공속 +12.5%',
  },
  {
    id: 'dai',
    name: '대맥 · 천기절예',
    acupointTitle: '대맥혈(帶脈穴)',
    badge: '대맥',
    color: '#8b5cf6',
    descPerLv: 'Lv당 절기(스킬) 피해 +4%',
    maxSummary: '극의: 절기 피해 +20%',
  },
  {
    id: 'yangqiao',
    name: '양교맥 · 회심안',
    acupointTitle: '신맥혈(申脈穴)',
    badge: '양교',
    color: '#e11d48',
    descPerLv: 'Lv당 치명타율 +1.0% · 치명피해 +5%',
    maxSummary: '극의: 치명 +5.0% · 치명피해 +25%',
  },
  {
    id: 'yinqiao',
    name: '음교맥 · 투골침',
    acupointTitle: '조해혈(照海穴)',
    badge: '음교',
    color: '#06b6d4',
    descPerLv: 'Lv당 전 협객 기본 파갑 +2',
    maxSummary: '극의: 전 협객 기본 파갑 +10',
  },
  {
    id: 'yangwei',
    name: '양유맥 · 항마투기',
    acupointTitle: '금문혈(金門穴)',
    badge: '양유',
    color: '#0284c7',
    descPerLv: 'Lv당 영물·수배범 피해 +3.5%',
    maxSummary: '극의: 보스 피해 +18%',
  },
  {
    id: 'yinwei',
    name: '음유맥 · 조화단전',
    acupointTitle: '축빈혈(築賓穴)',
    badge: '음유',
    color: '#d97706',
    descPerLv: 'Lv당 영약 성공률 +1.6%',
    maxSummary: '극의: 영약 복용 성공률 +8%',
  },
];

export const MERIDIAN_ORDER: readonly MeridianId[] = [
  'ren',
  'du',
  'chong',
  'dai',
  'yangqiao',
  'yinqiao',
  'yangwei',
  'yinwei',
];

export type MeridianLevels = Readonly<Record<MeridianId, number>>;

export function createEmptyMeridianLevels(): Record<MeridianId, number> {
  return {
    ren: 0,
    du: 0,
    chong: 0,
    dai: 0,
    yangqiao: 0,
    yinqiao: 0,
    yangwei: 0,
    yinwei: 0,
  };
}

export const CULTIVATION_MAX_LEVEL = 41;

export interface CultivationRealmTier {
  readonly minLevel: number;
  readonly name: string;
  readonly badge: string;
  readonly color: string;
  readonly rewardGold: number;
  readonly rewardKeys: number;
  readonly rewardSilk: number;
}

export const CULTIVATION_REALMS: readonly CultivationRealmTier[] = [
  { minLevel: 1, name: '삼류초입 (三流初入)', badge: '삼류초입', color: '#64748b', rewardGold: 0, rewardKeys: 0, rewardSilk: 0 },
  { minLevel: 5, name: '이류무사 (二流武士)', badge: '이류무사', color: '#10b981', rewardGold: 150, rewardKeys: 1, rewardSilk: 10 },
  { minLevel: 10, name: '일류고수 (一流高手)', badge: '일류고수', color: '#0ea5e9', rewardGold: 250, rewardKeys: 2, rewardSilk: 20 },
  { minLevel: 15, name: '절정대협 (絶頂大俠)', badge: '절정대협', color: '#eab308', rewardGold: 380, rewardKeys: 2, rewardSilk: 30 },
  { minLevel: 21, name: '초절정종사 (超絶頂宗師)', badge: '초절정종사', color: '#f97316', rewardGold: 520, rewardKeys: 3, rewardSilk: 45 },
  { minLevel: 27, name: '화경현자 (化境賢者)', badge: '화경현자', color: '#a855f7', rewardGold: 700, rewardKeys: 3, rewardSilk: 60 },
  { minLevel: 34, name: '현경지존 (玄境至尊)', badge: '현경지존', color: '#ec4899', rewardGold: 950, rewardKeys: 4, rewardSilk: 80 },
  { minLevel: 41, name: '무극태상 (無極太上)', badge: '무극태상', color: '#ef4444', rewardGold: 1500, rewardKeys: 5, rewardSilk: 120 },
];

export const CULTIVATION_MILESTONE_REALMS: readonly CultivationRealmTier[] = CULTIVATION_REALMS.filter(
  (r) => r.minLevel > 1,
);

export const CULTIVATION_REALMS_BY_LEVEL: ReadonlyMap<number, CultivationRealmTier> = new Map(
  CULTIVATION_MILESTONE_REALMS.map((r) => [r.minLevel, r]),
);

export interface CultivationProgress {
  readonly level: number;
  readonly totalXp: number;
  readonly currentLevelXp: number;
  readonly nextLevelXp: number;
  readonly isMaxLevel: boolean;
  readonly realmName: string;
  readonly realmBadge: string;
  readonly realmColor: string;
  readonly totalMeridianPoints: number;
}

export function getCultivationStepXp(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return 120 + (lv - 1) * 45;
}

export function computeCultivationProgress(rawTotalXp: number): CultivationProgress {
  const totalXp = Math.max(0, Math.floor(rawTotalXp));
  let level = 1;
  let rem = totalXp;
  while (level < CULTIVATION_MAX_LEVEL) {
    const need = getCultivationStepXp(level);
    if (rem < need) break;
    rem -= need;
    level++;
  }
  const isMaxLevel = level >= CULTIVATION_MAX_LEVEL;
  const nextLevelXp = isMaxLevel ? getCultivationStepXp(CULTIVATION_MAX_LEVEL - 1) : getCultivationStepXp(level);
  const currentLevelXp = isMaxLevel ? nextLevelXp : rem;

  let realm = CULTIVATION_REALMS[0]!;
  for (let i = 0; i < CULTIVATION_REALMS.length; i++) {
    if (level >= CULTIVATION_REALMS[i]!.minLevel) {
      realm = CULTIVATION_REALMS[i]!;
    }
  }

  return {
    level,
    totalXp,
    currentLevelXp,
    nextLevelXp,
    isMaxLevel,
    realmName: realm.name,
    realmBadge: realm.badge,
    realmColor: realm.color,
    totalMeridianPoints: Math.max(0, level - 1),
  };
}

export const HERO_PROFICIENCY_MAX_RANK = 5;

export interface HeroProficiencyTierDef {
  readonly rank: number;
  readonly minXp: number;
  readonly name: string;
  readonly color: string;
  readonly atkBonusPct: number;
  readonly rewardGold: number;
  readonly rewardKeys: number;
  readonly rewardSilk: number;
}

export const HERO_PROFICIENCY_TIERS: readonly HeroProficiencyTierDef[] = [
  { rank: 0, minXp: 0, name: '미수련', color: '#475569', atkBonusPct: 0, rewardGold: 0, rewardKeys: 0, rewardSilk: 0 },
  { rank: 1, minXp: 60, name: '입문', color: '#10b981', atkBonusPct: 3, rewardGold: 30, rewardKeys: 0, rewardSilk: 0 },
  { rank: 2, minXp: 180, name: '숙련', color: '#0ea5e9', atkBonusPct: 6, rewardGold: 50, rewardKeys: 0, rewardSilk: 0 },
  { rank: 3, minXp: 380, name: '달인', color: '#eab308', atkBonusPct: 9, rewardGold: 80, rewardKeys: 0, rewardSilk: 5 },
  { rank: 4, minXp: 700, name: '종사', color: '#a855f7', atkBonusPct: 12, rewardGold: 120, rewardKeys: 0, rewardSilk: 10 },
  { rank: 5, minXp: 1150, name: '화신', color: '#ef4444', atkBonusPct: 15, rewardGold: 180, rewardKeys: 1, rewardSilk: 15 },
];

export interface HeroProficiencyInfo {
  readonly rank: number;
  readonly rankName: string;
  readonly color: string;
  readonly atkBonusPct: number;
  readonly xp: number;
  readonly currentTierXp: number;
  readonly nextTierXp: number;
  readonly isMaxRank: boolean;
}

export function computeHeroProficiencyInfo(rawXp: number): HeroProficiencyInfo {
  const xp = Math.max(0, Math.floor(rawXp));
  let tierIdx = 0;
  for (let i = 0; i < HERO_PROFICIENCY_TIERS.length; i++) {
    if (xp >= HERO_PROFICIENCY_TIERS[i]!.minXp) {
      tierIdx = i;
    }
  }
  const cur = HERO_PROFICIENCY_TIERS[tierIdx]!;
  const next = HERO_PROFICIENCY_TIERS[tierIdx + 1] ?? null;
  const isMaxRank = next === null;
  const currentTierXp = isMaxRank ? 1 : xp - cur.minXp;
  const nextTierXp = isMaxRank ? 1 : Math.max(1, next.minXp - cur.minXp);

  return {
    rank: cur.rank,
    rankName: cur.name,
    color: cur.color,
    atkBonusPct: cur.atkBonusPct,
    xp,
    currentTierXp,
    nextTierXp,
    isMaxRank,
  };
}

export function computeHeroProficiencyRankUpRewards(
  prevRank: number,
  newRank: number,
): { readonly gold: number; readonly keys: number; readonly silk: number } {
  const from = Math.max(0, Math.floor(prevRank));
  const to = Math.max(from, Math.min(HERO_PROFICIENCY_MAX_RANK, Math.floor(newRank)));
  let gold = 0;
  let keys = 0;
  let silk = 0;
  for (let r = from + 1; r <= to; r++) {
    const def = HERO_PROFICIENCY_TIERS[r];
    if (def) {
      gold += def.rewardGold;
      keys += def.rewardKeys;
      silk += def.rewardSilk;
    }
  }
  return { gold, keys, silk };
}

export interface EndgameMetaBonuses {
  readonly atkPct: number;
  readonly skillDamagePct: number;
  readonly startCoin: number;
  readonly killCoinPct: number;
  readonly critChanceBps: number;
  readonly critMultBonus: number;
  readonly bossDamagePct: number;
  readonly speedPct?: number;
  readonly armorShred?: number;
  readonly gambleBonusPct?: number;
  readonly meridianCycleTier?: 0 | 1 | 2;
}

export const ZERO_ENDGAME_META_BONUSES: EndgameMetaBonuses = {
  atkPct: 0,
  skillDamagePct: 0,
  startCoin: 0,
  killCoinPct: 0,
  critChanceBps: 0,
  critMultBonus: 0,
  bossDamagePct: 0,
  speedPct: 0,
  armorShred: 0,
  gambleBonusPct: 0,
  meridianCycleTier: 0,
};

export function getMasteryUpgradeCost(currentLv: number): { readonly gold: number; readonly silk: number } {
  const lv = Math.max(0, Math.floor(currentLv));
  return {
    gold: 180 + lv * 95,
    silk: lv >= 5 ? (lv - 4) * 4 : 0,
  };
}

export function computeEndgameMetaBonuses(
  masteryLevels: Partial<Record<MasteryId, number>>,
  engravedRelicCount: number,
  meridianLevels?: Partial<Record<MeridianId, number>>,
): EndgameMetaBonuses {
  const atkLv = Math.max(0, Math.min(MASTERY_MAX_LEVEL, Math.floor(masteryLevels.atk ?? 0)));
  const econLv = Math.max(0, Math.min(MASTERY_MAX_LEVEL, Math.floor(masteryLevels.econ ?? 0)));
  const critLv = Math.max(0, Math.min(MASTERY_MAX_LEVEL, Math.floor(masteryLevels.crit ?? 0)));
  const bossLv = Math.max(0, Math.min(MASTERY_MAX_LEVEL, Math.floor(masteryLevels.boss ?? 0)));
  const eng = Math.max(0, Math.floor(engravedRelicCount));

  const clampMer = (id: MeridianId): number =>
    Math.max(0, Math.min(MERIDIAN_MAX_LEVEL, Math.floor(meridianLevels?.[id] ?? 0)));

  const renLv = clampMer('ren');
  const duLv = clampMer('du');
  const chongLv = clampMer('chong');
  const daiLv = clampMer('dai');
  const yangqiaoLv = clampMer('yangqiao');
  const yinqiaoLv = clampMer('yinqiao');
  const yangweiLv = clampMer('yangwei');
  const yinweiLv = clampMer('yinwei');

  const allOpened =
    renLv >= 1 &&
    duLv >= 1 &&
    chongLv >= 1 &&
    daiLv >= 1 &&
    yangqiaoLv >= 1 &&
    yinqiaoLv >= 1 &&
    yangweiLv >= 1 &&
    yinweiLv >= 1;
  const allMaxed =
    renLv >= MERIDIAN_MAX_LEVEL &&
    duLv >= MERIDIAN_MAX_LEVEL &&
    chongLv >= MERIDIAN_MAX_LEVEL &&
    daiLv >= MERIDIAN_MAX_LEVEL &&
    yangqiaoLv >= MERIDIAN_MAX_LEVEL &&
    yinqiaoLv >= MERIDIAN_MAX_LEVEL &&
    yangweiLv >= MERIDIAN_MAX_LEVEL &&
    yinweiLv >= MERIDIAN_MAX_LEVEL;

  const meridianCycleTier: 0 | 1 | 2 = allMaxed ? 2 : allOpened ? 1 : 0;
  const cycleAtkPct = meridianCycleTier === 2 ? 12 : meridianCycleTier === 1 ? 4 : 0;
  const cycleSkillPct = meridianCycleTier === 2 ? 10 : 0;
  const cycleStartCoin = meridianCycleTier === 2 ? 40 : meridianCycleTier === 1 ? 15 : 0;

  return {
    atkPct: Math.round(atkLv * 1.5) + eng * RELIC_ENGRAVE_ATK_PCT_EACH + duLv * 2 + cycleAtkPct,
    skillDamagePct: eng * RELIC_ENGRAVE_SKILL_PCT_EACH + daiLv * 4 + cycleSkillPct,
    startCoin: econLv * 5 + renLv * 8 + cycleStartCoin,
    killCoinPct: econLv * 2 + renLv * 2,
    critChanceBps: critLv * 50 + yangqiaoLv * 100,
    critMultBonus: Number((critLv * 0.04 + yangqiaoLv * 0.05).toFixed(2)),
    bossDamagePct: Math.round(bossLv * 2.5 + yangweiLv * 3.5),
    speedPct: Number((chongLv * 2.5).toFixed(1)),
    armorShred: yinqiaoLv * 2,
    gambleBonusPct: Math.round(yinweiLv * 1.6),
    meridianCycleTier,
  };
}



