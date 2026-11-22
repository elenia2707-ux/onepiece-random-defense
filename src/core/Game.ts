import type { GameCommand } from './CommandQueue';
import { GameLoop } from './GameLoop';
import { TITLES_BY_ID, TRIAL_CONFIGS } from './relicFormulas';
import { Simulation, type UISnapshot } from './Simulation';
import { loadGameData } from '../data/loader';
import type { CourtSkinId, GameDataBundle, HeroSkinDef, TitleId, UnitId } from '../data/types';
import { DragController } from '../input/DragController';
import { InputManager } from '../input/InputManager';
import { HapticsController } from '../platform/Haptics';
import { Lifecycle } from '../platform/Lifecycle';
import { MetaStore, type SettlementRecord } from '../platform/MetaStore';
import { SoundSynthesizer } from '../platform/SoundSynthesizer';
import { Viewport } from '../platform/Viewport';
import { BackgroundPainter } from '../render/BackgroundPainter';
import { CanvasStack } from '../render/CanvasStack';
import { Renderer } from '../render/Renderer';
import { SpriteCache } from '../render/SpriteCache';
import { getUnitCombatProfile } from '../render/weaponProfiles';
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
  private readonly haptics: HapticsController;
  private readonly equippedHeroSkinsMap = new Map<UnitId, HeroSkinDef>();
  private readonly seenCutInUnits = new Set<UnitId>();

  private settlementRecord: SettlementRecord | null = null;
  private endlessSettled = false;
  private slowFrameStreak = 0;

  private lastSavedWave = 1;
  private lastAutoSaveTick = 0;
  private runSaveDirty = false;
  private suppressAutoSave = false;
  private autoRestoredWave: number | null = null;
  private discardedSaveReason: string | null = null;
  private tutorialPaused = false;

  public constructor() {
    const data = loadGameData();
    this.data = data;
    const appEl = document.getElementById('app');
    if (!(appEl instanceof HTMLElement)) {
      throw new Error('[Game] Missing #app root');
    }

    this.meta = new MetaStore();
    this.sound = new SoundSynthesizer();
    this.haptics = new HapticsController();
    const runSeed = ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) || 0x20261118;
    const selRunMode = this.meta.getSelectedRunMode();
    const selChronicle = selRunMode === 'chronicle' ? this.meta.getSelectedChronicleId() : null;
    const selDiff = this.meta.getSelectedDifficulty();
    const selTrial = selRunMode === 'standard' ? this.meta.getSelectedTrialId() : null;
    const selAscension =
      selRunMode === 'standard' && selDiff === 'abyss' && selTrial === null
        ? this.meta.getSelectedAscensionLevel()
        : 0;
    const metaProf = this.meta.getProfile();
    const initialCourtDef = data.courtSkinsById.get(metaProf.equippedCourtSkin) ?? null;
    const rookieMode =
      selRunMode === 'standard' &&
      metaProf.totalRuns < 3 &&
      selDiff === 'normal' &&
      selTrial === null;
    this.sim = new Simulation(
      data,
      runSeed,
      this.meta.getRelicLevels(),
      selDiff,
      selTrial,
      rookieMode,
      {
        runMode: selRunMode,
        chronicleId: selChronicle,
        dailyDateKey: metaProf.dailyDate,
        ascensionLevel: selAscension,
        blessedRelics: this.meta.getBlessedRelics(),
        codexAtkBonusPct: metaProf.codexAtkBonusPct,
        endgameBonuses: metaProf.endgameBonuses,
        arenaRule: initialCourtDef?.arenaRule ?? null,
        heroMasteryAtkPct: metaProf.heroMasteryAtkPct,
      },
    );

    // Attempt seamless auto-resume of unfinished expedition with schema migration (v1 -> v2)
    const mig = this.meta.loadActiveRunMigrated(data);
    if (mig.discardedReason) {
      this.discardedSaveReason = mig.discardedReason;
      this.meta.clearActiveRun();
    } else if (mig.save) {
      const savedRun = mig.save;
      if (
        !savedRun.gameOver &&
        !savedRun.victoryHold &&
        !savedRun.victoryAchieved &&
        (savedRun.runMode ?? 'standard') === this.sim.runMode &&
        (savedRun.chronicleId ?? null) === this.sim.chronicleId &&
        (savedRun.dailyDateKey ?? null) === (this.sim.dailyChallengeSpec?.dateKey ?? null) &&
        savedRun.difficulty === this.sim.difficulty &&
        (savedRun.trialId ?? null) === this.sim.trialId &&
        (savedRun.ascensionLevel ?? 0) === this.sim.ascensionLevel &&
        this.sim.restoreRunSave(savedRun)
      ) {
        this.lastSavedWave = savedRun.waveNumber;
        this.lastAutoSaveTick = savedRun.currentTick;
        this.autoRestoredWave = savedRun.waveNumber;
        for (const u of this.sim.getUnits()) {
          this.seenCutInUnits.add(u.unitId);
        }
        if (mig.migratedFrom !== null) {
          this.meta.saveActiveRun(this.sim.exportRunSave(Date.now()));
        }
      } else if (!this.autoRestoredWave) {
        this.meta.clearActiveRun();
      }
    }

    this.stack = new CanvasStack();
    this.sprites = new SpriteCache();
    this.bgPainter = new BackgroundPainter(() => {
      this.bgPainter.paint(this.stack.bgCtx, this.sim.board, this.sim.path);
    });
    this.vfx = new VfxSystem(this.sprites);
    try {
      const savedVfx = window.localStorage.getItem('mrd_vfx_mode_v1');
      if (savedVfx === 'clean' || savedVfx === 'full') {
        this.vfx.setDensityMode(savedVfx);
      }
    } catch {
      // ignore storage errors
    }
    this.renderer = new Renderer(this.stack, this.sprites, this.vfx);
    this.syncCosmetics(false);

    this.drag = new DragController(
      this.sim,
      (cmd) => this.dispatchCommand(cmd),
      () => this.ui.forceRefreshSelection(),
    );

    this.ui = new UIManager(data, this.sim.recipeGraph, this.sprites, {
      onDispatch: (cmd) => this.dispatchCommand(cmd),
      isTutorialDone: () => this.meta.isTutorialDone(),
      onSetTutorialDone: (done) => {
        this.meta.setTutorialDone(done);
        if (done && this.tutorialPaused) {
          this.tutorialPaused = false;
          this.loop.setPaused(false);
          this.ui.sync(
            this.sim.buildSnapshot(this.loop.getSpeed(), false),
            performance.now(),
            true,
          );
          if (this.sim.rookieMode) {
            this.ui.showToast('🛡 초출강호 보호 적용 (첫 3회 출정: 5·10장 영물 제한시간 +25%)');
          }
        }
      },
      onCycleSpeed: () => {
        this.sound.playUiTap();
        const next = this.loop.cycleSpeed();
        if (this.loop.isPaused()) {
          this.tutorialPaused = false;
          this.loop.setPaused(false);
        }
        this.ui.sync(this.sim.buildSnapshot(next, false), performance.now(), true);
      },
      onTogglePause: () => {
        this.sound.playUiTap();
        this.tutorialPaused = false;
        const paused = this.loop.togglePaused();
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), paused),
          performance.now(),
          true,
        );
      },
      isSoundMuted: () => this.sound.isMuted(),
      getSoundVolume: () => this.sound.getVolumeLevel(),
      onToggleMute: () => this.sound.toggleMute(),
      onCycleSoundVolume: () => this.sound.cycleVolume(),
      isBgmEnabled: () => this.sound.isBgmEnabled(),
      onToggleBgm: () => this.sound.toggleBgm(),
      getVfxDensityMode: () => this.vfx.getDensityMode(),
      onToggleVfxDensityMode: () => {
        this.sound.playUiTap();
        const next = this.vfx.getDensityMode() === 'full' ? 'clean' : 'full';
        this.vfx.setDensityMode(next);
        try {
          window.localStorage.setItem('mrd_vfx_mode_v1', next);
        } catch {
          // ignore storage errors
        }
        return next;
      },
      onClaimDailyQuest: (questId) => {
        const res = this.meta.claimDailyQuest(questId);
        if (res.ok) {
          this.sound.playCoinReward();
          this.announceUnlockedTitles(res.unlockedTitleIds);
        }
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
        return res;
      },
      onClaimCodexMilestone: (target) => {
        const res = this.meta.claimCodexMilestone(target);
        if (res.ok) {
          this.sound.playCraft(5);
          this.dispatchCommand({
            type: 'syncMetaBonuses',
            codexAtkBonusPct: res.totalCodexAtkBonusPct,
          });
          this.announceUnlockedTitles(res.unlockedTitleIds);
        }
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
        return res;
      },
      onSelectDifficulty: (diff) => {
        if (this.meta.setSelectedDifficulty(diff)) {
          this.suppressAutoSave = true;
          this.meta.clearActiveRun();
          window.location.reload();
          return true;
        }
        return false;
      },
      onSelectTrial: (trialId) => {
        if (this.meta.setSelectedTrial(trialId)) {
          this.suppressAutoSave = true;
          this.meta.clearActiveRun();
          window.location.reload();
          return true;
        }
        return false;
      },
      onSelectAscensionLevel: (level) => {
        if (this.meta.setSelectedAscensionLevel(level)) {
          this.suppressAutoSave = true;
          this.meta.clearActiveRun();
          window.location.reload();
          return true;
        }
        return false;
      },
      onSelectRunMode: (mode) => {
        if (this.meta.setSelectedRunMode(mode)) {
          this.suppressAutoSave = true;
          this.meta.clearActiveRun();
          window.location.reload();
          return true;
        }
        return false;
      },
      onSelectChronicle: (chronicleId) => {
        if (this.meta.setSelectedChronicle(chronicleId)) {
          this.suppressAutoSave = true;
          this.meta.clearActiveRun();
          window.location.reload();
          return true;
        }
        return false;
      },
      onEnterEndless: () => {
        this.sound.playBossHorn();
        this.dispatchCommand({ type: 'enterEndless' });
      },
      onPickBoon: (boonId) => {
        this.sound.playCraft(5);
        this.dispatchCommand({ type: 'pickBoon', boonId });
        if (this.loop.isPaused()) {
          this.loop.setPaused(false);
        }
      },
      onRestart: () => {
        this.suppressAutoSave = true;
        this.meta.clearActiveRun();
        window.location.reload();
      },
      onSettleAndRestart: () => {
        const snap = this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused());
        this.settleCurrentRun(snap);
        this.suppressAutoSave = true;
        this.meta.clearActiveRun();
        window.location.reload();
      },
      onExportBackup: () => this.meta.exportBackupCode(),
      onImportBackup: (code) => {
        const res = this.meta.importBackupCode(code);
        if (res.ok) {
          this.suppressAutoSave = true;
          this.meta.clearActiveRun();
          this.sound.playCoinReward();
        }
        return res;
      },
      onReloadAfterImport: () => {
        this.suppressAutoSave = true;
        this.meta.clearActiveRun();
        window.location.reload();
      },
      getMetaProfile: () => this.meta.getProfile(),
      getSettlementRecord: () => this.settlementRecord,
      onDrawRelic: (payWith) => {
        const res = this.meta.drawRelic(data.relics, payWith);
        if (res.ok) {
          if (res.newLevel > 10 || (res.shardsGranted ?? 0) > 0) {
            this.sound.playRelicTranscend();
          } else {
            this.sound.playCraft(res.isNew ? 4 : 3);
          }
          this.dispatchCommand({
            type: 'syncRelics',
            relics: this.meta.getRelicLevels(),
            blessedRelics: this.meta.getBlessedRelics(),
          });
          this.announceUnlockedTitles(res.unlockedTitleIds);
        }
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
        return res;
      },
      onDrawRelicBatch: (maxCount, payWith) => {
        const res = this.meta.drawRelicBatch(data.relics, maxCount, payWith);
        if (res.ok) {
          const hasTranscend =
            res.items.some((x) => x.newLevel > 10) || (res.totalShardsGranted ?? 0) > 0;
          if (hasTranscend) {
            this.sound.playRelicTranscend();
          } else {
            this.sound.playBatchChestCascade(res.items.length);
          }
          this.dispatchCommand({
            type: 'syncRelics',
            relics: this.meta.getRelicLevels(),
            blessedRelics: this.meta.getBlessedRelics(),
          });
          this.announceUnlockedTitles(res.unlockedTitleIds);
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
          if (res.newLevel > 10) {
            this.sound.playRelicTranscend();
          } else {
            this.sound.playCoinReward();
          }
          this.dispatchCommand({
            type: 'syncRelics',
            relics: this.meta.getRelicLevels(),
            blessedRelics: this.meta.getBlessedRelics(),
          });
          this.announceUnlockedTitles(res.unlockedTitleIds);
        }
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
        return res;
      },
      onTranscendRelic: (relicId) => {
        const def = data.relicsById.get(relicId);
        if (!def) {
          return { ok: false, reason: '존재하지 않는 신물입니다.' };
        }
        const res = this.meta.transcendRelic(def);
        if (res.ok) {
          this.sound.playRelicTranscend();
          this.haptics.trigger('success');
          this.dispatchCommand({
            type: 'syncRelics',
            relics: this.meta.getRelicLevels(),
            blessedRelics: this.meta.getBlessedRelics(),
          });
        }
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
        return res;
      },
      onEngraveRelic: (relicId) => {
        const def = data.relicsById.get(relicId);
        if (!def) {
          return { ok: false, reason: '존재하지 않는 신물입니다.' };
        }
        const res = this.meta.engraveRelic(def);
        if (res.ok) {
          this.sound.playMilestone();
          this.haptics.trigger('success');
          this.dispatchCommand({
            type: 'syncMetaBonuses',
            endgameBonuses: res.endgameBonuses,
          });
        }
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
        return res;
      },
      onRerollRelicSoul: (relicId) => {
        const def = data.relicsById.get(relicId);
        if (!def) {
          return { ok: false, reason: '존재하지 않는 신물입니다.' };
        }
        const res = this.meta.rerollRelicSoul(def);
        if (res.ok) {
          this.sound.playCraft(5);
          this.haptics.trigger('medium');
          this.dispatchCommand({
            type: 'syncMetaBonuses',
            endgameBonuses: res.endgameBonuses,
          });
        }
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
        return res;
      },
      onToggleRelicSoulLock: (relicId, slotIndex) => {
        const res = this.meta.toggleRelicSoulLock(relicId, slotIndex);
        if (res.ok) {
          this.sound.playUiTap();
        }
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
        return res;
      },
      onToggleBlessedRelic: (relicId) => {
        const def = data.relicsById.get(relicId);
        if (!def) {
          return { ok: false, reason: '존재하지 않는 신물입니다.' };
        }
        const res = this.meta.toggleBlessedRelic(def);
        if (res.ok) {
          this.sound.playRelicTranscend();
          this.haptics.trigger('light');
          this.dispatchCommand({
            type: 'syncRelics',
            relics: this.meta.getRelicLevels(),
            blessedRelics: res.blessedRelics,
          });
        }
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
        return res;
      },
      onReincarnate: () => {
        const res = this.meta.reincarnateCultivation();
        if (res.ok) {
          this.sound.playVictory();
          this.haptics.trigger('heavy');
          this.dispatchCommand({
            type: 'syncMetaBonuses',
            endgameBonuses: res.endgameBonuses,
          });
        }
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
        return res;
      },
      onUpgradeMastery: (masteryId) => {
        const res = this.meta.upgradeMastery(masteryId);
        if (res.ok) {
          this.sound.playCoinReward();
          this.haptics.trigger('light');
          this.dispatchCommand({
            type: 'syncMetaBonuses',
            endgameBonuses: res.endgameBonuses,
          });
        }
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
        return res;
      },
      onUpgradeMeridian: (meridianId) => {
        const res = this.meta.upgradeMeridian(meridianId);
        if (res.ok) {
          this.sound.playCraft(4);
          this.haptics.trigger('medium');
          this.dispatchCommand({
            type: 'syncMetaBonuses',
            endgameBonuses: res.endgameBonuses,
          });
        }
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
        return res;
      },
      onResetMeridians: () => {
        const res = this.meta.resetMeridians();
        if (res.ok) {
          this.sound.playUiTap();
          this.dispatchCommand({
            type: 'syncMetaBonuses',
            endgameBonuses: res.endgameBonuses,
          });
        }
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
        return res;
      },
      onClaimRealmMilestone: (minLevel) => {
        const res = this.meta.claimRealmMilestone(minLevel);
        if (res.ok) {
          this.sound.playMilestone();
          this.haptics.trigger('success');
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
          const courtDef = this.data.courtSkinsById.get(courtId) ?? null;
          this.dispatchCommand({
            type: 'syncMetaBonuses',
            arenaRule: courtDef?.arenaRule ?? null,
          });
          this.ui.sync(
            this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
            performance.now(),
            true,
          );
        }
        return ok;
      },
      onEquipTitle: (titleId) => {
        const ok = this.meta.equipTitle(titleId);
        if (ok) {
          this.sound.playUiTap();
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
      onGrantDevCultivation: () => {
        this.sound.playMilestone();
        const cult = this.meta.grantCultivationXp(400);
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused()),
          performance.now(),
          true,
        );
        return cult.level;
      },
      getSelectedSlot: () => this.drag.getSelectedSlot(),
      getDragDiscardView: () => this.drag.getDragDiscardView(),
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
          const topEntry = snap.damageMeter.entries[0] ?? null;
          this.settlementRecord = this.meta.settleEndlessOvertime(this.settlementRecord, {
            wave: snap.wave,
            monstersSlain: snap.monstersSlain,
            bossesSlain: snap.bossesSlain,
            bountiesSlain: snap.bounty.bountiesSlain,
            difficulty: snap.difficulty,
            trialId: snap.trialId,
            ascensionLevel: snap.ascensionLevel,
            runMode: snap.runMode,
            victory: snap.victoryAchieved,
            elapsedTicks: this.sim.tickCount,
            totalDamage: snap.damageMeter.totalDamage,
            topHeroId: topEntry?.unitId ?? null,
            topHeroName: topEntry?.name ?? null,
            heroContributions: this.sim.getRunHeroContributions(),
            usedHighFormation: snap.usedHighFormation,
            craftedImmortal: snap.craftedImmortal,
            ...(snap.dailyChallenge ? { dateKey: snap.dailyChallenge.dateKey } : {}),
          });
          if (this.settlementRecord.unlockedSkinIds.length > prevUnlockLen) {
            this.syncCosmetics(true);
          }
          this.sound.playDefeat();
        } else if (!this.settlementRecord && !snap.gameOver && snap.tick > 0) {
          if (snap.wave !== this.lastSavedWave) {
            this.lastSavedWave = snap.wave;
            this.flushActiveRunSave();
          } else if (this.runSaveDirty && snap.tick - this.lastAutoSaveTick >= 45) {
            this.flushActiveRunSave();
          } else if (snap.tick - this.lastAutoSaveTick >= 150) {
            this.flushActiveRunSave();
          }
        }
        this.sound.setBgmState(
          snap.paused || snap.gameOver || snap.victoryHold
            ? 'idle'
            : snap.isBossWave
              ? 'boss'
              : 'normal',
        );
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

    this.lifecycle = new Lifecycle(
      this.loop,
      () => {
        const snap = this.sim.buildSnapshot(this.loop.getSpeed(), true);
        this.ui.sync(snap, performance.now(), true);
      },
      () => {
        this.flushActiveRunSave();
      },
    );

    this.bindSimulationEvents();
  }

  private dispatchCommand(cmd: GameCommand): void {
    this.sim.commands.enqueue(cmd);
    this.runSaveDirty = true;
    const flushNowWhilePaused =
      this.tutorialPaused ||
      cmd.type === 'pledgeSect' ||
      cmd.type === 'rerollBoon' ||
      cmd.type === 'pickContract' ||
      cmd.type === 'awaken' ||
      cmd.type === 'syncMetaBonuses' ||
      cmd.type === 'syncRelics';
    if (
      flushNowWhilePaused &&
      this.loop.isPaused() &&
      !this.sim.isGameOver &&
      !this.sim.isVictoryHold
    ) {
      this.sim.flushCommandsWhilePaused();
      this.ui.sync(
        this.sim.buildSnapshot(this.loop.getSpeed(), true),
        performance.now(),
        true,
      );
    }
  }

  private flushActiveRunSave(): void {
    if (this.suppressAutoSave) return;
    if (this.sim.isGameOver || this.settlementRecord !== null) {
      this.meta.clearActiveRun();
      this.runSaveDirty = false;
      return;
    }
    if (this.sim.tickCount <= 0) return;
    this.meta.saveActiveRun(this.sim.exportRunSave(Date.now()));
    this.lastAutoSaveTick = this.sim.tickCount;
    this.runSaveDirty = false;
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

  private announceUnlockedTitles(ids?: readonly TitleId[]): void {
    if (!ids || ids.length === 0) return;
    for (let i = 0; i < ids.length; i++) {
      const def = TITLES_BY_ID.get(ids[i]!);
      if (!def) continue;
      const parts: string[] = [];
      if (def.rewardGold > 0) parts.push(`주화 +${def.rewardGold}`);
      if (def.rewardKeys > 0) parts.push(`열쇠 +${def.rewardKeys}`);
      if (def.rewardSilk > 0) parts.push(`비단 +${def.rewardSilk}필`);
      const rewardStr = parts.length > 0 ? ` (${parts.join(' · ')})` : '';
      this.ui.showToast(`🏅 강호 칭호 해금! [${def.name}]${rewardStr}`);
    }
  }

  private settleCurrentRun(snap: UISnapshot): SettlementRecord {
    if (!this.settlementRecord) {
      const topEntry = snap.damageMeter.entries[0] ?? null;
      this.settlementRecord = this.meta.settleRun({
        wave: snap.wave,
        monstersSlain: snap.monstersSlain,
        bossesSlain: snap.bossesSlain,
        bountiesSlain: snap.bounty.bountiesSlain,
        difficulty: snap.difficulty,
        trialId: snap.trialId,
        ascensionLevel: snap.ascensionLevel,
        runMode: snap.runMode,
        chronicleId: snap.chronicle?.id ?? null,
        victory: snap.victoryAchieved,
        elapsedTicks: this.sim.tickCount,
        totalDamage: snap.damageMeter.totalDamage,
        topHeroId: topEntry?.unitId ?? null,
        topHeroName: topEntry?.name ?? null,
        heroContributions: this.sim.getRunHeroContributions(),
        usedHighFormation: snap.usedHighFormation,
        craftedImmortal: snap.craftedImmortal,
        ...(snap.dailyChallenge ? { dateKey: snap.dailyChallenge.dateKey } : {}),
      });
      if (this.settlementRecord.heroRankUps.length > 0) {
        this.dispatchCommand({
          type: 'syncMetaBonuses',
          heroMasteryAtkPct: this.meta.getHeroMasteryAtkPctMap(),
        });
      }
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
          this.announceUnlockedTitles(disc.unlockedTitleIds);
        }
      }

      if (ev.source === 'wisp') {
        const unitName = unitDef?.name ?? ev.unitId;
        this.ui.showToast(`✦ 기연 초빙: ${unitName} 합류!`);
      }
    });

    this.sim.events.on('unit:sold', (ev) => {
      this.sound.playCoinReward();
      this.vfx.spawnMovePulse(ev.pos.x, ev.pos.y, ev.tick);
      if (ev.luckEarned > 0) {
        this.ui.showToast(`🧪 협객 환단 완료! 은자 +${ev.coinEarned} · 영단 +${ev.luckEarned} 획득!`);
      } else {
        this.ui.showToast(`🗑 협객 정리 완료 (+${ev.coinEarned} 은자)`);
      }
    });

    this.sim.events.on('units:bulk_sold', (ev) => {
      this.sound.playCoinReward();
      this.ui.showToast(`🧹 대기석 삼류 ${ev.count}인 일괄 정리! (+${ev.coinEarned} 은자)`);
    });

    this.sim.events.on('craft:done', (ev) => {
      const unitDef = this.sim.data.unitsById.get(ev.outputUnitId);
      const gradeDef = this.sim.data.gradesById.get(ev.grade);
      const skin = this.equippedHeroSkinsMap.get(ev.outputUnitId);
      const color = unitDef?.hiddenMythic
        ? '#fde047'
        : (skin?.primaryColor ?? gradeDef?.color ?? '#fbbf24');
      const rank = gradeDef?.rank ?? 2;
      const unitName = unitDef?.name ?? ev.outputUnitId;
      const gradeLabel = unitDef?.hiddenMythic ? '태고신화' : (gradeDef?.name ?? '');

      this.vfx.spawnCraftPillarFx(ev.pos.x, ev.pos.y, color, rank, ev.tick);
      if (unitDef?.hiddenMythic) {
        this.vfx.triggerScreenFlash('#fde047', 0.18, 0.28, ev.tick);
      }
      if (rank >= 4) {
        this.haptics.trigger(rank >= 6 ? 'heavy' : 'medium');
      }
      const starPart =
        ev.inheritedStarLevel && ev.inheritedStarLevel > 0
          ? ` (⭐ ${'★'.repeat(ev.inheritedStarLevel)} 계승 · 자동잠금!)`
          : '';
      this.ui.showToast(
        unitDef?.hiddenMythic
          ? `🌌 [${gradeLabel}] ${unitName} 태고 진·합공 강림!${starPart}`
          : `⚔️ [${gradeLabel}] ${unitName} 합공 등선!${starPart}`,
      );

      if (gradeDef?.isCutInTier && unitDef && !this.seenCutInUnits.has(unitDef.id)) {
        this.seenCutInUnits.add(unitDef.id);
        this.sound.playCutinFanfare(rank >= 6);
        this.vfx.showAscensionCutIn(
          this.sprites.unitToken(unitDef, gradeDef, skin),
          this.sprites.cutInBanner(
            unitDef.id,
            gradeLabel,
            unitDef.name,
            unitDef.skill.name,
            color,
            unitDef.faction,
          ),
          color,
          performance.now(),
        );
      } else {
        this.sound.playCraft(rank);
        if (gradeDef?.showSkillCallout) {
          this.vfx.showCraftCelebrationBanner(
            gradeLabel,
            unitName,
            color,
            performance.now(),
          );
        }
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
      const profile = getUnitCombatProfile(ev.unitId);
      const uDef = this.sim.data.unitsById.get(ev.unitId);
      const uGrade = uDef ? this.sim.data.gradesById.get(uDef.grade) : undefined;
      this.vfx.spawnSkillTrack(
        ev.vfxTrack,
        ev.fromX,
        ev.fromY,
        ev.x,
        ev.y,
        ev.radius,
        skin?.primaryColor ?? profile.primary,
        ev.gradeRank,
        ev.tick,
        skin?.primaryColor ?? profile.primary,
        skin?.secondaryColor ?? profile.secondary,
        profile.style,
      );
      // Only show floating scroll plaques for grades configured with showSkillCallout in grades.json
      if (uGrade?.showSkillCallout) {
        this.vfx.spawnSkillCallout(
          ev.fromX,
          ev.fromY - 68,
          ev.skillName,
          uDef?.faction ?? 'orthodox',
          ev.gradeRank,
          ev.tick,
        );
      }
    });

    this.sim.events.on('monster:hit', (ev) => {
      const uDef = this.sim.data.unitsById.get(ev.unitId);
      const skin = this.equippedHeroSkinsMap.get(ev.unitId);
      const profile = getUnitCombatProfile(ev.unitId);
      this.sound.playHit(
        uDef?.faction ?? 'orthodox',
        ev.isCrit || ev.justShattered,
        ev.isSkill,
        profile.style,
      );
      this.vfx.spawnHitFx(
        ev.entityId,
        ev.x,
        ev.y,
        ev.damage,
        skin?.primaryColor ?? profile.primary,
        ev.slain,
        ev.isCrit,
        ev.tick,
        ev.isSkill,
        ev.armorBroken,
        ev.justShattered,
        profile.style,
        ev.fromX,
        ev.fromY,
        skin?.secondaryColor ?? profile.secondary,
        ev.passiveProc,
      );
    });

    this.sim.events.on('wave:interest', (ev) => {
      this.sound.playCoinReward();
      this.ui.showToast(
        `🏦 전장 금고 복리 +${ev.pct}% 발동! 이자 +${ev.interestCoin.toLocaleString('ko-KR')} 은자`,
      );
    });

    this.sim.events.on('wave:mutant', (ev) => {
      this.sound.playHazardWarn();
      const wStr = String(ev.wave).padStart(2, '0');
      this.ui.showToast(`⚠️ 제 ${wStr} 장 변이 특집 [${ev.name}] — ${ev.desc}`);
    });

    this.sim.events.on('wave:boss', (ev) => {
      this.sound.playBossHorn();
      this.haptics.trigger('heavy');
      this.vfx.showBossWaveBanner(ev.wave, ev.bossName, performance.now());
      this.vfx.triggerScreenFlash('#dc2626', 0.14, 0.24, ev.tick);
    });

    this.sim.events.on('boss:skill', (ev) => {
      const tilePositions = (ev.tileIndices ?? []).map((idx) =>
        this.sim.board.getSlotCenter({ area: 'field', index: idx }),
      );
      this.vfx.spawnBossSkillFx(
        ev.skillKind,
        ev.skillName,
        ev.x,
        ev.y,
        tilePositions,
        ev.tick,
      );

      if (ev.skillKind === 'serpent_shatter') {
        this.sound.playCoinReward();
        this.ui.showToast('💥 만년현무 독갑 분쇄! 보스 기절 및 호신강기 대파쇄!');
      } else if (ev.skillKind === 'phoenix_shatter') {
        this.sound.playCoinReward();
        this.haptics.trigger('heavy');
        this.ui.showToast('🔥 남명주작 열반화란 파훼! 기절 · 파갑 + 영단 +1 · 은자 +80!');
      } else if (ev.skillKind === 'dragon_backfire') {
        this.sound.playCoinReward();
        this.haptics.trigger('success');
        this.ui.showToast('⚡ 구천낙뢰 회피 성공! 역뢰 파훼로 청룡 감전 + 은자 +70!');
      } else if (ev.skillKind === 'dragon_thunder_warn') {
        this.sound.playHazardWarn();
        this.ui.showToast('⚡ 창궁청룡 낙뢰진 예고! 푸른 마법진의 협객을 옮기면 역뢰 파훼!');
      } else if (ev.skillKind === 'phoenix_rebirth_egg') {
        this.sound.playHazardWarn();
        this.ui.showToast('🔥 남명주작 열반화란 전개! 회심·파갑 1.8x 화력으로 깨뜨리면 영단 획득!');
      } else if (ev.skillKind === 'patriarch_telegraph') {
        if (ev.skillName.includes('이중권능')) {
          this.sound.playBossPhaseDrum();
          this.ui.showToast('🔥 【무한이중권능】 광폭화 + 2칸 주박진 예고! 협객을 즉시 이동하세요!');
        } else {
          this.sound.playHazardWarn();
          this.ui.showToast('🚨 혈옥주박진 예고! 붉은 마법진 위의 협객을 옆 칸으로 옮기세요!');
        }
      } else if (ev.skillKind === 'patriarch_seal' || ev.skillKind === 'dragon_thunder_strike') {
        this.sound.playHazardWarn();
      } else if (ev.skillKind === 'serpent_shell') {
        this.sound.playHazardWarn();
        this.ui.showToast('🛡 만년현무 독갑 전개! 파갑 협객으로 5초 내 격파 시 역류 기절!');
      } else if (ev.skillKind === 'tiger_roar') {
        this.sound.playHazardWarn();
        this.ui.showToast('🐯 백호 호포진! 주변 협객 일시 경직!');
      } else if (
        ev.skillKind === 'tiger_sprint' ||
        ev.skillKind === 'patriarch_summon' ||
        ev.skillKind === 'dragon_tempest' ||
        ev.skillKind === 'phoenix_rebirth_heal'
      ) {
        this.sound.playBossPhaseDrum();
      }
    });

    this.sim.events.on('armament:forged', (ev) => {
      this.sound.playCraft(5);
      this.haptics.trigger('medium');
      const armDef = this.sim.data.armamentsById.get(ev.armamentId);
      if (ev.pos) {
        this.vfx.spawnCraftPillarFx(ev.pos.x, ev.pos.y, armDef?.color ?? '#facc15', 5, ev.tick);
      }
      const eqUnit = ev.equippedUid !== null ? this.sim.getUnitByUid(ev.equippedUid) : undefined;
      const uName = eqUnit ? this.sim.data.unitsById.get(eqUnit.unitId)?.name : null;
      this.ui.showToast(
        uName
          ? `🗡 신병 주조 완료! [${ev.name}] → ${uName} 즉시 패용!`
          : `🗡 신병 주조 완료! [${ev.name}] 무기고 보관!`,
      );
    });

    this.sim.events.on('armament:reforged', (ev) => {
      this.sound.playCraft(4);
      const armDef = this.sim.data.armamentsById.get(ev.armamentId);
      if (ev.pos) {
        this.vfx.spawnArrivalFx(ev.pos.x, ev.pos.y, armDef?.color ?? '#38bdf8', 4, ev.tick);
      }
      this.ui.showToast(`🔨 신병 재연마 완료! → [${ev.name}]`);
    });

    this.sim.events.on('armament:equipped', (ev) => {
      this.sound.playUiTap();
      const armDef = this.sim.data.armamentsById.get(ev.armamentId);
      if (ev.pos) {
        this.vfx.spawnArrivalFx(ev.pos.x, ev.pos.y, armDef?.color ?? '#facc15', 4, ev.tick);
      }
      const eqUnit = ev.targetUid !== null ? this.sim.getUnitByUid(ev.targetUid) : undefined;
      const uDef = eqUnit ? this.sim.data.unitsById.get(eqUnit.unitId) : undefined;
      const resTxt =
        armDef && uDef && armDef.resonance.faction === uDef.faction ? ' · ✦문파공명 발동!' : '';
      this.ui.showToast(
        uDef
          ? `🗡 [${ev.name}] → ${uDef.name} 수여 완료!${resTxt}`
          : `🗡 [${ev.name}] 장착을 해제하여 무기고로 회수했습니다.`,
      );
    });

    this.sim.events.on('armament:tempered', (ev) => {
      this.sound.playCraft(5);
      this.haptics.trigger('success');
      const armDef = this.sim.data.armamentsById.get(ev.armamentId);
      if (ev.pos) {
        this.vfx.spawnCraftPillarFx(ev.pos.x, ev.pos.y, armDef?.color ?? '#f97316', 5, ev.tick);
      }
      this.ui.showToast(
        `🔥 신병 담금질 성공! [${ev.name}] +${ev.temperLevel}강 (능력치 +${ev.temperLevel * 25}%)`,
      );
    });

    this.sim.events.on('command:cast', (ev) => {
      this.sound.playComboSkill();
      this.haptics.trigger('heavy');
      this.vfx.triggerScreenFlash(
        ev.color,
        ev.skillId === 'cmd_heaven_cannon' ? 0.22 : 0.14,
        ev.skillId === 'cmd_heaven_cannon' ? 0.3 : 0.22,
        ev.tick,
      );
      this.vfx.spawnCommandSkillFx(ev.skillId, ev.tick);
      if (ev.skillId === 'cmd_sword_barrage') {
        this.ui.showToast('🗡 [만검총공] 호령 발동! 5초간 전 협객 공속 +45% · 치명률 +25%p!');
      } else if (ev.skillId === 'cmd_bagua_bind') {
        this.ui.showToast(
          `☯ [팔괘금강박] 발동! 전 마물 ${ev.hitCount}기 기절 · 호신강기 -45 파쇄 · 55% 둔화!`,
        );
      } else {
        this.ui.showToast(
          `🌌 [천지개벽포] 발동! 전 마물 ${ev.hitCount}기 일제 포격 (총 ${ev.totalDamage.toLocaleString('ko-KR')} 피해)!`,
        );
      }
    });

    this.sim.events.on('sect:pledged', (ev) => {
      this.sound.playCraft(5);
      this.haptics.trigger('success');
      this.vfx.triggerScreenFlash(ev.color, 0.14, 0.22, ev.tick);
      if (ev.pos) {
        this.vfx.spawnCraftPillarFx(ev.pos.x, ev.pos.y, ev.color, 5, ev.tick);
      }
      this.vfx.showCraftCelebrationBanner('출정 문파 서약', ev.badge, ev.color, performance.now());
      this.ui.showToast(`🏛 [${ev.badge}] 가문 서약 체결! (${ev.startSummary})`);
    });

    this.sim.events.on('sect:vow_fulfilled', (ev) => {
      this.sound.playVictory();
      this.haptics.trigger('heavy');
      this.vfx.triggerScreenFlash('#fde047', 0.16, 0.26, ev.tick);
      this.vfx.showCraftCelebrationBanner(
        `${ev.sectName} 서약 성취`,
        `${ev.vowName} · 🌌태고합공 개방!`,
        ev.color,
        performance.now(),
      );
      const rewards: string[] = [];
      if (ev.rewardCoin > 0) rewards.push(`은자 +${ev.rewardCoin}`);
      if (ev.rewardLuck > 0) rewards.push(`영단 +${ev.rewardLuck}`);
      if (ev.rewardWispGrade) {
        const gName =
          this.sim.data.gradesById.get(ev.rewardWispGrade)?.name ?? ev.rewardWispGrade;
        rewards.push(`${gName} 기연 +${ev.rewardWispCount ?? 1}`);
      }
      this.ui.showToast(
        `🏆 [${ev.sectName}] 서약 완수! ${rewards.join(' · ')} + 🌌태고신화 진·합공식 해금!`,
      );
    });

    this.sim.events.on('mythic:unlocked', (ev) => {
      if (ev.reason === '출정 문파 서약 완수') {
        return; // Already celebrated alongside sect:vow_fulfilled
      }
      this.sound.playMilestone();
      this.haptics.trigger('heavy');
      this.vfx.triggerScreenFlash('#fde047', 0.16, 0.25, ev.tick);
      this.vfx.showCraftCelebrationBanner(
        '🌌 태고신화 해금',
        ev.reason,
        '#fde047',
        performance.now(),
      );
      this.ui.showToast(`🌌 [${ev.reason}] 달성! 합공보의 태고신화 진·합공식 3종이 봉인 해제되었습니다!`);
    });

    this.sim.events.on('boss:slain', (ev) => {
      this.sound.playCoinReward();
      const wispGradeName =
        this.sim.data.gradesById.get(ev.rewardWispGrade)?.name ?? ev.rewardWispGrade;
      this.ui.showToast(
        `🏆 ${ev.bossName} 토벌! 보상: 영단 +${ev.rewardLuck} · ${wispGradeName} 기연 +1`,
      );
    });

    this.sim.events.on('boon:offered', () => {
      this.sound.playBoonOffer();
      this.loop.setPaused(true);
      this.flushActiveRunSave();
      this.ui.sync(this.sim.buildSnapshot(this.loop.getSpeed(), true), performance.now(), true);
    });

    this.sim.events.on('boon:picked', (ev) => {
      this.vfx.triggerScreenFlash('#fde047', 0.1, 0.18, ev.tick);
      this.ui.showToast(`☯ 강호 기연 전수! [${ev.name}] Lv.${ev.stacks} 발동!`);
    });

    this.sim.events.on('boon:rerolled', (ev) => {
      this.sound.playSummon();
      this.ui.showToast(`🎲 기연 비급 다시 뽑기! (은자 -${ev.cost})`);
    });

    this.sim.events.on('unit:awakened', (ev) => {
      this.sound.playAwaken(ev.starLevel);
      this.haptics.trigger('success');
      const uDef = this.sim.data.unitsById.get(ev.unitId);
      const stars = '★'.repeat(ev.starLevel);
      const lockTxt = ev.autoLocked ? ' · 🔒 자동잠금 보호' : '';
      this.vfx.spawnCraftPillarFx(ev.pos.x, ev.pos.y, '#facc15', 5, ev.tick);
      this.ui.showToast(`⭐ [${uDef?.name ?? ev.unitId}] ${stars} 각성 돌파!${lockTxt}`);
    });

    this.sim.events.on('contract:offered', (ev) => {
      this.sound.playBoonOffer();
      this.ui.promptContractModal(ev.seq);
      this.ui.showToast(`📜 제 ${String(ev.wave).padStart(2, '0')} 장 강호 밀명 3택 도착! 보증금 예치 후 도전하세요`);
    });

    this.sim.events.on('contract:reminder', (ev) => {
      this.sound.playBoonOffer();
      this.ui.promptContractModal(ev.seq);
      this.ui.showToast(`📜 미선택 강호 밀명(제 ${String(ev.offerWave).padStart(2, '0')}장)이 대기 중입니다!`);
    });

    this.sim.events.on('contract:picked', (ev) => {
      this.sound.playSummon();
      const depTxt = ev.depositCoin > 0 ? ` · 보증금 ${ev.depositCoin} 예치` : '';
      this.ui.showToast(`📜 강호 밀명 [${ev.name}] 수락! (제 ${ev.deadlineWave} 장까지${depTxt})`);
    });

    this.sim.events.on('contract:completed', (ev) => {
      this.sound.playVictory();
      const parts: string[] = [];
      if (ev.refundedDeposit > 0) parts.push(`보증금 환급 +${ev.refundedDeposit}`);
      if (ev.rewardCoin > 0) parts.push(`은자 +${ev.rewardCoin}`);
      if (ev.rewardLuck > 0) parts.push(`영단 +${ev.rewardLuck}`);
      if (ev.rewardWispGrade) {
        const gName =
          this.sim.data.gradesById.get(ev.rewardWispGrade)?.name ?? ev.rewardWispGrade;
        parts.push(`${gName} 기연 +${ev.rewardWispCount ?? 1}`);
      }
      if (ev.rewardUpgradeAll && ev.rewardUpgradeAll > 0) {
        parts.push(`전 문파 내공 +${ev.rewardUpgradeAll}Lv`);
      }
      this.vfx.triggerScreenFlash('#fde047', 0.14, 0.24, ev.tick);
      this.ui.showToast(`🏆 밀명 완수 [${ev.name}]! ${parts.join(' · ')}`);
    });

    this.sim.events.on('contract:failed', (ev) => {
      const lossTxt = ev.lostDeposit > 0 ? ` (보증금 ${ev.lostDeposit} 은자 몰수)` : '';
      this.ui.showToast(`⌛ 밀명 [${ev.name}] 기한 만료!${lossTxt}`, true);
    });

    this.sim.events.on('boss:retry', (ev) => {
      this.sound.playBossRetry();
      this.haptics.trigger('warning');
      this.vfx.triggerScreenFlash('#f97316', 0.2, 0.28, ev.tick);
      this.ui.showToast(
        `🔥 강호 혈전 1회 발동! [${ev.bossName}] 체력 유지 · +${ev.bonusSec}초 연장! (내공 수련·합공으로 마무리하세요!)`,
      );
    });

    this.sim.events.on('boss:timeout', (ev) => {
      this.vfx.triggerScreenFlash('#991b1b', 0.22, 0.3, ev.tick);
      this.ui.showToast(`⏳ 제한시간 초과! ${ev.bossName} 토벌에 실패했습니다!`, true);
    });

    this.sim.events.on('bounty:called', (ev) => {
      this.sound.playBossHorn();
      this.vfx.triggerScreenFlash(ev.isElite ? '#e11d48' : '#f59e0b', 0.14, 0.22, ev.tick);
      const sec = ev.isElite ? 24 : 30;
      const extra = ev.isElite ? ' · 일류 기연 +1 (실패 시 추가 약탈 주의!)' : '';
      this.ui.showToast(
        `📜 ${ev.bossName} 출현! ${sec}초 내 토벌 시 은자+${ev.rewardCoin} · 영단+${ev.rewardLuck}${extra}`,
      );
    });

    this.sim.events.on('bounty:slain', (ev) => {
      this.sound.playCoinReward();
      const wispText = ev.rewardWispGrade
        ? ` · ${this.sim.data.gradesById.get(ev.rewardWispGrade)?.name ?? ev.rewardWispGrade} 기연 +1`
        : '';
      this.ui.showToast(
        `🎯 ${ev.isElite ? '정예 ' : ''}수배범 포획 성공! 은자 +${ev.rewardCoin} · 영단 +${ev.rewardLuck}${wispText} 획득!`,
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
      this.haptics.trigger('success');
      const chronDef = this.sim.chronicleDef;
      const bannerTag =
        this.sim.runMode === 'chronicle' && chronDef
          ? `제${chronDef.chapterNo}전 제패`
          : this.sim.runMode === 'boss_rush'
            ? '보스러시 제패'
            : this.sim.runMode === 'daily_challenge'
              ? '오늘의 비무 제패'
              : ev.trialId
                ? TRIAL_CONFIGS[ev.trialId].badge
                : '천하통일';
      const subTxt =
        this.sim.runMode === 'chronicle' && chronDef
          ? `${chronDef.name} 완전 정복!`
          : this.sim.runMode === 'boss_rush'
            ? `제 ${ev.wave} 관문 완전 정복!`
            : `제 ${ev.wave} 장 대승리!`;
      this.vfx.showCraftCelebrationBanner(
        bannerTag,
        subTxt,
        '#fde047',
        performance.now(),
      );
      const snap = this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused());
      this.settleCurrentRun(snap);
    });

    this.sim.events.on('endless:milestone', (ev) => {
      this.sound.playMilestone();
      this.haptics.trigger('success');
      this.vfx.triggerScreenFlash('#fde047', 0.16, 0.25, ev.tick);
      this.vfx.showCraftCelebrationBanner(
        `무한 ${ev.wave}장 돌파`,
        ev.label,
        '#fde047',
        performance.now(),
      );
      this.ui.showToast(
        `🏛 ${ev.label} 달성! 전투 보급 은자+${ev.inRunCoin} · 영단+${ev.inRunLuck} (정산 시 영구 보상 지급!)`,
      );
    });

    this.sim.events.on('combo:triggered', (ev) => {
      this.sound.playComboSkill();
      this.haptics.trigger('heavy');
      const firstId = ev.unitIds[0];
      const uDef = firstId ? this.sim.data.unitsById.get(firstId) : undefined;
      const isTrinity = ev.unitIds.length >= 3;
      if (isTrinity && ev.casterPositions && ev.casterPositions.length >= 2) {
        this.vfx.spawnTrinityComboFx(
          ev.casterPositions,
          ev.x,
          ev.y,
          ev.radius,
          ev.color,
          ev.tick,
        );
      }
      this.vfx.spawnSkillTrack(
        uDef?.skill.vfxTrack ?? 'im_cheonma',
        ev.fromX,
        ev.fromY,
        ev.x,
        ev.y,
        ev.radius,
        ev.color,
        6,
        ev.tick,
        ev.color,
        '#fde047',
        'sword',
      );
      this.vfx.triggerScreenFlash(ev.color, isTrinity ? 0.18 : 0.11, isTrinity ? 0.28 : 0.2, ev.tick);
      const bannerTitle = isTrinity
        ? ev.comboId === 'combo_primordial_genesis'
          ? '🌌 태고삼신 합체기'
          : ev.comboId === 'combo_v5_eclipse_trinity'
            ? '🌌 삼계종언 합체기'
            : '☯ 삼재 합체기'
        : '문파 연환절기';
      this.vfx.showCraftCelebrationBanner(bannerTitle, ev.name, ev.color, performance.now());
      this.ui.showToast(
        isTrinity
          ? `🌌 3인 삼재합체기 【${ev.name}】 개천 작렬! (${ev.hitCount}기 초토화)`
          : `⚡ 연환절기 【${ev.name}】 작렬! (${ev.hitCount}기 명중)`,
      );
    });

    this.sim.events.on('gamble:result', (ev) => {
      const gradeDef = this.sim.data.gradesById.get(ev.tier);
      const gName = gradeDef?.name ?? ev.tier;
      if (ev.success && ev.unitId) {
        const unitDef = this.sim.data.unitsById.get(ev.unitId);
        const uName = unitDef?.name ?? ev.unitId;
        const skin = this.equippedHeroSkinsMap.get(ev.unitId);
        const rank = gradeDef?.rank ?? 2;
        const color = skin?.primaryColor ?? gradeDef?.color ?? '#16a34a';
        if (ev.pos) {
          this.vfx.spawnCraftPillarFx(ev.pos.x, ev.pos.y, color, rank, ev.tick);
        }
        if (gradeDef?.isCutInTier && unitDef && !this.seenCutInUnits.has(unitDef.id)) {
          this.seenCutInUnits.add(unitDef.id);
          this.sound.playCutinFanfare(rank >= 6);
          this.vfx.showAscensionCutIn(
            this.sprites.unitToken(unitDef, gradeDef, skin),
            this.sprites.cutInBanner(
              unitDef.id,
              gradeDef.name,
              unitDef.name,
              unitDef.skill.name,
              color,
              unitDef.faction,
            ),
            color,
            performance.now(),
          );
        } else {
          this.sound.playGamble(ev.success, ev.refundedLuck);
          if (gradeDef?.showSkillCallout) {
            this.vfx.showCraftCelebrationBanner(gName, uName, color, performance.now());
          }
        }
        this.ui.showToast(`✨ [${gName}] 환골탈태 대성공! ${uName} 합류!`);
      } else {
        this.sound.playGamble(ev.success, ev.refundedLuck);
        if (ev.refundedLuck) {
          this.ui.showToast(`🔥 [${gName}] 주화입마! 만년단로가 영단 1개를 환급했습니다!`);
        } else {
          this.ui.showToast(`🩸 [${gName}] 주화입마... 내상이 깊어집니다`, true);
        }
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
          const footOff = u.slot.area === 'field' ? 45 : 37;
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

    this.sim.events.on('craft:batch', (ev) => {
      const topUnit = this.sim.data.unitsById.get(ev.topUnitId);
      const topGrade = this.sim.data.gradesById.get(ev.topGrade);
      this.ui.showToast(
        `⚡ 일괄 합공 완료! ${ev.count}명 등선 (최고: ${topGrade?.name ?? ''} ${topUnit?.name ?? ev.topUnitId})`,
      );
    });
  }

  public start(): void {
    this.sprites.ensureGlyphAtlas();
    this.ui.mount();
    this.viewport.mount();
    this.input.mount();
    this.lifecycle.mount();
    this.sound.mount();

    if (this.autoRestoredWave !== null) {
      const checkSnap = this.sim.buildSnapshot(this.loop.getSpeed(), false);
      if (checkSnap.pendingBoonOffer) {
        this.loop.setPaused(true);
      }
    } else if (!this.meta.isTutorialDone()) {
      this.loop.setPaused(true);
      this.tutorialPaused = true;
    }

    const initialSnap = this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused());
    this.ui.sync(initialSnap, performance.now(), true);
    if (this.discardedSaveReason) {
      this.ui.showToast(`⚠️ ${this.discardedSaveReason}`, true);
    } else if (this.autoRestoredWave !== null) {
      const wStr = String(this.autoRestoredWave).padStart(2, '0');
      this.ui.showToast(`💾 이전 출정(제 ${wStr}장) 자동 이어하기 완료!`);
    } else if (!this.tutorialPaused && this.sim.dailyChallengeSpec) {
      const spec = this.sim.dailyChallengeSpec;
      this.ui.showToast(
        `📅 오늘의 강호 비무 [${spec.rule.name}] (${spec.seedCode}) — ${spec.rule.desc}`,
      );
    } else if (!this.tutorialPaused && this.sim.runMode === 'boss_rush') {
      this.ui.showToast(
        '⚔ 보스 러시 10연전 출정! 초기 420은자 · 6영단 · 기연 6장 지급 — 4초 뒤 제1관문 개시!',
      );
    } else if (!this.tutorialPaused && this.sim.rookieMode) {
      this.ui.showToast('🛡 초출강호 보호 적용 (첫 3회 출정: 5·10장 영물 제한시간 +25%)');
    }
    this.loop.start();
  }
}
