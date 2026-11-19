export type GradeId = string;
export type UnitId = string;
export type RecipeId = string;
export type FactionId = 'orthodox' | 'unorthodox' | 'demonic';
export type UpgradeGroupId = FactionId;

export type VfxTrackKind =
  | 'plum_blossom'
  | 'emperor_thunder'
  | 'golden_palm'
  | 'poison_rain'
  | 'blood_slash'
  | 'demonic_flame'
  | 'heavenly_demon'
  | 'tx_sword_saint'
  | 'tx_murim_lord'
  | 'tx_mad_demon'
  | 'tx_poison_dragon'
  | 'tx_demon_heir'
  | 'tx_nether_queen'
  | 'im_cheonma'
  | 'im_sword_immortal'
  | 'im_asura_emperor'
  | 'im_venom_lord'
  | 'im_thunder_emperor'
  | 'im_hell_flame';

export type PassiveProcKind = 'execute' | 'pierce' | 'boss' | 'corrode';

export type MonsterKind =
  | 'bandit_minion'
  | 'jiangshi'
  | 'blood_zealot'
  | 'white_tiger'
  | 'black_serpent'
  | 'blood_patriarch';

export interface GradeDef {
  readonly id: GradeId;
  readonly name: string;
  readonly rank: number;
  readonly color: string;
  readonly summonable: boolean;
  readonly summonWeight: number;
  readonly fx?: string;
  readonly isSurplusCleanupTarget: boolean;
  readonly starterWispCount: number;
  readonly scrollChestUnlockLv: number;
  readonly scrollChestBonusLv: number;
  readonly sellLuckGuaranteed: number;
  readonly sellLuckChancePct: number;
  readonly codexRewardGold: number;
  readonly codexRewardKeys: number;
  readonly showSkillCallout: boolean;
  readonly isHighTierToast: boolean;
  readonly isCutInTier: boolean;
}

export interface RawUnitSkillDef {
  readonly name: string;
  readonly desc: string;
  readonly everyN: number;
  readonly atkRatio: number;
  readonly splashRadius: number;
  readonly stunSec: number;
  readonly slowPct: number;
  readonly slowSec: number;
  readonly vfxTrack: VfxTrackKind;
}

export interface UnitSkillDef {
  readonly name: string;
  readonly desc: string;
  readonly everyN: number;
  readonly atkRatio: number;
  readonly splashRadius: number;
  readonly stunTicks: number;
  readonly slowPct: number;
  readonly slowTicks: number;
  readonly vfxTrack: VfxTrackKind;
}

export interface SupportAuraDef {
  readonly name: string;
  readonly atkPct: number;
  readonly speedPct: number;
}

export interface PassiveTraitDef {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly bossDamagePct?: number;
  readonly executeBelowHpPct?: number;
  readonly executeDamagePct?: number;
  readonly shreddedDamagePct?: number;
  readonly armorPiercePct?: number;
}

export interface RawUnitDef {
  readonly id: UnitId;
  readonly name: string;
  readonly title: string;
  readonly faction: FactionId;
  readonly grade: GradeId;
  readonly leaf: boolean;
  readonly atk: number;
  readonly range: number;
  readonly attackIntervalSec: number;
  readonly critChance: number;
  readonly critMult: number;
  readonly sellCoin: number;
  readonly armorShred?: number;
  readonly supportAura?: SupportAuraDef;
  readonly passiveTrait?: PassiveTraitDef;
  readonly skill: RawUnitSkillDef;
}

export interface UnitDef {
  readonly id: UnitId;
  readonly name: string;
  readonly title: string;
  readonly faction: FactionId;
  readonly grade: GradeId;
  readonly leaf: boolean;
  readonly atk: number;
  readonly range: number;
  readonly attackIntervalTicks: number;
  readonly critChance: number;
  readonly critMult: number;
  readonly sellCoin: number;
  readonly armorShred: number;
  readonly supportAura?: SupportAuraDef;
  readonly passiveTrait?: PassiveTraitDef;
  readonly skill: UnitSkillDef;
}

export interface RecipeIngredient {
  readonly unit: UnitId;
  readonly n: number;
}

export interface RecipeDef {
  readonly id: RecipeId;
  readonly output: UnitId;
  readonly ingredients: readonly RecipeIngredient[];
  readonly priority: number;
}

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface GridSpec {
  readonly cols: number;
  readonly rows: number;
  readonly originX: number;
  readonly originY: number;
  readonly cellW: number;
  readonly cellH: number;
  readonly gapX: number;
  readonly gapY: number;
}

