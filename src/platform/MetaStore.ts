import { CLEAR_TARGET_WAVE, DIFFICULTY_CONFIGS, DIFFICULTY_ORDER } from '../core/relicFormulas';
import type { DifficultyId, GradeDef, RelicDef, RelicId, UnitDef, UnitId } from '../data/types';

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

const STORAGE_KEY = 'murim_defense_meta_v1';
const STARTER_GOLD = 120;
const STARTER_KEYS = 2;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MetaProfile {
  readonly gold: number;
  readonly keys: number;
  readonly relics: Readonly<Record<RelicId, number>>;
  readonly totalRuns: number;
  readonly bestWave: number;
  readonly selectedDifficulty: DifficultyId;
  readonly unlockedDifficulties: Readonly<Record<DifficultyId, boolean>>;
  readonly clearedDifficulties: Readonly<Record<DifficultyId, boolean>>;
  readonly discoveredUnits: Readonly<Record<UnitId, boolean>>;
  readonly discoveredCount: number;
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
  private rev = 1;

  public constructor(customStorage?: StorageLike | null) {
    this.storage = customStorage !== undefined ? customStorage : resolveDefaultStorage();
    this.load();
  }

  public getProfile(): MetaProfile {
    const discoveredCount = Object.values(this.discoveredUnits).filter(Boolean).length;
    return {
      gold: this.gold,
      keys: this.keys,
      relics: { ...this.relics },
      totalRuns: this.totalRuns,
      bestWave: this.bestWave,
      selectedDifficulty: this.selectedDifficulty,
      unlockedDifficulties: { ...this.unlockedDifficulties },
      clearedDifficulties: { ...this.clearedDifficulties },
      discoveredUnits: { ...this.discoveredUnits },
      discoveredCount,
      rev: this.rev,
    };
  }

  public getRelicLevels(): Readonly<Record<RelicId, number>> {
    return { ...this.relics };
  }

  public getSelectedDifficulty(): DifficultyId {
    return this.selectedDifficulty;
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
      goldEarned: prevRecord.goldEarned + deltaGold,
      keysEarned: prevRecord.keysEarned + deltaKeys,
      totalGold: this.gold,
      totalKeys: this.keys,
      isNewBest,
    };
  }

  public grantDevMeta(goldBonus: number, keyBonus: number): void {
    this.gold += Math.max(0, Math.floor(goldBonus));
    this.keys += Math.max(0, Math.floor(keyBonus));
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
        relics: this.relics,
        totalRuns: this.totalRuns,
        bestWave: this.bestWave,
        selectedDifficulty: this.selectedDifficulty,
        unlockedDifficulties: this.unlockedDifficulties,
        clearedDifficulties: this.clearedDifficulties,
        discoveredUnits: this.discoveredUnits,
      });
      this.storage.setItem(STORAGE_KEY, payload);
    } catch {
      // Quota or private-browsing error — keep in-memory state
    }
  }
}
