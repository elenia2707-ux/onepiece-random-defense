import type { RelicDef, RelicId } from '../data/types';

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
  readonly rev: number;
}

export interface SettlementInput {
  readonly wave: number;
  readonly monstersSlain: number;
  readonly bossesSlain: number;
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
  readonly totalGold: number;
  readonly totalKeys: number;
  readonly isNewBest: boolean;
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

export function computeSettlementReward(input: SettlementInput): SettlementReward {
  const clearedWaves = Math.max(0, Math.floor(input.wave) - 1);
  const bosses = Math.max(0, Math.floor(input.bossesSlain));
  const kills = Math.max(0, Math.floor(input.monstersSlain));

  const goldEarned = 30 + clearedWaves * 18 + bosses * 45 + Math.floor(kills / 8) * 2;
  const keysEarned = (clearedWaves >= 2 ? 1 : 0) + bosses + Math.floor(clearedWaves / 10);

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
  private rev = 1;

  public constructor(customStorage?: StorageLike | null) {
    this.storage = customStorage !== undefined ? customStorage : resolveDefaultStorage();
    this.load();
  }

  public getProfile(): MetaProfile {
    return {
      gold: this.gold,
      keys: this.keys,
      relics: { ...this.relics },
      totalRuns: this.totalRuns,
      bestWave: this.bestWave,
      rev: this.rev,
    };
  }

  public getRelicLevels(): Readonly<Record<RelicId, number>> {
    return { ...this.relics };
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
    const reward = computeSettlementReward(input);
    const wave = Math.max(1, Math.floor(input.wave));
    const isNewBest = wave > this.bestWave;

    this.gold += reward.goldEarned;
    this.keys += reward.keysEarned;
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
      goldEarned: reward.goldEarned,
      keysEarned: reward.keysEarned,
      totalGold: this.gold,
      totalKeys: this.keys,
      isNewBest,
    };
  }

  public grantDevMeta(goldBonus: number, keyBonus: number): void {
    this.gold += Math.max(0, Math.floor(goldBonus));
    this.keys += Math.max(0, Math.floor(keyBonus));
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
      });
      this.storage.setItem(STORAGE_KEY, payload);
    } catch {
      // Quota or private-browsing error — keep in-memory state
    }
  }
}
