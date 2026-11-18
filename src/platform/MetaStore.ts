import { CLEAR_TARGET_WAVE, DIFFICULTY_CONFIGS, DIFFICULTY_ORDER } from '../core/relicFormulas';
import type {
  CourtSkinDef,
  CourtSkinId,
  DifficultyId,
  GradeDef,
  HeroSkinDef,
  RelicDef,
  RelicId,
  SkinRarity,
  UnitDef,
  UnitId,
} from '../data/types';

export const RELIC_ORDER: readonly RelicId[] = [
  'golden_vault',
  'million_sword_seal',
  'bandit_dagger',
  'immortal_furnace',
  'founding_jade_seal',
  'heavenly_scroll_chest',
];

export const RELIC_CHEST_GOLD_COST = 100;
export const RELIC_DIRECT_UNLOCK_GOLD = 180;
export const SKIN_SINGLE_GOLD_COST = 120;
export const SKIN_MULTI5_GOLD_COST = 540;
export const DEFAULT_COURT_SKIN_ID: CourtSkinId = 'court_bamboo_dawn';

const STORAGE_KEY = 'murim_defense_meta_v1';
const STARTER_GOLD = 120;
const STARTER_KEYS = 2;
const STARTER_SILK = 30;

const VALID_COURT_SKIN_SET: ReadonlySet<string> = new Set<CourtSkinId>([
  'court_bamboo_dawn',
  'court_crimson_sunset',
  'court_blood_moon',
  'court_golden_palace',
]);

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MetaProfile {
  readonly gold: number;
  readonly keys: number;
  readonly silk: number;
  readonly relics: Readonly<Record<RelicId, number>>;
  readonly totalRuns: number;
  readonly bestWave: number;
  readonly selectedDifficulty: DifficultyId;
  readonly unlockedDifficulties: Readonly<Record<DifficultyId, boolean>>;
  readonly clearedDifficulties: Readonly<Record<DifficultyId, boolean>>;
  readonly discoveredUnits: Readonly<Record<UnitId, boolean>>;
  readonly discoveredCount: number;
  readonly ownedSkins: Readonly<Record<string, boolean>>;
  readonly ownedSkinCount: number;
  readonly equippedHeroSkins: Readonly<Record<UnitId, string>>;
  readonly equippedCourtSkin: CourtSkinId;
  readonly rev: number;
}

export interface SettlementInput {
  readonly wave: number;
  readonly monstersSlain: number;
  readonly bossesSlain: number;
  readonly bountiesSlain?: number;
  readonly difficulty?: DifficultyId;
  readonly victory?: boolean;
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
  readonly victory: boolean;
  readonly firstClearBonusGold: number;
  readonly firstClearBonusKeys: number;
  readonly unlockedNextDifficulty: DifficultyId | null;
  readonly unlockedSkinIds: readonly string[];
  readonly totalGold: number;
  readonly totalKeys: number;
  readonly isNewBest: boolean;
}

export interface CodexDiscoveryResult {
  readonly isNew: boolean;
  readonly unitId: UnitId;
  readonly unitName: string;
  readonly gradeName: string;
  readonly bonusGold: number;
  readonly bonusKeys: number;
}

export type RelicDrawResult =
  | {
      readonly ok: true;
      readonly relicId: RelicId;
      readonly prevLevel: number;
      readonly newLevel: number;
      readonly isNew: boolean;
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
  };
}

export function getRelicUpgradeGoldCost(def: RelicDef, currentLevel: number): number {
  if (currentLevel <= 0) {
    return RELIC_DIRECT_UNLOCK_GOLD;
  }
  if (currentLevel >= def.maxLevel) {
    return 0;
  }
  return def.baseUpgradeGold + currentLevel * def.stepUpgradeGold;
}

