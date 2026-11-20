import {
  CLEAR_TARGET_WAVE,
  computeRelicSetBonuses,
  DIFFICULTY_CONFIGS,
  DIFFICULTY_ORDER,
  RELIC_MAX_LEVEL,
  RELIC_STANDARD_CAP,
  TITLE_DEFS,
  TITLES_BY_ID,
  TRIAL_CONFIGS,
  TRIAL_ORDER,
} from '../core/relicFormulas';
import {
  computeDailyChallengeScore,
  ENDLESS_MILESTONES,
  type RunModeId,
} from '../data/specialModes';
import type {
  CourtSkinDef,
  CourtSkinId,
  DifficultyId,
  GameDataBundle,
  GradeDef,
  HeroSkinDef,
  RelicDef,
  RelicId,
  SkinRarity,
  TitleDef,
  TitleId,
  TrialId,
  UnitDef,
  UnitId,
} from '../data/types';
import {
  type DailyQuestId,
  type DailyQuestView,
  getLocalDateKey,
  pickDailyQuestsForDate,
} from './DailyQuests';
import {
  migrateRunSave,
  RUN_SAVE_SCHEMA_VERSION,
  type RunSaveData,
  type SaveMigrationResult,
} from './SaveMigration';

export type { DailyQuestId, DailyQuestView };

