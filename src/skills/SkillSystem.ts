import type { EventBus } from '../core/EventBus';
import {
  computeRelicSetBonuses,
  getAbacusKillCoinPct,
  getArmorGauntletShred,
  getBanditPilferCoin,
  getBanditProcPer1000,
  getCritBladeChanceBps,
  getCritBladeMultBonus,
  getRangeMirrorCcPct,
  getRangeMirrorRangeBonus,
  getScrollChestBossLuckBonus,
  getSkillJadeDamagePct,
  getSlayerBannerBossPct,
  getSlayerBannerBountyCoinPct,
  getSwiftBootsSpeedPct,
  getTrigramMirrorAuraPct,
} from '../core/relicFormulas';
import type { Rng } from '../core/Rng';
import type { SimEventMap } from '../core/Simulation';
import type {
  BoonId,
  DifficultyId,
  FactionId,
  GameDataBundle,
  GradeId,
  PassiveProcKind,
  RelicId,
  TrialId,
  UnitDef,
  UnitId,
  UpgradeGroupId,
} from '../data/types';
import type { Board } from '../world/Board';
import { resolveWaveDef } from '../world/WaveSystem';
import type { MonsterEntity, ProjectileEntity, TileHazard, UnitEntity } from '../world/entities';

export interface TileAuraBuff {
  readonly atkPct: number;
  readonly speedPct: number;
}

export interface BenchPassiveActiveEntry {
  readonly unitId: UnitId;
  readonly name: string;
  readonly passiveName: string;
  readonly desc: string;
}

export interface BenchPassiveSummary {
  readonly activeUnits: readonly BenchPassiveActiveEntry[];
  readonly interestPct: number;
  readonly interestCap: number;
  readonly killCoinPct: number;
  readonly gambleBonusPct: number;
  readonly critChancePct: number;
  readonly critMultBonus: number;
  readonly armorShred: number;
  readonly skillDamagePct: number;
  readonly bossDamagePct: number;
}

export const MAX_UNIT_STAR_LEVEL = 3;

export function getUnitAwakenCost(gradeRank: number, currentStar: number): number | null {
  if (currentStar >= MAX_UNIT_STAR_LEVEL || currentStar < 0) return null;
  const baseCosts = [300, 650, 1200] as const;
  const rankSteps = [80, 150, 250] as const;
  const idx = Math.min(2, Math.max(0, Math.floor(currentStar)));
  const rankDelta = Math.max(0, gradeRank - 3);
  return baseCosts[idx]! + rankDelta * rankSteps[idx]!;
}

export function getStarAtkBps(starLevel: number): number {
  if (starLevel <= 0) return 0;
  if (starLevel === 1) return 1800;
  if (starLevel === 2) return 3800;
  return 6200;
}

export function getStarSpeedPct(starLevel: number): number {
  if (starLevel <= 0) return 0;
  return Math.min(MAX_UNIT_STAR_LEVEL, starLevel) * 6;
}

export function computeBenchPassiveSummary(
  units: readonly UnitEntity[],
  unitsById: ReadonlyMap<UnitId, UnitDef>,
): BenchPassiveSummary {
  const seen = new Set<UnitId>();
  const activeUnits: BenchPassiveActiveEntry[] = [];
  let interestPct = 0;
  let interestCap = 0;
  let killCoinPct = 0;
  let gambleBonusPct = 0;
  let critChancePct = 0;
  let critMultBonus = 0;
  let armorShred = 0;
  let skillDamagePct = 0;
  let bossDamagePct = 0;

  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    if (u.slot.area !== 'bench') continue;
    if (seen.has(u.unitId)) continue;
    const def = unitsById.get(u.unitId);
    const bp = def?.benchPassive;
    if (!def || !bp) continue;
    seen.add(u.unitId);
    activeUnits.push({
      unitId: u.unitId,
      name: def.name,
      passiveName: bp.name,
      desc: bp.desc,
    });
    interestPct += bp.interestPct ?? 0;
    interestCap += bp.interestCap ?? 0;
    killCoinPct += bp.killCoinPct ?? 0;
    gambleBonusPct += bp.gambleBonusPct ?? 0;
    critChancePct += bp.critChancePct ?? 0;
    critMultBonus += bp.critMultBonus ?? 0;
    armorShred += bp.armorShred ?? 0;
    skillDamagePct += bp.skillDamagePct ?? 0;
    bossDamagePct += bp.bossDamagePct ?? 0;
  }

  return {
    activeUnits,
    interestPct,
    interestCap,
    killCoinPct,
    gambleBonusPct,
    critChancePct,
    critMultBonus,
    armorShred,
    skillDamagePct,
    bossDamagePct,
  };
}

export interface FactionSynergySnapshot {
  readonly counts: Readonly<Record<FactionId, number>>;
  readonly orthodoxTier: 0 | 1 | 2;
  readonly unorthodoxTier: 0 | 1 | 2;
  readonly demonicTier: 0 | 1 | 2;
  readonly trinityActive: boolean;
}

