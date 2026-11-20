import type {
  ActiveContractState,
  BoonOfferSnapshot,
  ContractOfferSnapshot,
  GambleResultSnapshot,
} from '../core/Simulation';
import type {
  BoonId,
  DifficultyId,
  GameDataBundle,
  GameOverReason,
  GradeId,
  RelicId,
  TrialId,
  UnitId,
  UpgradeGroupId,
} from '../data/types';
import type { MonsterEntity, ProjectileEntity, TileHazard, UnitEntity } from '../world/entities';

export const RUN_SAVE_SCHEMA_VERSION = 2;

export interface RunSaveData {
  readonly version: 2;
  readonly savedAtMs: number;
  readonly difficulty: DifficultyId;
  readonly trialId: TrialId | null;
  readonly currentTick: number;
  readonly rngState: number;
  readonly nextUid: number;
  readonly nextMonsterId: number;
  readonly nextProjectileId: number;
  readonly gambleSeq: number;
  readonly gambleWins: number;
  readonly coin: number;
  readonly luckStone: number;
  readonly summonCount: number;
  readonly wisps: Readonly<Record<GradeId, number>>;
  readonly upgradeLv: Readonly<Record<UpgradeGroupId, number>>;
  readonly relicLv: Readonly<Record<RelicId, number>>;
  readonly activeBoons: Readonly<Record<BoonId, number>>;
  readonly boonOfferSeq: number;
  readonly pendingBoonOffers: readonly BoonOfferSnapshot[];
  readonly contractOfferSeq?: number;
  readonly pendingContractOffer?: ContractOfferSnapshot | null;
  readonly activeContracts?: readonly ActiveContractState[];
  readonly bossSpawnTick?: number;
  readonly awakenCount?: number;
  readonly appliedStartCoinBonus: number;
  readonly appliedStartLuckBonus?: number;
  readonly appliedStartWisps: Readonly<Record<GradeId, number>>;
  readonly lastWaveInterest: number;
  readonly pilferedCoinTotal: number;
  readonly monstersSlain: number;
  readonly bossesSlain: number;
  readonly bountiesCalled: number;
  readonly bountiesSlain: number;
  readonly bountyReadyTick: number;
  readonly completedMissions: readonly string[];
  readonly damageByUnit: readonly (readonly [UnitId, number])[];
  readonly totalDamageDealt: number;
  readonly lastGambleResult: GambleResultSnapshot | null;
  readonly waveNumber: number;
  readonly waveTicksLeft: number;
  readonly spawnedInWave: number;
  readonly nextSpawnTick: number;
  readonly gameOver: boolean;
  readonly gameOverReason: GameOverReason;
  readonly victoryAchieved: boolean;
  readonly victoryHold: boolean;
  readonly endlessMode: boolean;
  readonly units: readonly UnitEntity[];
  readonly monsters: readonly MonsterEntity[];
  readonly projectiles: readonly ProjectileEntity[];
  readonly tileHazards: readonly TileHazard[];
}

export interface SaveMigrationResult {
  readonly save: RunSaveData | null;
  readonly migratedFrom: number | null;
  readonly discardedReason: string | null;
}

/**
 * Validates and migrates persisted mid-run snapshots (v1 -> v2).
 * Never fails silently: returns an explicit Korean `discardedReason` whenever an incompatible
 * or corrupted run save must be dropped so the UI can notify the player cleanly.
 */
export function migrateRunSave(raw: unknown, data: GameDataBundle): SaveMigrationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      save: null,
      migratedFrom: null,
      discardedReason: '저장된 출정 데이터 형식이 올바르지 않아 새 전장으로 시작합니다.',
    };
  }

  const rec = raw as Record<string, unknown>;
  const ver = rec.version;
  if (ver !== 1 && ver !== RUN_SAVE_SCHEMA_VERSION) {
    return {
      save: null,
      migratedFrom: typeof ver === 'number' ? ver : null,
      discardedReason: `구버전(v${String(ver)}) 출정 데이터가 현재 버전과 호환되지 않아 초기화되었습니다.`,
    };
  }

  if (
    rec.gameOver === true ||
    typeof rec.currentTick !== 'number' ||
    !Number.isFinite(rec.currentTick) ||
    rec.currentTick < 0 ||
    typeof rec.waveNumber !== 'number' ||
    !Array.isArray(rec.units) ||
    !Array.isArray(rec.monsters)
  ) {
    return {
      save: null,
      migratedFrom: ver === 1 ? 1 : null,
      discardedReason: null,
    };
  }

  const fieldCap = data.board.field.cols * data.board.field.rows;
  const benchCap = data.board.bench.cols * data.board.bench.rows;
  for (let i = 0; i < rec.units.length; i++) {
    const u = rec.units[i] as Partial<UnitEntity> | undefined;
    if (!u || typeof u.unitId !== 'string' || !data.unitsById.has(u.unitId)) {
      return {
        save: null,
        migratedFrom: ver === 1 ? 1 : null,
        discardedReason: '업데이트로 변경된 협객 데이터가 포함되어 새 출정을 시작합니다.',
      };
    }
    const slot = u.slot;
    if (
      !slot ||
      (slot.area !== 'field' && slot.area !== 'bench') ||
      typeof slot.index !== 'number' ||
      slot.index < 0 ||
      slot.index >= (slot.area === 'field' ? fieldCap : benchCap)
    ) {
      return {
        save: null,
        migratedFrom: ver === 1 ? 1 : null,
        discardedReason: '배치 슬롯 규격이 변경되어 새 출정을 시작합니다.',
      };
    }
  }

  let appliedStartWisps: Record<GradeId, number> = {};
  if (ver === 1) {
    // Legacy v1 stored `appliedStartCommonWisp` & `appliedStartUncommonWisp` separately
    const firstGradeId = data.grades[0]?.id;
    const secondGradeId = data.grades[1]?.id;
    const cWisp =
      typeof rec.appliedStartCommonWisp === 'number' && Number.isFinite(rec.appliedStartCommonWisp)
        ? Math.max(0, Math.floor(rec.appliedStartCommonWisp))
        : 0;
    const uWisp =
      typeof rec.appliedStartUncommonWisp === 'number' &&
      Number.isFinite(rec.appliedStartUncommonWisp)
        ? Math.max(0, Math.floor(rec.appliedStartUncommonWisp))
        : 0;
    if (firstGradeId && cWisp > 0) appliedStartWisps[firstGradeId] = cWisp;
    if (secondGradeId && uWisp > 0) appliedStartWisps[secondGradeId] = uWisp;
  } else if (typeof rec.appliedStartWisps === 'object' && rec.appliedStartWisps !== null) {
    for (const [gId, val] of Object.entries(rec.appliedStartWisps as Record<string, unknown>)) {
      if (typeof val === 'number' && Number.isFinite(val) && val > 0 && data.gradesById.has(gId)) {
        appliedStartWisps[gId] = Math.floor(val);
      }
    }
  }

  const migrated: RunSaveData = {
    ...(rec as unknown as Omit<RunSaveData, 'version' | 'appliedStartWisps'>),
    version: RUN_SAVE_SCHEMA_VERSION,
    savedAtMs: typeof rec.savedAtMs === 'number' ? rec.savedAtMs : 0,
    trialId: typeof rec.trialId === 'string' ? (rec.trialId as TrialId) : null,
    appliedStartWisps,
  };

  return {
    save: migrated,
    migratedFrom: ver === 1 ? 1 : null,
    discardedReason: null,
  };
}
