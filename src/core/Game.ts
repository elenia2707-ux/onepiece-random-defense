import { GameLoop } from './GameLoop';
import { Simulation, type UISnapshot } from './Simulation';
import { loadGameData } from '../data/loader';
import type { CourtSkinId, GameDataBundle, HeroSkinDef, UnitId } from '../data/types';
import { DragController } from '../input/DragController';
import { InputManager } from '../input/InputManager';
import { Lifecycle } from '../platform/Lifecycle';
import { MetaStore, type SettlementRecord } from '../platform/MetaStore';
import { SoundSynthesizer } from '../platform/SoundSynthesizer';
import { Viewport } from '../platform/Viewport';
import { BackgroundPainter } from '../render/BackgroundPainter';
import { CanvasStack } from '../render/CanvasStack';
import { Renderer } from '../render/Renderer';
import { SpriteCache } from '../render/SpriteCache';
import { UIManager } from '../ui/UIManager';
import { VfxSystem } from '../vfx/VfxSystem';

export class Game {
  private readonly data: GameDataBundle;
  private readonly meta: MetaStore;
  private readonly sim: Simulation;
  private readonly stack: CanvasStack;
  private readonly sprites: SpriteCache;
  private readonly bgPainter: BackgroundPainter;
  private readonly vfx: VfxSystem;
  private readonly renderer: Renderer;
  private readonly drag: DragController;
  private readonly input: InputManager;
  private readonly ui: UIManager;
  private readonly loop: GameLoop;
  private readonly viewport: Viewport;
  private readonly lifecycle: Lifecycle;
  private readonly sound: SoundSynthesizer;
  private readonly equippedHeroSkinsMap = new Map<UnitId, HeroSkinDef>();

  private settlementRecord: SettlementRecord | null = null;
  private endlessSettled = false;
  private slowFrameStreak = 0;

  public constructor() {
    const data = loadGameData();
    this.data = data;
    const appEl = document.getElementById('app');
    if (!(appEl instanceof HTMLElement)) {
      throw new Error('[Game] Missing #app root');
    }

    this.meta = new MetaStore();
    this.sound = new SoundSynthesizer();
    const runSeed = ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) || 0x20261118;
    this.sim = new Simulation(
      data,
      runSeed,
      this.meta.getRelicLevels(),
      this.meta.getSelectedDifficulty(),
    );
    this.stack = new CanvasStack();
    this.sprites = new SpriteCache();
    this.bgPainter = new BackgroundPainter(() => {
      this.bgPainter.paint(this.stack.bgCtx, this.sim.board, this.sim.path);
    });
    this.vfx = new VfxSystem(this.sprites);
    this.renderer = new Renderer(this.stack, this.sprites, this.vfx);
    this.syncCosmetics(false);

    this.drag = new DragController(
      this.sim,
      (cmd) => this.sim.commands.enqueue(cmd),
      () => this.ui.forceRefreshSelection(),
    );

