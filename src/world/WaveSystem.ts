import type { EventBus } from '../core/EventBus';
import type { Rng } from '../core/Rng';
import type { SimEventMap } from '../core/Simulation';
import type {
  DifficultyId,
  GameDataBundle,
  GameOverReason,
  MonsterKind,
  TrialId,
  WaveDef,
  WaveMutantKind,
} from '../data/types';
import type { Board } from './Board';
import type { LoopPath } from './Path';
import type { MonsterEntity, TileHazard, UnitEntity } from './entities';

export const BOUNTY_COOLDOWN_TICKS = 1350; // 45s
export const BOUNTY_DURATION_TICKS = 900; // 30s
export const HAZARD_WARNING_TICKS = 60; // 2.0s telegraph warning
export const HAZARD_SEAL_TICKS = 135; // 4.5s active seal duration

export interface WaveMutantMeta {
  readonly kind: WaveMutantKind;
  readonly name: string;
  readonly badge: string;
  readonly desc: string;
  readonly hpMult: number;
  readonly speedMult: number;
  readonly countMult: number;
  readonly intervalMult: number;
  readonly bonusArmor: number;
  readonly bonusCoin: number;
}

export const WAVE_MUTANT_META: Readonly<Record<WaveMutantKind, WaveMutantMeta>> = {
  swift_raid: {
    kind: 'swift_raid',
    name: '경공 야습단',
    badge: '⚡ 경공야습',
    desc: '이동속도 +28% · 체력 -20% · 은자 +1',
    hpMult: 0.8,
    speedMult: 1.28,
    countMult: 1.0,
    intervalMult: 0.9,
    bonusArmor: 0,
    bonusCoin: 1,
  },
  iron_wall: {
    kind: 'iron_wall',
    name: '철갑 중장병',
    badge: '🛡 철갑중장',
    desc: '호신강기 +22 · 체력 +35% · 소수정예 · 은자 +4',
    hpMult: 1.35,
    speedMult: 0.88,
    countMult: 0.65,
    intervalMult: 1.25,
    bonusArmor: 22,
    bonusCoin: 4,
  },
  blood_swarm: {
    kind: 'blood_swarm',
    name: '혈해 인해전술',
    badge: '🩸 인해전술',
    desc: '마물 머릿수 +35% · 체력 -18%',
    hpMult: 0.82,
    speedMult: 1.05,
    countMult: 1.35,
    intervalMult: 0.75,
    bonusArmor: 0,
    bonusCoin: 0,
  },
};

export function getWaveMutantKind(waveNum: number, isBoss: boolean): WaveMutantKind | null {
  if (isBoss || waveNum < 6) return null;
  const rem = waveNum % 5;
  if (rem !== 2 && rem !== 4) return null;
  const cycleIdx = (Math.floor(waveNum / 5) + (rem === 4 ? 1 : 0)) % 3;
  if (cycleIdx === 0) return 'iron_wall';
  if (cycleIdx === 1) return 'swift_raid';
  return 'blood_swarm';
}

export type BossSkillKind =
  | 'tiger_roar'
  | 'tiger_sprint'
  | 'serpent_shell'
  | 'serpent_heal'
  | 'serpent_shatter'
  | 'patriarch_telegraph'
  | 'patriarch_seal'
  | 'patriarch_summon';

export const BOUNTY_ROSTER: readonly {
  readonly name: string;
  readonly kind: MonsterKind;
  readonly radius: number;
}[] = [
  { name: '현상수배 · 만독귀 사마현', kind: 'blood_zealot', radius: 24 },
  { name: '현상수배 · 철혈마도 악무극', kind: 'jiangshi', radius: 25 },
  { name: '현상수배 · 흑살령주 혈무영', kind: 'blood_patriarch', radius: 26 },
];

/**
 * Resolves the wave definition for `waveNum` without ever wrapping back to Wave 1!
 * Waves 1..N map 1:1 to `waves.json`; endless waves > N cycle the final 5 endgame waves (26..30).
 */