export interface BoardConfig {
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly arenaRect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly path: {
    readonly corridorWidth: number;
    readonly monsterCap: number;
    readonly waypoints: readonly Vec2[];
  };
  readonly field: GridSpec;
  readonly bench: GridSpec;
  readonly economy: {
    readonly initialCoin: number;
    readonly initialLuckStone: number;
    readonly baseSummonCost: number;
    readonly summonCostStep: number;
  };
}

export interface RawWaveDef {
  readonly wave: number;
  readonly durationSec: number;
  readonly spawnCount: number;
  readonly spawnIntervalSec: number;
  readonly monsterHp: number;
  readonly monsterSpeed: number;
  readonly monsterRadius: number;
  readonly rewardCoin: number;
  readonly monsterKind: MonsterKind;
  readonly isBoss: boolean;
  readonly bossName?: string;
  readonly rewardWispGrade?: GradeId;
}

export interface WaveDef {
  readonly wave: number;
  readonly durationTicks: number;
  readonly spawnCount: number;
  readonly spawnIntervalTicks: number;
  readonly monsterHp: number;
  readonly monsterSpeedPerTick: number;
  readonly monsterRadius: number;
  readonly rewardCoin: number;
  readonly monsterKind: MonsterKind;
  readonly isBoss: boolean;
  readonly bossName?: string;
  readonly rewardWispGrade?: GradeId;
}

export interface GambleRateDef {
  readonly tier: GradeId;
  readonly label: string;
  readonly costLuck: number;
  readonly chancePct: number;
  readonly desc: string;
}

export interface UpgradeGroupDef {
  readonly id: UpgradeGroupId;
  readonly name: string;
  readonly faction: FactionId;
  readonly desc: string;
  readonly currency: 'coin' | 'luck';
  readonly baseCost: number;
  readonly costStep: number;
  readonly atkBonusPctPerLv: number;
  readonly maxLevel: number;
}

export type WispPools = Readonly<Record<GradeId, readonly UnitId[]>>;

export type RelicId =
  | 'golden_vault'
  | 'million_sword_seal'
  | 'bandit_dagger'
  | 'immortal_furnace'
  | 'founding_jade_seal'
  | 'heavenly_scroll_chest'
  | 'wind_swift_boots'
  | 'crimson_crit_blade'
  | 'armor_break_gauntlet'
  | 'celestial_skill_jade'
  | 'demon_slayer_banner'
  | 'merchant_abacus';

export interface RelicDef {
  readonly id: RelicId;
  readonly name: string;
  readonly tag: string;
  readonly desc: string;
  readonly maxLevel: number;
  readonly baseUpgradeGold: number;
  readonly stepUpgradeGold: number;
}

export type DifficultyId = 'normal' | 'hard' | 'hell' | 'abyss';

export interface DifficultyConfig {
  readonly id: DifficultyId;
  readonly name: string;
  readonly badge: string;
  readonly desc: string;
  readonly hpMult: number;
  readonly lateWaveRamp: number;
  readonly bossHpMult: number;
  readonly speedMult: number;
  readonly armorBonus: number;
  readonly rewardMult: number;
  readonly firstClearGold: number;
  readonly firstClearKeys: number;
}

export type TrialId =
  | 'trial_venom_gale'
  | 'trial_sword_tomb'
  | 'trial_crimson_iron'
  | 'trial_chaos_trinity';