export const RELIC_ORDER: readonly RelicId[] = [
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

export const RELIC_CHEST_GOLD_COST = 100;
export const RELIC_DIRECT_UNLOCK_GOLD = 180;
export const SKIN_SINGLE_GOLD_COST = 120;
export const SKIN_MULTI5_GOLD_COST = 540;
export const DEFAULT_COURT_SKIN_ID: CourtSkinId = 'court_bamboo_dawn';

const STORAGE_KEY = 'murim_defense_meta_v1';
export const RUN_STORAGE_KEY = 'murim_defense_run_v1';
export const BACKUP_CODE_PREFIX = 'MRD1-';
const STARTER_GOLD = 120;
const STARTER_KEYS = 2;
const STARTER_SILK = 30;

const VALID_COURT_SKIN_SET: ReadonlySet<string> = new Set<CourtSkinId>([
  'court_bamboo_dawn',
  'court_crimson_sunset',
  'court_blood_moon',
  'court_golden_palace',
  'court_snow_sword_pavilion',
]);

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface TrialRecord {
  readonly clears: number;
  readonly bestWave: number;
  readonly bestTicks: number | null;
}

export interface DailyChallengeRecord {
  readonly dateKey: string;
  readonly bestWave: number;
  readonly bestScore: number;
  readonly cleared: boolean;
  readonly bestTicks: number | null;
  readonly rewardTierClaimed: 0 | 1 | 2;
}

export interface BossRushRecord {
  readonly clears: number;
  readonly bestStage: number;
  readonly bestTicks: number | null;
}

export interface HallOfFameEntry {
  readonly id: string;
  readonly dateKey: string;
  readonly runMode: RunModeId;
  readonly difficulty: DifficultyId;
  readonly trialId: TrialId | null;
  readonly wave: number;
  readonly victory: boolean;
  readonly totalDamage: number;
  readonly topHeroId: UnitId | null;
  readonly topHeroName: string | null;
  readonly elapsedTicks: number | null;
  readonly score: number;
}

export interface TitleProgress {
  readonly current: number;
  readonly target: number;
}

export type DailyQuestClaimResult =
  | {
      readonly ok: true;
      readonly questId: DailyQuestId;
      readonly questName: string;
      readonly rewardGold: number;
      readonly rewardKeys: number;
      readonly rewardSilk: number;
      readonly unlockedTitleIds?: readonly TitleId[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

export interface MetaProfile {
  readonly gold: number;
  readonly keys: number;
  readonly silk: number;
  readonly relics: Readonly<Record<RelicId, number>>;
  readonly totalRuns: number;
  readonly bestWave: number;
  readonly selectedRunMode: RunModeId;
  readonly selectedDifficulty: DifficultyId;
  readonly selectedTrialId: TrialId | null;
  readonly unlockedDifficulties: Readonly<Record<DifficultyId, boolean>>;
  readonly clearedDifficulties: Readonly<Record<DifficultyId, boolean>>;
  readonly difficultyBestWave: Readonly<Record<DifficultyId, number>>;
  readonly clearedTrials: Readonly<Record<TrialId, boolean>>;
  readonly trialRecords: Readonly<Record<TrialId, TrialRecord>>;
  readonly clearedTrialCount: number;
  readonly dailyChallengeToday: DailyChallengeRecord | null;
  readonly dailyChallengeStreak: number;
  readonly bossRushRecord: BossRushRecord;
  readonly endlessMilestonesCleared: readonly number[];
  readonly hallOfFame: readonly HallOfFameEntry[];
  readonly unlockedTitles: Readonly<Record<TitleId, boolean>>;
  readonly unlockedTitleCount: number;
  readonly equippedTitle: TitleId | null;
  readonly discoveredUnits: Readonly<Record<UnitId, boolean>>;
  readonly discoveredCount: number;
  readonly ownedSkins: Readonly<Record<string, boolean>>;
  readonly ownedSkinCount: number;
  readonly equippedHeroSkins: Readonly<Record<UnitId, string>>;
  readonly equippedCourtSkin: CourtSkinId;
  readonly dailyDate: string;
  readonly dailyQuests: readonly DailyQuestView[];
  readonly claimableDailyCount: number;
  readonly totalDailyClaimed: number;
  readonly tutorialDone: boolean;
  readonly rev: number;
}

export interface SettlementInput {
  readonly wave: number;
  readonly monstersSlain: number;
  readonly bossesSlain: number;
  readonly bountiesSlain?: number;
  readonly difficulty?: DifficultyId;
  readonly trialId?: TrialId | null;
  readonly runMode?: RunModeId;
  readonly victory?: boolean;
  readonly elapsedTicks?: number;
  readonly totalDamage?: number;
  readonly topHeroId?: UnitId | null;
  readonly topHeroName?: string | null;
  readonly usedHighFormation?: boolean;
  readonly craftedImmortal?: boolean;
  readonly dateKey?: string;
}

export interface SettlementReward {
  readonly clearedWaves: number;
  readonly goldEarned: number;
  readonly keysEarned: number;
}

export interface SettlementRecord extends SettlementReward {
  readonly wave: number;
  readonly monstersSlain: number;
  readonly bossesSlain: number;
  readonly bountiesSlain: number;
  readonly difficulty: DifficultyId;
  readonly trialId: TrialId | null;
  readonly runMode: RunModeId;
  readonly victory: boolean;
  readonly firstClearBonusGold: number;
  readonly firstClearBonusKeys: number;
  readonly firstClearBonusSilk: number;
  readonly unlockedNextDifficulty: DifficultyId | null;
  readonly unlockedEndlessMilestones: readonly number[];
  readonly endlessBonusGold: number;
  readonly endlessBonusKeys: number;
  readonly endlessBonusSilk: number;
  readonly dailyChallengeScore?: number;
  readonly unlockedSkinIds: readonly string[];
  readonly unlockedTitleIds: readonly TitleId[];
  readonly titleBonusGold: number;
  readonly titleBonusKeys: number;
  readonly titleBonusSilk: number;
  readonly totalGold: number;
  readonly totalKeys: number;
  readonly totalSilk: number;
  readonly isNewBest: boolean;
}

export type BackupImportResult =
  | {
      readonly ok: true;
      readonly gold: number;
      readonly discoveredCount: number;
      readonly bestWave: number;
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

export interface CodexDiscoveryResult {
  readonly isNew: boolean;
  readonly unitId: UnitId;
  readonly unitName: string;
  readonly gradeName: string;
  readonly bonusGold: number;
  readonly bonusKeys: number;
  readonly unlockedTitleIds?: readonly TitleId[];
}

export type RelicDrawResult =
  | {
      readonly ok: true;
      readonly relicId: RelicId;
      readonly prevLevel: number;
      readonly newLevel: number;
      readonly isNew: boolean;
      readonly unlockedTitleIds?: readonly TitleId[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

export interface RelicBatchPullItem {
  readonly relicId: RelicId;
  readonly prevLevel: number;
  readonly newLevel: number;
  readonly isNew: boolean;
}

export type RelicBatchDrawResult =
  | {
      readonly ok: true;
      readonly items: readonly RelicBatchPullItem[];
      readonly spentCount: number;
      readonly unlockedTitleIds?: readonly TitleId[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

export type RelicUpgradeResult =
  | {
      readonly ok: true;
      readonly relicId: RelicId;
      readonly prevLevel: number;
      readonly newLevel: number;
      readonly wasUnlock: boolean;
      readonly spentGold: number;
      readonly unlockedTitleIds?: readonly TitleId[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

export interface SkinPullItem {
  readonly skinId: string;
  readonly name: string;
  readonly rarity: SkinRarity;
  readonly kind: 'hero' | 'court';
  readonly unitId?: UnitId;
  readonly isNew: boolean;
  readonly silkRefund: number;
}

export type SkinGachaResult =
  | {
      readonly ok: true;
      readonly items: readonly SkinPullItem[];
      readonly totalSilkRefund: number;
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

export type SkinCraftResult =
  | {
      readonly ok: true;
      readonly skinId: string;
      readonly name: string;
      readonly spentSilk: number;
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

export function computeTitleProgress(profile: MetaProfile, title: TitleDef): TitleProgress {
  switch (title.condition) {
    case 'total_runs':
      return { current: Math.min(title.target, profile.totalRuns), target: title.target };
    case 'normal_clear':
      return { current: profile.clearedDifficulties.normal ? 1 : 0, target: 1 };
    case 'hard_clear':
      return { current: profile.clearedDifficulties.hard ? 1 : 0, target: 1 };
    case 'hell_clear':
      return { current: profile.clearedDifficulties.hell ? 1 : 0, target: 1 };
    case 'abyss_clear':
      return { current: profile.clearedDifficulties.abyss ? 1 : 0, target: 1 };
    case 'all_trials_clear':
      return { current: profile.clearedTrialCount, target: TRIAL_ORDER.length };
    case 'best_wave':
      return { current: Math.min(title.target, profile.bestWave), target: title.target };
    case 'discovered_units':
      return { current: Math.min(title.target, profile.discoveredCount), target: title.target };
    case 'max_relic_level': {
      let maxLv = 0;
      for (const lv of Object.values(profile.relics)) {
        if (lv > maxLv) maxLv = lv;
      }
      return { current: Math.min(title.target, maxLv), target: title.target };
    }
    case 'owned_relics': {
      let owned = 0;
      for (const lv of Object.values(profile.relics)) {
        if (lv > 0) owned++;
      }
      return { current: Math.min(title.target, owned), target: title.target };
    }
    case 'relic_sets_active': {
      const sets = computeRelicSetBonuses(profile.relics);
      return { current: Math.min(title.target, sets.activeSetCount), target: title.target };
    }
    case 'relic_sets_mythic': {
      const sets = computeRelicSetBonuses(profile.relics);
      return { current: Math.min(title.target, sets.mythicSetCount), target: title.target };
    }
    case 'daily_quests_claimed':
      return { current: Math.min(title.target, profile.totalDailyClaimed), target: title.target };
    case 'trial_abyss_clear':
      return { current: profile.clearedTrials.trial_abyss_sanctum ? 1 : 0, target: 1 };
  }
}

export function getSkinDuplicateSilk(rarity: SkinRarity): number {
  if (rarity === 'mythic') return 50;
  if (rarity === 'legendary') return 30;
  return 15;
}

export function createEmptyRelicMap(): Record<RelicId, number> {
  return {
    golden_vault: 0,
    million_sword_seal: 0,
    bandit_dagger: 0,
    immortal_furnace: 0,
    founding_jade_seal: 0,
    heavenly_scroll_chest: 0,
    wind_swift_boots: 0,
    crimson_crit_blade: 0,
    armor_break_gauntlet: 0,
    celestial_skill_jade: 0,
    demon_slayer_banner: 0,
    merchant_abacus: 0,
    jade_training_manual: 0,
    phoenix_luck_pouch: 0,
    dragon_range_mirror: 0,
    eight_trigram_mirror: 0,
  };
}

export function getRelicUpgradeGoldCost(def: RelicDef, currentLevel: number): number {
  if (currentLevel <= 0) {
    return RELIC_DIRECT_UNLOCK_GOLD;
  }
  if (currentLevel >= def.maxLevel) {
    return 0;
  }
  const linear = def.baseUpgradeGold + currentLevel * def.stepUpgradeGold;
  if (currentLevel < RELIC_STANDARD_CAP) {
    return linear;
  }
  // Transcendence refinement (Lv.10 -> Lv.15) carries a prestige surcharge
  const overSteps = currentLevel - RELIC_STANDARD_CAP + 1;
  return linear + overSteps * Math.round(def.stepUpgradeGold * 1.2);
}

export function getCodexDiscoveryReward(gradeDef: GradeDef | undefined): {
  readonly gold: number;
  readonly keys: number;
} {
  if (!gradeDef) {
    return { gold: 0, keys: 0 };
  }
  return {
    gold: gradeDef.codexRewardGold,
    keys: gradeDef.codexRewardKeys,
  };
}

export function computeSettlementReward(input: SettlementInput): SettlementReward {
  const rawWave = Math.floor(input.wave);
  const trialCfg = input.trialId ? TRIAL_CONFIGS[input.trialId] : null;
  const targetWave = trialCfg ? trialCfg.targetWave : CLEAR_TARGET_WAVE;
  const clearedWaves = Math.max(
    0,
    input.victory && rawWave === targetWave ? targetWave : rawWave - 1,
  );
  const bosses = Math.max(0, Math.floor(input.bossesSlain));
  const bounties = Math.max(0, Math.floor(input.bountiesSlain ?? 0));
  const kills = Math.max(0, Math.floor(input.monstersSlain));
  const diff = input.difficulty ?? 'normal';
  const mult = trialCfg ? trialCfg.rewardMult : (DIFFICULTY_CONFIGS[diff]?.rewardMult ?? 1.0);

  const baseGold =
    30 +
    clearedWaves * 18 +
    bosses * 45 +
    bounties * 24 +
    Math.floor(kills / 8) * 2 +
    (input.victory ? 120 : 0);

  const goldEarned = Math.round(baseGold * mult);
  const keysEarned =
    (clearedWaves >= 2 ? 1 : 0) +
    bosses +
    Math.floor(bounties / 2) +
    Math.floor(clearedWaves / 10) +
    (input.victory ? 1 : 0);

  return {
    clearedWaves,
    goldEarned,
    keysEarned,
  };
}

const B64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function fnv1aHex(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function encodeBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out +=
      B64URL_ALPHABET[(n >>> 18) & 63]! +
      B64URL_ALPHABET[(n >>> 12) & 63]! +
      B64URL_ALPHABET[(n >>> 6) & 63]! +
      B64URL_ALPHABET[n & 63]!;
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i]! << 16;
    out += B64URL_ALPHABET[(n >>> 18) & 63]! + B64URL_ALPHABET[(n >>> 12) & 63]!;
  } else if (rem === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out +=
      B64URL_ALPHABET[(n >>> 18) & 63]! +
      B64URL_ALPHABET[(n >>> 12) & 63]! +
      B64URL_ALPHABET[(n >>> 6) & 63]!;
  }
  return out;
}

function decodeBase64Url(str: string): Uint8Array | null {
  const len = str.length;
  if (len === 0 || len % 4 === 1) return null;
  const outLen = Math.floor((len * 3) / 4);
  const out = new Uint8Array(outLen);
  let outIdx = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < len; i++) {
    const idx = B64URL_ALPHABET.indexOf(str[i]!);
    if (idx < 0) return null;
    acc = (acc << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outIdx++] = (acc >>> bits) & 0xff;
    }
  }
  return out;
}

function createEmptyClearedTrials(): Record<TrialId, boolean> {
  return {
    trial_venom_gale: false,
    trial_sword_tomb: false,
    trial_crimson_iron: false,
    trial_chaos_trinity: false,
    trial_gale_blitz: false,
    trial_abyss_sanctum: false,
  };
}

function createEmptyTrialRecords(): Record<TrialId, TrialRecord> {
  return {
    trial_venom_gale: { clears: 0, bestWave: 0, bestTicks: null },
    trial_sword_tomb: { clears: 0, bestWave: 0, bestTicks: null },
    trial_crimson_iron: { clears: 0, bestWave: 0, bestTicks: null },
    trial_chaos_trinity: { clears: 0, bestWave: 0, bestTicks: null },
    trial_gale_blitz: { clears: 0, bestWave: 0, bestTicks: null },
    trial_abyss_sanctum: { clears: 0, bestWave: 0, bestTicks: null },
  };
}

function createEmptyDifficultyBestWave(): Record<DifficultyId, number> {
  return {
    normal: 0,
    hard: 0,
    hell: 0,
    abyss: 0,
  };
}

function createEmptyUnlockedTitles(): Record<TitleId, boolean> {
  const out: Record<string, boolean> = {};
  for (let i = 0; i < TITLE_DEFS.length; i++) {
    out[TITLE_DEFS[i]!.id] = false;
  }
  return out as Record<TitleId, boolean>;
}

function resolveDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Private mode or non-browser environment
  }
  return null;
}

export class MetaStore {
  private readonly storage: StorageLike | null;
  private gold = STARTER_GOLD;
  private keys = STARTER_KEYS;
  private silk = STARTER_SILK;
  private readonly relics: Record<RelicId, number> = createEmptyRelicMap();
  private totalRuns = 0;
  private bestWave = 1;
  private selectedDifficulty: DifficultyId = 'normal';
  private selectedTrialId: TrialId | null = null;
  private readonly unlockedDifficulties: Record<DifficultyId, boolean> = {
    normal: true,
    hard: false,
    hell: false,
    abyss: false,
  };
  private readonly clearedDifficulties: Record<DifficultyId, boolean> = {
    normal: false,
    hard: false,
    hell: false,
    abyss: false,
  };
  private readonly difficultyBestWave: Record<DifficultyId, number> =
    createEmptyDifficultyBestWave();
  private readonly clearedTrials: Record<TrialId, boolean> = createEmptyClearedTrials();
  private readonly trialRecords: Record<TrialId, TrialRecord> = createEmptyTrialRecords();
  private selectedRunMode: RunModeId = 'standard';
  private readonly dailyChallengeRecords: Record<string, DailyChallengeRecord> = {};
  private dailyChallengeStreak = 0;
  private lastDailyChallengeDate: string | null = null;
  private bossRushRecord: BossRushRecord = { clears: 0, bestStage: 0, bestTicks: null };
  private readonly endlessMilestonesCleared = new Set<number>();
  private hallOfFame: HallOfFameEntry[] = [];
  private readonly unlockedTitles: Record<TitleId, boolean> = createEmptyUnlockedTitles();
  private equippedTitle: TitleId | null = null;
  private readonly discoveredUnits: Record<UnitId, boolean> = {};
  private readonly ownedSkins: Record<string, boolean> = {
    [DEFAULT_COURT_SKIN_ID]: true,
  };
  private readonly equippedHeroSkins: Record<UnitId, string> = {};
  private equippedCourtSkin: CourtSkinId = DEFAULT_COURT_SKIN_ID;
  private dailyDate = getLocalDateKey();
  private dailyProgress: Record<string, number> = {};
  private dailyClaimed: Record<string, boolean> = {};
  private totalDailyClaimed = 0;
  private tutorialDone = false;
  private rev = 1;

  public constructor(customStorage?: StorageLike | null) {
    this.storage = customStorage !== undefined ? customStorage : resolveDefaultStorage();
    this.load();
    this.ensureDailyDate();
    this.unlockEligibleAchievementSkins();
    this.evaluateTitles(false);
  }

  public ensureDailyDate(dateKey: string = getLocalDateKey()): boolean {
    if (this.dailyDate === dateKey) return false;
    this.dailyDate = dateKey;
    this.dailyProgress = {};
    this.dailyClaimed = {};
    return true;
  }

  public buildDailyQuestViews(dateKey: string = getLocalDateKey()): readonly DailyQuestView[] {
    this.ensureDailyDate(dateKey);
    const defs = pickDailyQuestsForDate(this.dailyDate);
    return defs.map((def) => {
      const progress = Math.min(def.target, Math.max(0, Math.floor(this.dailyProgress[def.id] ?? 0)));
      return {
        def,
        progress,
        completed: progress >= def.target,
        claimed: Boolean(this.dailyClaimed[def.id]),
      };
    });
  }

  public claimDailyQuest(
    questId: DailyQuestId,
    dateKey: string = getLocalDateKey(),
  ): DailyQuestClaimResult {
    this.ensureDailyDate(dateKey);
    const todayDefs = pickDailyQuestsForDate(this.dailyDate);
    const def = todayDefs.find((q) => q.id === questId);
    if (!def) {
      return { ok: false, reason: '오늘의 일일 강호 과제 목록에 없는 과제입니다.' };
    }
    if (this.dailyClaimed[questId]) {
      return { ok: false, reason: '이미 보상을 수령한 일일 과제입니다.' };
    }
    const progress = Math.max(0, Math.floor(this.dailyProgress[questId] ?? 0));
    if (progress < def.target) {
      return { ok: false, reason: `과제 목표를 아직 달성하지 못했습니다 (${progress}/${def.target}).` };
    }

    this.dailyClaimed[questId] = true;
    this.totalDailyClaimed += 1;
    this.gold += def.rewardGold;
    this.keys += def.rewardKeys;
    this.silk += def.rewardSilk;
    const titleRes = this.evaluateTitles(true);
    this.rev++;
    this.save();

    return {
      ok: true,
      questId: def.id,
      questName: def.name,
      rewardGold: def.rewardGold,
      rewardKeys: def.rewardKeys,
      rewardSilk: def.rewardSilk,
      unlockedTitleIds: titleRes.unlockedIds,
    };
  }

  private advanceDailyQuests(input: SettlementInput, victory: boolean, wave: number): void {
    this.ensureDailyDate(input.dateKey ?? getLocalDateKey());
    const todayDefs = pickDailyQuestsForDate(this.dailyDate);
    const monstersSlain = Math.max(0, Math.floor(input.monstersSlain));
    const bossesSlain = Math.max(0, Math.floor(input.bossesSlain));

    for (let i = 0; i < todayDefs.length; i++) {
      const def = todayDefs[i]!;
      const prev = Math.max(0, Math.floor(this.dailyProgress[def.id] ?? 0));
      let next = prev;
      switch (def.id) {
        case 'dq_play_run':
          next = prev + 1;
          break;
        case 'dq_slay_180':
          next = prev + monstersSlain;
          break;
        case 'dq_boss_3':
          next = prev + bossesSlain;
          break;
        case 'dq_clear_any':
          if (victory) next = prev + 1;
          break;
        case 'dq_trial_clear':
          if (victory && input.trialId) next = prev + 1;
          break;
        case 'dq_endless_35':
          if (wave >= 35) next = Math.max(prev, 1);
          break;
        case 'dq_formation_6':
          if (input.usedHighFormation) next = Math.max(prev, 1);
          break;
        case 'dq_craft_immortal':
          if (input.craftedImmortal) next = Math.max(prev, 1);
          break;
      }
      this.dailyProgress[def.id] = Math.min(def.target, next);
    }
  }

  public getProfile(dateKey: string = getLocalDateKey()): MetaProfile {
    const discoveredCount = Object.values(this.discoveredUnits).filter(Boolean).length;
    const ownedSkinCount = Object.values(this.ownedSkins).filter(Boolean).length;
    const clearedTrialCount = Object.values(this.clearedTrials).filter(Boolean).length;
    const unlockedTitleCount = Object.values(this.unlockedTitles).filter(Boolean).length;
    const dailyQuests = this.buildDailyQuestViews(dateKey);
    const claimableDailyCount = dailyQuests.filter((q) => q.completed && !q.claimed).length;
    const trialRecordsCopy: Record<TrialId, TrialRecord> = {
      trial_venom_gale: { ...this.trialRecords.trial_venom_gale },
      trial_sword_tomb: { ...this.trialRecords.trial_sword_tomb },
      trial_crimson_iron: { ...this.trialRecords.trial_crimson_iron },
      trial_chaos_trinity: { ...this.trialRecords.trial_chaos_trinity },
      trial_gale_blitz: { ...this.trialRecords.trial_gale_blitz },
      trial_abyss_sanctum: { ...this.trialRecords.trial_abyss_sanctum },
    };
    return {
      gold: this.gold,
      keys: this.keys,
      silk: this.silk,
      relics: { ...this.relics },
      totalRuns: this.totalRuns,
      bestWave: this.bestWave,
      selectedRunMode: this.selectedRunMode,
      selectedDifficulty: this.selectedDifficulty,
      selectedTrialId: this.selectedTrialId,
      unlockedDifficulties: { ...this.unlockedDifficulties },
      clearedDifficulties: { ...this.clearedDifficulties },
      difficultyBestWave: { ...this.difficultyBestWave },
      clearedTrials: { ...this.clearedTrials },
      trialRecords: trialRecordsCopy,
      clearedTrialCount,
      dailyChallengeToday: this.dailyChallengeRecords[this.dailyDate]
        ? { ...this.dailyChallengeRecords[this.dailyDate]! }
        : null,
      dailyChallengeStreak: this.dailyChallengeStreak,
      bossRushRecord: { ...this.bossRushRecord },
      endlessMilestonesCleared: [...this.endlessMilestonesCleared].sort((a, b) => a - b),
      hallOfFame: this.hallOfFame.map((e) => ({ ...e })),
      unlockedTitles: { ...this.unlockedTitles },
      unlockedTitleCount,
      equippedTitle: this.equippedTitle,
      discoveredUnits: { ...this.discoveredUnits },
      discoveredCount,
      ownedSkins: { ...this.ownedSkins },
      ownedSkinCount,
      equippedHeroSkins: { ...this.equippedHeroSkins },
      equippedCourtSkin: this.equippedCourtSkin,
      dailyDate: this.dailyDate,
      dailyQuests,
      claimableDailyCount,
      totalDailyClaimed: this.totalDailyClaimed,
      tutorialDone: this.tutorialDone,
      rev: this.rev,
    };
  }

  public isTutorialDone(): boolean {
    return this.tutorialDone;
  }

  public setTutorialDone(done: boolean): void {
    if (this.tutorialDone === done) return;
    this.tutorialDone = done;
    this.rev++;
    this.save();
  }

  public getRelicLevels(): Readonly<Record<RelicId, number>> {
    return { ...this.relics };
  }

  public getSelectedRunMode(): RunModeId {
    return this.selectedRunMode;
  }

  public getSelectedDifficulty(): DifficultyId {
    return this.selectedDifficulty;
  }

  public getSelectedTrialId(): TrialId | null {
    return this.selectedTrialId;
  }

  public getEquippedHeroSkins(): Readonly<Record<UnitId, string>> {
    return { ...this.equippedHeroSkins };
  }

  public getEquippedCourtSkin(): CourtSkinId {
    return this.equippedCourtSkin;
  }

  public getEquippedTitle(): TitleId | null {
    return this.equippedTitle;
  }

  public equipTitle(titleId: TitleId | null): boolean {
    if (titleId === null) {
      if (this.equippedTitle === null) return true;
      this.equippedTitle = null;
      this.rev++;
      this.save();
      return true;
    }
    if (!TITLES_BY_ID.has(titleId) || !this.unlockedTitles[titleId]) {
      return false;
    }
    this.equippedTitle = titleId;
    this.rev++;
    this.save();
    return true;
  }

  public setSelectedRunMode(mode: RunModeId): boolean {
    if (mode !== 'standard' && mode !== 'daily_challenge' && mode !== 'boss_rush') {
      return false;
    }
    if (this.selectedRunMode !== mode || (mode !== 'standard' && this.selectedTrialId !== null)) {
      this.clearActiveRun();
    }
    this.selectedRunMode = mode;
    if (mode !== 'standard') {
      this.selectedTrialId = null;
    }
    this.rev++;
    this.save();
    return true;
  }

  public setSelectedDifficulty(diff: DifficultyId): boolean {
    if (!this.unlockedDifficulties[diff]) {
      return false;
    }
    if (
      this.selectedDifficulty !== diff ||
      this.selectedTrialId !== null ||
      this.selectedRunMode !== 'standard'
    ) {
      this.clearActiveRun();
    }
    this.selectedRunMode = 'standard';
    this.selectedDifficulty = diff;
    this.selectedTrialId = null;
    this.rev++;
    this.save();
    return true;
  }

  public setSelectedTrial(trialId: TrialId | null): boolean {
    if (trialId !== null && !(TRIAL_ORDER as readonly string[]).includes(trialId)) {
      return false;
    }
    if (this.selectedTrialId !== trialId || this.selectedRunMode !== 'standard') {
      this.clearActiveRun();
    }
    this.selectedRunMode = 'standard';
    this.selectedTrialId = trialId;
    this.rev++;
    this.save();
    return true;
  }

  public discoverUnit(unitDef: UnitDef, gradeDef: GradeDef): CodexDiscoveryResult {
    if (this.discoveredUnits[unitDef.id]) {
      return {
        isNew: false,
        unitId: unitDef.id,
        unitName: unitDef.name,
        gradeName: gradeDef.name,
        bonusGold: 0,
        bonusKeys: 0,
      };
    }
    this.discoveredUnits[unitDef.id] = true;
    const reward = getCodexDiscoveryReward(gradeDef);
    this.gold += reward.gold;
    this.keys += reward.keys;
    const titleRes = this.evaluateTitles(true);
    this.rev++;
    this.save();

    return {
      isNew: true,
      unitId: unitDef.id,
      unitName: unitDef.name,
      gradeName: gradeDef.name,
      bonusGold: reward.gold,
      bonusKeys: reward.keys,
      unlockedTitleIds: titleRes.unlockedIds,
    };
  }

  public hasActionableBadge(relicDefs: readonly RelicDef[]): number {
    if (this.keys > 0) {
      return this.keys;
    }
    const allMaxed = relicDefs.every((d) => (this.relics[d.id] ?? 0) >= d.maxLevel);
    if (!allMaxed && this.gold >= RELIC_CHEST_GOLD_COST) {
      return 1;
    }
    for (let i = 0; i < relicDefs.length; i++) {
      const def = relicDefs[i]!;
      const lv = this.relics[def.id] ?? 0;
      if (lv > 0 && lv < def.maxLevel && this.gold >= getRelicUpgradeGoldCost(def, lv)) {
        return 1;
      }
    }
    return 0;
  }

  public drawRelic(
    relicDefs: readonly RelicDef[],
    payWith: 'key' | 'gold',
    rngFn: () => number = Math.random,
  ): RelicDrawResult {
    const candidates = relicDefs.filter((d) => (this.relics[d.id] ?? 0) < d.maxLevel);
    if (candidates.length === 0) {
      return {
        ok: false,
        reason: `모든 무림 신물이 이미 태극신화(Lv.${RELIC_MAX_LEVEL})에 도달했습니다!`,
      };
    }

    if (payWith === 'key') {
      if (this.keys < 1) {
        return { ok: false, reason: '보유한 기보함 열쇠가 부족합니다.' };
      }
      this.keys -= 1;
    } else {
      if (this.gold < RELIC_CHEST_GOLD_COST) {
        return {
          ok: false,
          reason: `천하주화가 부족합니다 (${RELIC_CHEST_GOLD_COST} 필요)`,
        };
      }
      this.gold -= RELIC_CHEST_GOLD_COST;
    }

    const chosen = this.pickWeightedRelicCandidate(candidates, rngFn);
    const prevLevel = this.relics[chosen.id] ?? 0;
    const newLevel = Math.min(chosen.maxLevel, prevLevel + 1);
    this.relics[chosen.id] = newLevel;
    const titleRes = this.evaluateTitles(true);
    this.rev++;
    this.save();

    return {
      ok: true,
      relicId: chosen.id,
      prevLevel,
      newLevel,
      isNew: prevLevel === 0,
      unlockedTitleIds: titleRes.unlockedIds,
    };
  }

  public drawRelicBatch(
    relicDefs: readonly RelicDef[],
    maxCount: number,
    payWith: 'key' | 'gold',
    rngFn: () => number = Math.random,
  ): RelicBatchDrawResult {
    const targetPulls = Math.max(1, Math.min(10, Math.floor(maxCount)));
    const initialCandidates = relicDefs.filter((d) => (this.relics[d.id] ?? 0) < d.maxLevel);
    if (initialCandidates.length === 0) {
      return {
        ok: false,
        reason: `모든 무림 신물이 이미 태극신화(Lv.${RELIC_MAX_LEVEL})에 도달했습니다!`,
      };
    }

    const affordableCount =
      payWith === 'key' ? this.keys : Math.floor(this.gold / RELIC_CHEST_GOLD_COST);
    if (affordableCount < 1) {
      return {
        ok: false,
        reason:
          payWith === 'key'
            ? '보유한 기보함 열쇠가 부족합니다.'
            : `천하주화가 부족합니다 (${RELIC_CHEST_GOLD_COST} 필요)`,
      };
    }

    const pullsToRun = Math.min(targetPulls, affordableCount);
    const items: RelicBatchPullItem[] = [];

    for (let i = 0; i < pullsToRun; i++) {
      const candidates = relicDefs.filter((d) => (this.relics[d.id] ?? 0) < d.maxLevel);
      if (candidates.length === 0) break;

      if (payWith === 'key') {
        this.keys -= 1;
      } else {
        this.gold -= RELIC_CHEST_GOLD_COST;
      }

      const chosen = this.pickWeightedRelicCandidate(candidates, rngFn);
      const prevLevel = this.relics[chosen.id] ?? 0;
      const newLevel = Math.min(chosen.maxLevel, prevLevel + 1);
      this.relics[chosen.id] = newLevel;
      items.push({
        relicId: chosen.id,
        prevLevel,
        newLevel,
        isNew: prevLevel === 0,
      });
    }

    const titleRes = this.evaluateTitles(true);
    this.rev++;
    this.save();

    return {
      ok: true,
      items,
      spentCount: items.length,
      unlockedTitleIds: titleRes.unlockedIds,
    };
  }

  private pickWeightedRelicCandidate(
    candidates: readonly RelicDef[],
    rngFn: () => number,
  ): RelicDef {
    // Weight unowned relics 2.5x so players unlock diverse relics smoothly
    let totalWeight = 0;
    for (let i = 0; i < candidates.length; i++) {
      const lv = this.relics[candidates[i]!.id] ?? 0;
      totalWeight += lv === 0 ? 25 : 10;
    }

    const r = Math.max(0, Math.min(0.999999, rngFn()));
    let roll = Math.floor(r * totalWeight);
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i]!;
      const w = (this.relics[cand.id] ?? 0) === 0 ? 25 : 10;
      if (roll < w) {
        return cand;
      }
      roll -= w;
    }
    return candidates[0]!;
  }

  public upgradeRelic(def: RelicDef): RelicUpgradeResult {
    const prevLevel = this.relics[def.id] ?? 0;
    if (prevLevel >= def.maxLevel) {
      return { ok: false, reason: `이미 태극신화(Lv.${def.maxLevel})에 도달했습니다.` };
    }

    const cost = getRelicUpgradeGoldCost(def, prevLevel);
    if (this.gold < cost) {
      return { ok: false, reason: `천하주화가 부족합니다 (${cost} 필요)` };
    }

    this.gold -= cost;
    const newLevel = prevLevel + 1;
    this.relics[def.id] = newLevel;
    const titleRes = this.evaluateTitles(true);
    this.rev++;
    this.save();

    return {
      ok: true,
      relicId: def.id,
      prevLevel,
      newLevel,
      wasUnlock: prevLevel === 0,
      spentGold: cost,
      unlockedTitleIds: titleRes.unlockedIds,
    };
  }

  public drawSkinGacha(
    heroSkins: readonly HeroSkinDef[],
    courtSkins: readonly CourtSkinDef[],
    count: 1 | 5,
    payWith: 'gold' | 'key',
    rngFn: () => number = Math.random,
  ): SkinGachaResult {
    type GachaCandidate =
      | { readonly kind: 'hero'; readonly def: HeroSkinDef }
      | { readonly kind: 'court'; readonly def: CourtSkinDef };

    const allCandidates: GachaCandidate[] = [];
    for (const h of heroSkins) {
      if (h.rarity !== 'achievement' && h.silkCost > 0) {
        allCandidates.push({ kind: 'hero', def: h });
      }
    }
    for (const c of courtSkins) {
      if (c.rarity !== 'achievement' && c.silkCost > 0) {
        allCandidates.push({ kind: 'court', def: c });
      }
    }
    if (allCandidates.length === 0) {
      return { ok: false, reason: '초빙 가능한 의복·테마 목록이 없습니다.' };
    }

    if (payWith === 'key') {
      if (this.keys < count) {
        return { ok: false, reason: `보유한 기보함 열쇠가 부족합니다 (${count}개 필요)` };
      }
      this.keys -= count;
    } else {
      const goldCost = count === 5 ? SKIN_MULTI5_GOLD_COST : SKIN_SINGLE_GOLD_COST;
      if (this.gold < goldCost) {
        return { ok: false, reason: `천하주화가 부족합니다 (${goldCost} 필요)` };
      }
      this.gold -= goldCost;
    }

    const rarePool = allCandidates.filter((c) => c.def.rarity === 'rare');
    const legendaryPool = allCandidates.filter((c) => c.def.rarity === 'legendary');
    const mythicPool = allCandidates.filter((c) => c.def.rarity === 'mythic');

    const items: SkinPullItem[] = [];
    let totalSilkRefund = 0;

    for (let i = 0; i < count; i++) {
      const tierRoll = Math.max(0, Math.min(0.999999, rngFn())) * 100;
      let pool: GachaCandidate[];
      if (tierRoll < 15 && mythicPool.length > 0) {
        pool = mythicPool;
      } else if (tierRoll < 50 && legendaryPool.length > 0) {
        pool = legendaryPool;
      } else if (rarePool.length > 0) {
        pool = rarePool;
      } else {
        pool = allCandidates;
      }

      const pickIdx = Math.floor(Math.max(0, Math.min(0.999999, rngFn())) * pool.length);
      const picked = pool[pickIdx] ?? pool[0]!;
      const skinId = picked.def.id;
      const wasOwned = Boolean(this.ownedSkins[skinId]);

      if (wasOwned) {
        const refund = getSkinDuplicateSilk(picked.def.rarity);
        this.silk += refund;
        totalSilkRefund += refund;
        items.push({
          skinId,
          name: picked.def.name,
          rarity: picked.def.rarity,
          kind: picked.kind,
          unitId: picked.kind === 'hero' ? picked.def.unitId : undefined,
          isNew: false,
          silkRefund: refund,
        });
      } else {
        this.ownedSkins[skinId] = true;
        if (picked.kind === 'hero' && !this.equippedHeroSkins[picked.def.unitId]) {
          this.equippedHeroSkins[picked.def.unitId] = skinId;
        }
        items.push({
          skinId,
          name: picked.def.name,
          rarity: picked.def.rarity,
          kind: picked.kind,
          unitId: picked.kind === 'hero' ? picked.def.unitId : undefined,
          isNew: true,
          silkRefund: 0,
        });
      }
    }

    this.rev++;
    this.save();
    return {
      ok: true,
      items,
      totalSilkRefund,
    };
  }

  public craftSkinWithSilk(skin: HeroSkinDef | CourtSkinDef): SkinCraftResult {
    if (this.ownedSkins[skin.id]) {
      return { ok: false, reason: '이미 보유 중인 의복·테마입니다.' };
    }
    if (skin.rarity === 'achievement' || skin.silkCost <= 0) {
      return { ok: false, reason: '업적 한정 스킨은 조건 달성으로만 해금할 수 있습니다.' };
    }
    if (this.silk < skin.silkCost) {
      return { ok: false, reason: `운금비단이 부족합니다 (${skin.silkCost}필 필요)` };
    }

    this.silk -= skin.silkCost;
    this.ownedSkins[skin.id] = true;
    if ('unitId' in skin) {
      this.equippedHeroSkins[skin.unitId] = skin.id;
    } else {
      this.equippedCourtSkin = skin.id;
    }
    this.rev++;
    this.save();

    return {
      ok: true,
      skinId: skin.id,
      name: skin.name,
      spentSilk: skin.silkCost,
    };
  }

  public equipHeroSkin(
    unitId: UnitId,
    skinId: string | null,
    heroSkinsById: ReadonlyMap<string, HeroSkinDef>,
  ): boolean {
    if (skinId === null) {
      if (!this.equippedHeroSkins[unitId]) return true;
      delete this.equippedHeroSkins[unitId];
      this.rev++;
      this.save();
      return true;
    }
    const def = heroSkinsById.get(skinId);
    if (!def || def.unitId !== unitId || !this.ownedSkins[skinId]) {
      return false;
    }
    this.equippedHeroSkins[unitId] = skinId;
    this.rev++;
    this.save();
    return true;
  }

  public equipCourtSkin(courtId: CourtSkinId): boolean {
    if (!VALID_COURT_SKIN_SET.has(courtId) || !this.ownedSkins[courtId]) {
      return false;
    }
    this.equippedCourtSkin = courtId;
    this.rev++;
    this.save();
    return true;
  }

  private unlockEligibleAchievementSkins(): string[] {
    const newlyUnlocked: string[] = [];
    const anyTrialCleared = Object.values(this.clearedTrials).some(Boolean);
    const allTrialsCleared = TRIAL_ORDER.every((t) => this.clearedTrials[t]);
    const anyCleared =
      this.clearedDifficulties.normal ||
      this.clearedDifficulties.hard ||
      this.clearedDifficulties.hell ||
      this.clearedDifficulties.abyss ||
      anyTrialCleared;

    if (anyCleared && !this.ownedSkins.court_golden_palace) {
      this.ownedSkins.court_golden_palace = true;
      newlyUnlocked.push('court_golden_palace');
    }
    if (this.clearedDifficulties.hard && !this.ownedSkins.skin_hell_flame_nirvana) {
      this.ownedSkins.skin_hell_flame_nirvana = true;
      if (!this.equippedHeroSkins.hell_flame_sovereign) {
        this.equippedHeroSkins.hell_flame_sovereign = 'skin_hell_flame_nirvana';
      }
      newlyUnlocked.push('skin_hell_flame_nirvana');
    }
    if (this.clearedDifficulties.hell && !this.ownedSkins.skin_cheonma_golden_emperor) {
      this.ownedSkins.skin_cheonma_golden_emperor = true;
      if (!this.equippedHeroSkins.cheonma) {
        this.equippedHeroSkins.cheonma = 'skin_cheonma_golden_emperor';
      }
      newlyUnlocked.push('skin_cheonma_golden_emperor');
    }
    if (this.clearedDifficulties.abyss && !this.ownedSkins.skin_asura_blood_eclipse) {
      this.ownedSkins.skin_asura_blood_eclipse = true;
      if (!this.equippedHeroSkins.asura_emperor) {
        this.equippedHeroSkins.asura_emperor = 'skin_asura_blood_eclipse';
      }
      newlyUnlocked.push('skin_asura_blood_eclipse');
    }
    if (allTrialsCleared && !this.ownedSkins.skin_sword_immortal_celestial) {
      this.ownedSkins.skin_sword_immortal_celestial = true;
      if (!this.equippedHeroSkins.sword_immortal) {
        this.equippedHeroSkins.sword_immortal = 'skin_sword_immortal_celestial';
      }
      newlyUnlocked.push('skin_sword_immortal_celestial');
    }
    if (this.bestWave >= 35 && !this.ownedSkins.skin_sword_demon_azure) {
      this.ownedSkins.skin_sword_demon_azure = true;
      if (!this.equippedHeroSkins.sword_demon) {
        this.equippedHeroSkins.sword_demon = 'skin_sword_demon_azure';
      }
      newlyUnlocked.push('skin_sword_demon_azure');
    }
    if (this.bestWave >= 55 && !this.ownedSkins.skin_thunder_jade_sovereign) {
      this.ownedSkins.skin_thunder_jade_sovereign = true;
      if (!this.equippedHeroSkins.thunder_emperor) {
        this.equippedHeroSkins.thunder_emperor = 'skin_thunder_jade_sovereign';
      }
      newlyUnlocked.push('skin_thunder_jade_sovereign');
    }
    return newlyUnlocked;
  }

  private evaluateTitles(grantRewards: boolean): {
    readonly unlockedIds: readonly TitleId[];
    readonly bonusGold: number;
    readonly bonusKeys: number;
    readonly bonusSilk: number;
  } {
    const profile = this.getProfile(this.dailyDate);
    const unlockedIds: TitleId[] = [];
    let bonusGold = 0;
    let bonusKeys = 0;
    let bonusSilk = 0;

    for (let i = 0; i < TITLE_DEFS.length; i++) {
      const def = TITLE_DEFS[i]!;
      if (this.unlockedTitles[def.id]) continue;
      const prog = computeTitleProgress(profile, def);
      if (prog.current >= prog.target) {
        this.unlockedTitles[def.id] = true;
        unlockedIds.push(def.id);
        if (this.equippedTitle === null) {
          this.equippedTitle = def.id;
        }
        if (grantRewards) {
          this.gold += def.rewardGold;
          this.keys += def.rewardKeys;
          this.silk += def.rewardSilk;
          bonusGold += def.rewardGold;
          bonusKeys += def.rewardKeys;
          bonusSilk += def.rewardSilk;
        }
      }
    }

    return { unlockedIds, bonusGold, bonusKeys, bonusSilk };
  }

  private awardEndlessMilestones(wave: number): {
    readonly unlockedWaves: number[];
    readonly bonusGold: number;
    readonly bonusKeys: number;
    readonly bonusSilk: number;
  } {
    const unlockedWaves: number[] = [];
    let bonusGold = 0;
    let bonusKeys = 0;
    let bonusSilk = 0;
    for (let i = 0; i < ENDLESS_MILESTONES.length; i++) {
      const ms = ENDLESS_MILESTONES[i]!;
      if (wave >= ms.wave && !this.endlessMilestonesCleared.has(ms.wave)) {
        this.endlessMilestonesCleared.add(ms.wave);
        unlockedWaves.push(ms.wave);
        bonusGold += ms.rewardGold;
        bonusKeys += ms.rewardKeys;
        bonusSilk += ms.rewardSilk;
      }
    }
    if (bonusGold > 0) this.gold += bonusGold;
    if (bonusKeys > 0) this.keys += bonusKeys;
    if (bonusSilk > 0) this.silk += bonusSilk;
    return { unlockedWaves, bonusGold, bonusKeys, bonusSilk };
  }

  private recordHallOfFame(entry: HallOfFameEntry): void {
    const minWave = entry.runMode === 'boss_rush' ? 2 : 5;
    if (entry.wave < minWave) return;
    this.hallOfFame.push(entry);
    this.hallOfFame.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.wave !== a.wave) return b.wave - a.wave;
      return b.totalDamage - a.totalDamage;
    });
    if (this.hallOfFame.length > 12) {
      this.hallOfFame.length = 12;
    }
  }

  private static isConsecutiveDay(prevDateKey: string | null, currDateKey: string): boolean {
    if (!prevDateKey || prevDateKey === currDateKey) return false;
    const prevMs = Date.parse(`${prevDateKey}T00:00:00Z`);
    const currMs = Date.parse(`${currDateKey}T00:00:00Z`);
    if (!Number.isFinite(prevMs) || !Number.isFinite(currMs)) return false;
    const diffDays = Math.round((currMs - prevMs) / 86_400_000);
    return diffDays === 1;
  }

  public settleRun(input: SettlementInput): SettlementRecord {
    const runMode: RunModeId = input.runMode ?? 'standard';
    const diff = input.difficulty ?? 'normal';
    const trialId = runMode === 'standard' ? (input.trialId ?? null) : null;
    const victory = Boolean(input.victory);
    const bountiesSlain = Math.max(0, Math.floor(input.bountiesSlain ?? 0));
    const reward = computeSettlementReward(input);
    const wave = Math.max(1, Math.floor(input.wave));
    const isNewBest = runMode === 'standard' && wave > this.bestWave;
    const elapsedTicks =
      typeof input.elapsedTicks === 'number' &&
      Number.isFinite(input.elapsedTicks) &&
      input.elapsedTicks > 0
        ? Math.floor(input.elapsedTicks)
        : null;
    const dateKey = input.dateKey ?? getLocalDateKey();

    let firstClearBonusGold = 0;
    let firstClearBonusKeys = 0;
    let firstClearBonusSilk = 0;
    let unlockedNextDifficulty: DifficultyId | null = null;
    let dailyChallengeScore: number | undefined;

    if (runMode === 'daily_challenge') {
      dailyChallengeScore = computeDailyChallengeScore(
        wave,
        Math.max(0, Math.floor(input.bossesSlain)),
        victory,
        elapsedTicks ?? 36000,
      );
      const prev = this.dailyChallengeRecords[dateKey];
      const prevTier = prev?.rewardTierClaimed ?? 0;
      let nextTier: 0 | 1 | 2 = prevTier;
      if (wave >= 10 && prevTier < 1) {
        firstClearBonusGold += 120;
        firstClearBonusKeys += 1;
        firstClearBonusSilk += 15;
        nextTier = 1;
      }
      if (victory && prevTier < 2) {
        firstClearBonusGold += 250;
        firstClearBonusKeys += 2;
        firstClearBonusSilk += 35;
        nextTier = 2;
      }
      if (this.lastDailyChallengeDate !== dateKey) {
        this.dailyChallengeStreak = MetaStore.isConsecutiveDay(this.lastDailyChallengeDate, dateKey)
          ? this.dailyChallengeStreak + 1
          : 1;
        this.lastDailyChallengeDate = dateKey;
      }
      this.dailyChallengeRecords[dateKey] = {
        dateKey,
        bestWave: Math.max(prev?.bestWave ?? 0, wave),
        bestScore: Math.max(prev?.bestScore ?? 0, dailyChallengeScore),
        cleared: Boolean(prev?.cleared || victory),
        bestTicks:
          victory && elapsedTicks !== null
            ? prev?.bestTicks != null
              ? Math.min(prev.bestTicks, elapsedTicks)
              : elapsedTicks
            : (prev?.bestTicks ?? null),
        rewardTierClaimed: nextTier,
      };
    } else if (runMode === 'boss_rush') {
      const prev = this.bossRushRecord;
      const wasFirstClear = victory && prev.clears === 0;
      this.bossRushRecord = {
        clears: prev.clears + (victory ? 1 : 0),
        bestStage: Math.max(prev.bestStage, wave),
        bestTicks:
          victory && elapsedTicks !== null
            ? prev.bestTicks !== null
              ? Math.min(prev.bestTicks, elapsedTicks)
              : elapsedTicks
            : prev.bestTicks,
      };
      if (wasFirstClear) {
        firstClearBonusGold = 350;
        firstClearBonusKeys = 3;
        firstClearBonusSilk = 50;
      } else if (victory) {
        firstClearBonusGold = 180;
        firstClearBonusKeys = 1;
        firstClearBonusSilk = 20;
      }
    } else if (trialId !== null) {
      const prevRec = this.trialRecords[trialId];
      this.trialRecords[trialId] = {
        clears: prevRec.clears + (victory ? 1 : 0),
        bestWave: Math.max(prevRec.bestWave, wave),
        bestTicks:
          victory && elapsedTicks !== null
            ? prevRec.bestTicks === null
              ? elapsedTicks
              : Math.min(prevRec.bestTicks, elapsedTicks)
            : prevRec.bestTicks,
      };
      if (victory && !this.clearedTrials[trialId]) {
        this.clearedTrials[trialId] = true;
        const tCfg = TRIAL_CONFIGS[trialId];
        firstClearBonusGold = tCfg.firstClearGold;
        firstClearBonusKeys = tCfg.firstClearKeys;
        firstClearBonusSilk = tCfg.firstClearSilk;
      }
    } else {
      if (wave > this.difficultyBestWave[diff]) {
        this.difficultyBestWave[diff] = wave;
      }
      if (victory && !this.clearedDifficulties[diff]) {
        this.clearedDifficulties[diff] = true;
        const cfg = DIFFICULTY_CONFIGS[diff];
        firstClearBonusGold = cfg.firstClearGold;
        firstClearBonusKeys = cfg.firstClearKeys;

        if (diff === 'normal' && !this.unlockedDifficulties.hard) {
          this.unlockedDifficulties.hard = true;
          unlockedNextDifficulty = 'hard';
        } else if (diff === 'hard' && !this.unlockedDifficulties.hell) {
          this.unlockedDifficulties.hell = true;
          unlockedNextDifficulty = 'hell';
        } else if (diff === 'hell' && !this.unlockedDifficulties.abyss) {
          this.unlockedDifficulties.abyss = true;
          unlockedNextDifficulty = 'abyss';
        }
      }
    }

    const endlessMs =
      runMode === 'standard'
        ? this.awardEndlessMilestones(wave)
        : { unlockedWaves: [], bonusGold: 0, bonusKeys: 0, bonusSilk: 0 };

    const totalGoldGain = reward.goldEarned + firstClearBonusGold;
    const totalKeysGain = reward.keysEarned + firstClearBonusKeys;

    this.gold += totalGoldGain;
    this.keys += totalKeysGain;
    this.silk += firstClearBonusSilk;
    this.totalRuns += 1;
    if (isNewBest) {
      this.bestWave = wave;
    }

    const totalDamage = Math.max(0, Math.floor(input.totalDamage ?? 0));
    const modeScore =
      dailyChallengeScore ??
      (runMode === 'boss_rush'
        ? wave * 2500 + (victory ? 8000 : 0)
        : wave * 1000 +
          (diff === 'abyss' ? 6000 : diff === 'hell' ? 3500 : diff === 'hard' ? 1500 : 0) +
          (trialId ? 4000 : 0) +
          (victory ? 3000 : 0));
    this.recordHallOfFame({
      id: `${dateKey}-${this.totalRuns}-${wave}`,
      dateKey,
      runMode,
      difficulty: diff,
      trialId,
      wave,
      victory,
      totalDamage,
      topHeroId: input.topHeroId ?? null,
      topHeroName: input.topHeroName ?? null,
      elapsedTicks,
      score: modeScore,
    });

    this.advanceDailyQuests(input, victory, wave);
    const unlockedSkinIds = this.unlockEligibleAchievementSkins();
    const titleRes = this.evaluateTitles(true);
    this.clearActiveRun();
    this.rev++;
    this.save();

    return {
      wave,
      clearedWaves: reward.clearedWaves,
      monstersSlain: Math.max(0, Math.floor(input.monstersSlain)),
      bossesSlain: Math.max(0, Math.floor(input.bossesSlain)),
      bountiesSlain,
      difficulty: diff,
      trialId,
      runMode,
      victory,
      firstClearBonusGold,
      firstClearBonusKeys,
      firstClearBonusSilk,
      unlockedNextDifficulty,
      unlockedEndlessMilestones: endlessMs.unlockedWaves,
      endlessBonusGold: endlessMs.bonusGold,
      endlessBonusKeys: endlessMs.bonusKeys,
      endlessBonusSilk: endlessMs.bonusSilk,
      ...(dailyChallengeScore !== undefined ? { dailyChallengeScore } : {}),
      unlockedSkinIds,
      unlockedTitleIds: titleRes.unlockedIds,
      titleBonusGold: titleRes.bonusGold,
      titleBonusKeys: titleRes.bonusKeys,
      titleBonusSilk: titleRes.bonusSilk,
      goldEarned: totalGoldGain + endlessMs.bonusGold,
      keysEarned: totalKeysGain + endlessMs.bonusKeys,
      totalGold: this.gold,
      totalKeys: this.keys,
      totalSilk: this.silk,
      isNewBest,
    };
  }

  public settleEndlessOvertime(
    prevRecord: SettlementRecord,
    finalInput: SettlementInput,
  ): SettlementRecord {
    const prevBase = computeSettlementReward({
      wave: prevRecord.wave,
      monstersSlain: prevRecord.monstersSlain,
      bossesSlain: prevRecord.bossesSlain,
      bountiesSlain: prevRecord.bountiesSlain,
      difficulty: prevRecord.difficulty,
      trialId: prevRecord.trialId,
      victory: prevRecord.victory,
    });
    const finalBase = computeSettlementReward({
      ...finalInput,
      difficulty: prevRecord.difficulty,
      trialId: prevRecord.trialId,
      victory: prevRecord.victory,
    });

    const deltaGold = Math.max(0, finalBase.goldEarned - prevBase.goldEarned);
    const deltaKeys = Math.max(0, finalBase.keysEarned - prevBase.keysEarned);
    const wave = Math.max(prevRecord.wave, Math.floor(finalInput.wave));
    const isNewBest = prevRecord.runMode === 'standard' && (wave > this.bestWave || prevRecord.isNewBest);

    this.gold += deltaGold;
    this.keys += deltaKeys;
    if (prevRecord.runMode === 'standard' && wave > this.bestWave) {
      this.bestWave = wave;
    }
    if (prevRecord.trialId !== null) {
      const prevRec = this.trialRecords[prevRecord.trialId];
      if (wave > prevRec.bestWave) {
        this.trialRecords[prevRecord.trialId] = {
          ...prevRec,
          bestWave: wave,
        };
      }
    } else if (prevRecord.runMode === 'standard' && wave > this.difficultyBestWave[prevRecord.difficulty]) {
      this.difficultyBestWave[prevRecord.difficulty] = wave;
    }

    const endlessMs =
      prevRecord.runMode === 'standard'
        ? this.awardEndlessMilestones(wave)
        : { unlockedWaves: [], bonusGold: 0, bonusKeys: 0, bonusSilk: 0 };

    if (wave >= 35) {
      const dateKey = finalInput.dateKey ?? getLocalDateKey();
      const totalDamage = Math.max(0, Math.floor(finalInput.totalDamage ?? 0));
      this.recordHallOfFame({
        id: `${dateKey}-endless-${this.totalRuns}-${wave}`,
        dateKey,
        runMode: prevRecord.runMode,
        difficulty: prevRecord.difficulty,
        trialId: prevRecord.trialId,
        wave,
        victory: true,
        totalDamage,
        topHeroId: finalInput.topHeroId ?? null,
        topHeroName: finalInput.topHeroName ?? null,
        elapsedTicks:
          typeof finalInput.elapsedTicks === 'number' ? Math.floor(finalInput.elapsedTicks) : null,
        score:
          wave * 1000 +
          (prevRecord.difficulty === 'abyss'
            ? 6000
            : prevRecord.difficulty === 'hell'
              ? 3500
              : prevRecord.difficulty === 'hard'
                ? 1500
                : 0) +
          (prevRecord.trialId ? 4000 : 0) +
          3000,
      });
    }

    // Advance endless overtime deltas on today's daily quests without double-counting run/clear quests
    this.ensureDailyDate(finalInput.dateKey ?? getLocalDateKey());
    const deltaMonsters = Math.max(0, Math.floor(finalInput.monstersSlain) - prevRecord.monstersSlain);
    const deltaBosses = Math.max(0, Math.floor(finalInput.bossesSlain) - prevRecord.bossesSlain);
    const todayDefs = pickDailyQuestsForDate(this.dailyDate);
    for (let i = 0; i < todayDefs.length; i++) {
      const def = todayDefs[i]!;
      const prev = Math.max(0, Math.floor(this.dailyProgress[def.id] ?? 0));
      let next = prev;
      if (def.id === 'dq_slay_180') next = prev + deltaMonsters;
      else if (def.id === 'dq_boss_3') next = prev + deltaBosses;
      else if (def.id === 'dq_endless_35' && wave >= 35) next = Math.max(prev, 1);
      else if (def.id === 'dq_formation_6' && finalInput.usedHighFormation) next = Math.max(prev, 1);
      else if (def.id === 'dq_craft_immortal' && finalInput.craftedImmortal) next = Math.max(prev, 1);
      this.dailyProgress[def.id] = Math.min(def.target, next);
    }

    const overtimeUnlocked = this.unlockEligibleAchievementSkins();
    const mergedSkins = [
      ...prevRecord.unlockedSkinIds,
      ...overtimeUnlocked.filter((id) => !prevRecord.unlockedSkinIds.includes(id)),
    ];
    const overtimeTitles = this.evaluateTitles(true);
    const mergedTitles = [
      ...prevRecord.unlockedTitleIds,
      ...overtimeTitles.unlockedIds.filter((id) => !prevRecord.unlockedTitleIds.includes(id)),
    ];
    const mergedMilestones = [
      ...prevRecord.unlockedEndlessMilestones,
      ...endlessMs.unlockedWaves.filter((w) => !prevRecord.unlockedEndlessMilestones.includes(w)),
    ].sort((a, b) => a - b);

    this.clearActiveRun();
    this.rev++;
    this.save();

    return {
      ...prevRecord,
      wave,
      clearedWaves: finalBase.clearedWaves,
      monstersSlain: Math.max(prevRecord.monstersSlain, Math.floor(finalInput.monstersSlain)),
      bossesSlain: Math.max(prevRecord.bossesSlain, Math.floor(finalInput.bossesSlain)),
      bountiesSlain: Math.max(
        prevRecord.bountiesSlain,
        Math.floor(finalInput.bountiesSlain ?? 0),
      ),
      unlockedEndlessMilestones: mergedMilestones,
      endlessBonusGold: prevRecord.endlessBonusGold + endlessMs.bonusGold,
      endlessBonusKeys: prevRecord.endlessBonusKeys + endlessMs.bonusKeys,
      endlessBonusSilk: prevRecord.endlessBonusSilk + endlessMs.bonusSilk,
      unlockedSkinIds: mergedSkins,
      unlockedTitleIds: mergedTitles,
      titleBonusGold: prevRecord.titleBonusGold + overtimeTitles.bonusGold,
      titleBonusKeys: prevRecord.titleBonusKeys + overtimeTitles.bonusKeys,
      titleBonusSilk: prevRecord.titleBonusSilk + overtimeTitles.bonusSilk,
      goldEarned: prevRecord.goldEarned + deltaGold + endlessMs.bonusGold,
      keysEarned: prevRecord.keysEarned + deltaKeys + endlessMs.bonusKeys,
      totalGold: this.gold,
      totalKeys: this.keys,
      totalSilk: this.silk,
      isNewBest,
    };
  }

  public saveActiveRun(run: RunSaveData): void {
    if (!this.storage) return;
    if (run.gameOver) {
      this.clearActiveRun();
      return;
    }
    try {
      this.storage.setItem(RUN_STORAGE_KEY, JSON.stringify(run));
    } catch {
      // Quota or private browsing — ignore silently
    }
  }

  public loadActiveRunMigrated(data: GameDataBundle): SaveMigrationResult {
    if (!this.storage) {
      return { save: null, migratedFrom: null, discardedReason: null };
    }
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(RUN_STORAGE_KEY);
    } catch {
      return { save: null, migratedFrom: null, discardedReason: null };
    }
    if (!raw) {
      return { save: null, migratedFrom: null, discardedReason: null };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.clearActiveRun();
      return {
        save: null,
        migratedFrom: null,
        discardedReason: '저장된 출정 자동저장 데이터가 손상되어 새 전장으로 시작합니다.',
      };
    }
    const result = migrateRunSave(parsed, data);
    if (!result.save) {
      this.clearActiveRun();
    }
    return result;
  }

  public loadActiveRun(data?: GameDataBundle): RunSaveData | null {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(RUN_STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (data) {
        return migrateRunSave(parsed, data).save;
      }
      if (typeof parsed !== 'object' || parsed === null) return null;
      const candidate = parsed as Record<string, unknown>;
      if (
        (candidate.version !== 1 && candidate.version !== RUN_SAVE_SCHEMA_VERSION) ||
        candidate.gameOver === true ||
        typeof candidate.currentTick !== 'number' ||
        candidate.currentTick <= 0 ||
        typeof candidate.waveNumber !== 'number' ||
        !Array.isArray(candidate.units) ||
        !Array.isArray(candidate.monsters)
      ) {
        return null;
      }
      return candidate as unknown as RunSaveData;
    } catch {
      return null;
    }
  }

  public clearActiveRun(): void {
    if (!this.storage) return;
    try {
      if (typeof this.storage.removeItem === 'function') {
        this.storage.removeItem(RUN_STORAGE_KEY);
      } else {
        this.storage.setItem(RUN_STORAGE_KEY, '');
      }
    } catch {
      // Ignore storage errors
    }
  }

  public exportBackupCode(): string {
    const json = this.serializePayload();
    const bytes = new TextEncoder().encode(json);
    const checksum = fnv1aHex(bytes);
    const b64 = encodeBase64Url(bytes);
    return `${BACKUP_CODE_PREFIX}${checksum}-${b64}`;
  }

  public importBackupCode(rawInput: string): BackupImportResult {
    const trimmed = rawInput.trim();
    if (!trimmed.startsWith(BACKUP_CODE_PREFIX)) {
      return { ok: false, reason: '유효하지 않은 백업 코드 형식입니다 (MRD1- 접두사 필요).' };
    }
    const rest = trimmed.slice(BACKUP_CODE_PREFIX.length);
    const sepIdx = rest.indexOf('-');
    if (sepIdx !== 8) {
      return { ok: false, reason: '백업 코드 검증 해시 형식이 올바르지 않습니다.' };
    }
    const expectedHex = rest.slice(0, 8).toLowerCase();
    const b64Part = rest.slice(9);
    const bytes = decodeBase64Url(b64Part);
    if (!bytes) {
      return { ok: false, reason: '백업 코드 본문이 손상되어 해독할 수 없습니다.' };
    }
    const actualHex = fnv1aHex(bytes);
    if (actualHex !== expectedHex) {
      return { ok: false, reason: '백업 코드 무결성 검증에 실패했습니다 (오타·변조 감지).' };
    }

    let parsed: unknown;
    try {
      const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      parsed = JSON.parse(json);
    } catch {
      return { ok: false, reason: '백업 데이터 JSON 파싱에 실패했습니다.' };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, reason: '백업 데이터 구조가 올바르지 않습니다.' };
    }

    this.resetToCleanDefaults();
    this.applyRecord(parsed as Record<string, unknown>);
    this.unlockEligibleAchievementSkins();
    this.evaluateTitles(false);
    this.clearActiveRun();
    this.rev++;
    this.save();

    const discoveredCount = Object.values(this.discoveredUnits).filter(Boolean).length;
    return {
      ok: true,
      gold: this.gold,
      discoveredCount,
      bestWave: this.bestWave,
    };
  }

  public grantDevMeta(goldBonus: number, keyBonus: number, silkBonus = 180): void {
    this.gold += Math.max(0, Math.floor(goldBonus));
    this.keys += Math.max(0, Math.floor(keyBonus));
    this.silk += Math.max(0, Math.floor(silkBonus));
    this.unlockedDifficulties.hard = true;
    this.unlockedDifficulties.hell = true;
    this.unlockedDifficulties.abyss = true;
    this.rev++;
    this.save();
  }

  private resetToCleanDefaults(): void {
    this.gold = STARTER_GOLD;
    this.keys = STARTER_KEYS;
    this.silk = STARTER_SILK;
    for (let i = 0; i < RELIC_ORDER.length; i++) {
      this.relics[RELIC_ORDER[i]!] = 0;
    }
    this.totalRuns = 0;
    this.bestWave = 1;
    this.selectedDifficulty = 'normal';
    this.selectedTrialId = null;
    this.unlockedDifficulties.normal = true;
    this.unlockedDifficulties.hard = false;
    this.unlockedDifficulties.hell = false;
    this.unlockedDifficulties.abyss = false;
    this.clearedDifficulties.normal = false;
    this.clearedDifficulties.hard = false;
    this.clearedDifficulties.hell = false;
    this.clearedDifficulties.abyss = false;
    for (const d of DIFFICULTY_ORDER) {
      this.difficultyBestWave[d] = 0;
    }
    for (const t of TRIAL_ORDER) {
      this.clearedTrials[t] = false;
      this.trialRecords[t] = { clears: 0, bestWave: 0, bestTicks: null };
    }
    for (let i = 0; i < TITLE_DEFS.length; i++) {
      this.unlockedTitles[TITLE_DEFS[i]!.id] = false;
    }
    this.equippedTitle = null;
    for (const k of Object.keys(this.discoveredUnits)) {
      delete this.discoveredUnits[k];
    }
    for (const k of Object.keys(this.ownedSkins)) {
      delete this.ownedSkins[k];
    }
    this.ownedSkins[DEFAULT_COURT_SKIN_ID] = true;
    for (const k of Object.keys(this.equippedHeroSkins)) {
      delete this.equippedHeroSkins[k];
    }
    this.equippedCourtSkin = DEFAULT_COURT_SKIN_ID;
    this.dailyDate = getLocalDateKey();
    this.dailyProgress = {};
    this.dailyClaimed = {};
    this.totalDailyClaimed = 0;
    this.tutorialDone = false;
  }

  private applyRecord(rec: Record<string, unknown>): void {
    if (typeof rec.gold === 'number' && Number.isFinite(rec.gold) && rec.gold >= 0) {
      this.gold = Math.floor(rec.gold);
    }
    if (typeof rec.keys === 'number' && Number.isFinite(rec.keys) && rec.keys >= 0) {
      this.keys = Math.floor(rec.keys);
    }
    if (typeof rec.silk === 'number' && Number.isFinite(rec.silk) && rec.silk >= 0) {
      this.silk = Math.floor(rec.silk);
    }
    if (typeof rec.totalRuns === 'number' && Number.isFinite(rec.totalRuns) && rec.totalRuns >= 0) {
      this.totalRuns = Math.floor(rec.totalRuns);
    }
    if (typeof rec.bestWave === 'number' && Number.isFinite(rec.bestWave) && rec.bestWave >= 1) {
      this.bestWave = Math.floor(rec.bestWave);
    }
    if (typeof rec.relics === 'object' && rec.relics !== null) {
      const relObj = rec.relics as Record<string, unknown>;
      for (let i = 0; i < RELIC_ORDER.length; i++) {
        const id = RELIC_ORDER[i]!;
        const lv = relObj[id];
        if (typeof lv === 'number' && Number.isFinite(lv) && lv >= 0) {
          this.relics[id] = Math.min(RELIC_MAX_LEVEL, Math.floor(lv));
        }
      }
    }
    if (typeof rec.unlockedDifficulties === 'object' && rec.unlockedDifficulties !== null) {
      const uObj = rec.unlockedDifficulties as Record<string, unknown>;
      for (const d of DIFFICULTY_ORDER) {
        if (typeof uObj[d] === 'boolean') {
          this.unlockedDifficulties[d] = d === 'normal' ? true : uObj[d]!;
        }
      }
    }
    if (typeof rec.clearedDifficulties === 'object' && rec.clearedDifficulties !== null) {
      const cObj = rec.clearedDifficulties as Record<string, unknown>;
      for (const d of DIFFICULTY_ORDER) {
        if (typeof cObj[d] === 'boolean') {
          this.clearedDifficulties[d] = cObj[d]!;
        }
      }
    }
    if (typeof rec.difficultyBestWave === 'object' && rec.difficultyBestWave !== null) {
      const dbObj = rec.difficultyBestWave as Record<string, unknown>;
      for (const d of DIFFICULTY_ORDER) {
        const w = dbObj[d];
        if (typeof w === 'number' && Number.isFinite(w) && w >= 0) {
          this.difficultyBestWave[d] = Math.floor(w);
        }
      }
    }
    if (typeof rec.clearedTrials === 'object' && rec.clearedTrials !== null) {
      const tObj = rec.clearedTrials as Record<string, unknown>;
      for (const t of TRIAL_ORDER) {
        if (typeof tObj[t] === 'boolean') {
          this.clearedTrials[t] = tObj[t]!;
        }
      }
    }
    if (typeof rec.trialRecords === 'object' && rec.trialRecords !== null) {
      const trObj = rec.trialRecords as Record<string, unknown>;
      for (const t of TRIAL_ORDER) {
        const entry = trObj[t];
        if (typeof entry === 'object' && entry !== null) {
          const e = entry as Record<string, unknown>;
          const clears =
            typeof e.clears === 'number' && Number.isFinite(e.clears) && e.clears >= 0
              ? Math.floor(e.clears)
              : 0;
          const bestWave =
            typeof e.bestWave === 'number' && Number.isFinite(e.bestWave) && e.bestWave >= 0
              ? Math.floor(e.bestWave)
              : 0;
          const bestTicks =
            typeof e.bestTicks === 'number' && Number.isFinite(e.bestTicks) && e.bestTicks > 0
              ? Math.floor(e.bestTicks)
              : null;
          this.trialRecords[t] = { clears, bestWave, bestTicks };
        }
      }
    }
    // Backfill legacy clearedTrials -> trialRecords
    for (const t of TRIAL_ORDER) {
      if (this.clearedTrials[t] && this.trialRecords[t].clears === 0) {
        this.trialRecords[t] = {
          clears: 1,
          bestWave: Math.max(this.trialRecords[t].bestWave, TRIAL_CONFIGS[t].targetWave),
          bestTicks: this.trialRecords[t].bestTicks,
        };
      }
    }
    if (typeof rec.unlockedTitles === 'object' && rec.unlockedTitles !== null) {
      const utObj = rec.unlockedTitles as Record<string, unknown>;
      for (let i = 0; i < TITLE_DEFS.length; i++) {
        const id = TITLE_DEFS[i]!.id;
        if (utObj[id] === true) {
          this.unlockedTitles[id] = true;
        }
      }
    }
    if (typeof rec.equippedTitle === 'string' && TITLES_BY_ID.has(rec.equippedTitle as TitleId)) {
      const tid = rec.equippedTitle as TitleId;
      if (this.unlockedTitles[tid]) {
        this.equippedTitle = tid;
      }
    }
    if (
      typeof rec.selectedDifficulty === 'string' &&
      (DIFFICULTY_ORDER as readonly string[]).includes(rec.selectedDifficulty)
    ) {
      const d = rec.selectedDifficulty as DifficultyId;
      if (this.unlockedDifficulties[d]) {
        this.selectedDifficulty = d;
      }
    }
    if (
      typeof rec.selectedTrialId === 'string' &&
      (TRIAL_ORDER as readonly string[]).includes(rec.selectedTrialId)
    ) {
      this.selectedTrialId = rec.selectedTrialId as TrialId;
    } else if (rec.selectedTrialId === null) {
      this.selectedTrialId = null;
    }
    if (typeof rec.discoveredUnits === 'object' && rec.discoveredUnits !== null) {
      const dObj = rec.discoveredUnits as Record<string, unknown>;
      for (const [uid, val] of Object.entries(dObj)) {
        if (val === true) {
          this.discoveredUnits[uid] = true;
        }
      }
    }
    if (typeof rec.ownedSkins === 'object' && rec.ownedSkins !== null) {
      const sObj = rec.ownedSkins as Record<string, unknown>;
      for (const [sid, val] of Object.entries(sObj)) {
        if (val === true) {
          this.ownedSkins[sid] = true;
        }
      }
    }
    this.ownedSkins[DEFAULT_COURT_SKIN_ID] = true;
    if (typeof rec.equippedHeroSkins === 'object' && rec.equippedHeroSkins !== null) {
      const eObj = rec.equippedHeroSkins as Record<string, unknown>;
      for (const [uid, sid] of Object.entries(eObj)) {
        if (typeof sid === 'string' && this.ownedSkins[sid]) {
          this.equippedHeroSkins[uid] = sid;
        }
      }
    }
    if (
      typeof rec.equippedCourtSkin === 'string' &&
      VALID_COURT_SKIN_SET.has(rec.equippedCourtSkin) &&
      this.ownedSkins[rec.equippedCourtSkin]
    ) {
      this.equippedCourtSkin = rec.equippedCourtSkin as CourtSkinId;
    }
    if (typeof rec.dailyDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rec.dailyDate)) {
      this.dailyDate = rec.dailyDate;
    }
    if (typeof rec.dailyProgress === 'object' && rec.dailyProgress !== null) {
      const dpObj = rec.dailyProgress as Record<string, unknown>;
      for (const [qid, val] of Object.entries(dpObj)) {
        if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
          this.dailyProgress[qid] = Math.floor(val);
        }
      }
    }
    if (typeof rec.dailyClaimed === 'object' && rec.dailyClaimed !== null) {
      const dcObj = rec.dailyClaimed as Record<string, unknown>;
      for (const [qid, val] of Object.entries(dcObj)) {
        if (val === true) {
          this.dailyClaimed[qid] = true;
        }
      }
    }
    if (
      typeof rec.totalDailyClaimed === 'number' &&
      Number.isFinite(rec.totalDailyClaimed) &&
      rec.totalDailyClaimed >= 0
    ) {
      this.totalDailyClaimed = Math.floor(rec.totalDailyClaimed);
    }
    if (typeof rec.tutorialDone === 'boolean') {
      this.tutorialDone = rec.tutorialDone;
    }
    if (
      rec.selectedRunMode === 'standard' ||
      rec.selectedRunMode === 'daily_challenge' ||
      rec.selectedRunMode === 'boss_rush'
    ) {
      this.selectedRunMode = rec.selectedRunMode;
    }
    if (typeof rec.dailyChallengeStreak === 'number' && Number.isFinite(rec.dailyChallengeStreak) && rec.dailyChallengeStreak >= 0) {
      this.dailyChallengeStreak = Math.floor(rec.dailyChallengeStreak);
    }
    if (typeof rec.lastDailyChallengeDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rec.lastDailyChallengeDate)) {
      this.lastDailyChallengeDate = rec.lastDailyChallengeDate;
    }
    if (typeof rec.dailyChallengeRecords === 'object' && rec.dailyChallengeRecords !== null) {
      for (const [dk, rawEntry] of Object.entries(rec.dailyChallengeRecords as Record<string, unknown>)) {
        if (typeof rawEntry === 'object' && rawEntry !== null) {
          const e = rawEntry as Record<string, unknown>;
          this.dailyChallengeRecords[dk] = {
            dateKey: dk,
            bestWave: typeof e.bestWave === 'number' ? Math.max(0, Math.floor(e.bestWave)) : 0,
            bestScore: typeof e.bestScore === 'number' ? Math.max(0, Math.floor(e.bestScore)) : 0,
            cleared: Boolean(e.cleared),
            bestTicks: typeof e.bestTicks === 'number' && e.bestTicks > 0 ? Math.floor(e.bestTicks) : null,
            rewardTierClaimed: e.rewardTierClaimed === 2 ? 2 : e.rewardTierClaimed === 1 ? 1 : 0,
          };
        }
      }
    }
    if (typeof rec.bossRushRecord === 'object' && rec.bossRushRecord !== null) {
      const br = rec.bossRushRecord as Record<string, unknown>;
      this.bossRushRecord = {
        clears: typeof br.clears === 'number' ? Math.max(0, Math.floor(br.clears)) : 0,
        bestStage: typeof br.bestStage === 'number' ? Math.max(0, Math.floor(br.bestStage)) : 0,
        bestTicks: typeof br.bestTicks === 'number' && br.bestTicks > 0 ? Math.floor(br.bestTicks) : null,
      };
    }
    this.endlessMilestonesCleared.clear();
    if (Array.isArray(rec.endlessMilestonesCleared)) {
      for (const w of rec.endlessMilestonesCleared) {
        if (typeof w === 'number' && Number.isFinite(w) && w >= 40) {
          this.endlessMilestonesCleared.add(Math.floor(w));
        }
      }
    }
    this.hallOfFame = [];
    if (Array.isArray(rec.hallOfFame)) {
      for (const rawH of rec.hallOfFame.slice(0, 12)) {
        if (typeof rawH === 'object' && rawH !== null) {
          const h = rawH as Record<string, unknown>;
          if (typeof h.wave === 'number' && typeof h.dateKey === 'string') {
            this.hallOfFame.push({
              id: typeof h.id === 'string' ? h.id : `${h.dateKey}-${h.wave}`,
              dateKey: h.dateKey,
              runMode:
                h.runMode === 'daily_challenge' || h.runMode === 'boss_rush'
                  ? h.runMode
                  : 'standard',
              difficulty:
                typeof h.difficulty === 'string' && (DIFFICULTY_ORDER as readonly string[]).includes(h.difficulty)
                  ? (h.difficulty as DifficultyId)
                  : 'normal',
              trialId:
                typeof h.trialId === 'string' && (TRIAL_ORDER as readonly string[]).includes(h.trialId)
                  ? (h.trialId as TrialId)
                  : null,
              wave: Math.max(1, Math.floor(h.wave)),
              victory: Boolean(h.victory),
              totalDamage: typeof h.totalDamage === 'number' ? Math.max(0, Math.floor(h.totalDamage)) : 0,
              topHeroId: typeof h.topHeroId === 'string' ? h.topHeroId : null,
              topHeroName: typeof h.topHeroName === 'string' ? h.topHeroName : null,
              elapsedTicks: typeof h.elapsedTicks === 'number' && h.elapsedTicks > 0 ? Math.floor(h.elapsedTicks) : null,
              score: typeof h.score === 'number' ? Math.max(0, Math.floor(h.score)) : 0,
            });
          }
        }
      }
    }
  }

  private load(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return;
      this.applyRecord(parsed as Record<string, unknown>);
    } catch {
      // Ignore malformed storage data and retain clean defaults
    }
  }

  private serializePayload(): string {
    return JSON.stringify({
      gold: this.gold,
      keys: this.keys,
      silk: this.silk,
      relics: this.relics,
      totalRuns: this.totalRuns,
      bestWave: this.bestWave,
      selectedRunMode: this.selectedRunMode,
      selectedDifficulty: this.selectedDifficulty,
      selectedTrialId: this.selectedTrialId,
      unlockedDifficulties: this.unlockedDifficulties,
      clearedDifficulties: this.clearedDifficulties,
      difficultyBestWave: this.difficultyBestWave,
      clearedTrials: this.clearedTrials,
      trialRecords: this.trialRecords,
      dailyChallengeRecords: this.dailyChallengeRecords,
      dailyChallengeStreak: this.dailyChallengeStreak,
      lastDailyChallengeDate: this.lastDailyChallengeDate,
      bossRushRecord: this.bossRushRecord,
      endlessMilestonesCleared: [...this.endlessMilestonesCleared].sort((a, b) => a - b),
      hallOfFame: this.hallOfFame,
      unlockedTitles: this.unlockedTitles,
      equippedTitle: this.equippedTitle,
      discoveredUnits: this.discoveredUnits,
      ownedSkins: this.ownedSkins,
      equippedHeroSkins: this.equippedHeroSkins,
      equippedCourtSkin: this.equippedCourtSkin,
      dailyDate: this.dailyDate,
      dailyProgress: this.dailyProgress,
      dailyClaimed: this.dailyClaimed,
      totalDailyClaimed: this.totalDailyClaimed,
      tutorialDone: this.tutorialDone,
    });
  }

  private save(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, this.serializePayload());
    } catch {
      // Quota or private-browsing error — keep in-memory state
    }
  }
}