export function computeFieldSynergy(
  units: readonly UnitEntity[],
  unitsById: ReadonlyMap<UnitId, UnitDef>,
): FactionSynergySnapshot {
  let orthodox = 0;
  let unorthodox = 0;
  let demonic = 0;

  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    if (u.slot.area !== 'field') continue;
    const def = unitsById.get(u.unitId);
    if (!def) continue;
    if (def.faction === 'orthodox') orthodox++;
    else if (def.faction === 'unorthodox') unorthodox++;
    else if (def.faction === 'demonic') demonic++;
  }

  const orthodoxTier: 0 | 1 | 2 = orthodox >= 6 ? 2 : orthodox >= 3 ? 1 : 0;
  const unorthodoxTier: 0 | 1 | 2 = unorthodox >= 6 ? 2 : unorthodox >= 3 ? 1 : 0;
  const demonicTier: 0 | 1 | 2 = demonic >= 6 ? 2 : demonic >= 3 ? 1 : 0;
  const trinityActive = orthodox >= 2 && unorthodox >= 2 && demonic >= 2;

  return {
    counts: { orthodox, unorthodox, demonic },
    orthodoxTier,
    unorthodoxTier,
    demonicTier,
    trinityActive,
  };
}

export function computeFieldTileBuffs(
  board: Board,
  unitsByUid: ReadonlyMap<number, UnitEntity>,
  unitsById: ReadonlyMap<UnitId, UnitDef>,
  swiftStacks: number,
  trigramAuraPct = 0,
): readonly TileAuraBuff[] {
  const cap = board.field.capacity;
  const cols = board.config.field.cols;
  const rows = board.config.field.rows;
  const out: TileAuraBuff[] = new Array<TileAuraBuff>(cap);
  const auraMult = 1 + 0.5 * swiftStacks + trigramAuraPct / 100;
  const atkCap = Math.round((65 + 25 * swiftStacks) * (1 + trigramAuraPct / 200));
  const speedCap = Math.round((45 + 20 * swiftStacks) * (1 + trigramAuraPct / 200));

  for (let idx = 0; idx < cap; idx++) {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    let atkPct = 0;
    let speedPct = 0;

    const checkNeighbor = (nIdx: number): void => {
      const nUid = board.field.getUidAt(nIdx);
      if (nUid === null) return;
      const nUnit = unitsByUid.get(nUid);
      if (!nUnit) return;
      const nDef = unitsById.get(nUnit.unitId);
      if (!nDef?.supportAura) return;
      atkPct += Math.round(nDef.supportAura.atkPct * auraMult);
      speedPct += Math.round(nDef.supportAura.speedPct * auraMult);
    };

    if (col > 0) checkNeighbor(idx - 1);
    if (col < cols - 1) checkNeighbor(idx + 1);
    if (row > 0) checkNeighbor(idx - cols);
    if (row < rows - 1) checkNeighbor(idx + cols);

    out[idx] = {
      atkPct: Math.min(atkCap, atkPct),
      speedPct: Math.min(speedCap, speedPct),
    };
  }
  return out;
}

export function computeUnitEffectiveAtk(
  data: GameDataBundle,
  unitId: UnitId,
  upgradeLv: Readonly<Record<UpgradeGroupId, number>>,
  synergy: FactionSynergySnapshot,
  tileBuffAtkPct: number,
  wealthBps: number,
  harmonyStacks: number,
  demonicBoonStacks: number,
  trialId: TrialId | null,
  extraFinalBps = 0,
  extraTraitPct = 0,
): { readonly baseAtk: number; readonly bonusAtk: number } {
  const def = data.unitsById.get(unitId);
  if (!def) return { baseAtk: 0, bonusAtk: 0 };
  const upDef = data.upgradesByFaction.get(def.faction);
  const lv = upDef ? (upgradeLv[upDef.id] ?? 0) : 0;
  const upPct = upDef && lv > 0 ? lv * upDef.atkBonusPctPerLv : 0;

  const trialCfg = trialId ? data.trialsById.get(trialId) : undefined;
  const trialTrinityPct = synergy.trinityActive && trialCfg ? trialCfg.trinityAtkBonusPct : 0;
  let synPct = (synergy.trinityActive ? 18 : 0) + trialTrinityPct;
  if (def.faction === 'orthodox' && synergy.orthodoxTier === 2) {
    synPct += 20;
  } else if (def.faction === 'unorthodox' && synergy.unorthodoxTier === 2) {
    synPct += 20;
  } else if (def.faction === 'demonic' && synergy.demonicTier === 2) {
    synPct += 25;
  }

  let boonPct = harmonyStacks * 22 + Math.max(0, extraTraitPct);
  if (def.faction === 'demonic') {
    boonPct += demonicBoonStacks * 35;
  }

  const traitPct = upPct + synPct + boonPct + Math.max(0, tileBuffAtkPct);
  const finalBps = wealthBps + Math.max(0, extraFinalBps);
  if (traitPct <= 0 && finalBps <= 0) {
    return { baseAtk: def.atk, bonusAtk: 0 };
  }
  if (finalBps <= 0) {
    const bonusAtk = Math.round((def.atk * traitPct) / 100);
    return { baseAtk: def.atk, bonusAtk };
  }
  const effectiveTotal = Math.round(
    (def.atk * (100 + traitPct) * (10000 + finalBps)) / 1_000_000,
  );
  return { baseAtk: def.atk, bonusAtk: Math.max(0, effectiveTotal - def.atk) };
}

