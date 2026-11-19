import type { EventBus } from '../core/EventBus';
import {
  getBanditPilferCoin,
  getBanditProcPer1000,
  getScrollChestBossLuckBonus,
} from '../core/relicFormulas';
import type { Rng } from '../core/Rng';
import type { SimEventMap } from '../core/Simulation';
import type {
  BoonId,
  DifficultyId,
  FactionId,
  GameDataBundle,
  GradeId,
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
): readonly TileAuraBuff[] {
  const cap = board.field.capacity;
  const cols = board.config.field.cols;
  const rows = board.config.field.rows;
  const out: TileAuraBuff[] = new Array<TileAuraBuff>(cap);
  const auraMult = 1 + 0.5 * swiftStacks;
  const atkCap = 65 + 25 * swiftStacks;
  const speedCap = 45 + 20 * swiftStacks;

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

  let boonPct = harmonyStacks * 22;
  if (def.faction === 'demonic') {
    boonPct += demonicBoonStacks * 35;
  }

  const traitPct = upPct + synPct + boonPct + Math.max(0, tileBuffAtkPct);
  if (traitPct <= 0 && wealthBps <= 0) {
    return { baseAtk: def.atk, bonusAtk: 0 };
  }
  if (wealthBps <= 0) {
    const bonusAtk = Math.round((def.atk * traitPct) / 100);
    return { baseAtk: def.atk, bonusAtk };
  }
  const effectiveTotal = Math.round(
    (def.atk * (100 + traitPct) * (10000 + wealthBps)) / 1_000_000,
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
  ): { readonly baseAtk: number; readonly bonusAtk: number };
  allocateProjectileId(): number;
  recordDamage(unitId: UnitId, amount: number): void;
  addCoin(delta: number, isPilfer?: boolean): void;
  addLuckStone(delta: number): void;
  grantBossWisp(gradeId: GradeId): void;
  onMonsterSlain(isWaveBoss: boolean, isBounty: boolean): void;
  triggerVictory(): void;
  offerBossBoons(wave: number): void;
  markPriorityDirty(): void;
}

export function stepCombat(ctx: CombatSystemContext): void {
  const synergy = computeFieldSynergy(ctx.units, ctx.data.unitsById);
  const swiftStacks = ctx.getBoonStacks('b_swift_formation');
  const tileBuffs = computeFieldTileBuffs(
    ctx.board,
    ctx.unitsByUid,
    ctx.data.unitsById,
    swiftStacks,
  );
  const trialCfg = ctx.trialId ? ctx.data.trialsById.get(ctx.trialId) : undefined;
  const harmonyStacks = ctx.getBoonStacks('b_trinity_harmony');
  const pillageStacks = ctx.getBoonStacks('b_unorthodox_pillage');
  const acupointStacks = ctx.getBoonStacks('b_hidden_acupoint');
  const orthodoxBoonStacks = ctx.getBoonStacks('b_orthodox_zenith');
  const demonicBoonStacks = ctx.getBoonStacks('b_demonic_overdrive');
  const crusherStacks = ctx.getBoonStacks('b_armor_crusher');

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

      const effectiveRange = def.range + harmonyStacks * 25;
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
        let speedMult = synergy.trinityActive ? 1.1 : 1.0;
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
        );
        const totalAtk = baseAtk + bonusAtk;
        const effectiveEveryN = Math.max(2, def.skill.everyN - acupointStacks);
        const isSkill = u.attackCount % effectiveEveryN === 0;

        let critChance = def.critChance;
        let critMult = def.critMult;
        let skillRatio = def.skill.atkRatio;
        let ccMult = 1 + 0.35 * acupointStacks;

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
        const unitBaseShred = def.armorShred + crusherStacks * 6 + trialShred;
        const projectileShred =
          unitBaseShred > 0
            ? isSkill
              ? Math.round(unitBaseShred * 1.5)
              : unitBaseShred
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
          applyHitToMonster(ctx, m, dealt, p, synergy);
        }
      } else if (target) {
        applyHitToMonster(ctx, target, p.damage, p, synergy);
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
): void {
  const idx = ctx.monsters.indexOf(m);
  if (idx === -1) return;

  const attackerDef = ctx.data.unitsById.get(p.unitId);
  const passive = attackerDef?.passiveTrait;

  const prevShredBeforeHit = ctx.currentTick < m.shredExpireTick ? m.armorShred : 0;
  const prevNetArmor = m.armor - prevShredBeforeHit;

  if (p.armorShred > 0) {
    m.armorShred = Math.min(180, prevShredBeforeHit + p.armorShred);
    m.shredExpireTick = Math.max(m.shredExpireTick, ctx.currentTick + 120);
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

  // Apply unit-specific PassiveTraitDef multipliers (Immortal & Transcendent specialization!)
  if (passive) {
    if (m.isBoss && passive.bossDamagePct && passive.bossDamagePct > 0) {
      effectiveRaw = Math.round(effectiveRaw * (1 + passive.bossDamagePct / 100));
    }
    if (
      passive.executeBelowHpPct &&
      passive.executeDamagePct &&
      m.hp <= Math.round(m.maxHp * passive.executeBelowHpPct)
    ) {
      effectiveRaw = Math.round(effectiveRaw * (1 + passive.executeDamagePct / 100));
    }
    if (activeShred > 0 && passive.shreddedDamagePct && passive.shreddedDamagePct > 0) {
      effectiveRaw = Math.round(effectiveRaw * (1 + passive.shreddedDamagePct / 100));
    }
  }

  const piercePct = passive?.armorPiercePct ?? 0;
  const netArmor =
    rawNetArmor > 0 && piercePct > 0
      ? Math.max(0, Math.round(rawNetArmor * (1 - piercePct)))
      : rawNetArmor;

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
      m.armorShred = Math.min(180, activeShred + 25);
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

  if (p.stunTicks > 0) {
    const bossFactor = ctx.difficulty === 'hell' ? 0.35 : 0.45;
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
    ctx.addCoin(m.rewardCoin + synPillageBonus, false);
    ctx.monsters.splice(idx, 1);

    if (m.isBoss) {
      if (m.isBounty) {
        ctx.onMonsterSlain(false, true);
        const rewardLuck = m.bountyRewardLuck ?? 2;
        ctx.addLuckStone(rewardLuck);
        ctx.markPriorityDirty();
        ctx.events.emit('bounty:slain', {
          bossName: m.bossName ?? '현상수배범',
          rewardCoin: m.rewardCoin,
          rewardLuck,
          tick: ctx.currentTick,
        });
      } else {
        ctx.onMonsterSlain(true, false);
        ctx.tileHazards.length = 0;
        const rewardLuck =
          2 + getScrollChestBossLuckBonus(ctx.relicLv.heavenly_scroll_chest ?? 0);
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
    tick: ctx.currentTick,
  });
}