export function getCodexDiscoveryReward(gradeRank: number): {
  readonly gold: number;
  readonly keys: number;
} {
  if (gradeRank >= 6) return { gold: 300, keys: 3 };
  if (gradeRank === 5) return { gold: 130, keys: 1 };
  if (gradeRank === 4) return { gold: 65, keys: 1 };
  if (gradeRank === 3) return { gold: 35, keys: 0 };
  if (gradeRank === 2) return { gold: 20, keys: 0 };
  return { gold: 10, keys: 0 };
}

export function computeSettlementReward(input: SettlementInput): SettlementReward {
  const rawWave = Math.floor(input.wave);
  const clearedWaves = Math.max(
    0,
    input.victory && rawWave === CLEAR_TARGET_WAVE ? CLEAR_TARGET_WAVE : rawWave - 1,
  );
  const bosses = Math.max(0, Math.floor(input.bossesSlain));
  const bounties = Math.max(0, Math.floor(input.bountiesSlain ?? 0));
  const kills = Math.max(0, Math.floor(input.monstersSlain));
  const diff = input.difficulty ?? 'normal';
  const mult = DIFFICULTY_CONFIGS[diff]?.rewardMult ?? 1.0;

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
  private readonly unlockedDifficulties: Record<DifficultyId, boolean> = {
    normal: true,
    hard: false,
    hell: false,
  };
  private readonly clearedDifficulties: Record<DifficultyId, boolean> = {
    normal: false,
    hard: false,
    hell: false,
  };
  private readonly discoveredUnits: Record<UnitId, boolean> = {};
  private readonly ownedSkins: Record<string, boolean> = {
    [DEFAULT_COURT_SKIN_ID]: true,
  };
  private readonly equippedHeroSkins: Record<UnitId, string> = {};
  private equippedCourtSkin: CourtSkinId = DEFAULT_COURT_SKIN_ID;
  private rev = 1;

  public constructor(customStorage?: StorageLike | null) {
    this.storage = customStorage !== undefined ? customStorage : resolveDefaultStorage();
    this.load();
    this.unlockEligibleAchievementSkins();
  }

  public getProfile(): MetaProfile {
    const discoveredCount = Object.values(this.discoveredUnits).filter(Boolean).length;
    const ownedSkinCount = Object.values(this.ownedSkins).filter(Boolean).length;
    return {
      gold: this.gold,
      keys: this.keys,
      silk: this.silk,
      relics: { ...this.relics },
      totalRuns: this.totalRuns,
      bestWave: this.bestWave,
      selectedDifficulty: this.selectedDifficulty,
      unlockedDifficulties: { ...this.unlockedDifficulties },
      clearedDifficulties: { ...this.clearedDifficulties },
      discoveredUnits: { ...this.discoveredUnits },
      discoveredCount,
      ownedSkins: { ...this.ownedSkins },
      ownedSkinCount,
      equippedHeroSkins: { ...this.equippedHeroSkins },
      equippedCourtSkin: this.equippedCourtSkin,
      rev: this.rev,
    };
  }

  public getRelicLevels(): Readonly<Record<RelicId, number>> {
    return { ...this.relics };
  }

  public getSelectedDifficulty(): DifficultyId {
    return this.selectedDifficulty;
  }

  public getEquippedHeroSkins(): Readonly<Record<UnitId, string>> {
    return { ...this.equippedHeroSkins };
  }

  public getEquippedCourtSkin(): CourtSkinId {
    return this.equippedCourtSkin;
  }

  public setSelectedDifficulty(diff: DifficultyId): boolean {
    if (!this.unlockedDifficulties[diff]) {
      return false;
    }
    this.selectedDifficulty = diff;
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
    const reward = getCodexDiscoveryReward(gradeDef.rank);
    this.gold += reward.gold;
    this.keys += reward.keys;
    this.rev++;
    this.save();

    return {
      isNew: true,
      unitId: unitDef.id,
      unitName: unitDef.name,
      gradeName: gradeDef.name,
      bonusGold: reward.gold,
      bonusKeys: reward.keys,
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
      return { ok: false, reason: '모든 무림 신물이 이미 극의(Lv.10)에 도달했습니다!' };
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

    // Weight unowned relics 2.5x so players unlock diverse relics smoothly
    let totalWeight = 0;
    for (let i = 0; i < candidates.length; i++) {
      const lv = this.relics[candidates[i]!.id] ?? 0;
      totalWeight += lv === 0 ? 25 : 10;
    }

    const r = Math.max(0, Math.min(0.999999, rngFn()));
    let roll = Math.floor(r * totalWeight);
    let chosen = candidates[0]!;
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i]!;
      const w = (this.relics[cand.id] ?? 0) === 0 ? 25 : 10;
      if (roll < w) {
        chosen = cand;
        break;
      }
      roll -= w;
    }

    const prevLevel = this.relics[chosen.id] ?? 0;
    const newLevel = Math.min(chosen.maxLevel, prevLevel + 1);
    this.relics[chosen.id] = newLevel;
    this.rev++;
    this.save();

    return {
      ok: true,
      relicId: chosen.id,
      prevLevel,
      newLevel,
      isNew: prevLevel === 0,
    };
  }

  public upgradeRelic(def: RelicDef): RelicUpgradeResult {
    const prevLevel = this.relics[def.id] ?? 0;
    if (prevLevel >= def.maxLevel) {
      return { ok: false, reason: '이미 신물 극의(최대 단계)에 도달했습니다.' };
    }

    const cost = getRelicUpgradeGoldCost(def, prevLevel);
    if (this.gold < cost) {
      return { ok: false, reason: `천하주화가 부족합니다 (${cost} 필요)` };
    }

    this.gold -= cost;
    const newLevel = prevLevel + 1;
    this.relics[def.id] = newLevel;
    this.rev++;
    this.save();

    return {
      ok: true,
      relicId: def.id,
      prevLevel,
      newLevel,
      wasUnlock: prevLevel === 0,
      spentGold: cost,
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
    const anyCleared =
      this.clearedDifficulties.normal ||
      this.clearedDifficulties.hard ||
      this.clearedDifficulties.hell;

    if (anyCleared && !this.ownedSkins.court_golden_palace) {
      this.ownedSkins.court_golden_palace = true;
      newlyUnlocked.push('court_golden_palace');
    }
    if (this.clearedDifficulties.hell && !this.ownedSkins.skin_cheonma_golden_emperor) {
      this.ownedSkins.skin_cheonma_golden_emperor = true;
      if (!this.equippedHeroSkins.cheonma) {
        this.equippedHeroSkins.cheonma = 'skin_cheonma_golden_emperor';
      }
      newlyUnlocked.push('skin_cheonma_golden_emperor');
    }
    if (this.bestWave >= 35 && !this.ownedSkins.skin_sword_demon_azure) {
      this.ownedSkins.skin_sword_demon_azure = true;
      if (!this.equippedHeroSkins.sword_demon) {
        this.equippedHeroSkins.sword_demon = 'skin_sword_demon_azure';
      }
      newlyUnlocked.push('skin_sword_demon_azure');
    }
    return newlyUnlocked;
  }

  public settleRun(input: SettlementInput): SettlementRecord {
    const diff = input.difficulty ?? 'normal';
    const victory = Boolean(input.victory);
    const bountiesSlain = Math.max(0, Math.floor(input.bountiesSlain ?? 0));
    const reward = computeSettlementReward(input);
    const wave = Math.max(1, Math.floor(input.wave));
    const isNewBest = wave > this.bestWave;

    let firstClearBonusGold = 0;
    let firstClearBonusKeys = 0;
    let unlockedNextDifficulty: DifficultyId | null = null;

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
      }
    }

    const totalGoldGain = reward.goldEarned + firstClearBonusGold;
    const totalKeysGain = reward.keysEarned + firstClearBonusKeys;

    this.gold += totalGoldGain;
    this.keys += totalKeysGain;
    this.totalRuns += 1;
    if (isNewBest) {
      this.bestWave = wave;
    }
    const unlockedSkinIds = this.unlockEligibleAchievementSkins();
    this.rev++;
    this.save();

    return {
      wave,
      clearedWaves: reward.clearedWaves,
      monstersSlain: Math.max(0, Math.floor(input.monstersSlain)),
      bossesSlain: Math.max(0, Math.floor(input.bossesSlain)),
      bountiesSlain,
      difficulty: diff,
      victory,
      firstClearBonusGold,
      firstClearBonusKeys,
      unlockedNextDifficulty,
      unlockedSkinIds,
      goldEarned: totalGoldGain,
      keysEarned: totalKeysGain,
      totalGold: this.gold,
      totalKeys: this.keys,
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
      victory: prevRecord.victory,
    });
    const finalBase = computeSettlementReward({
      ...finalInput,
      difficulty: prevRecord.difficulty,
      victory: prevRecord.victory,
    });

    const deltaGold = Math.max(0, finalBase.goldEarned - prevBase.goldEarned);
    const deltaKeys = Math.max(0, finalBase.keysEarned - prevBase.keysEarned);
    const wave = Math.max(prevRecord.wave, Math.floor(finalInput.wave));
    const isNewBest = wave > this.bestWave || prevRecord.isNewBest;

    this.gold += deltaGold;
    this.keys += deltaKeys;
    if (wave > this.bestWave) {
      this.bestWave = wave;
    }
    const overtimeUnlocked = this.unlockEligibleAchievementSkins();
    const mergedSkins = [
      ...prevRecord.unlockedSkinIds,
      ...overtimeUnlocked.filter((id) => !prevRecord.unlockedSkinIds.includes(id)),
    ];
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
      unlockedSkinIds: mergedSkins,
      goldEarned: prevRecord.goldEarned + deltaGold,
      keysEarned: prevRecord.keysEarned + deltaKeys,
      totalGold: this.gold,
      totalKeys: this.keys,
      isNewBest,
    };
  }

  public grantDevMeta(goldBonus: number, keyBonus: number, silkBonus = 180): void {
    this.gold += Math.max(0, Math.floor(goldBonus));
    this.keys += Math.max(0, Math.floor(keyBonus));
    this.silk += Math.max(0, Math.floor(silkBonus));
    this.unlockedDifficulties.hard = true;
    this.unlockedDifficulties.hell = true;
    this.rev++;
    this.save();
  }

  private load(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return;
      const rec = parsed as Record<string, unknown>;

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
            this.relics[id] = Math.min(10, Math.floor(lv));
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
      if (
        typeof rec.selectedDifficulty === 'string' &&
        (DIFFICULTY_ORDER as readonly string[]).includes(rec.selectedDifficulty)
      ) {
        const d = rec.selectedDifficulty as DifficultyId;
        if (this.unlockedDifficulties[d]) {
          this.selectedDifficulty = d;
        }
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
    } catch {
      // Ignore malformed storage data and retain clean defaults
    }
  }

  private save(): void {
    if (!this.storage) return;
    try {
      const payload = JSON.stringify({
        gold: this.gold,
        keys: this.keys,
        silk: this.silk,
        relics: this.relics,
        totalRuns: this.totalRuns,
        bestWave: this.bestWave,
        selectedDifficulty: this.selectedDifficulty,
        unlockedDifficulties: this.unlockedDifficulties,
        clearedDifficulties: this.clearedDifficulties,
        discoveredUnits: this.discoveredUnits,
        ownedSkins: this.ownedSkins,
        equippedHeroSkins: this.equippedHeroSkins,
        equippedCourtSkin: this.equippedCourtSkin,
      });
      this.storage.setItem(STORAGE_KEY, payload);
    } catch {
      // Quota or private-browsing error — keep in-memory state
    }
  }
}