export function resolveWaveDef(waves: readonly WaveDef[], waveNum: number): WaveDef {
  if (waveNum <= waves.length) {
    return waves[Math.max(0, waveNum - 1)] ?? waves[0]!;
  }
  const tailLen = Math.min(5, waves.length);
  const tailStart = waves.length - tailLen;
  const offset = (waveNum - waves.length - 1) % tailLen;
  return waves[tailStart + offset] ?? waves[waves.length - 1]!;
}

export function computeWaveHpScale(
  data: GameDataBundle,
  difficulty: DifficultyId,
  trialId: TrialId | null,
  waveNum: number,
  isBoss = false,
): number {
  const diffCfg = data.difficultiesById.get(difficulty) ?? data.difficulties[0]!;
  const trialCfg = trialId ? data.trialsById.get(trialId) : undefined;
  const baseMult = diffCfg.hpMult * (trialCfg ? trialCfg.hpMult : 1);
  const effLateRamp = diffCfg.lateWaveRamp * (trialCfg ? trialCfg.lateWaveRamp : 1);
  const bossMult = isBoss ? diffCfg.bossHpMult * (trialCfg ? trialCfg.bossHpMult : 1) : 1;

  const targetWave = trialCfg ? trialCfg.targetWave : data.waves.length;
  const rampSpan = Math.max(1, targetWave - 5);
  const rampProgress = waveNum <= 5 ? 0 : Math.min(1, (waveNum - 5) / rampSpan);
  const rampMult = 1 + (effLateRamp - 1) * rampProgress;

  if (waveNum <= data.waves.length) {
    return baseMult * rampMult * bossMult;
  }
  // Endless Bloodbath (> Wave 30): exponential compounding atop the full endgame ramp
  const endlessStep = waveNum - data.waves.length;
  return baseMult * effLateRamp * bossMult * Math.pow(1.18, endlessStep);
}

export function computeMonsterArmor(
  data: GameDataBundle,
  difficulty: DifficultyId,
  trialId: TrialId | null,
  waveNum: number,
  isBoss: boolean,
  isBounty: boolean,
): number {
  const diffCfg = data.difficultiesById.get(difficulty) ?? data.difficulties[0]!;
  const trialCfg = trialId ? data.trialsById.get(trialId) : undefined;
  const trialArmor = trialCfg ? trialCfg.bonusMonsterArmor : 0;
  const diffArmor = diffCfg.armorBonus;

  if (waveNum <= 2 && !isBounty) {
    return trialArmor + Math.floor(diffArmor * 0.5);
  }
  const mutantKind = !isBoss && !isBounty ? getWaveMutantKind(waveNum, false) : null;
  const mutantArmor = mutantKind ? WAVE_MUTANT_META[mutantKind].bonusArmor : 0;
  const base =
    Math.max(0, waveNum - 2) * 2.8 +
    diffArmor +
    (isBoss && !isBounty ? 20 : 0) +
    (isBounty ? 14 : 0) +
    mutantArmor +
    trialArmor;
  return Math.min(180, Math.round(base));
}

export function resolveTargetBossName(
  trialId: TrialId | null,
  clearTargetWave: number,
  waveNum: number,
  waveDef: WaveDef,
): string | undefined {
  if (!waveDef.isBoss) return waveDef.bossName;
  if (waveNum === clearTargetWave) {
    return trialId
      ? `비경수호신 · ${waveDef.bossName ?? '아수라 혈마존'}`
      : waveDef.bossName ?? '천마대제 아수라 혈마신';
  }
  return waveDef.bossName;
}

export interface WaveSystemContext {
  readonly data: GameDataBundle;
  readonly difficulty: DifficultyId;
  readonly trialId: TrialId | null;
  readonly clearTargetWave: number;
  readonly board: Board;
  readonly path: LoopPath;
  readonly rng: Rng;
  readonly events: EventBus<SimEventMap>;
  readonly units: UnitEntity[];
  readonly monsters: MonsterEntity[];
  readonly tileHazards: TileHazard[];
  readonly currentTick: number;
  getWaveNumber(): number;
  setWaveNumber(v: number): void;
  getWaveTicksLeft(): number;
  setWaveTicksLeft(v: number): void;
  getSpawnedInWave(): number;
  setSpawnedInWave(v: number): void;
  getNextSpawnTick(): number;
  setNextSpawnTick(v: number): void;
  allocateMonsterId(): number;
  getCoin(): number;
  setCoin(v: number): void;
  addLuckStone(delta: number): void;
  setLastWaveInterest(v: number): void;
  getEffectiveInterestConfig(): { readonly pct: number; readonly cap: number };
  hasFieldHazard(fieldIndex: number): boolean;
  markGameOver(reason: GameOverReason): void;
  markPriorityDirty(): void;
}