export interface CombatSystemContext {
  readonly data: GameDataBundle;
  readonly difficulty: DifficultyId;
  readonly trialId: TrialId | null;
  readonly clearTargetWave: number;
  readonly board: Board;
  readonly rng: Rng;
  readonly events: EventBus<SimEventMap>;
  readonly units: UnitEntity[];
  readonly unitsByUid: ReadonlyMap<number, UnitEntity>;
  readonly monsters: MonsterEntity[];
  readonly projectiles: ProjectileEntity[];
  readonly tileHazards: TileHazard[];
  readonly relicLv: Readonly<Record<RelicId, number>>;
  readonly currentTick: number;
  readonly waveNumber: number;
  readonly endlessMode: boolean;
  readonly victoryAchieved: boolean;
  getBoonStacks(id: BoonId): number;
  isFieldSlotSealed(fieldIndex: number): boolean;
  getUnitEffectiveAtk(
    unitId: UnitId,
    synergy: FactionSynergySnapshot,
    tileBuffAtkPct: number,
    starLevel?: number,
  ): { readonly baseAtk: number; readonly bonusAtk: number };
  allocateProjectileId(): number;
  recordDamage(unitId: UnitId, amount: number): void;
  addCoin(delta: number, isPilfer?: boolean): void;
  addLuckStone(delta: number): void;
  grantBossWisp(gradeId: GradeId): void;
  onMonsterSlain(isWaveBoss: boolean, isBounty: boolean, spawnTick?: number): void;
  triggerVictory(): void;
  offerBossBoons(wave: number): void;
  markPriorityDirty(): void;
}