    this.ui = new UIManager(data, this.sim.recipeGraph, this.sprites, {
      onDispatch: (cmd) => this.sim.commands.enqueue(cmd),
      onCycleSpeed: () => {
        this.sound.playUiTap();
        const next = this.loop.cycleSpeed();
        if (this.loop.isPaused()) {
          this.loop.setPaused(false);
        }
        this.ui.sync(this.sim.buildSnapshot(next, false), performance.now(), true);
      },
      onTogglePause: () => {
        this.sound.playUiTap();
        const paused = this.loop.togglePaused();
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), paused),
          performance.now(),
          true,
        );
      },
      isSoundMuted: () => this.sound.isMuted(),
      onToggleMute: () => this.sound.toggleMute(),
      onSelectDifficulty: (diff) => {
        if (this.meta.setSelectedDifficulty(diff)) {
          window.location.reload();
          return true;
        }
        return false;
      },
      onEnterEndless: () => {
        this.sound.playBossHorn();
        this.sim.commands.enqueue({ type: 'enterEndless' });
      },
      onRestart: () => {
        window.location.reload();
      },
      onSettleAndRestart: () => {
        const snap = this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused());
        this.settleCurrentRun(snap);
        window.location.reload();
      },
      getMetaProfile: () => this.meta.getProfile(),
      getSettlementRecord: () => this.settlementRecord,
      onDrawRelic: (payWith) => {
        const res = this.meta.drawRelic(data.relics, payWith);
        if (res.ok) {
          this.sound.playCraft(res.isNew ? 4 : 3);
          this.sim.commands.enqueue({ type: 'syncRelics', relics: this.meta.getRelicLevels() });
        }
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
        return res;
      },
      onUpgradeRelic: (relicId) => {
        const def = data.relicsById.get(relicId);
        if (!def) {
          return { ok: false, reason: '존재하지 않는 신물입니다.' };
        }
        const res = this.meta.upgradeRelic(def);
        if (res.ok) {
          this.sound.playCoinReward();
          this.sim.commands.enqueue({ type: 'syncRelics', relics: this.meta.getRelicLevels() });
        }
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
        return res;
      },
      onDrawSkin: (count, payWith) => {
        const res = this.meta.drawSkinGacha(data.heroSkins, data.courtSkins, count, payWith);
        if (res.ok) {
          const bestRank = res.items.some((x) => x.rarity === 'mythic')
            ? 6
            : res.items.some((x) => x.rarity === 'legendary')
              ? 5
              : 4;
          this.sound.playCraft(bestRank);
          this.syncCosmetics(false);
        }
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
        return res;
      },
      onCraftSkin: (skinId) => {
        const skin =
          data.heroSkinsById.get(skinId) ??
          data.courtSkins.find((c) => c.id === (skinId as CourtSkinId));
        if (!skin) {
          return { ok: false, reason: '존재하지 않는 의복·테마입니다.' };
        }
        const res = this.meta.craftSkinWithSilk(skin);
        if (res.ok) {
          this.sound.playCraft(5);
          this.syncCosmetics(true);
        }
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
        return res;
      },
      onEquipHeroSkin: (unitId, skinId) => {
        const ok = this.meta.equipHeroSkin(unitId, skinId, data.heroSkinsById);
        if (ok) {
          this.sound.playUiTap();
          this.syncCosmetics(false);
          this.ui.sync(
            this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
            performance.now(),
            true,
          );
        }
        return ok;
      },
      onEquipCourtSkin: (courtId) => {
        const ok = this.meta.equipCourtSkin(courtId);
        if (ok) {
          this.sound.playUiTap();
          this.syncCosmetics(true);
          this.ui.sync(
            this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
            performance.now(),
            true,
          );
        }
        return ok;
      },
      onGrantDevMeta: () => {
        this.sound.playCoinReward();
        this.meta.grantDevMeta(250, 2);
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
      },
      getSelectedSlot: () => this.drag.getSelectedSlot(),
      clearSelection: () => this.drag.clearSelection(),
    });

    this.viewport = new Viewport(appEl, (scale) => {
      this.stack.resize(scale);
      this.bgPainter.paint(this.stack.bgCtx, this.sim.board, this.sim.path);
    });

    this.input = new InputManager(this.stack.worldCanvas, this.viewport, this.drag);

    this.loop = new GameLoop(this.sim, {
      onRender: (alpha) => {
        this.renderer.render(this.sim, alpha, this.drag.getOverlayState());
      },
      onSyncUI: (nowMs, forcePriority) => {
        if (!forcePriority && nowMs % 1 < 0) return;
        const snap = this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused());
        if ((snap.victoryHold || snap.gameOver) && !this.settlementRecord) {
          this.settleCurrentRun(snap);
          if (snap.gameOver && !snap.victoryAchieved) {
            this.sound.playDefeat();
          }
        } else if (snap.gameOver && this.settlementRecord && !this.endlessSettled) {
          this.endlessSettled = true;
          const prevUnlockLen = this.settlementRecord.unlockedSkinIds.length;
          this.settlementRecord = this.meta.settleEndlessOvertime(this.settlementRecord, {
            wave: snap.wave,
            monstersSlain: snap.monstersSlain,
            bossesSlain: snap.bossesSlain,
            bountiesSlain: snap.bounty.bountiesSlain,
            difficulty: snap.difficulty,
            victory: snap.victoryAchieved,
          });
          if (this.settlementRecord.unlockedSkinIds.length > prevUnlockLen) {
            this.syncCosmetics(true);
          }
          this.sound.playDefeat();
        }
        this.ui.sync(snap, nowMs, forcePriority);
      },
      onFrameCostMs: (frameMs) => {
        // Automatic quality downgrade if frame budget (> 20ms) is repeatedly exceeded (AGENTS.md §10)
        if (frameMs > 20) {
          this.slowFrameStreak++;
          if (this.slowFrameStreak >= 24) {
            this.slowFrameStreak = 0;
            if (this.stack.downgradeQuality()) {
              this.bgPainter.paint(this.stack.bgCtx, this.sim.board, this.sim.path);
            }
          }
        } else if (this.slowFrameStreak > 0) {
          this.slowFrameStreak--;
        }
      },
    });

    this.lifecycle = new Lifecycle(this.loop, () => {
      const snap = this.sim.buildSnapshot(this.loop.getSpeed(), true);
      this.ui.sync(snap, performance.now(), true);
    });

    this.bindSimulationEvents();
  }

  private syncCosmetics(repaintBg: boolean): void {
    this.equippedHeroSkinsMap.clear();
    const rawEquipped = this.meta.getEquippedHeroSkins();
    for (const [unitId, skinId] of Object.entries(rawEquipped)) {
      const skinDef = this.data.heroSkinsById.get(skinId);
      if (skinDef) {
        this.equippedHeroSkinsMap.set(unitId, skinDef);
      }
    }
    const courtDef = this.data.courtSkinsById.get(this.meta.getEquippedCourtSkin()) ?? null;
    this.bgPainter.setCourtSkin(courtDef);
    this.renderer.setCosmetics(this.equippedHeroSkinsMap, courtDef);
    if (repaintBg) {
      this.bgPainter.paint(this.stack.bgCtx, this.sim.board, this.sim.path);
    }
  }

  private settleCurrentRun(snap: UISnapshot): SettlementRecord {
    if (!this.settlementRecord) {
      this.settlementRecord = this.meta.settleRun({
        wave: snap.wave,
        monstersSlain: snap.monstersSlain,
        bossesSlain: snap.bossesSlain,
        bountiesSlain: snap.bounty.bountiesSlain,
        difficulty: snap.difficulty,
        victory: snap.victoryAchieved,
      });
      if (this.settlementRecord.unlockedSkinIds.length > 0) {
        this.syncCosmetics(true);
      }
    }
    return this.settlementRecord;
  }

  private bindSimulationEvents(): void {
    this.sim.events.on('unit:added', (ev) => {
      const unitDef = this.sim.data.unitsById.get(ev.unitId);
      const gradeDef = this.sim.data.gradesById.get(ev.grade);
      const skin = this.equippedHeroSkinsMap.get(ev.unitId);
      const color = skin?.primaryColor ?? gradeDef?.color ?? '#94a3b8';
      const rank = gradeDef?.rank ?? 1;
      this.vfx.spawnArrivalFx(ev.pos.x, ev.pos.y, color, rank, ev.tick);

      if (ev.source === 'summon' || ev.source === 'wisp') {
        this.sound.playSummon();
      }

      if (unitDef && gradeDef) {
        const disc = this.meta.discoverUnit(unitDef, gradeDef);
        if (disc.isNew) {
          this.sound.playCoinReward();
          const keyPart = disc.bonusKeys > 0 ? ` · 열쇠 +${disc.bonusKeys}` : '';
          this.ui.showToast(
            `📖 명숙록 최초 등재! [${disc.gradeName}] ${disc.unitName} (+${disc.bonusGold} 주화${keyPart})`,
          );
        }
      }

      if (ev.source === 'wisp') {
        const unitName = unitDef?.name ?? ev.unitId;
        this.ui.showToast(`✦ 기연 초빙: ${unitName} 합류!`);
      }
    });

    this.sim.events.on('craft:done', (ev) => {
      const gradeDef = this.sim.data.gradesById.get(ev.grade);
      const skin = this.equippedHeroSkinsMap.get(ev.outputUnitId);
      const color = skin?.primaryColor ?? gradeDef?.color ?? '#fbbf24';
      const rank = gradeDef?.rank ?? 2;
      const unitName = this.sim.data.unitsById.get(ev.outputUnitId)?.name ?? ev.outputUnitId;

      this.sound.playCraft(rank);
      this.vfx.spawnCraftPillarFx(ev.pos.x, ev.pos.y, color, rank, ev.tick);
      this.ui.showToast(`⚔️ [${gradeDef?.name ?? ''}] ${unitName} 합공 등선!`);

      if (rank >= 4) {
        this.vfx.showCraftCelebrationBanner(
          gradeDef?.name ?? '절정',
          unitName,
          color,
          performance.now(),
        );
      }
    });

    this.sim.events.on('unit:moved', (ev) => {
      const dest = this.sim.board.getSlotCenter(ev.to);
      this.vfx.spawnMovePulse(dest.x, dest.y, ev.tick);
    });

    this.sim.events.on('board:arranged', (ev) => {
      this.sound.playUiTap();
      if (ev.deployedCount > 0) {
        this.ui.showToast(`⚡ 자동출전 완료! 비무대 ${ev.deployedCount}인 투입 · 대기석 정렬`);
      } else {
        this.ui.showToast('⚡ 문파 대기석 서열 정렬 완료!');
      }
    });

    this.sim.events.on('skill:impact', (ev) => {
      const skin = this.equippedHeroSkinsMap.get(ev.unitId);
      this.vfx.spawnSkillTrack(
        ev.vfxTrack,
        ev.fromX,
        ev.fromY,
        ev.x,
        ev.y,
        ev.radius,
        skin?.primaryColor ?? ev.color,
        ev.gradeRank,
        ev.tick,
        skin?.primaryColor,
        skin?.secondaryColor,
      );
      const uDef = this.sim.data.unitsById.get(ev.unitId);
      this.vfx.spawnSkillCallout(
        ev.fromX,
        ev.fromY - 56,
        ev.skillName,
        uDef?.faction ?? 'orthodox',
        ev.gradeRank,
        ev.tick,
      );
    });

    this.sim.events.on('monster:hit', (ev) => {
      const uDef = this.sim.data.unitsById.get(ev.unitId);
      const skin = this.equippedHeroSkinsMap.get(ev.unitId);
      this.sound.playHit(uDef?.faction ?? 'orthodox', ev.isCrit, ev.isSkill);
      this.vfx.spawnHitFx(
        ev.entityId,
        ev.x,
        ev.y,
        ev.damage,
        skin?.primaryColor ?? ev.color,
        ev.slain,
        ev.isCrit,
        ev.tick,
        ev.isSkill,
      );
    });

    this.sim.events.on('wave:interest', (ev) => {
      this.sound.playCoinReward();
      this.ui.showToast(
        `🏦 전장 금고 복리 +${ev.pct}% 발동! 이자 +${ev.interestCoin.toLocaleString('ko-KR')} 은자`,
      );
    });

    this.sim.events.on('wave:boss', (ev) => {
      this.sound.playBossHorn();
      this.vfx.showBossWaveBanner(ev.wave, ev.bossName, performance.now());
      this.vfx.triggerScreenFlash('#dc2626', 0.14, 0.24, ev.tick);
    });

    this.sim.events.on('boss:slain', (ev) => {
      this.sound.playCoinReward();
      const wispGradeName =
        this.sim.data.gradesById.get(ev.rewardWispGrade)?.name ?? ev.rewardWispGrade;
      this.ui.showToast(
        `🏆 ${ev.bossName} 토벌! 보상: 영단 +${ev.rewardLuck} · ${wispGradeName} 기연 +1`,
      );
    });

    this.sim.events.on('boss:timeout', (ev) => {
      this.vfx.triggerScreenFlash('#991b1b', 0.22, 0.3, ev.tick);
      this.ui.showToast(`⏳ 제한시간 초과! ${ev.bossName} 토벌에 실패했습니다!`, true);
    });

    this.sim.events.on('bounty:called', (ev) => {
      this.sound.playBossHorn();
      this.vfx.triggerScreenFlash('#f59e0b', 0.12, 0.2, ev.tick);
      this.ui.showToast(
        `📜 ${ev.bossName} 출현! 30초 내 토벌 시 은자+${ev.rewardCoin} · 영단+${ev.rewardLuck}`,
      );
    });

    this.sim.events.on('bounty:slain', (ev) => {
      this.sound.playCoinReward();
      this.ui.showToast(
        `🎯 수배범 포획 성공! 은자 +${ev.rewardCoin} · 영단 +${ev.rewardLuck} 획득!`,
      );
    });

    this.sim.events.on('bounty:escaped', (ev) => {
      this.ui.showToast(
        `💨 ${ev.bossName} 도주! 군자금 ${ev.stolenCoin} 은자를 약탈당했습니다!`,
        true,
      );
    });

    this.sim.events.on('mission:completed', (ev) => {
      this.sound.playCoinReward();
      const rewards: string[] = [];
      if (ev.rewardCoin > 0) rewards.push(`은자 +${ev.rewardCoin}`);
      if (ev.rewardLuck > 0) rewards.push(`영단 +${ev.rewardLuck}`);
      if (ev.rewardWispGrade) {
        const gName =
          this.sim.data.gradesById.get(ev.rewardWispGrade)?.name ?? ev.rewardWispGrade;
        rewards.push(`${gName} 기연 +1`);
      }
      this.ui.showToast(`📋 의뢰 달성: ${ev.name} (${rewards.join(' · ')})`);
    });

    this.sim.events.on('run:victory', (ev) => {
      this.sound.playVictory();
      this.vfx.showCraftCelebrationBanner(
        '천하통일',
        `제 ${ev.wave} 장 대승리!`,
        '#fde047',
        performance.now(),
      );
      const snap = this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused());
      this.settleCurrentRun(snap);
    });

    this.sim.events.on('gamble:result', (ev) => {
      this.sound.playGamble(ev.success, ev.refundedLuck);
      const gradeDef = this.sim.data.gradesById.get(ev.tier);
      const gName = gradeDef?.name ?? ev.tier;
      if (ev.success && ev.unitId) {
        const uName = this.sim.data.unitsById.get(ev.unitId)?.name ?? ev.unitId;
        const rank = gradeDef?.rank ?? 2;
        const color = gradeDef?.color ?? '#16a34a';
        if (ev.pos) {
          this.vfx.spawnCraftPillarFx(ev.pos.x, ev.pos.y, color, rank, ev.tick);
        }
        if (rank >= 4) {
          this.vfx.showCraftCelebrationBanner(gName, uName, color, performance.now());
        }
        this.ui.showToast(`✨ [${gName}] 환골탈태 대성공! ${uName} 합류!`);
      } else if (ev.refundedLuck) {
        this.ui.showToast(`🔥 [${gName}] 주화입마! 만년단로가 영단 1개를 환급했습니다!`);
      } else {
        this.ui.showToast(`🩸 [${gName}] 주화입마... 내상이 깊어집니다`, true);
      }
    });

    this.sim.events.on('upgrade:done', (ev) => {
      this.sound.playCoinReward();
      const upDef = this.sim.data.upgrades.find((u) => u.id === ev.group);
      const factionAccent =
        ev.group === 'orthodox'
          ? '#38bdf8'
          : ev.group === 'unorthodox'
            ? '#22c55e'
            : '#e11d48';
      const owned = this.sim.getUnits();
      for (let i = 0; i < owned.length; i++) {
        const u = owned[i]!;
        const uDef = this.sim.data.unitsById.get(u.unitId);
        if (uDef && uDef.faction === ev.group) {
          const footOff = u.slot.area === 'field' ? 40 : 34;
          this.vfx.spawnUpgradeResonanceFx(
            u.currX,
            u.currY + footOff,
            factionAccent,
            ev.level,
            ev.tick,
          );
        }
      }
      this.ui.showToast(`🔥 ${upDef?.name ?? ev.group} Lv.${ev.level} 수련 완료!`);
    });
  }

  public start(): void {
    this.sprites.ensureGlyphAtlas();
    this.ui.mount();
    this.viewport.mount();
    this.input.mount();
    this.lifecycle.mount();
    this.sound.mount();

    const initialSnap = this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused());
    this.ui.sync(initialSnap, performance.now(), true);
    this.loop.start();
  }
}