export function spawnBountyOutlaw(
  ctx: WaveSystemContext,
  bountiesCalled: number,
  hunterStacks: number,
): { readonly nextBountyReadyTick: number } {
  const waveNumber = ctx.getWaveNumber();
  const spec = BOUNTY_ROSTER[bountiesCalled % BOUNTY_ROSTER.length]!;
  const diffCfg = ctx.data.difficultiesById.get(ctx.difficulty) ?? ctx.data.difficulties[0]!;
  const trialCfg = ctx.trialId ? ctx.data.trialsById.get(ctx.trialId) : undefined;
  const trialSpdMult = trialCfg ? trialCfg.speedMult : 1;

  const waveDef = resolveWaveDef(ctx.data.waves, waveNumber);
  const waveBaseHp = waveDef.monsterHp;
  const hpScale = computeWaveHpScale(ctx.data, ctx.difficulty, ctx.trialId, waveNumber, false);
  const bountyHp = Math.round(
    Math.max(1200, waveBaseHp * (waveDef.isBoss ? 0.35 : 5.2)) * hpScale,
  );
  const rewardCoin = 45 + waveNumber * 10;
  const rewardLuck = waveNumber >= 14 ? 3 : 2;
  const startPos = ctx.path.sample(0);

  const outlaw: MonsterEntity = {
    entityId: ctx.allocateMonsterId(),
    kind: spec.kind,
    isBoss: true,
    isBounty: true,
    expireTick: ctx.currentTick + BOUNTY_DURATION_TICKS,
    bountyRewardLuck: rewardLuck,
    bossName: spec.name,
    hp: bountyHp,
    maxHp: bountyHp,
    armor: computeMonsterArmor(ctx.data, ctx.difficulty, ctx.trialId, waveNumber, false, true),
    armorShred: 0,
    shredExpireTick: 0,
    shieldHp: 0,
    shieldMaxHp: 0,
    shieldExpireTick: 0,
    hasteUntilTick: 0,
    nextBossSkillTick: 999999999,
    phaseTriggered: true,
    speedPerTick: 3.4 * diffCfg.speedMult * trialSpdMult,
    radius: spec.radius,
    rewardCoin,
    spawnTick: ctx.currentTick,
    stunUntilTick: 0,
    slowUntilTick: 0,
    slowFactor: 1,
    lastHitTick: -100,
    prevDistance: 0,
    currDistance: 0,
    prevX: startPos.x,
    prevY: startPos.y,
    currX: startPos.x,
    currY: startPos.y,
  };

  ctx.monsters.push(outlaw);
  const cdMult = Math.max(0.3, 1 - 0.35 * hunterStacks);
  const nextBountyReadyTick = ctx.currentTick + Math.round(BOUNTY_COOLDOWN_TICKS * cdMult);
  ctx.markPriorityDirty();

  ctx.events.emit('bounty:called', {
    bossName: spec.name,
    rewardCoin,
    rewardLuck,
    tick: ctx.currentTick,
  });

  return { nextBountyReadyTick };
}