export function stepCombat(ctx: CombatSystemContext): void {
  const synergy = computeFieldSynergy(ctx.units, ctx.data.unitsById);
  const benchPassive = computeBenchPassiveSummary(ctx.units, ctx.data.unitsById);
  const swiftStacks = ctx.getBoonStacks('b_swift_formation');
  const setBonus = computeRelicSetBonuses(ctx.relicLv);
  const trigramAuraPct = getTrigramMirrorAuraPct(ctx.relicLv.eight_trigram_mirror ?? 0);
  const tileBuffs = computeFieldTileBuffs(
    ctx.board,
    ctx.unitsByUid,
    ctx.data.unitsById,
    swiftStacks,
    trigramAuraPct,
  );
  const trialCfg = ctx.trialId ? ctx.data.trialsById.get(ctx.trialId) : undefined;
  const harmonyStacks = ctx.getBoonStacks('b_trinity_harmony');
  const pillageStacks = ctx.getBoonStacks('b_unorthodox_pillage');
  const acupointStacks = ctx.getBoonStacks('b_hidden_acupoint');
  const orthodoxBoonStacks = ctx.getBoonStacks('b_orthodox_zenith');
  const demonicBoonStacks = ctx.getBoonStacks('b_demonic_overdrive');
  const crusherStacks = ctx.getBoonStacks('b_armor_crusher');
  const resonanceStacks = ctx.getBoonStacks('b_relic_resonance');
  const piercingEchoStacks = ctx.getBoonStacks('b_piercing_echo');
  const chainThunderStacks = ctx.getBoonStacks('b_chain_thunder');

  let ownedRelicCount = 0;
  if (resonanceStacks > 0) {
    for (let k = 0; k < ctx.data.relics.length; k++) {
      if ((ctx.relicLv[ctx.data.relics[k]!.id] ?? 0) > 0) {
        ownedRelicCount++;
      }
    }
  }
  const resonanceSpeedPct = resonanceStacks > 0 ? ownedRelicCount * 1.5 : 0;

  const rangeMirrorBonus =
    getRangeMirrorRangeBonus(ctx.relicLv.dragon_range_mirror ?? 0) + setBonus.rangeBonus;
  const rangeMirrorCcPct =
    getRangeMirrorCcPct(ctx.relicLv.dragon_range_mirror ?? 0) + setBonus.ccPct;

  if (ctx.monsters.length > 0) {
    for (let i = 0; i < ctx.units.length; i++) {
      const u = ctx.units[i]!;
      if (u.slot.area !== 'field') {
        continue;
      }
      if (ctx.isFieldSlotSealed(u.slot.index)) {
        continue;
      }
      if (u.cooldownTicks > 0) {
        u.cooldownTicks--;
      }
      if (u.cooldownTicks > 0) {
        continue;
      }

      const def = ctx.data.unitsById.get(u.unitId);
      if (!def) continue;

      const effectiveRange = def.range + harmonyStacks * 25 + rangeMirrorBonus;
      const rangeSq = effectiveRange * effectiveRange;
      let bestTarget: MonsterEntity | null = null;

      // Deterministic target order (AGENTS.md §3): path progress desc -> entityId asc
      for (let j = 0; j < ctx.monsters.length; j++) {
        const m = ctx.monsters[j]!;
        const dx = m.currX - u.currX;
        const dy = m.currY - u.currY;
        if (dx * dx + dy * dy > rangeSq) {
          continue;
        }
        if (
          bestTarget === null ||
          m.currDistance > bestTarget.currDistance ||
          (m.currDistance === bestTarget.currDistance && m.entityId < bestTarget.entityId)
        ) {
          bestTarget = m;
        }
      }

      if (bestTarget !== null) {
        const tileBuff = tileBuffs[u.slot.index] ?? { atkPct: 0, speedPct: 0 };
        const swiftBootsPct =
          getSwiftBootsSpeedPct(ctx.relicLv.wind_swift_boots ?? 0) +
          setBonus.speedPct +
          resonanceSpeedPct;
        let speedMult = (synergy.trinityActive ? 1.1 : 1.0) * (1 + swiftBootsPct / 100);
        if (trialCfg && trialCfg.globalSpeedMult !== 1) {
          speedMult *= trialCfg.globalSpeedMult;
        }
        if (swiftStacks > 0) {
          speedMult *= 1 + 0.16 * swiftStacks;
        }
        if (def.faction === 'unorthodox') {
          if (synergy.unorthodoxTier === 2) speedMult *= 1.32;
          else if (synergy.unorthodoxTier === 1) speedMult *= 1.18;
          if (pillageStacks > 0) {
            speedMult *= 1 + 0.22 * pillageStacks;
          }
          if (trialCfg && trialCfg.unorthodoxSpeedMult !== 1) {
            speedMult *= trialCfg.unorthodoxSpeedMult;
          }
        }
        if (tileBuff.speedPct > 0) {
          speedMult *= 1 + tileBuff.speedPct / 100;
        }
        const starSpeedPct = getStarSpeedPct(u.starLevel ?? 0);
        if (starSpeedPct > 0) {
          speedMult *= 1 + starSpeedPct / 100;
        }
        u.cooldownTicks = Math.max(1, Math.round(def.attackIntervalTicks / speedMult));
        u.attackCount++;
        u.lastAttackTick = ctx.currentTick;

        const dx = bestTarget.currX - u.currX;
        const dy = bestTarget.currY - u.currY;
        const dist = Math.hypot(dx, dy);
        u.attackDirX = dist > 0.001 ? dx / dist : 0;
        u.attackDirY = dist > 0.001 ? dy / dist : 1;

        const travelTicks = Math.max(2, Math.min(10, Math.round(dist / 32)));
        const gradeDef = ctx.data.gradesById.get(u.grade) ?? ctx.data.grades[0]!;
        const gradeColor = gradeDef.color;
        const gradeRank = gradeDef.rank;

        const { baseAtk, bonusAtk } = ctx.getUnitEffectiveAtk(
          u.unitId,
          synergy,
          tileBuff.atkPct,
          u.starLevel ?? 0,
        );
        const totalAtk = baseAtk + bonusAtk;
        const effectiveEveryN = Math.max(2, def.skill.everyN - acupointStacks);
        const isSkill = u.attackCount % effectiveEveryN === 0;

        const critBladeLv = ctx.relicLv.crimson_crit_blade ?? 0;
        let critChance = Math.min(
          0.95,
          def.critChance +
            getCritBladeChanceBps(critBladeLv) / 10000 +
            benchPassive.critChancePct / 100,
        );
        let critMult =
          def.critMult +
          getCritBladeMultBonus(critBladeLv) +
          setBonus.critMultBonus +
          benchPassive.critMultBonus;
        const skillJadePct =
          getSkillJadeDamagePct(ctx.relicLv.celestial_skill_jade ?? 0) +
          setBonus.skillDamagePct +
          benchPassive.skillDamagePct;
        let skillRatio = def.skill.atkRatio * (1 + skillJadePct / 100);
        let ccMult =
          (1 + 0.35 * acupointStacks) *
          (1 + rangeMirrorCcPct / 100) *
          (trialCfg ? trialCfg.ccMult : 1);

        if (def.faction === 'orthodox') {
          if (synergy.orthodoxTier === 2) {
            critChance = Math.min(0.95, critChance + 0.18);
            ccMult *= 1.4;
          } else if (synergy.orthodoxTier === 1) {
            critChance = Math.min(0.95, critChance + 0.1);
            ccMult *= 1.25;
          }
          if (orthodoxBoonStacks > 0) {
            critChance = Math.min(0.95, critChance + 0.15 * orthodoxBoonStacks);
            critMult += 0.55 * orthodoxBoonStacks;
          }
          if (trialCfg && trialCfg.orthodoxCritMultBonus > 0) {
            critMult += trialCfg.orthodoxCritMultBonus;
          }
        } else if (def.faction === 'demonic') {
          if (synergy.demonicTier === 2) {
            critMult += 0.8;
            skillRatio *= 1.45;
          } else if (synergy.demonicTier === 1) {
            critMult += 0.4;
            skillRatio *= 1.25;
          }
          if (demonicBoonStacks > 0) {
            skillRatio *= 1 + 0.3 * demonicBoonStacks;
          }
          if (trialCfg && trialCfg.demonicSkillRatioMult !== 1) {
            skillRatio *= trialCfg.demonicSkillRatioMult;
          }
        }

        const isCrit = ctx.rng.nextInt(1000) < Math.round(critChance * 1000);

        let damage = totalAtk;
        if (isSkill) {
          damage = Math.round(damage * skillRatio);
        }
        if (isCrit) {
          damage = Math.round(damage * critMult);
        }

        const trialShred =
          def.faction === 'unorthodox' && trialCfg ? trialCfg.unorthodoxBonusShred : 0;
        const relicShred =
          getArmorGauntletShred(ctx.relicLv.armor_break_gauntlet ?? 0) + setBonus.armorShred;
        const unitBaseShred =
          def.armorShred + crusherStacks * 6 + trialShred + relicShred + benchPassive.armorShred;
        const echoBonusShred =
          isSkill && piercingEchoStacks > 0 ? (piercingEchoStacks >= 2 ? 34 : 18) : 0;
        const projectileShred =
          unitBaseShred > 0 || echoBonusShred > 0
            ? (isSkill ? Math.round(unitBaseShred * 1.5) : unitBaseShred) + echoBonusShred
            : 0;

        ctx.projectiles.push({
          id: ctx.allocateProjectileId(),
          unitId: u.unitId,
          startTick: ctx.currentTick,
          arriveTick: ctx.currentTick + travelTicks,
          fromX: u.currX,
          fromY: u.currY - 8,
          targetEntityId: bestTarget.entityId,
          targetX: bestTarget.currX,
          targetY: bestTarget.currY,
          prevX: u.currX,
          prevY: u.currY - 8,
          currX: u.currX,
          currY: u.currY - 8,
          damage: Math.max(1, damage),
          armorShred: projectileShred,
          color: gradeColor,
          gradeRank,
          isCrit,
          isSkill,
          skillName: def.skill.name,
          vfxTrack: def.skill.vfxTrack,
          splashRadius: isSkill ? def.skill.splashRadius : 0,
          stunTicks:
            isSkill && def.skill.stunTicks > 0
              ? Math.max(1, Math.round(def.skill.stunTicks * ccMult))
              : 0,
          slowPct: isSkill ? def.skill.slowPct : 0,
          slowTicks:
            isSkill && def.skill.slowTicks > 0
              ? Math.max(1, Math.round(def.skill.slowTicks * ccMult))
              : 0,
        });
      }
    }
  } else {
    for (let i = 0; i < ctx.units.length; i++) {
      const u = ctx.units[i]!;
      if (u.slot.area === 'field' && !ctx.isFieldSlotSealed(u.slot.index) && u.cooldownTicks > 0) {
        u.cooldownTicks--;
      }
    }
  }

  // Advance projectiles & apply integer-tick arrival hits
  for (let i = ctx.projectiles.length - 1; i >= 0; i--) {
    const p = ctx.projectiles[i]!;
    const targetIdx = ctx.monsters.findIndex((m) => m.entityId === p.targetEntityId);
    const target = targetIdx !== -1 ? ctx.monsters[targetIdx] : undefined;

    if (target) {
      p.targetX = target.currX;
      p.targetY = target.currY;
    }

    const span = Math.max(1, p.arriveTick - p.startTick);
    const prog = Math.max(0, Math.min(1, (ctx.currentTick - p.startTick + 1) / span));
    p.currX = p.fromX + (p.targetX - p.fromX) * prog;
    p.currY = p.fromY + (p.targetY - p.fromY) * prog;

    if (ctx.currentTick >= p.arriveTick) {
      const impactX = target ? target.currX : p.targetX;
      const impactY = target ? target.currY : p.targetY;

      if (p.isSkill) {
        ctx.events.emit('skill:impact', {
          unitId: p.unitId,
          skillName: p.skillName,
          vfxTrack: p.vfxTrack,
          fromX: p.fromX,
          fromY: p.fromY,
          x: impactX,
          y: impactY,
          radius: Math.max(48, p.splashRadius),
          color: p.color,
          gradeRank: p.gradeRank,
          tick: ctx.currentTick,
        });
      }

      if (p.splashRadius > 0) {
        const rSq = p.splashRadius * p.splashRadius;
        const victims = ctx.monsters
          .filter((m) => {
            const dx = m.currX - impactX;
            const dy = m.currY - impactY;
            return dx * dx + dy * dy <= rSq;
          })
          .sort((a, b) =>
            b.currDistance !== a.currDistance
              ? b.currDistance - a.currDistance
              : a.entityId - b.entityId,
          );

        for (let v = 0; v < victims.length; v++) {
          const m = victims[v]!;
          const dealt =
            m.entityId === p.targetEntityId ? p.damage : Math.max(1, Math.round(p.damage * 0.75));
          applyHitToMonster(ctx, m, dealt, p, synergy, setBonus, benchPassive);
        }
      } else if (target) {
        applyHitToMonster(ctx, target, p.damage, p, synergy, setBonus, benchPassive);
      }

      // Boon: 구천연쇄뢰 (b_chain_thunder) — deterministic chain lightning arcs on skill impact
      if (p.isSkill && chainThunderStacks > 0 && ctx.monsters.length > 0) {
        const maxChainTargets = chainThunderStacks >= 2 ? 5 : 3;
        const chainRatio = chainThunderStacks >= 2 ? 0.48 : 0.28;
        const chainRangeSq = 185 * 185;
        const chainDmg = Math.max(1, Math.round(p.damage * chainRatio));
        const chainCandidates = ctx.monsters
          .filter((m) => {
            if (m.entityId === p.targetEntityId) return false;
            const dx = m.currX - impactX;
            const dy = m.currY - impactY;
            return dx * dx + dy * dy <= chainRangeSq;
          })
          .sort((a, b) =>
            b.currDistance !== a.currDistance
              ? b.currDistance - a.currDistance
              : a.entityId - b.entityId,
          )
          .slice(0, maxChainTargets);
        for (let c = 0; c < chainCandidates.length; c++) {
          applyHitToMonster(ctx, chainCandidates[c]!, chainDmg, p, synergy, setBonus, benchPassive);
        }
      }

      ctx.projectiles.splice(i, 1);
    }
  }
}