export interface TrialConfig {
  readonly id: TrialId;
  readonly name: string;
  readonly badge: string;
  readonly ruleTag: string;
  readonly desc: string;
  readonly targetWave: number;
  readonly hpMult: number;
  readonly lateWaveRamp: number;
  readonly bossHpMult: number;
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

export type GameOverReason = 'overrun' | 'boss_timeout';

export type MissionConditionKind =
  | 'distinct_leaf_owned'
  | 'min_grade_owned'
  | 'any_formation_active'
  | 'high_formation_active'
  | 'bounties_slain'
  | 'gamble_wins'
  | 'held_coin'
  | 'total_upgrades';

export interface MissionDef {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly condition: MissionConditionKind;
  readonly target: number;
  readonly gradeRank?: number;
  readonly rewardCoin: number;
  readonly rewardLuck: number;
  readonly rewardWispGrade?: GradeId;
}

export type SkinRarity = 'rare' | 'legendary' | 'mythic' | 'achievement';
export type SkinUnlockCond =
  | 'any_clear'
  | 'hard_clear'
  | 'hell_clear'
  | 'abyss_clear'
  | 'wave_35'
  | 'wave_55'
  | 'all_trials_clear';
export type SkinCrestKind = 'halo' | 'crown' | 'blades' | 'orbs';
export type CourtSkinId =
  | 'court_bamboo_dawn'
  | 'court_crimson_sunset'
  | 'court_blood_moon'
  | 'court_golden_palace';

export interface HeroSkinDef {
  readonly id: string;
  readonly unitId: UnitId;
  readonly name: string;
  readonly rarity: SkinRarity;
  readonly unlockCond?: SkinUnlockCond;
  readonly silkCost: number;
  readonly desc: string;
  readonly robeHue: number;
  readonly satMult: number;
  readonly lumOffset: number;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly crestKind: SkinCrestKind;
}

export interface CourtSkinDef {
  readonly id: CourtSkinId;
  readonly name: string;
  readonly rarity: SkinRarity;
  readonly unlockCond?: SkinUnlockCond;
  readonly silkCost: number;
  readonly desc: string;
  readonly tintColor: string;
  readonly tintAlpha: number;
  readonly lanternColor: string;
  readonly petalPrimary: string;
  readonly petalSecondary: string;
}

export type TitleId = string;

export type TitleConditionKind =
  | 'total_runs'
  | 'normal_clear'
  | 'hard_clear'
  | 'hell_clear'
  | 'abyss_clear'
  | 'all_trials_clear'
  | 'best_wave'
  | 'discovered_units'
  | 'max_relic_level'
  | 'owned_relics';

export interface TitleDef {
  readonly id: TitleId;
  readonly name: string;
  readonly badge: string;
  readonly color: string;
  readonly desc: string;
  readonly condition: TitleConditionKind;
  readonly target: number;
  readonly rewardGold: number;
  readonly rewardKeys: number;
  readonly rewardSilk: number;
}

export type BoonId =
  | 'b_usury_vault'
  | 'b_wealth_blade'
  | 'b_orthodox_zenith'
  | 'b_unorthodox_pillage'
  | 'b_demonic_overdrive'
  | 'b_armor_crusher'
  | 'b_swift_formation'
  | 'b_hidden_acupoint'
  | 'b_elixir_jackpot'
  | 'b_heavenly_reinforce'
  | 'b_bounty_hunter'
  | 'b_trinity_harmony';

export type BoonRarity = 'rare' | 'epic' | 'mythic';
export type BoonIconKind =
  | 'vault'
  | 'wealth_sword'
  | 'orthodox'
  | 'pillage'
  | 'demonic'
  | 'shatter'
  | 'formation'
  | 'acupoint'
  | 'furnace'
  | 'reinforce'
  | 'bounty'
  | 'trinity';

export interface BoonDef {
  readonly id: BoonId;
  readonly name: string;
  readonly tag: string;
  readonly rarity: BoonRarity;
  readonly maxStacks: number;
  readonly iconKind: BoonIconKind;
  readonly desc: string;
}

export type WaveMutantKind = 'swift_raid' | 'iron_wall' | 'blood_swarm';

export interface GameDataBundle {
  readonly grades: readonly GradeDef[];
  readonly gradesById: ReadonlyMap<GradeId, GradeDef>;
  readonly units: readonly UnitDef[];
  readonly unitsById: ReadonlyMap<UnitId, UnitDef>;
  readonly recipes: readonly RecipeDef[];
  readonly board: BoardConfig;
  readonly waves: readonly WaveDef[];
  readonly wispPools: WispPools;
  readonly gambleRates: readonly GambleRateDef[];
  readonly upgrades: readonly UpgradeGroupDef[];
  readonly upgradesByFaction: ReadonlyMap<FactionId, UpgradeGroupDef>;
  readonly relics: readonly RelicDef[];
  readonly relicsById: ReadonlyMap<RelicId, RelicDef>;
  readonly missions: readonly MissionDef[];
  readonly boons: readonly BoonDef[];
  readonly boonsById: ReadonlyMap<BoonId, BoonDef>;
  readonly heroSkins: readonly HeroSkinDef[];
  readonly heroSkinsById: ReadonlyMap<string, HeroSkinDef>;
  readonly heroSkinsByUnit: ReadonlyMap<UnitId, readonly HeroSkinDef[]>;
  readonly courtSkins: readonly CourtSkinDef[];
  readonly courtSkinsById: ReadonlyMap<CourtSkinId, CourtSkinDef>;
  readonly difficulties: readonly DifficultyConfig[];
  readonly difficultiesById: ReadonlyMap<DifficultyId, DifficultyConfig>;
  readonly trials: readonly TrialConfig[];
  readonly trialsById: ReadonlyMap<TrialId, TrialConfig>;
  readonly titles: readonly TitleDef[];
  readonly titlesById: ReadonlyMap<TitleId, TitleDef>;
}