export function stepWaveAndSpawn(ctx: WaveSystemContext): void {
  // 0. Check active bounty outlaw 30s escape timer
  for (let i = ctx.monsters.length - 1; i >= 0; i--) {
    const m = ctx.monsters[i]!;
    if (m.isBounty && m.expireTick !== undefined && ctx.currentTick >= m.expireTick) {
      const coin = ctx.getCoin();
      const stolenCoin = Math.min(120, Math.floor(coin * 0.18));
      ctx.setCoin(Math.max(0, coin - stolenCoin));
      ctx.monsters.splice(i, 1);
      ctx.markPriorityDirty();
      ctx.events.emit('bounty:escaped', {
        bossName: m.bossName ?? '현상수배범',
        stolenCoin,
        tick: ctx.currentTick,
      });
    }
  }

  const waveNumber = ctx.getWaveNumber();
  const waveDef = resolveWaveDef(ctx.data.waves, waveNumber);
  const mutantKind = getWaveMutantKind(waveNumber, waveDef.isBoss);
  const mutantMeta = mutantKind ? WAVE_MUTANT_META[mutantKind] : null;
  const diffCfg = ctx.data.difficultiesById.get(ctx.difficulty) ?? ctx.data.difficulties[0]!;
  const trialCfg = ctx.trialId ? ctx.data.trialsById.get(ctx.trialId) : undefined;
  const hpScale = computeWaveHpScale(
    ctx.data,
    ctx.difficulty,
    ctx.trialId,
    waveNumber,
    waveDef.isBoss,
  );
  const resolvedBossName = resolveTargetBossName(
    ctx.trialId,
    ctx.clearTargetWave,
    waveNumber,
    waveDef,
  );

  const effectiveSpawnCount = mutantMeta
    ? Math.max(4, Math.round(waveDef.spawnCount * mutantMeta.countMult))
    : waveDef.spawnCount;
  const effectiveSpawnInterval = mutantMeta
    ? Math.max(8, Math.round(waveDef.spawnIntervalTicks * mutantMeta.intervalMult))
    : waveDef.spawnIntervalTicks;

  const spawnedInWave = ctx.getSpawnedInWave();
  if (spawnedInWave < effectiveSpawnCount && ctx.currentTick >= ctx.getNextSpawnTick()) {
    const startPos = ctx.path.sample(0);
    const hpMult = mutantMeta ? mutantMeta.hpMult : 1;
    const speedMult =
      (mutantMeta ? mutantMeta.speedMult : 1) * (trialCfg ? trialCfg.speedMult : 1);
    const bonusCoin = mutantMeta ? mutantMeta.bonusCoin : 0;
    const scaledHp = Math.max(1, Math.round(waveDef.monsterHp * hpScale * hpMult));

    const bossCdMult = trialCfg ? trialCfg.bossCooldownMult : 1;
    const initialSkillDelay = !waveDef.isBoss
      ? 999999999
      : Math.max(
          45,
          Math.round(
            (waveDef.monsterKind === 'white_tiger'
              ? 120
              : waveDef.monsterKind === 'black_serpent'
                ? 135
                : 105) * bossCdMult,
          ),
        );

    const monster: MonsterEntity = {
      entityId: ctx.allocateMonsterId(),
      kind: waveDef.monsterKind,
      isBoss: waveDef.isBoss,
      bossName: resolvedBossName,
      hp: scaledHp,
      maxHp: scaledHp,
      armor: computeMonsterArmor(
        ctx.data,
        ctx.difficulty,
        ctx.trialId,
        waveNumber,
        waveDef.isBoss,
        false,
      ),
      armorShred: 0,
      shredExpireTick: 0,
      shieldHp: 0,
      shieldMaxHp: 0,
      shieldExpireTick: 0,
      hasteUntilTick: 0,
      nextBossSkillTick: ctx.currentTick + initialSkillDelay,
      phaseTriggered: false,
      speedPerTick: waveDef.monsterSpeedPerTick * diffCfg.speedMult * speedMult,
      radius: waveDef.monsterRadius,
      rewardCoin: waveDef.rewardCoin + bonusCoin,
      spawnTick: ctx.currentTick,
      stunUntilTick: 0,
      slowUntilTick: 0,
      slowFactor: 1,
      lastHitTick: -100,
      prevDistance: 0,
      currDistance: 0,
      prevX: startPos.x,
      prevY: startPos.y,
      currX: startPos.x,
      currY: startPos.y,
    };
    ctx.monsters.push(monster);
    ctx.setSpawnedInWave(spawnedInWave + 1);
    ctx.setNextSpawnTick(ctx.currentTick + effectiveSpawnInterval);

    if (ctx.monsters.length >= ctx.data.board.path.monsterCap) {
      ctx.markGameOver('overrun');
      return;
    }
  }

  // Fast-forward boss wave remaining idle timer once the wave boss is slain
  if (
    waveDef.isBoss &&
    ctx.getSpawnedInWave() >= effectiveSpawnCount &&
    !ctx.monsters.some((m) => m.isBoss && !m.isBounty) &&
    ctx.getWaveTicksLeft() > 45
  ) {
    ctx.setWaveTicksLeft(45);
    ctx.markPriorityDirty();
  }

  const nextTicksLeft = ctx.getWaveTicksLeft() - 1;
  ctx.setWaveTicksLeft(nextTicksLeft);
  if (nextTicksLeft <= 0) {
    if (waveDef.isBoss) {
      const survivingBoss = ctx.monsters.find((m) => m.isBoss && !m.isBounty);
      if (survivingBoss) {
        ctx.markGameOver('boss_timeout');
        ctx.events.emit('boss:timeout', {
          wave: waveNumber,
          bossName: survivingBoss.bossName ?? resolvedBossName ?? '영물 보스',
          tick: ctx.currentTick,
        });
        return;
      }
    }

    const completedWave = waveNumber;
    const { pct: interestPct, cap: interestCap } = ctx.getEffectiveInterestConfig();
    const curCoin = ctx.getCoin();
    const interestCoin =
      interestPct > 0 ? Math.min(interestCap, Math.floor((curCoin * interestPct) / 100)) : 0;
    ctx.setLastWaveInterest(interestCoin);

    ctx.tileHazards.length = 0;
    const nextWaveNum = waveNumber + 1;
    ctx.setWaveNumber(nextWaveNum);
    const nextWaveDef = resolveWaveDef(ctx.data.waves, nextWaveNum);
    ctx.setWaveTicksLeft(nextWaveDef.durationTicks);
    ctx.setSpawnedInWave(0);
    ctx.setNextSpawnTick(ctx.currentTick + 15);
    const updatedCoin = curCoin + 20 + interestCoin;
    ctx.setCoin(updatedCoin);
    ctx.addLuckStone(1);
    ctx.markPriorityDirty();

    if (interestCoin > 0) {
      ctx.events.emit('wave:interest', {
        completedWave,
        interestCoin,
        pct: interestPct,
        totalCoin: updatedCoin,
        tick: ctx.currentTick,
      });
    }

    if (nextWaveDef.isBoss) {
      const nextBossName =
        resolveTargetBossName(ctx.trialId, ctx.clearTargetWave, nextWaveNum, nextWaveDef) ??
        '웨이브 보스';
      ctx.events.emit('wave:boss', {
        wave: nextWaveNum,
        bossName: nextBossName,
        monsterKind: nextWaveDef.monsterKind,
        tick: ctx.currentTick,
      });
    } else {
      const nextMutant = getWaveMutantKind(nextWaveNum, false);
      if (nextMutant) {
        const meta = WAVE_MUTANT_META[nextMutant];
        ctx.events.emit('wave:mutant', {
          wave: nextWaveNum,
          mutant: nextMutant,
          name: meta.name,
          desc: meta.desc,
          tick: ctx.currentTick,
        });
      }
    }
  }
}