function applyHitToMonster(
  ctx: CombatSystemContext,
  m: MonsterEntity,
  rawDamage: number,
  p: ProjectileEntity,
  synergy: FactionSynergySnapshot,
  setBonus: ReturnType<typeof computeRelicSetBonuses>,
  benchPassive: BenchPassiveSummary,
): void {
  const idx = ctx.monsters.indexOf(m);
  if (idx === -1) return;

  const attackerDef = ctx.data.unitsById.get(p.unitId);
  const passive = attackerDef?.passiveTrait;

  const prevShredBeforeHit = ctx.currentTick < m.shredExpireTick ? m.armorShred : 0;
  const prevNetArmor = m.armor - prevShredBeforeHit;

  if (p.armorShred > 0) {
    const echoStacks = ctx.getBoonStacks('b_piercing_echo');
    const shredDur = echoStacks > 0 ? 180 : 120;
    m.armorShred = Math.min(200, prevShredBeforeHit + p.armorShred);
    m.shredExpireTick = Math.max(m.shredExpireTick, ctx.currentTick + shredDur);
  }

  const activeShred = ctx.currentTick < m.shredExpireTick ? m.armorShred : 0;
  const rawNetArmor = m.armor - activeShred;
  let justShattered = m.armor > 0 && prevNetArmor > 0 && rawNetArmor <= 0;
  const armorBroken = rawNetArmor < 0 || (m.armor > 0 && rawNetArmor <= 0);

  let effectiveRaw = rawDamage;
  const hunterStacks = ctx.getBoonStacks('b_bounty_hunter');
  if (m.isBoss && hunterStacks > 0) {
    effectiveRaw = Math.round(effectiveRaw * (1 + 0.28 * hunterStacks));
  }
  const slayerBannerPct =
    getSlayerBannerBossPct(ctx.relicLv.demon_slayer_banner ?? 0) +
    setBonus.bossDamagePct +
    benchPassive.bossDamagePct;
  if (m.isBoss && slayerBannerPct > 0) {
    effectiveRaw = Math.round(effectiveRaw * (1 + slayerBannerPct / 100));
  }

  // Boon: 빙쇄파열공 (b_frost_shatter) — bonus damage vs stunned or slowed foes
  const frostStacks = ctx.getBoonStacks('b_frost_shatter');
  if (
    frostStacks > 0 &&
    (ctx.currentTick < m.stunUntilTick || ctx.currentTick < m.slowUntilTick)
  ) {
    const frostPct = frostStacks >= 2 ? 60 : 32;
    effectiveRaw = Math.round(effectiveRaw * (1 + frostPct / 100));
  }

  // Boon: 사신추명결 (b_reaper_seal) — boss execute bonus (<35% HP)
  const reaperStacks = ctx.getBoonStacks('b_reaper_seal');
  let executeProc = false;
  if (reaperStacks > 0 && m.isBoss && m.hp <= Math.round(m.maxHp * 0.35)) {
    const reaperBossPct = reaperStacks >= 2 ? 55 : 30;
    effectiveRaw = Math.round(effectiveRaw * (1 + reaperBossPct / 100));
    executeProc = true;
  }

  // Apply unit-specific PassiveTraitDef multipliers (Immortal & Transcendent specialization!)
  let bossProc = false;
  let corrodeProc = false;
  if (passive) {
    if (m.isBoss && passive.bossDamagePct && passive.bossDamagePct > 0) {
      effectiveRaw = Math.round(effectiveRaw * (1 + passive.bossDamagePct / 100));
      bossProc = true;
    }
    if (
      passive.executeBelowHpPct &&
      passive.executeDamagePct &&
      m.hp <= Math.round(m.maxHp * passive.executeBelowHpPct)
    ) {
      effectiveRaw = Math.round(effectiveRaw * (1 + passive.executeDamagePct / 100));
      executeProc = true;
    }
    if (activeShred > 0 && passive.shreddedDamagePct && passive.shreddedDamagePct > 0) {
      effectiveRaw = Math.round(effectiveRaw * (1 + passive.shreddedDamagePct / 100));
      corrodeProc = true;
    }
  }

  const piercePct = passive?.armorPiercePct ?? 0;
  const pierceProc = rawNetArmor > 0 && piercePct > 0;
  const netArmor = pierceProc ? Math.max(0, Math.round(rawNetArmor * (1 - piercePct))) : rawNetArmor;
  const passiveProc: PassiveProcKind | undefined = executeProc
    ? 'execute'
    : pierceProc
      ? 'pierce'
      : bossProc
        ? 'boss'
        : corrodeProc
          ? 'corrode'
          : undefined;

  const maxAmp = 0.45 + 0.3 * ctx.getBoonStacks('b_armor_crusher');
  let damage = effectiveRaw;
  if (netArmor > 0) {
    damage = Math.max(1, Math.round(effectiveRaw * (100 / (100 + netArmor))));
  } else if (netArmor < 0) {
    const amp = Math.min(maxAmp, -netArmor * 0.0075);
    damage = Math.max(1, Math.round(effectiveRaw * (1 + amp)));
  }

  // Black Serpent poison-shell barrier absorption (armor-shredding attacks deal 1.8x bonus vs barrier!)
  if (m.shieldHp > 0 && ctx.currentTick < m.shieldExpireTick) {
    const shieldDamage = p.armorShred > 0 ? Math.round(damage * 1.8) : damage;
    if (shieldDamage < m.shieldHp) {
      m.shieldHp -= shieldDamage;
      m.lastHitTick = ctx.currentTick;
      ctx.recordDamage(p.unitId, damage);
      damage = shieldDamage;
    } else {
      const shieldMult = p.armorShred > 0 ? 1.8 : 1;
      const overflow = Math.max(0, Math.round((shieldDamage - m.shieldHp) / shieldMult));
      m.shieldHp = 0;
      m.shieldMaxHp = 0;
      m.shieldExpireTick = 0;
      m.hp -= overflow;
      m.lastHitTick = ctx.currentTick;
      m.stunUntilTick = Math.max(m.stunUntilTick, ctx.currentTick + 45);
      m.armorShred = Math.min(200, activeShred + 25);
      m.shredExpireTick = Math.max(m.shredExpireTick, ctx.currentTick + 150);
      justShattered = true;
      ctx.recordDamage(p.unitId, damage);
      ctx.events.emit('boss:skill', {
        entityId: m.entityId,
        bossKind: m.kind,
        skillKind: 'serpent_shatter',
        skillName: '현무 독갑 격파! (기절)',
        x: m.currX,
        y: m.currY,
        tick: ctx.currentTick,
      });
    }
  } else {
    m.hp -= damage;
    m.lastHitTick = ctx.currentTick;
    ctx.recordDamage(p.unitId, damage);
  }

  // Boon: 사신추명결 (b_reaper_seal) — instant execute for non-boss mobs below 12% / 18% HP
  if (reaperStacks > 0 && !m.isBoss && m.hp > 0) {
    const thresh = reaperStacks >= 2 ? 0.18 : 0.12;
    if (m.hp <= Math.round(m.maxHp * thresh)) {
      ctx.recordDamage(p.unitId, m.hp);
      m.hp = 0;
      executeProc = true;
    }
  }

  if (p.stunTicks > 0) {
    const bossFactor =
      ctx.difficulty === 'abyss' || ctx.trialId === 'trial_abyss_sanctum'
        ? 0.25
        : ctx.difficulty === 'hell'
          ? 0.35
          : 0.45;
    const stunDur = m.isBoss ? Math.max(1, Math.round(p.stunTicks * bossFactor)) : p.stunTicks;
    m.stunUntilTick = Math.max(m.stunUntilTick, ctx.currentTick + stunDur);
  }
  if (p.slowTicks > 0 && p.slowPct > 0 && ctx.currentTick >= m.hasteUntilTick) {
    m.slowUntilTick = Math.max(m.slowUntilTick, ctx.currentTick + p.slowTicks);
    m.slowFactor = Math.min(m.slowFactor, Math.max(0.3, 1 - p.slowPct));
  }

  const daggerLv = ctx.relicLv.bandit_dagger ?? 0;
  if (!p.isSkill && daggerLv > 0) {
    const procPer1000 = getBanditProcPer1000(daggerLv);
    if (ctx.rng.nextInt(1000) < procPer1000) {
      const pilfer = getBanditPilferCoin(daggerLv);
      ctx.addCoin(pilfer, true);
    }
  }

  const slain = m.hp <= 0;
  const hitX = m.currX;
  const hitY = m.currY;

  if (slain) {
    let synPillageBonus = 0;
    if (attackerDef?.faction === 'unorthodox') {
      if (synergy.unorthodoxTier > 0) {
        synPillageBonus = synergy.unorthodoxTier === 2 ? 2 : 1;
      }
      const pillageBoonStacks = ctx.getBoonStacks('b_unorthodox_pillage');
      if (pillageBoonStacks > 0 && ctx.rng.nextInt(100) < Math.min(90, pillageBoonStacks * 35)) {
        ctx.addCoin(2, true);
      }
    }
    const abacusCoinPct =
      getAbacusKillCoinPct(ctx.relicLv.merchant_abacus ?? 0) +
      setBonus.killCoinPct +
      benchPassive.killCoinPct;
    const bountyBannerCoinPct = m.isBounty
      ? getSlayerBannerBountyCoinPct(ctx.relicLv.demon_slayer_banner ?? 0)
      : 0;
    const totalCoinBonusPct = abacusCoinPct + bountyBannerCoinPct;
    const scaledRewardCoin =
      totalCoinBonusPct > 0
        ? Math.max(m.rewardCoin + 1, Math.round((m.rewardCoin * (100 + totalCoinBonusPct)) / 100))
        : m.rewardCoin;
    ctx.addCoin(scaledRewardCoin + synPillageBonus, false);
    ctx.monsters.splice(idx, 1);

    if (m.isBoss) {
      if (m.isBounty) {
        ctx.onMonsterSlain(false, true, m.spawnTick);
        const rewardLuck = m.bountyRewardLuck ?? 2;
        ctx.addLuckStone(rewardLuck);
        if (m.bountyRewardWispGrade) {
          ctx.grantBossWisp(m.bountyRewardWispGrade);
        }
        ctx.markPriorityDirty();
        ctx.events.emit('bounty:slain', {
          bossName: m.bossName ?? '현상수배범',
          rewardCoin: scaledRewardCoin,
          rewardLuck,
          rewardWispGrade: m.bountyRewardWispGrade,
          isElite: Boolean(m.isEliteBounty),
          tick: ctx.currentTick,
        });
      } else {
        ctx.onMonsterSlain(true, false, m.spawnTick);
        ctx.tileHazards.length = 0;
        const endlessBonusLuck = ctx.waveNumber >= 35 && ctx.waveNumber % 5 === 0 ? 2 : 0;
        const rewardLuck =
          2 +
          getScrollChestBossLuckBonus(ctx.relicLv.heavenly_scroll_chest ?? 0) +
          endlessBonusLuck;
        ctx.addLuckStone(rewardLuck);

        const waveDef = resolveWaveDef(ctx.data.waves, ctx.waveNumber);
        const fallbackWispGrade =
          Object.keys(ctx.data.wispPools)[1] ?? Object.keys(ctx.data.wispPools)[0]!;
        const rewardGrade = waveDef.rewardWispGrade ?? fallbackWispGrade;
        ctx.grantBossWisp(rewardGrade);
        ctx.markPriorityDirty();

        ctx.events.emit('boss:slain', {
          wave: ctx.waveNumber,
          bossName: m.bossName ?? '영물 보스',
          rewardWispGrade: rewardGrade,
          rewardLuck,
          tick: ctx.currentTick,
        });

        const noWaveBossRemaining = !ctx.monsters.some((o) => o.isBoss && !o.isBounty);
        if (
          ctx.waveNumber === ctx.clearTargetWave &&
          !ctx.endlessMode &&
          !ctx.victoryAchieved &&
          noWaveBossRemaining
        ) {
          ctx.triggerVictory();
        } else if (noWaveBossRemaining) {
          ctx.offerBossBoons(ctx.waveNumber);
        }
      }
    } else {
      ctx.onMonsterSlain(false, false);
    }
  }

  ctx.events.emit('monster:hit', {
    entityId: m.entityId,
    unitId: p.unitId,
    fromX: p.fromX,
    fromY: p.fromY,
    x: hitX,
    y: hitY,
    damage,
    color: p.color,
    slain,
    isCrit: p.isCrit,
    isSkill: p.isSkill,
    armorBroken,
    justShattered,
    passiveProc: executeProc ? 'execute' : passiveProc,
    tick: ctx.currentTick,
  });
}