function pickHazardTiles(ctx: WaveSystemContext, count: number): number[] {
  const occupiedSafe: number[] = [];
  const emptySafe: number[] = [];
  for (let i = 0; i < ctx.board.field.capacity; i++) {
    if (ctx.hasFieldHazard(i)) continue;
    if (ctx.board.field.getUidAt(i) !== null) occupiedSafe.push(i);
    else emptySafe.push(i);
  }

  const picked: number[] = [];
  while (picked.length < count && occupiedSafe.length > 0) {
    const r = ctx.rng.nextInt(occupiedSafe.length);
    picked.push(occupiedSafe.splice(r, 1)[0]!);
  }
  while (picked.length < count && emptySafe.length > 0) {
    const r = ctx.rng.nextInt(emptySafe.length);
    picked.push(emptySafe.splice(r, 1)[0]!);
  }
  return picked;
}

export function stepMonstersAndBosses(ctx: WaveSystemContext): void {
  // 0. Prune expired tile hazards & emit seal activation when warning completes
  if (ctx.tileHazards.length > 0) {
    const activatedIndices: number[] = [];
    for (let i = ctx.tileHazards.length - 1; i >= 0; i--) {
      const h = ctx.tileHazards[i]!;
      if (ctx.currentTick >= h.expireTick) {
        ctx.tileHazards.splice(i, 1);
        ctx.markPriorityDirty();
      } else if (ctx.currentTick === h.activateTick) {
        activatedIndices.push(h.fieldIndex);
        ctx.markPriorityDirty();
      }
    }
    if (activatedIndices.length > 0) {
      const firstCenter = ctx.board.getSlotCenter({
        area: 'field',
        index: activatedIndices[0]!,
      });
      ctx.events.emit('boss:skill', {
        entityId: 0,
        bossKind: 'blood_patriarch',
        skillKind: 'patriarch_seal',
        skillName: '혈옥주박 봉인 발동!',
        x: firstCenter.x,
        y: firstCenter.y,
        tileIndices: activatedIndices,
        tick: ctx.currentTick,
      });
    }
  }

  const spawnedEscorts: MonsterEntity[] = [];
  const trialCfg = ctx.trialId ? ctx.data.trialsById.get(ctx.trialId) : undefined;
  const bossCdMult = trialCfg ? trialCfg.bossCooldownMult : 1;
  const waveNumber = ctx.getWaveNumber();

  for (let i = 0; i < ctx.monsters.length; i++) {
    const m = ctx.monsters[i]!;

    // Unbroken Black Serpent poison-shell barrier expires -> heals boss 6% Max HP!
    if (m.shieldHp > 0 && ctx.currentTick >= m.shieldExpireTick) {
      m.shieldHp = 0;
      m.shieldMaxHp = 0;
      m.shieldExpireTick = 0;
      const healAmt = Math.max(1, Math.round(m.maxHp * 0.06));
      m.hp = Math.min(m.maxHp, m.hp + healAmt);
      ctx.markPriorityDirty();
      ctx.events.emit('boss:skill', {
        entityId: m.entityId,
        bossKind: m.kind,
        skillKind: 'serpent_heal',
        skillName: '만년독갑 흡수 · 재생!',
        x: m.currX,
        y: m.currY,
        tick: ctx.currentTick,
      });
    }

    if (ctx.currentTick < m.stunUntilTick) {
      continue;
    }

    const slowMult = ctx.currentTick < m.slowUntilTick ? m.slowFactor : 1;
    const hasteMult = ctx.currentTick < m.hasteUntilTick ? 1.55 : 1;
    m.currDistance += m.speedPerTick * slowMult * hasteMult;
    const pos = ctx.path.sample(m.currDistance);
    m.currX = pos.x;
    m.currY = pos.y;

    // Active Wave Boss Patterns (excludes bounty outlaws)
    if (m.isBoss && !m.isBounty) {
      // 1) 55% HP threshold phase trigger
      if (!m.phaseTriggered && m.hp <= Math.round(m.maxHp * 0.55)) {
        m.phaseTriggered = true;
        if (m.kind === 'white_tiger') {
          m.hasteUntilTick = ctx.currentTick + 90;
          m.slowUntilTick = 0;
          m.slowFactor = 1;
          ctx.markPriorityDirty();
          ctx.events.emit('boss:skill', {
            entityId: m.entityId,
            bossKind: m.kind,
            skillKind: 'tiger_sprint',
            skillName: '백호 광풍질주!',
            x: m.currX,
            y: m.currY,
            tick: ctx.currentTick,
          });
        } else if (m.kind === 'blood_patriarch') {
          const escortCount = waveNumber >= ctx.clearTargetWave ? 3 : 2;
          const room = Math.max(
            0,
            ctx.data.board.path.monsterCap - 2 - (ctx.monsters.length + spawnedEscorts.length),
          );
          const toSpawn = Math.min(escortCount, room);
          for (let s = 0; s < toSpawn; s++) {
            const offsetDist = Math.max(0, m.currDistance - 28 * (s + 1));
            const ePos = ctx.path.sample(offsetDist);
            const eHp = Math.max(80, Math.round(m.maxHp * 0.045));
            spawnedEscorts.push({
              entityId: ctx.allocateMonsterId(),
              kind: 'blood_zealot',
              isBoss: false,
              hp: eHp,
              maxHp: eHp,
              armor: Math.round(m.armor * 0.5),
              armorShred: 0,
              shredExpireTick: 0,
              shieldHp: 0,
              shieldMaxHp: 0,
              shieldExpireTick: 0,
              hasteUntilTick: 0,
              nextBossSkillTick: 999999999,
              phaseTriggered: true,
              speedPerTick: m.speedPerTick * 1.18,
              radius: 17,
              rewardCoin: 10,
              spawnTick: ctx.currentTick,
              stunUntilTick: 0,
              slowUntilTick: 0,
              slowFactor: 1,
              lastHitTick: -100,
              prevDistance: offsetDist,
              currDistance: offsetDist,
              prevX: ePos.x,
              prevY: ePos.y,
              currX: ePos.x,
              currY: ePos.y,
            });
          }
          if (toSpawn > 0) {
            ctx.markPriorityDirty();
            ctx.events.emit('boss:skill', {
              entityId: m.entityId,
              bossKind: m.kind,
              skillKind: 'patriarch_summon',
              skillName: '혈마호위 강림!',
              x: m.currX,
              y: m.currY,
              tick: ctx.currentTick,
            });
          }
        }
      }

      // 2) Periodic boss signature skill
      if (ctx.currentTick >= m.nextBossSkillTick) {
        if (m.kind === 'white_tiger') {
          m.nextBossSkillTick = ctx.currentTick + Math.max(90, Math.round(240 * bossCdMult));
          const roarRadiusSq = 195 * 195;
          for (let uIdx = 0; uIdx < ctx.units.length; uIdx++) {
            const u = ctx.units[uIdx]!;
            if (u.slot.area !== 'field') continue;
            const dx = u.currX - m.currX;
            const dy = u.currY - m.currY;
            if (dx * dx + dy * dy <= roarRadiusSq) {
              u.cooldownTicks = Math.min(90, u.cooldownTicks + 36);
            }
          }
          ctx.events.emit('boss:skill', {
            entityId: m.entityId,
            bossKind: m.kind,
            skillKind: 'tiger_roar',
            skillName: '백호 호포진!',
            x: m.currX,
            y: m.currY,
            tick: ctx.currentTick,
          });
        } else if (m.kind === 'black_serpent') {
          m.nextBossSkillTick = ctx.currentTick + Math.max(90, Math.round(270 * bossCdMult));
          const shieldAmt = Math.max(60, Math.round(m.maxHp * 0.12));
          m.shieldHp = shieldAmt;
          m.shieldMaxHp = shieldAmt;
          m.shieldExpireTick = ctx.currentTick + 150;
          ctx.markPriorityDirty();
          ctx.events.emit('boss:skill', {
            entityId: m.entityId,
            bossKind: m.kind,
            skillKind: 'serpent_shell',
            skillName: '만년현무 독갑!',
            x: m.currX,
            y: m.currY,
            tick: ctx.currentTick,
          });
        } else if (m.kind === 'blood_patriarch') {
          m.nextBossSkillTick = ctx.currentTick + Math.max(90, Math.round(225 * bossCdMult));
          const sealCount = waveNumber >= ctx.clearTargetWave ? 3 : 2;
          const chosenTiles = pickHazardTiles(ctx, sealCount);
          if (chosenTiles.length > 0) {
            for (let c = 0; c < chosenTiles.length; c++) {
              ctx.tileHazards.push({
                fieldIndex: chosenTiles[c]!,
                startTick: ctx.currentTick,
                activateTick: ctx.currentTick + HAZARD_WARNING_TICKS,
                expireTick: ctx.currentTick + HAZARD_WARNING_TICKS + HAZARD_SEAL_TICKS,
              });
            }
            ctx.markPriorityDirty();
            ctx.events.emit('boss:skill', {
              entityId: m.entityId,
              bossKind: m.kind,
              skillKind: 'patriarch_telegraph',
              skillName: '혈옥주박진 예고! (영웅 이동 회피)',
              x: m.currX,
              y: m.currY,
              tileIndices: chosenTiles,
              tick: ctx.currentTick,
            });
          }
        }
      }
    }
  }

  if (spawnedEscorts.length > 0) {
    for (let i = 0; i < spawnedEscorts.length; i++) {
      ctx.monsters.push(spawnedEscorts[i]!);
    }
  }
}
