import type { GameCommand, SlotRef } from '../core/CommandQueue';
import {
  DIFFICULTY_CONFIGS,
  formatCompactNumber,
  TITLES_BY_ID,
  TRIAL_CONFIGS,
} from '../core/relicFormulas';
import type { SlotView, UISnapshot } from '../core/Simulation';
import { ticksToClock } from '../core/time';
import type { RecipeGraph } from '../craft/RecipeGraph';
import type {
  BoonId,
  CourtSkinId,
  DifficultyId,
  GameDataBundle,
  GradeId,
  RecipeDef,
  RelicId,
  TitleId,
  TrialId,
  UnitId,
  UpgradeGroupId,
} from '../data/types';
import type { DragDiscardView } from '../input/DragController';
import {
  type BackupImportResult,
  type MetaProfile,
  RELIC_CHEST_GOLD_COST,
  type RelicBatchDrawResult,
  type RelicDrawResult,
  type RelicUpgradeResult,
  type SettlementRecord,
  SKIN_SINGLE_GOLD_COST,
  type SkinCraftResult,
  type SkinGachaResult,
} from '../platform/MetaStore';
import type { SpriteCache } from '../render/SpriteCache';
import { getUnitCombatProfile } from '../render/weaponProfiles';
import { buildHudShellMarkup } from './hudTemplate';
import { buildCodexPanelView } from './panels/CodexPanel';
import {
  buildCraftSheetView,
  buildGambleSheetView,
  buildMissionSheetView,
  buildUpgradeSheetView,
  buildWispSheetView,
  collectUnlockedCounts,
} from './panels/CombatSheets';
import { buildRelicPanelView, buildWardrobePanelView } from './panels/RelicSkinPanel';
import {
  buildBoonCardsHtml,
  buildDpsListHtml,
  buildSettlementLootHtml,
} from './panels/RunModals';
import { TutorialOverlay } from './TutorialOverlay';
import {
  type CodexFilterId,
  escapeHtml,
  FACTION_META,
  getEquippedSkinDef,
  hasUnownedGachaSkin,
  ICON,
  type RelicBatchNoticeEntry,
  type RelicFilterId,
  type RelicNoticeView,
  SKIN_RARITY_META,
  type SkinPullView,
  type WardrobeSubTab,
} from './uiShared';

export interface UIControlHandlers {
  onDispatch(cmd: GameCommand): void;
  isTutorialDone(): boolean;
  onSetTutorialDone(done: boolean): void;
  onPickBoon(boonId: BoonId): void;
  onCycleSpeed(): void;
  onTogglePause(): void;
  isSoundMuted(): boolean;
  onToggleMute(): boolean;
  onSelectDifficulty(diff: DifficultyId): boolean;
  onSelectTrial(trialId: TrialId | null): boolean;
  onEnterEndless(): void;
  onRestart(): void;
  onSettleAndRestart(): void;
  onExportBackup(): string;
  onImportBackup(code: string): BackupImportResult;
  onReloadAfterImport(): void;
  getMetaProfile(): MetaProfile;
  getSettlementRecord(): SettlementRecord | null;
  onDrawRelic(payWith: 'key' | 'gold'): RelicDrawResult;
  onDrawRelicBatch(maxCount: number, payWith: 'key' | 'gold'): RelicBatchDrawResult;
  onUpgradeRelic(relicId: RelicId): RelicUpgradeResult;
  onDrawSkin(count: 1 | 5, payWith: 'gold' | 'key'): SkinGachaResult;
  onCraftSkin(skinId: string): SkinCraftResult;
  onEquipHeroSkin(unitId: UnitId, skinId: string | null): boolean;
  onEquipCourtSkin(courtId: CourtSkinId): boolean;
  onEquipTitle(titleId: TitleId | null): boolean;
  onGrantDevMeta(): void;
  getSelectedSlot(): SlotRef | null;
  getDragDiscardView(): DragDiscardView;
  clearSelection(): void;
}

type SheetKind =
  | 'craft'
  | 'wisp'
  | 'gamble'
  | 'upgrade'
  | 'relic'
  | 'wardrobe'
  | 'codex'
  | 'mission';
type CraftTabId = 'all' | GradeId;

const NORMAL_SYNC_INTERVAL_MS = 100; // Max 10Hz for non-priority HUD fields (AGENTS.md §4)

export class UIManager {
  private readonly root: HTMLElement;
  private readonly data: GameDataBundle;
  private readonly recipeGraph: RecipeGraph;
  private readonly sprites: SpriteCache;
  private readonly handlers: UIControlHandlers;
  private readonly tutorial: TutorialOverlay;

  private waveBoxEl!: HTMLElement;
  private waveBadgeEl!: HTMLElement;
  private waveTimerEl!: HTMLElement;
  private monsterGaugeBoxEl!: HTMLElement;
  private monsterTitleEl!: HTMLElement;
  private monsterCountEl!: HTMLElement;
  private monsterFillEl!: HTMLElement;
  private relicBtnEl!: HTMLButtonElement;
  private relicBadgeEl!: HTMLElement;
  private speedBtnEl!: HTMLButtonElement;
  private pauseBtnEl!: HTMLButtonElement;
  private muteBtnEl!: HTMLButtonElement;
  private helpBtnEl!: HTMLButtonElement;
  private devBtnEl!: HTMLButtonElement;
  private devPopoverEl!: HTMLElement;
  private devSimMetaEl!: HTMLElement;

  private bossHudBarEl!: HTMLElement;
  private bossHudTagEl!: HTMLElement;
  private bossHudImgEl!: HTMLImageElement;
  private bossHudNameEl!: HTMLElement;
  private bossHudHpEl!: HTMLElement;
  private bossHudTrailEl!: HTMLElement;
  private bossHudFillEl!: HTMLElement;
  private bossHudShieldTrackEl!: HTMLElement;
  private bossHudShieldFillEl!: HTMLElement;
  private bossHudHintEl!: HTMLElement;
  private prevBossPortraitKind = '';

  private tacticalStripEl!: HTMLElement;
  private bountyBtnEl!: HTMLButtonElement;
  private missionBtnEl!: HTMLButtonElement;
  private dpsBtnEl!: HTMLButtonElement;
  private wardrobeBtnEl!: HTMLButtonElement;
  private codexBtnEl!: HTMLButtonElement;
  private dpsPanelEl!: HTMLElement;
  private dpsTotalEl!: HTMLElement;
  private dpsListEl!: HTMLElement;
  private prevDpsSig = '';
  private dpsOpen = false;

  private autoArrangeBtnEl!: HTMLButtonElement;
  private bulkCleanupBtnEl!: HTMLButtonElement;
  private surplusCountEl!: HTMLElement;
  private discardDropZoneEl!: HTMLElement;
  private discardDropTextEl!: HTMLElement;
  private prevDiscardSig = '';

  private unitSelectBarEl!: HTMLElement;
  private unitPortraitImgEl!: HTMLImageElement;
  private unitGradePillEl!: HTMLElement;
  private unitFactionPillEl!: HTMLElement;
  private unitNameEl!: HTMLElement;
  private unitStatEl!: HTMLElement;
  private unitShortcutsEl!: HTMLElement;
  private unitAscendBtnEl!: HTMLButtonElement;
  private unitLockBtnEl!: HTMLButtonElement;
  private unitSellBtnEl!: HTMLButtonElement;
  private selectedBestAscendRecipe: { readonly recipeId: string; readonly chain: boolean } | null =
    null;

  private coinValEl!: HTMLElement;
  private luckValEl!: HTMLElement;
  private wispValEl!: HTMLElement;
  private relicBuffStripEl!: HTMLElement;
  private occupancyEl!: HTMLElement;
  private prevRelicStripSig = '';

  private summonBtnEl!: HTMLButtonElement;
  private summonCostEl!: HTMLElement;
  private gambleBtnEl!: HTMLButtonElement;
  private gambleBadgeEl!: HTMLElement;
  private wispBtnEl!: HTMLButtonElement;
  private wispBadgeEl!: HTMLElement;
  private craftBtnEl!: HTMLButtonElement;
  private craftCostEl!: HTMLElement;
  private craftBadgeEl!: HTMLElement;
  private upgradeBtnEl!: HTMLButtonElement;
  private upgradeCostEl!: HTMLElement;

  private sheetBackdropEl!: HTMLElement;
  private sheetTitleEl!: HTMLElement;
  private sheetSubtitleEl!: HTMLElement;
  private sheetTabsEl!: HTMLElement;
  private sheetBodyEl!: HTMLElement;

  private recommendBarEl!: HTMLElement;
  private recImgEl!: HTMLImageElement;
  private recGradeEl!: HTMLElement;
  private recNameEl!: HTMLElement;
  private recIngsEl!: HTMLElement;
  private recCtaEl!: HTMLButtonElement;
  private benchCountEl!: HTMLElement;
  private synergyBarEl!: HTMLElement;
  private synOrthodoxBtnEl!: HTMLButtonElement;
  private synUnorthodoxBtnEl!: HTMLButtonElement;
  private synDemonicBtnEl!: HTMLButtonElement;
  private synTrinityBtnEl!: HTMLButtonElement;
  private synOrthodoxValEl!: HTMLElement;
  private synUnorthodoxValEl!: HTMLElement;
  private synDemonicValEl!: HTMLElement;
  private prevSynergyTracked = false;
  private prevOrthodoxTier = 0;
  private prevUnorthodoxTier = 0;
  private prevDemonicTier = 0;
  private prevTrinityActive = false;
  private recRecipeId: string | null = null;
  private prevRecommendSignature = '';

  private toastLayerEl!: HTMLElement;
  private activeToast: {
    el: HTMLDivElement;
    message: string;
    isReject: boolean;
    repeatCount: number;
    hideTimerId: number;
    removeTimerId: number | null;
  } | null = null;
  private boonPeekPillEl!: HTMLButtonElement;
  private boonModalEl!: HTMLElement;
  private boonTitleEl!: HTMLElement;
  private boonCardsEl!: HTMLElement;
  private boonPeekBtnEl!: HTMLButtonElement;
  private boonMinimized = false;
  private lastBoonOfferSeq = -1;
  private prevBoonModalSig = '';

  private gameOverModalEl!: HTMLElement;
  private gameOverCardEl!: HTMLElement;
  private gameOverTitleEl!: HTMLElement;
  private gameOverSubEl!: HTMLElement;
  private gameOverLootEl!: HTMLElement;
  private gameOverInspectBtnEl!: HTMLButtonElement;
  private gameOverEndlessBtnEl!: HTMLButtonElement;
  private gameOverRestartBtnEl!: HTMLButtonElement;
  private prevSettlementRenderedSig = '';

  private lastSyncMs = -1000;
  private lastSnapshot: UISnapshot | null = null;
  private prevSelectSignature = '';
  private prevSheetSignature = '';
  private prevTextCache = new Map<HTMLElement, string>();

  private activeSheet: SheetKind | null = null;
  private craftTab: CraftTabId = 'all';
  private codexFilter: CodexFilterId = 'all';
  private relicFilter: RelicFilterId = 'all';
  private wardrobeSubTab: WardrobeSubTab = 'hero';
  private wispTab: GradeId;
  private readonly craftTabs: readonly { readonly id: CraftTabId; readonly label: string }[];
  private readonly wispTabs: readonly {
    readonly id: GradeId;
    readonly name: string;
    readonly label: string;
  }[];
  private devOpen = false;
  private gameOverDismissed = false;
  private victoryDismissed = false;
  private lastAnimatedGambleSeq = 0;
  private lastRelicNotice: RelicNoticeView | null = null;
  private relicNoticeSeq = 0;
  private lastAnimatedRelicSeq = 0;
  private lastSkinPull: SkinPullView | null = null;
  private skinPullSeq = 0;
  private lastAnimatedSkinSeq = 0;
  private backupInputDraft = '';
  private abandonConfirmUntilMs = 0;

  public constructor(
    data: GameDataBundle,
    recipeGraph: RecipeGraph,
    sprites: SpriteCache,
    handlers: UIControlHandlers,
  ) {
    const el = document.getElementById('ui-root');
    if (!(el instanceof HTMLElement)) {
      throw new Error('[UIManager] Missing #ui-root container');
    }
    this.root = el;
    this.data = data;
    this.recipeGraph = recipeGraph;
    this.sprites = sprites;
    this.handlers = handlers;

    this.tutorial = new TutorialOverlay({
      data,
      isTutorialDone: () => this.handlers.isTutorialDone(),
      onSetTutorialDone: (done) => this.handlers.onSetTutorialDone(done),
      onToast: (msg) => this.showToast(msg),
    });

    const craftableGradeIds = new Set<GradeId>();
    for (const r of data.recipes) {
      const out = data.unitsById.get(r.output);
      if (out) craftableGradeIds.add(out.grade);
    }
    this.craftTabs = [
      { id: 'all', label: '전체' },
      ...data.grades
        .filter((g) => craftableGradeIds.has(g.id))
        .map((g) => ({ id: g.id, label: g.name })),
    ];

    this.wispTabs = data.grades
      .filter((g) => Boolean(data.wispPools[g.id]?.length))
      .map((g) => ({ id: g.id, name: g.name, label: `${g.name} 기연` }));
    this.wispTab = this.wispTabs[0]?.id ?? data.grades[0]!.id;

    // External WebP sprite atlas arrived -> refresh DOM portraits.
    this.sprites.onSpriteUpdated(() => {
      this.prevSelectSignature = '';
      this.prevSheetSignature = '';
      this.prevRecommendSignature = '';
      this.prevBossPortraitKind = '';
      this.prevDpsSig = '';
      if (this.lastSnapshot) {
        if (this.lastSnapshot.boss && this.bossHudImgEl) {
          this.bossHudImgEl.src = this.sprites.monsterPortraitUrl(this.lastSnapshot.boss.kind);
        }
        this.refreshSelectedUnitBar(this.lastSnapshot);
        this.refreshRecommendBar(this.lastSnapshot);
        if (this.dpsOpen) this.refreshDpsPanel(this.lastSnapshot);
        if (this.activeSheet) this.refreshSheet(this.lastSnapshot);
      }
    });
  }

  public mount(): void {
    const devLowWisp = this.wispTabs[0];
    const devHighWisp = this.wispTabs[this.wispTabs.length - 1];
    const devWispTabs = [devLowWisp, devHighWisp].filter(
      (t): t is NonNullable<typeof devLowWisp> => Boolean(t),
    );

    this.root.innerHTML = buildHudShellMarkup({
      mutedInit: this.handlers.isSoundMuted(),
      totalSkins: this.data.heroSkins.length + this.data.courtSkins.length,
      totalUnits: this.data.units.length,
      devWispTabs,
    });

    this.tutorial.mount(this.root);

    this.waveBoxEl = this.mustGet('hud-wave-box');
    this.waveBadgeEl = this.mustGet('hud-wave-badge');
    this.waveTimerEl = this.mustGet('hud-wave-timer');
    this.monsterGaugeBoxEl = this.mustGet('hud-monster-gauge');
    this.monsterTitleEl = this.mustGet('hud-monster-title');
    this.monsterCountEl = this.mustGet('hud-monster-count');
    this.monsterFillEl = this.mustGet('hud-monster-fill');
    this.relicBtnEl = this.mustGet('btn-relic') as HTMLButtonElement;
    this.relicBadgeEl = this.mustGet('badge-relic');
    this.speedBtnEl = this.mustGet('btn-speed') as HTMLButtonElement;
    this.pauseBtnEl = this.mustGet('btn-pause') as HTMLButtonElement;
    this.muteBtnEl = this.mustGet('btn-mute') as HTMLButtonElement;
    this.helpBtnEl = this.mustGet('btn-help') as HTMLButtonElement;
    this.devBtnEl = this.mustGet('btn-dev') as HTMLButtonElement;
    this.devPopoverEl = this.mustGet('dev-popover');
    this.devSimMetaEl = this.mustGet('dev-sim-meta');

    this.bossHudBarEl = this.mustGet('boss-hud-bar');
    this.bossHudTagEl = this.mustGet('boss-hud-tag');
    this.bossHudImgEl = this.mustGet('boss-hud-img') as HTMLImageElement;
    this.bossHudNameEl = this.mustGet('boss-hud-name');
    this.bossHudHpEl = this.mustGet('boss-hud-hp');
    this.bossHudTrailEl = this.mustGet('boss-hud-trail');
    this.bossHudFillEl = this.mustGet('boss-hud-fill');
    this.bossHudShieldTrackEl = this.mustGet('boss-hud-shield-track');
    this.bossHudShieldFillEl = this.mustGet('boss-hud-shield-fill');
    this.bossHudHintEl = this.mustGet('boss-hud-hint');

    this.tacticalStripEl = this.mustGet('tactical-strip');
    this.bountyBtnEl = this.mustGet('btn-bounty') as HTMLButtonElement;
    this.missionBtnEl = this.mustGet('btn-mission') as HTMLButtonElement;
    this.dpsBtnEl = this.mustGet('btn-dps') as HTMLButtonElement;
    this.wardrobeBtnEl = this.mustGet('btn-wardrobe') as HTMLButtonElement;
    this.codexBtnEl = this.mustGet('btn-codex') as HTMLButtonElement;
    this.dpsPanelEl = this.mustGet('dps-panel');
    this.dpsTotalEl = this.mustGet('dps-total-val');
    this.dpsListEl = this.mustGet('dps-list');

    this.autoArrangeBtnEl = this.mustGet('btn-auto-arrange') as HTMLButtonElement;
    this.bulkCleanupBtnEl = this.mustGet('btn-bulk-cleanup') as HTMLButtonElement;
    this.surplusCountEl = this.mustGet('val-surplus-count');
    this.discardDropZoneEl = this.mustGet('discard-drop-zone');
    this.discardDropTextEl = this.mustGet('discard-drop-text');

    this.unitSelectBarEl = this.mustGet('unit-select-bar');
    this.unitPortraitImgEl = this.mustGet('sel-unit-img') as HTMLImageElement;
    this.unitGradePillEl = this.mustGet('sel-unit-grade');
    this.unitFactionPillEl = this.mustGet('sel-unit-faction');
    this.unitNameEl = this.mustGet('sel-unit-name');
    this.unitStatEl = this.mustGet('sel-unit-stat');
    this.unitShortcutsEl = this.mustGet('sel-unit-shortcuts');
    this.unitAscendBtnEl = this.mustGet('btn-unit-ascend') as HTMLButtonElement;
    this.unitLockBtnEl = this.mustGet('btn-unit-lock') as HTMLButtonElement;
    this.unitSellBtnEl = this.mustGet('btn-unit-sell') as HTMLButtonElement;

    this.coinValEl = this.mustGet('val-coin');
    this.luckValEl = this.mustGet('val-luck');
    this.wispValEl = this.mustGet('val-wisp');
    this.relicBuffStripEl = this.mustGet('relic-buff-strip');
    this.occupancyEl = this.mustGet('val-occupancy');

    this.summonBtnEl = this.mustGet('btn-summon') as HTMLButtonElement;
    this.summonCostEl = this.mustGet('val-summon-cost');
    this.gambleBtnEl = this.mustGet('btn-gamble') as HTMLButtonElement;
    this.gambleBadgeEl = this.mustGet('badge-gamble');
    this.wispBtnEl = this.mustGet('btn-wisp') as HTMLButtonElement;
    this.wispBadgeEl = this.mustGet('badge-wisp');
    this.craftBtnEl = this.mustGet('btn-craft') as HTMLButtonElement;
    this.craftCostEl = this.mustGet('val-craft-state');
    this.craftBadgeEl = this.mustGet('badge-craft');
    this.upgradeBtnEl = this.mustGet('btn-upgrade') as HTMLButtonElement;
    this.upgradeCostEl = this.mustGet('val-upgrade-state');

    this.sheetBackdropEl = this.mustGet('sheet-backdrop');
    this.sheetTitleEl = this.mustGet('sheet-title');
    this.sheetSubtitleEl = this.mustGet('sheet-subtitle');
    this.sheetTabsEl = this.mustGet('sheet-tabs');
    this.sheetBodyEl = this.mustGet('sheet-body');

    this.recommendBarEl = this.mustGet('recommend-bar');
    this.recImgEl = this.mustGet('rec-img') as HTMLImageElement;
    this.recGradeEl = this.mustGet('rec-grade');
    this.recNameEl = this.mustGet('rec-name');
    this.recIngsEl = this.mustGet('rec-ings');
    this.recCtaEl = this.mustGet('btn-rec-cta') as HTMLButtonElement;
    this.benchCountEl = this.mustGet('val-bench-count');
    this.synergyBarEl = this.mustGet('synergy-bar');
    this.synOrthodoxBtnEl = this.mustGet('btn-syn-orthodox') as HTMLButtonElement;
    this.synUnorthodoxBtnEl = this.mustGet('btn-syn-unorthodox') as HTMLButtonElement;
    this.synDemonicBtnEl = this.mustGet('btn-syn-demonic') as HTMLButtonElement;
    this.synTrinityBtnEl = this.mustGet('btn-syn-trinity') as HTMLButtonElement;
    this.synOrthodoxValEl = this.mustGet('syn-val-orthodox');
    this.synUnorthodoxValEl = this.mustGet('syn-val-unorthodox');
    this.synDemonicValEl = this.mustGet('syn-val-demonic');

    this.toastLayerEl = this.mustGet('toast-layer');
    this.boonPeekPillEl = this.mustGet('boon-peek-pill') as HTMLButtonElement;
    this.boonModalEl = this.mustGet('boon-modal');
    this.boonTitleEl = this.mustGet('boon-title');
    this.boonCardsEl = this.mustGet('boon-cards');
    this.boonPeekBtnEl = this.mustGet('btn-boon-peek') as HTMLButtonElement;

    this.gameOverModalEl = this.mustGet('gameover-modal');
    this.gameOverCardEl = this.mustGet('gameover-card');
    this.gameOverTitleEl = this.mustGet('gameover-title');
    this.gameOverSubEl = this.mustGet('gameover-sub');
    this.gameOverLootEl = this.mustGet('gameover-loot');
    this.gameOverInspectBtnEl = this.mustGet('btn-gameover-inspect') as HTMLButtonElement;
    this.gameOverEndlessBtnEl = this.mustGet('btn-gameover-endless') as HTMLButtonElement;
    this.gameOverRestartBtnEl = this.mustGet('btn-gameover-restart') as HTMLButtonElement;

    this.bindEvents();
  }

  private isTutorialBlocked(): boolean {
    return (
      this.activeSheet !== null ||
      this.dpsOpen ||
      this.devOpen ||
      this.handlers.getDragDiscardView().active
    );
  }

  private bindEvents(): void {
    this.waveBoxEl.addEventListener('click', () => this.toggleSheet('codex'));
    this.relicBtnEl.addEventListener('click', () => this.toggleSheet('relic'));
    this.relicBuffStripEl.addEventListener('click', (ev) => {
      const targetEl = ev.target as HTMLElement | null;
      if (targetEl?.closest('[data-open-titles]')) {
        this.toggleSheet('codex');
      } else if (targetEl?.closest('[data-open-boons]')) {
        this.toggleSheet('upgrade');
      } else {
        this.toggleSheet('relic');
      }
    });
    this.boonCardsEl.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement | null)?.closest<HTMLElement>('[data-boon-id]');
      const boonId = btn?.dataset.boonId as BoonId | undefined;
      if (!boonId) return;
      this.handlers.onPickBoon(boonId);
    });
    this.boonPeekBtnEl.addEventListener('click', () => {
      this.boonMinimized = true;
      this.prevBoonModalSig = '';
      if (this.lastSnapshot) {
        this.refreshBoonModal(this.lastSnapshot);
      }
    });
    this.boonPeekPillEl.addEventListener('click', () => {
      this.boonMinimized = false;
      this.prevBoonModalSig = '';
      if (this.lastSnapshot) {
        this.refreshBoonModal(this.lastSnapshot);
      }
    });
    this.speedBtnEl.addEventListener('click', () => this.handlers.onCycleSpeed());
    this.pauseBtnEl.addEventListener('click', () => this.handlers.onTogglePause());
    this.muteBtnEl.addEventListener('click', () => {
      const muted = this.handlers.onToggleMute();
      this.muteBtnEl.classList.toggle('muted', muted);
      this.setText(this.muteBtnEl, muted ? '🔇' : '🔊');
    });
    this.helpBtnEl.addEventListener('click', () => {
      this.closeSheet();
      this.dpsOpen = false;
      this.dpsBtnEl.classList.remove('active');
      this.dpsPanelEl.classList.remove('open');
      this.devOpen = false;
      this.devBtnEl.classList.remove('active');
      this.devPopoverEl.classList.remove('open');
      this.tutorial.restart();
      if (this.lastSnapshot) {
        this.tutorial.sync(this.lastSnapshot, false);
      }
    });

    this.bountyBtnEl.addEventListener('click', () => {
      this.handlers.onDispatch({ type: 'callBounty' });
    });
    this.missionBtnEl.addEventListener('click', () => this.toggleSheet('mission'));
    this.dpsBtnEl.addEventListener('click', () => {
      this.dpsOpen = !this.dpsOpen;
      this.dpsBtnEl.classList.toggle('active', this.dpsOpen);
      this.dpsPanelEl.classList.toggle('open', this.dpsOpen);
      if (this.lastSnapshot) {
        if (this.dpsOpen) {
          this.prevDpsSig = '';
          this.refreshDpsPanel(this.lastSnapshot);
        }
        this.tutorial.sync(this.lastSnapshot, this.isTutorialBlocked());
      }
    });
    this.mustGet('btn-dps-close').addEventListener('click', () => {
      this.dpsOpen = false;
      this.dpsBtnEl.classList.remove('active');
      this.dpsPanelEl.classList.remove('open');
      if (this.lastSnapshot) {
        this.tutorial.sync(this.lastSnapshot, this.isTutorialBlocked());
      }
    });
    this.wardrobeBtnEl.addEventListener('click', () => this.toggleSheet('wardrobe'));
    this.codexBtnEl.addEventListener('click', () => this.toggleSheet('codex'));

    this.autoArrangeBtnEl.addEventListener('click', () => {
      this.handlers.onDispatch({ type: 'autoArrange' });
      this.handlers.clearSelection();
    });

    this.bulkCleanupBtnEl.addEventListener('click', () => {
      this.handlers.onDispatch({ type: 'sellSurplusCommon' });
      this.handlers.clearSelection();
    });

    this.synergyBarEl.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-syn]');
      if (!btn) return;
      const synId = btn.dataset.syn;
      if (synId === 'orthodox') {
        this.showToast(
          '☯ 정파 『북두검진』 (출전 3/6인): [3인] 치명률+10%·제어+25% / [6인] 공격+20%·치명률+18%·제어+40%',
        );
      } else if (synId === 'unorthodox') {
        this.showToast(
          '☠ 사파 『만독혈진』 (출전 3/6인): [3인] 공속+18%·처치시 은자+1 / [6인] 공격+20%·공속+32%·처치시 은자+2',
        );
      } else if (synId === 'demonic') {
        this.showToast(
          '🩸 마교 『천마혈진』 (출전 3/6인): [3인] 치명피해+40%·절기배율+25% / [6인] 공격+25%·치명피해+80%·절기배율+45%',
        );
      } else if (synId === 'trinity') {
        this.showToast(
          '✦ 삼재귀원 『삼재합진』 (정·사·마 각 2인 이상 출전): 전 협객 공격력 +18% · 공속 +10%',
        );
      }
    });

    this.devBtnEl.addEventListener('click', () => {
      this.devOpen = !this.devOpen;
      this.devBtnEl.classList.toggle('active', this.devOpen);
      this.devPopoverEl.classList.toggle('open', this.devOpen);
      if (this.lastSnapshot) {
        this.tutorial.sync(this.lastSnapshot, this.isTutorialBlocked());
      }
    });

    this.devPopoverEl.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-dev-action]');
      if (!btn) return;
      const act = btn.dataset.devAction;
      if (act === 'coin') {
        this.handlers.onDispatch({ type: 'grantTestCoin', amount: 500 });
        this.showToast('DEV: +500 은자 지급');
      } else if (act === 'luck') {
        this.handlers.onDispatch({ type: 'grantTestResource', luck: 5 });
        this.showToast('DEV: +5 영단 지급');
      } else if (act === 'wisp') {
        const wispGrade = btn.dataset.wispGrade;
        if (wispGrade) {
          const gName = this.data.gradesById.get(wispGrade)?.name ?? wispGrade;
          this.handlers.onDispatch({ type: 'grantTestResource', wispGrade });
          this.showToast(`DEV: +1 ${gName} 기연 지급`);
        }
      } else if (act === 'meta') {
        this.handlers.onGrantDevMeta();
        this.showToast('DEV: +250 천하주화 · +2 열쇠 · +180 운금비단 · 전 난이도 해금');
      }
    });

    this.unitAscendBtnEl.addEventListener('click', () => {
      if (!this.selectedBestAscendRecipe) return;
      this.handlers.onDispatch({
        type: 'craft',
        recipeId: this.selectedBestAscendRecipe.recipeId,
        chain: this.selectedBestAscendRecipe.chain,
      });
      this.handlers.clearSelection();
    });

    this.unitLockBtnEl.addEventListener('click', () => {
      const slotView = this.getSelectedSlotView(this.lastSnapshot);
      if (!slotView) return;
      this.handlers.onDispatch({ type: 'lock', uid: slotView.uid, locked: !slotView.locked });
    });

    this.unitSellBtnEl.addEventListener('click', () => {
      const slotView = this.getSelectedSlotView(this.lastSnapshot);
      if (!slotView) return;
      if (slotView.locked) {
        this.showToast('잠금 상태인 협객은 먼저 잠금을 해제해 주세요.', true);
        return;
      }
      this.handlers.onDispatch({ type: 'sell', uid: slotView.uid });
      this.handlers.clearSelection();
    });

    this.unitShortcutsEl.addEventListener('click', (ev) => {
      const chip = (ev.target as HTMLElement | null)?.closest<HTMLButtonElement>(
        '[data-shortcut-recipe]',
      );
      if (!chip || !this.lastSnapshot) return;
      const rid = chip.dataset.shortcutRecipe!;
      const st = this.lastSnapshot.craft.recipes[rid];
      const rec = this.recipeGraph.recipesById.get(rid);
      if (!st || !rec) return;

      if (st.lamp === 'ready' || st.lamp === 'chainReady') {
        this.handlers.onDispatch({
          type: 'craft',
          recipeId: rid,
          chain: st.lamp === 'chainReady',
        });
        this.handlers.clearSelection();
        return;
      }

      const outUnit = this.data.unitsById.get(rec.output);
      const outGrade = (outUnit?.grade ?? 'all') as CraftTabId;
      this.craftTab = this.craftTabs.some((t) => t.id === outGrade) ? outGrade : 'all';
      this.openSheet('craft');
    });

    this.recommendBarEl.addEventListener('click', () => {
      const rid = this.recRecipeId;
      if (!rid || !this.lastSnapshot) return;
      const st = this.lastSnapshot.craft.recipes[rid];
      const rec = this.recipeGraph.recipesById.get(rid);
      if (!st || !rec) return;
      if (st.lamp === 'ready' || st.lamp === 'chainReady') {
        this.handlers.onDispatch({ type: 'craft', recipeId: rid, chain: st.lamp === 'chainReady' });
        return;
      }
      const outGrade = (this.data.unitsById.get(rec.output)?.grade ?? 'all') as CraftTabId;
      this.craftTab = this.craftTabs.some((t) => t.id === outGrade) ? outGrade : 'all';
      this.openSheet('craft');
    });

    // Bottom 5 Wuxia Dock Buttons
    this.summonBtnEl.addEventListener('click', () => {
      this.handlers.onDispatch({ type: 'summon' });
    });

    this.gambleBtnEl.addEventListener('click', () => {
      this.toggleSheet('gamble');
    });

    this.wispBtnEl.addEventListener('click', () => {
      if (this.activeSheet !== 'wisp' && this.lastSnapshot) {
        const w = this.lastSnapshot.wisps;
        if ((w[this.wispTab] ?? 0) <= 0) {
          const ownedTab = this.wispTabs.find((t) => (w[t.id] ?? 0) > 0);
          this.wispTab = ownedTab?.id ?? this.wispTabs[0]?.id ?? this.wispTab;
        }
      }
      this.toggleSheet('wisp');
    });

    this.craftBtnEl.addEventListener('click', () => {
      this.toggleSheet('craft');
    });

    this.upgradeBtnEl.addEventListener('click', () => {
      this.toggleSheet('upgrade');
    });

    this.mustGet('btn-sheet-close').addEventListener('click', () => this.closeSheet());
    this.sheetBackdropEl.addEventListener('click', (ev) => {
      if (ev.target === this.sheetBackdropEl) {
        this.closeSheet();
      }
    });

    this.sheetTabsEl.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-tab-id]');
      if (!btn) return;
      const tabId = btn.dataset.tabId!;
      if (tabId === 'sheet-upgrade') {
        this.openSheet('upgrade');
        return;
      }
      if (tabId === 'sheet-relic') {
        this.openSheet('relic');
        return;
      }
      if (tabId === 'sheet-wardrobe') {
        this.openSheet('wardrobe');
        return;
      }
      if (tabId === 'sheet-codex') {
        this.openSheet('codex');
        return;
      }
      if (this.activeSheet === 'craft') {
        this.craftTab = tabId as CraftTabId;
        this.prevSheetSignature = '';
        if (this.lastSnapshot) this.refreshSheet(this.lastSnapshot);
      } else if (this.activeSheet === 'wisp') {
        this.wispTab = tabId;
        this.prevSheetSignature = '';
        if (this.lastSnapshot) this.refreshSheet(this.lastSnapshot);
      }
    });

    this.sheetBodyEl.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement | null)?.closest<HTMLButtonElement>(
        '[data-sheet-action]',
      );
      if (!btn || btn.classList.contains('cta-disabled')) return;

      const action = btn.dataset.sheetAction;
      if (action === 'craft') {
        const recipeId = btn.dataset.recipeId;
        const chain = btn.dataset.chain === '1';
        if (recipeId) {
          this.handlers.onDispatch({ type: 'craft', recipeId, chain });
        }
      } else if (action === 'wisp') {
        const grade = btn.dataset.grade;
        const unitId = btn.dataset.unitId;
        if (grade && unitId) {
          this.handlers.onDispatch({ type: 'useWisp', grade, unitId });
        }
      } else if (action === 'gamble') {
        const tier = btn.dataset.tier;
        if (tier) {
          this.handlers.onDispatch({ type: 'gamble', tier });
        }
      } else if (action === 'upgrade') {
        const group = btn.dataset.group as UpgradeGroupId | undefined;
        if (group) {
          this.handlers.onDispatch({ type: 'upgrade', group });
        }
      } else if (action === 'relic-filter') {
        const f = btn.dataset.filter;
        this.relicFilter = f === 'economy' || f === 'combat' ? f : 'all';
        this.prevSheetSignature = '';
        if (this.lastSnapshot) this.refreshSheet(this.lastSnapshot);
      } else if (action === 'relic-draw') {
        const payWith = btn.dataset.pay === 'key' ? 'key' : 'gold';
        const reqCount = Math.max(1, Math.min(10, Number(btn.dataset.count ?? '1') || 1));
        if (reqCount > 1) {
          const res = this.handlers.onDrawRelicBatch(reqCount, payWith);
          if (res.ok) {
            const aggMap = new Map<RelicId, RelicBatchNoticeEntry>();
            for (const item of res.items) {
              const prev = aggMap.get(item.relicId);
              if (prev) {
                aggMap.set(item.relicId, {
                  relicId: item.relicId,
                  prevLevel: prev.prevLevel,
                  newLevel: item.newLevel,
                  pulls: prev.pulls + 1,
                  isNew: prev.isNew || item.isNew,
                });
              } else {
                aggMap.set(item.relicId, {
                  relicId: item.relicId,
                  prevLevel: item.prevLevel,
                  newLevel: item.newLevel,
                  pulls: 1,
                  isNew: item.isNew,
                });
              }
            }
            const batchItems = Array.from(aggMap.values());
            const newCount = batchItems.filter((x) => x.isNew).length;
            const msg = `🏺 기보함 ${res.spentCount}연 개봉 완료! (${batchItems.length}종 승급${newCount > 0 ? ` · 신규 ${newCount}종` : ''})`;
            this.lastRelicNotice = {
              seq: ++this.relicNoticeSeq,
              isWin: true,
              text: msg,
              batchItems,
              totalPulls: res.spentCount,
            };
            this.prevSheetSignature = '';
            if (this.lastSnapshot) this.refreshSheet(this.lastSnapshot);
            this.showToast(msg);
          } else {
            this.showToast(res.reason, true);
          }
        } else {
          const res = this.handlers.onDrawRelic(payWith);
          if (res.ok) {
            const def = this.data.relicsById.get(res.relicId);
            const rName = def?.name ?? res.relicId;
            const msg = res.isNew
              ? `✨ 신규 신물 해금! [${rName}] Lv.1`
              : `⬆️ 신물 승급! [${rName}] Lv.${res.prevLevel} → Lv.${res.newLevel}`;
            this.lastRelicNotice = {
              seq: ++this.relicNoticeSeq,
              isWin: true,
              text: msg,
              relicId: res.relicId,
              prevLevel: res.prevLevel,
              newLevel: res.newLevel,
              isNew: res.isNew,
            };
            this.prevSheetSignature = '';
            if (this.lastSnapshot) this.refreshSheet(this.lastSnapshot);
            this.showToast(msg);
          } else {
            this.showToast(res.reason, true);
          }
        }
      } else if (action === 'relic-upgrade') {
        const relicId = btn.dataset.relicId as RelicId | undefined;
        if (!relicId) return;
        const res = this.handlers.onUpgradeRelic(relicId);
        if (res.ok) {
          const def = this.data.relicsById.get(res.relicId);
          const rName = def?.name ?? res.relicId;
          const msg = res.wasUnlock
            ? `✨ 신물 지정 해금! [${rName}] Lv.1`
            : `🔨 신물 제련 완료! [${rName}] Lv.${res.newLevel}`;
          this.lastRelicNotice = {
            seq: ++this.relicNoticeSeq,
            isWin: true,
            text: msg,
            relicId: res.relicId,
            prevLevel: res.prevLevel,
            newLevel: res.newLevel,
            isNew: res.wasUnlock,
          };
          this.prevSheetSignature = '';
          if (this.lastSnapshot) this.refreshSheet(this.lastSnapshot);
          this.showToast(msg);
        } else {
          this.showToast(res.reason, true);
        }
      } else if (action === 'wardrobe-subtab') {
        const sub = btn.dataset.subtab === 'court' ? 'court' : 'hero';
        this.wardrobeSubTab = sub;
        this.prevSheetSignature = '';
        if (this.lastSnapshot) this.refreshSheet(this.lastSnapshot);
      } else if (action === 'skin-draw') {
        const count: 1 | 5 = btn.dataset.count === '5' ? 5 : 1;
        const payWith = btn.dataset.pay === 'key' ? 'key' : 'gold';
        const res = this.handlers.onDrawSkin(count, payWith);
        if (res.ok) {
          this.lastSkinPull = {
            items: res.items,
            totalSilkRefund: res.totalSilkRefund,
            seq: ++this.skinPullSeq,
          };
          const newCount = res.items.filter((x) => x.isNew).length;
          const topItem = [...res.items].sort(
            (a, b) => SKIN_RARITY_META[b.rarity].rank - SKIN_RARITY_META[a.rarity].rank,
          )[0];
          const summaryMsg =
            count === 5
              ? `👘 5연속 초빙 완료! 신규 ${newCount}종${res.totalSilkRefund > 0 ? ` · 운금비단 +${res.totalSilkRefund}필` : ''}`
              : topItem?.isNew
                ? `✨ 전설 의복 획득! [${SKIN_RARITY_META[topItem.rarity].label}] ${topItem.name}`
                : `🧶 중복 환급! [${topItem?.name ?? ''}] → 운금비단 +${res.totalSilkRefund}필`;
          this.prevSheetSignature = '';
          if (this.lastSnapshot) this.refreshSheet(this.lastSnapshot);
          this.showToast(summaryMsg);
        } else {
          this.showToast(res.reason, true);
        }
      } else if (action === 'skin-craft') {
        const skinId = btn.dataset.skinId;
        if (!skinId) return;
        const res = this.handlers.onCraftSkin(skinId);
        if (res.ok) {
          this.prevSheetSignature = '';
          if (this.lastSnapshot) this.refreshSheet(this.lastSnapshot);
          this.showToast(`👘 확정 재단 완료! [${res.name}] 장착 완료 (-${res.spentSilk}필)`);
        } else {
          this.showToast(res.reason, true);
        }
      } else if (action === 'skin-equip-hero') {
        const unitId = btn.dataset.unitId;
        const skinId = btn.dataset.skinId ? btn.dataset.skinId : null;
        if (!unitId) return;
        const ok = this.handlers.onEquipHeroSkin(unitId, skinId);
        if (ok) {
          this.prevSheetSignature = '';
          if (this.lastSnapshot) this.refreshSheet(this.lastSnapshot);
          const skinDef = skinId ? this.data.heroSkinsById.get(skinId) : null;
          this.showToast(
            skinDef ? `👘 [${skinDef.name}] 의복·검기 장착!` : '기본 문파 복장으로 복귀했습니다.',
          );
        }
      } else if (action === 'skin-equip-court') {
        const courtId = btn.dataset.courtId as CourtSkinId | undefined;
        if (!courtId) return;
        const ok = this.handlers.onEquipCourtSkin(courtId);
        if (ok) {
          this.prevSheetSignature = '';
          if (this.lastSnapshot) this.refreshSheet(this.lastSnapshot);
          const courtDef = this.data.courtSkinsById.get(courtId);
          this.showToast(`🏯 비무대 테마 [${courtDef?.name ?? courtId}] 적용!`);
        }
      } else if (action === 'select-difficulty') {
        const diff = btn.dataset.difficulty as DifficultyId | undefined;
        if (!diff) return;
        if (
          this.lastSnapshot &&
          this.lastSnapshot.trialId === null &&
          diff === this.lastSnapshot.difficulty
        ) {
          this.showToast(`현재 [${DIFFICULTY_CONFIGS[diff].name}] 난이도로 출정 중입니다.`);
          return;
        }
        const ok = this.handlers.onSelectDifficulty(diff);
        if (!ok) {
          this.showToast('이전 난이도 제 30 장을 먼저 제패해야 해금됩니다!', true);
        }
      } else if (action === 'select-trial') {
        const rawTrial = btn.dataset.trialId ?? '';
        const trialId = rawTrial ? (rawTrial as TrialId) : null;
        if (this.lastSnapshot && trialId === this.lastSnapshot.trialId) {
          if (trialId) {
            this.showToast(`현재 [${TRIAL_CONFIGS[trialId].name}] 비경에 출정 중입니다.`);
          }
          return;
        }
        const ok = this.handlers.onSelectTrial(trialId);
        if (!ok) {
          this.showToast('선택할 수 없는 비경 시련입니다.', true);
        }
      } else if (action === 'codex-filter') {
        this.codexFilter = (btn.dataset.filter ?? 'all') as CodexFilterId;
        this.prevSheetSignature = '';
        if (this.lastSnapshot) this.refreshSheet(this.lastSnapshot);
      } else if (action === 'equip-title') {
        const rawTitle = btn.dataset.titleId ?? '';
        const titleId = rawTitle ? (rawTitle as TitleId) : null;
        const ok = this.handlers.onEquipTitle(titleId);
        if (ok) {
          this.prevSheetSignature = '';
          if (this.lastSnapshot) this.refreshSheet(this.lastSnapshot);
          const def = titleId ? TITLES_BY_ID.get(titleId) : null;
          this.showToast(
            def ? `🏅 강호 칭호 [${def.name}] 장착 완료!` : '칭호 장착을 해제했습니다.',
          );
        }
      } else if (action === 'replay-tutorial') {
        this.closeSheet();
        this.tutorial.restart();
        if (this.lastSnapshot) {
          this.tutorial.sync(this.lastSnapshot, false);
        }
      } else if (action === 'enter-endless') {
        this.victoryDismissed = true;
        this.closeSheet();
        this.gameOverModalEl.classList.remove('open');
        this.handlers.onEnterEndless();
      } else if (action === 'settle-run') {
        this.handlers.onSettleAndRestart();
      } else if (action === 'restart-run') {
        this.handlers.onRestart();
      } else if (action === 'abandon-restart') {
        const now = performance.now();
        if (this.abandonConfirmUntilMs > now) {
          this.abandonConfirmUntilMs = 0;
          this.handlers.onRestart();
          return;
        }
        this.abandonConfirmUntilMs = now + 4000;
        this.prevSheetSignature = '';
        if (this.lastSnapshot) this.refreshSheet(this.lastSnapshot);
        this.showToast(
          '⚠ 현재 출정 기록이 초기화됩니다. 4초 내 한 번 더 누르면 처음부터 재출정합니다.',
          true,
        );
      } else if (action === 'backup-export') {
        const code = this.handlers.onExportBackup();
        this.backupInputDraft = code;
        const inputEl = document.getElementById('backup-code-input') as HTMLInputElement | null;
        if (inputEl) {
          inputEl.value = code;
          inputEl.select();
        }
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard
            .writeText(code)
            .then(() => {
              this.showToast('💾 영구 백업 코드가 클립보드에 복사되었습니다!');
            })
            .catch(() => {
              this.showToast(
                '💾 백업 코드가 생성되었습니다. 입력창의 코드를 복사해 보관하세요!',
              );
            });
        } else {
          this.showToast('💾 백업 코드가 생성되었습니다. 입력창의 코드를 복사해 보관하세요!');
        }
      } else if (action === 'backup-import') {
        const inputEl = document.getElementById('backup-code-input') as HTMLInputElement | null;
        const raw = (inputEl?.value ?? this.backupInputDraft).trim();
        const res = this.handlers.onImportBackup(raw);
        if (!res.ok) {
          this.showToast(res.reason, true);
          return;
        }
        this.backupInputDraft = '';
        this.showToast(
          `✅ 세이브 복원 완료! (최고 ${res.bestWave}장 · 명숙록 ${res.discoveredCount}인 · 주화 ${res.gold.toLocaleString('ko-KR')})`,
        );
        window.setTimeout(() => {
          this.handlers.onReloadAfterImport();
        }, 550);
      }
    });

    this.sheetBodyEl.addEventListener('input', (ev) => {
      const target = ev.target as HTMLElement | null;
      if (target instanceof HTMLInputElement && target.id === 'backup-code-input') {
        this.backupInputDraft = target.value;
      }
    });

    this.gameOverEndlessBtnEl.addEventListener('click', () => {
      this.victoryDismissed = true;
      this.gameOverModalEl.classList.remove('open');
      this.handlers.onEnterEndless();
    });

    this.gameOverInspectBtnEl.addEventListener('click', () => {
      if (this.lastSnapshot?.victoryHold) {
        this.victoryDismissed = true;
      } else {
        this.gameOverDismissed = true;
      }
      this.gameOverModalEl.classList.remove('open');
    });

    this.mustGet('btn-gameover-relic').addEventListener('click', () => {
      if (this.lastSnapshot?.victoryHold) {
        this.victoryDismissed = true;
      } else {
        this.gameOverDismissed = true;
      }
      this.gameOverModalEl.classList.remove('open');
      this.openSheet('relic');
    });

    this.gameOverRestartBtnEl.addEventListener('click', () => {
      this.handlers.onRestart();
    });
  }

  public openSheet(kind: SheetKind): void {
    this.activeSheet = kind;
    this.prevSheetSignature = '';
    this.sheetBackdropEl.classList.add('open');
    if (this.lastSnapshot) {
      this.refreshSheet(this.lastSnapshot);
      this.tutorial.sync(this.lastSnapshot, this.isTutorialBlocked());
    }
  }

  public closeSheet(): void {
    this.activeSheet = null;
    this.prevSheetSignature = '';
    this.sheetBackdropEl.classList.remove('open');
    if (this.lastSnapshot) {
      this.tutorial.sync(this.lastSnapshot, this.isTutorialBlocked());
    }
  }

  private toggleSheet(kind: SheetKind): void {
    if (this.activeSheet === kind) {
      this.closeSheet();
    } else {
      this.openSheet(kind);
    }
  }

  public sync(snapshot: UISnapshot, nowMs: number, forcePriority: boolean): void {
    if (!forcePriority && nowMs - this.lastSyncMs < NORMAL_SYNC_INTERVAL_MS) {
      this.refreshDragDiscardZone(snapshot);
      this.tutorial.sync(snapshot, this.isTutorialBlocked());
      return;
    }
    this.lastSyncMs = nowMs;
    this.lastSnapshot = snapshot;
    const meta = this.handlers.getMetaProfile();

    // 1. Top HUD Wave, Difficulty, Secret Realm Trial, Mutant Wave & Boss status
    const waveStr = String(snapshot.wave).padStart(2, '0');
    const diffCfg = DIFFICULTY_CONFIGS[snapshot.difficulty];
    const trialCfg = snapshot.trialId ? TRIAL_CONFIGS[snapshot.trialId] : null;
    this.waveBoxEl.classList.toggle('boss-mode', snapshot.isBossWave);
    this.waveBoxEl.classList.toggle('endless-mode', snapshot.endlessMode);
    this.waveBoxEl.classList.toggle('mutant-mode', Boolean(snapshot.waveMutant));
    this.waveBoxEl.classList.toggle('trial-mode', trialCfg !== null);
    const prefix = snapshot.isBossWave ? '영물' : snapshot.endlessMode ? '혈투' : '제';
    if (trialCfg) {
      const targetStr = String(snapshot.clearTargetWave).padStart(2, '0');
      const waveNumLabel = snapshot.endlessMode ? `${waveStr}장` : `${waveStr}/${targetStr}장`;
      const rightTag = snapshot.waveMutant ? snapshot.waveMutant.badge : trialCfg.badge;
      this.setText(this.waveBadgeEl, `${prefix} ${waveNumLabel} · ${rightTag}`);
    } else {
      const shortDiff = diffCfg.badge.split(' ')[0] ?? diffCfg.badge;
      const waveRight = snapshot.waveMutant ? snapshot.waveMutant.badge : shortDiff;
      this.setText(this.waveBadgeEl, `${prefix} ${waveStr}장 · ${waveRight}`);
    }
    this.setText(this.waveTimerEl, ticksToClock(snapshot.waveTicksLeft));
    this.setText(
      this.devSimMetaEl,
      `30Hz · Tick ${snapshot.tick} · ${trialCfg ? trialCfg.badge : diffCfg.badge}`,
    );

    this.setText(
      this.monsterTitleEl,
      snapshot.waveMutant
        ? snapshot.waveMutant.name
        : trialCfg
          ? trialCfg.badge
          : '침입 마물',
    );
    this.setText(this.monsterCountEl, `${snapshot.monsterCount} / ${snapshot.monsterCap}`);
    const pct = Math.min(100, Math.max(0, (snapshot.monsterCount / snapshot.monsterCap) * 100));
    this.monsterFillEl.style.width = `${pct.toFixed(1)}%`;
    this.monsterGaugeBoxEl.classList.toggle('danger', pct >= 75);

    const hasBoss = Boolean(snapshot.boss);
    this.bossHudBarEl.classList.toggle('visible', hasBoss);
    this.bossHudBarEl.classList.toggle('bounty-mode', Boolean(snapshot.boss?.isBounty));
    this.tacticalStripEl.classList.toggle('boss-active', hasBoss);
    this.dpsPanelEl.classList.toggle('boss-active', hasBoss);

    if (snapshot.boss) {
      if (this.prevBossPortraitKind !== snapshot.boss.kind) {
        this.prevBossPortraitKind = snapshot.boss.kind;
        this.bossHudImgEl.src = this.sprites.monsterPortraitUrl(snapshot.boss.kind);
      }
      const leftSec = Math.ceil(snapshot.boss.ticksLeft / 30);
      this.setText(
        this.bossHudTagEl,
        snapshot.boss.isBounty ? `수배 ${leftSec}초` : `제한 ${ticksToClock(snapshot.boss.ticksLeft)}`,
      );
      let bossNameLabel = snapshot.boss.name;
      if (snapshot.boss.armor > 0 || snapshot.boss.armorShred > 0) {
        const netArmor = snapshot.boss.armor - snapshot.boss.armorShred;
        bossNameLabel =
          netArmor < 0
            ? `${snapshot.boss.name} · 💥파갑 ${netArmor}`
            : snapshot.boss.armorShred > 0
              ? `${snapshot.boss.name} · 🛡강기 ${netArmor} (-${snapshot.boss.armorShred})`
              : `${snapshot.boss.name} · 🛡강기 ${netArmor}`;
      }
      this.setText(this.bossHudNameEl, bossNameLabel);
      const shieldPart =
        snapshot.boss.shieldHp > 0
          ? ` (+독갑 ${Math.ceil(snapshot.boss.shieldHp).toLocaleString('ko-KR')})`
          : '';
      this.setText(
        this.bossHudHpEl,
        `${Math.ceil(snapshot.boss.hp).toLocaleString('ko-KR')} / ${snapshot.boss.maxHp.toLocaleString('ko-KR')}${shieldPart}`,
      );
      const bossPct = Math.min(
        100,
        Math.max(0, (snapshot.boss.hp / Math.max(1, snapshot.boss.maxHp)) * 100),
      );
      const wCss = `${bossPct.toFixed(1)}%`;
      this.bossHudFillEl.style.width = wCss;
      this.bossHudTrailEl.style.width = wCss;

      const hasShieldBar = snapshot.boss.shieldHp > 0 && snapshot.boss.shieldMaxHp > 0;
      this.bossHudShieldTrackEl.classList.toggle('visible', hasShieldBar);
      if (hasShieldBar) {
        const sPct = Math.min(
          100,
          Math.max(0, (snapshot.boss.shieldHp / Math.max(1, snapshot.boss.shieldMaxHp)) * 100),
        );
        this.bossHudShieldFillEl.style.width = `${sPct.toFixed(1)}%`;
      }
      this.setText(this.bossHudHintEl, snapshot.boss.patternHint);
      this.bossHudHintEl.classList.toggle('visible', snapshot.boss.patternHint.length > 0);
    }

    // 1b. Tactical Strip (Bounty · Missions · DPS · Wardrobe · Codex)
    const bnt = snapshot.bounty;
    let bountyLabel = '📜 수배 (2장~)';
    if (bnt.active) {
      bountyLabel = `🎯 추격 ${Math.ceil(bnt.activeTicksLeft / 30)}s`;
    } else if (!bnt.unlocked) {
      bountyLabel = '📜 수배 (2장~)';
    } else if (bnt.cooldownTicksLeft > 0) {
      bountyLabel = `📜 정비 ${Math.ceil(bnt.cooldownTicksLeft / 30)}s`;
    } else {
      bountyLabel = '📜 현상수배!';
    }
    this.setText(this.bountyBtnEl, bountyLabel);
    this.bountyBtnEl.classList.toggle('ready', bnt.canCall);
    this.bountyBtnEl.classList.toggle('active-chase', bnt.active);

    this.setText(
      this.missionBtnEl,
      `📋 의뢰 ${snapshot.missionsCompletedCount}/${snapshot.missions.length}`,
    );
    this.missionBtnEl.classList.toggle('active', this.activeSheet === 'mission');

    const totalSkinCount = this.data.heroSkins.length + this.data.courtSkins.length;
    const unownedSkinExists = hasUnownedGachaSkin(this.data, meta);
    const canDrawSkinNow =
      unownedSkinExists && (meta.keys >= 1 || meta.gold >= SKIN_SINGLE_GOLD_COST);
    this.setText(this.wardrobeBtnEl, `👘 화장각 ${meta.ownedSkinCount}/${totalSkinCount}`);
    this.wardrobeBtnEl.classList.toggle('active', this.activeSheet === 'wardrobe');
    this.wardrobeBtnEl.classList.toggle(
      'draw-ready',
      canDrawSkinNow && this.activeSheet !== 'wardrobe',
    );

    this.codexBtnEl.classList.toggle('active', this.activeSheet === 'codex');
    this.setText(this.codexBtnEl, `📖 명숙록 ${meta.discoveredCount}/${this.data.units.length}`);

    if (this.dpsOpen) {
      this.refreshDpsPanel(snapshot);
    }

    const canDrawGold =
      meta.gold >= RELIC_CHEST_GOLD_COST &&
      this.data.relics.some((d) => (meta.relics[d.id] ?? 0) < d.maxLevel);
    const relicBadgeNum = meta.keys > 0 ? String(meta.keys) : canDrawGold ? '!' : '0';
    this.setText(this.relicBadgeEl, relicBadgeNum);
    this.relicBadgeEl.classList.toggle('visible', relicBadgeNum !== '0');
    this.relicBtnEl.classList.toggle('active', this.activeSheet === 'relic');

    this.setText(this.speedBtnEl, `${snapshot.speed === 0 ? 1 : snapshot.speed}x`);
    this.setText(this.pauseBtnEl, snapshot.paused ? '▶' : '⏸');
    this.pauseBtnEl.classList.toggle('active', snapshot.paused);

    // 2. Currencies & Live Relic Buff Strip
    this.setText(this.coinValEl, snapshot.coin.toLocaleString('ko-KR'));
    this.setText(this.luckValEl, String(snapshot.luckStone));

    const totalWisps = Object.values(snapshot.wisps).reduce((s, n) => s + (n ?? 0), 0);
    this.setText(this.wispValEl, String(totalWisps));
    this.setText(this.wispBadgeEl, String(totalWisps));
    this.wispBadgeEl.classList.toggle('visible', totalWisps > 0);

    this.setText(this.gambleBadgeEl, String(snapshot.luckStone));
    this.gambleBadgeEl.classList.toggle('visible', snapshot.luckStone > 0);

    this.refreshRelicBuffStrip(snapshot, meta);

    this.setText(this.occupancyEl, `비무대 ${snapshot.fieldOccupied}/18`);
    this.setText(this.benchCountEl, `${snapshot.benchOccupied}/12`);
    this.autoArrangeBtnEl.classList.toggle(
      'can-deploy',
      snapshot.benchOccupied > 0 && snapshot.fieldOccupied < 18,
    );
    this.setText(this.surplusCountEl, String(snapshot.benchSurplusCommonCount));
    this.bulkCleanupBtnEl.classList.toggle('has-surplus', snapshot.benchSurplusCommonCount > 0);
    this.setText(this.summonCostEl, String(snapshot.summonCost));

    const syn = snapshot.synergy;
    this.setText(this.synOrthodoxValEl, String(syn.counts.orthodox));
    this.setText(this.synUnorthodoxValEl, String(syn.counts.unorthodox));
    this.setText(this.synDemonicValEl, String(syn.counts.demonic));
    this.synOrthodoxBtnEl.classList.toggle('tier-1', syn.orthodoxTier === 1);
    this.synOrthodoxBtnEl.classList.toggle('tier-2', syn.orthodoxTier === 2);
    this.synUnorthodoxBtnEl.classList.toggle('tier-1', syn.unorthodoxTier === 1);
    this.synUnorthodoxBtnEl.classList.toggle('tier-2', syn.unorthodoxTier === 2);
    this.synDemonicBtnEl.classList.toggle('tier-1', syn.demonicTier === 1);
    this.synDemonicBtnEl.classList.toggle('tier-2', syn.demonicTier === 2);
    this.synTrinityBtnEl.classList.toggle('active', syn.trinityActive);

    if (this.prevSynergyTracked) {
      if (syn.orthodoxTier > this.prevOrthodoxTier) {
        this.showToast(
          syn.orthodoxTier === 2
            ? '☯ 정파 『북두검진 · 극』 6인 발동! 정파 공격+20% · 치명률+18%'
            : '☯ 정파 『북두검진』 3인 발동! 정파 치명률+10% · 제어시간+25%',
        );
      }
      if (syn.unorthodoxTier > this.prevUnorthodoxTier) {
        this.showToast(
          syn.unorthodoxTier === 2
            ? '☠ 사파 『만독혈진 · 극』 6인 발동! 사파 공격+20% · 공속+32% · 약탈+2'
            : '☠ 사파 『만독혈진』 3인 발동! 사파 공속+18% · 처치시 약탈 은자+1',
        );
      }
      if (syn.demonicTier > this.prevDemonicTier) {
        this.showToast(
          syn.demonicTier === 2
            ? '🩸 마교 『천마혈진 · 극』 6인 발동! 마교 공격+25% · 치명피해+80%'
            : '🩸 마교 『천마혈진』 3인 발동! 마교 치명피해+40% · 절기배율+25%',
        );
      }
      if (syn.trinityActive && !this.prevTrinityActive) {
        const trinityBonus = 18 + (trialCfg?.trinityAtkBonusPct ?? 0);
        this.showToast(`✦ 삼재귀원 『삼재합진』 발동! 전 협객 공격력 +${trinityBonus}% · 공속 +10%`);
      }
    }
    this.prevSynergyTracked = true;
    this.prevOrthodoxTier = syn.orthodoxTier;
    this.prevUnorthodoxTier = syn.unorthodoxTier;
    this.prevDemonicTier = syn.demonicTier;
    this.prevTrinityActive = syn.trinityActive;

    const totalCraftable = snapshot.craft.readyCount + snapshot.craft.chainReadyCount;
    this.setText(this.craftBadgeEl, String(totalCraftable));
    this.craftBadgeEl.classList.toggle('visible', totalCraftable > 0);
    this.craftBtnEl.classList.toggle('craft-lit', totalCraftable > 0);
    this.setText(
      this.craftCostEl,
      snapshot.craft.readyCount > 0
        ? `합공 ${snapshot.craft.readyCount}`
        : snapshot.craft.chainReadyCount > 0
          ? `등선 ${snapshot.craft.chainReadyCount}`
          : '합공보',
    );

    const totalUpLv =
      snapshot.upgradeLv.orthodox + snapshot.upgradeLv.unorthodox + snapshot.upgradeLv.demonic;
    this.setText(this.upgradeCostEl, `Lv.${totalUpLv}`);

    // 3. Reject notices
    for (let i = 0; i < snapshot.rejects.length; i++) {
      this.showToast(snapshot.rejects[i]!.reason, true);
    }

    // 4. Drag discard zone, selected unit bar & recommended ascension bar
    this.refreshDragDiscardZone(snapshot);
    this.refreshSelectedUnitBar(snapshot);
    this.refreshRecommendBar(snapshot);

    // 5. Active BottomSheet
    if (this.activeSheet) {
      this.refreshSheet(snapshot);
    }

    // 6. Boss Reward 3-Choice Roguelike Boon Modal
    this.refreshBoonModal(snapshot);

    // 7. Victory / Game Over Settlement Modal
    this.refreshSettlementModal(snapshot, waveStr);

    // 8. Interactive First-Run Tutorial Coach
    this.tutorial.sync(snapshot, this.isTutorialBlocked());
  }

  private refreshBoonModal(snapshot: UISnapshot): void {
    const offer = snapshot.pendingBoonOffer;
    if (!offer || snapshot.gameOver || snapshot.victoryHold) {
      if (this.prevBoonModalSig !== 'closed') {
        this.prevBoonModalSig = 'closed';
        this.boonModalEl.classList.remove('open');
        this.boonPeekPillEl.classList.remove('visible');
      }
      return;
    }

    if (offer.seq !== this.lastBoonOfferSeq) {
      this.lastBoonOfferSeq = offer.seq;
      this.boonMinimized = false;
      if (this.activeSheet) {
        this.closeSheet();
      }
    }

    const sig = `${offer.seq}:${offer.wave}:${this.boonMinimized ? 1 : 0}:${offer.options.map((id) => `${id}=${snapshot.activeBoons[id] ?? 0}`).join(',')}`;
    if (sig === this.prevBoonModalSig) {
      return;
    }
    this.prevBoonModalSig = sig;

    const offerWaveStr = String(offer.wave).padStart(2, '0');
    this.setText(this.boonTitleEl, `제 ${offerWaveStr} 장 비전 비급 3택 1`);
    this.setText(
      this.boonPeekPillEl,
      `☯ 제 ${offerWaveStr} 장 강호 기연 선택 대기중 — 비급 펼치기`,
    );

    if (this.boonMinimized) {
      this.boonModalEl.classList.remove('open');
      this.boonPeekPillEl.classList.add('visible');
      return;
    }

    this.boonPeekPillEl.classList.remove('visible');
    this.boonCardsEl.innerHTML = buildBoonCardsHtml(this.data, snapshot, offer);

    this.boonModalEl.classList.add('open');
  }

  private refreshDpsPanel(snapshot: UISnapshot): void {
    const meta = this.handlers.getMetaProfile();
    const dm = snapshot.damageMeter;
    const sig = `${meta.rev}:${dm.totalDamage}:${dm.entries.map((e) => `${e.unitId}=${e.damage}`).join(',')}`;
    if (sig === this.prevDpsSig) return;
    this.prevDpsSig = sig;

    this.setText(this.dpsTotalEl, `총 ${formatCompactNumber(dm.totalDamage)}`);
    this.dpsListEl.innerHTML = buildDpsListHtml(this.data, this.sprites, snapshot, meta);
  }

  private refreshSettlementModal(snapshot: UISnapshot, waveStr: string): void {
    if (!snapshot.victoryHold) {
      this.victoryDismissed = false;
    }
    if (!snapshot.gameOver) {
      this.gameOverDismissed = false;
    }

    const showVictory = snapshot.victoryHold && !this.victoryDismissed;
    const showDefeat = !showVictory && snapshot.gameOver && !this.gameOverDismissed;

    if (!showVictory && !showDefeat) {
      this.prevSettlementRenderedSig = '';
      this.gameOverModalEl.classList.remove('open');
      return;
    }

    const rec = this.handlers.getSettlementRecord();
    const diffCfg = DIFFICULTY_CONFIGS[snapshot.difficulty];
    const trialCfg = snapshot.trialId ? TRIAL_CONFIGS[snapshot.trialId] : null;
    this.gameOverCardEl.classList.toggle('victory-theme', showVictory || snapshot.victoryAchieved);

    if (showVictory) {
      this.setText(
        this.gameOverTitleEl,
        trialCfg ? '🏆 무림 비경 제패 · 출정 정산' : '🏆 천하통일 대승리 · 출정 정산',
      );
      this.setText(
        this.gameOverSubEl,
        trialCfg
          ? `제 ${waveStr} 장 [${trialCfg.name}] 시련 제패! (마물 ${snapshot.monstersSlain}기)`
          : `제 ${waveStr} 장 천마대제 토벌 완료! (${diffCfg.name} · 마물 ${snapshot.monstersSlain}기)`,
      );
      this.setText(
        this.gameOverEndlessBtnEl,
        `⚔ 무한 혈투 (${snapshot.clearTargetWave + 1}장~)`,
      );
      this.gameOverEndlessBtnEl.style.display = 'inline-flex';
      this.gameOverInspectBtnEl.style.display = 'none';
      this.setText(this.gameOverRestartBtnEl, '금의환향');
    } else {
      const titleTxt = snapshot.victoryAchieved
        ? '⚔ 무한 혈투 종료 · 최종 정산'
        : snapshot.gameOverReason === 'boss_timeout'
          ? '⏳ 영물 토벌 시간초과 · 정산'
          : '비무대 함락 · 출정 정산';
      this.setText(this.gameOverTitleEl, titleTxt);

      const reasonTag =
        snapshot.gameOverReason === 'boss_timeout'
          ? '제한시간 초과'
          : `마물 ${snapshot.monsterCap}기 돌파`;
      const modeTag = trialCfg ? `[${trialCfg.badge}] · ` : '';
      const subTxt = rec
        ? `${modeTag}제 ${waveStr} 장 도달${rec.isNewBest ? ' (최고 기록!)' : ''} · ${reasonTag} · 영물 ${rec.bossesSlain}기 토벌`
        : `${modeTag}제 ${waveStr} 장 · ${reasonTag}`;
      this.setText(this.gameOverSubEl, subTxt);

      this.gameOverEndlessBtnEl.style.display = 'none';
      this.gameOverInspectBtnEl.style.display = 'inline-flex';
      this.setText(this.gameOverRestartBtnEl, '재출정');
    }

    const sig = `${showVictory ? 'V' : 'D'}:${rec?.goldEarned ?? 0}:${rec?.keysEarned ?? 0}:${rec?.firstClearBonusSilk ?? 0}:${rec?.titleBonusGold ?? 0}:${rec?.titleBonusKeys ?? 0}:${rec?.titleBonusSilk ?? 0}:${rec?.totalGold ?? 0}:${rec?.firstClearBonusGold ?? 0}:${rec?.unlockedSkinIds.join(',') ?? ''}:${rec?.unlockedTitleIds.join(',') ?? ''}`;
    if (rec && sig !== this.prevSettlementRenderedSig) {
      this.prevSettlementRenderedSig = sig;
      this.gameOverLootEl.innerHTML = buildSettlementLootHtml(this.data, snapshot, rec);
    }

    this.gameOverModalEl.classList.add('open');
  }

  private refreshRelicBuffStrip(snapshot: UISnapshot, meta: MetaProfile): void {
    const vaultLv = snapshot.relics.golden_vault ?? 0;
    const vaultPct = snapshot.relicBonus.interestPct;
    const swordLv = snapshot.relics.million_sword_seal ?? 0;
    const swordBps = snapshot.relicBonus.wealthAtkBps;
    const boonStacks = snapshot.totalBoonStacks;
    const activeRelicCount = this.data.relics.filter((d) => (snapshot.relics[d.id] ?? 0) > 0).length;
    const equippedTitleId = meta.equippedTitle ?? '';
    const sig = `${equippedTitleId}:${vaultLv}:${vaultPct}:${swordLv}:${swordBps}:${boonStacks}:${activeRelicCount}:${meta.keys}`;
    if (sig === this.prevRelicStripSig) return;
    this.prevRelicStripSig = sig;

    const pills: string[] = [];
    if (meta.equippedTitle) {
      const titleDef = TITLES_BY_ID.get(meta.equippedTitle);
      if (titleDef) {
        pills.push(
          `<span class="relic-buff-pill hud-title-pill" data-open-titles="1" style="background:${titleDef.color}" title="장착 중인 강호 칭호: ${escapeHtml(titleDef.name)}">🏅 ${escapeHtml(titleDef.badge)}</span>`,
        );
      }
    }
    if (boonStacks > 0) {
      pills.push(
        `<span class="relic-buff-pill boon-active" data-open-boons="1" title="이번 출정 전수받은 강호 기연 보기">☯ 기연 ${boonStacks}중</span>`,
      );
    }
    if (vaultPct > 0) {
      const iconUrl = this.sprites.relicPortraitUrl('golden_vault', Math.max(1, vaultLv));
      pills.push(
        `<span class="relic-buff-pill vault"><img class="relic-mini-px" src="${iconUrl}" alt="" />금고 +${vaultPct}%</span>`,
      );
    }
    if (swordLv > 0 || swordBps > 0) {
      const iconUrl = this.sprites.relicPortraitUrl(
        'million_sword_seal',
        Math.max(1, swordLv),
      );
      const pctStr = (swordBps / 100).toFixed(1);
      pills.push(
        `<span class="relic-buff-pill sword"><img class="relic-mini-px" src="${iconUrl}" alt="" />쾌검 +${pctStr}%</span>`,
      );
    }
    const shownRelics = (vaultPct > 0 ? 1 : 0) + (swordLv > 0 || swordBps > 0 ? 1 : 0);
    const otherActiveCount = Math.max(0, activeRelicCount - shownRelics);
    if (otherActiveCount > 0) {
      const firstOther = this.data.relics.find(
        (d) =>
          (snapshot.relics[d.id] ?? 0) > 0 &&
          d.id !== 'golden_vault' &&
          d.id !== 'million_sword_seal',
      );
      const iconUrl = firstOther
        ? this.sprites.relicPortraitUrl(firstOther.id, snapshot.relics[firstOther.id] ?? 1)
        : '';
      const label = shownRelics > 0 ? `신물 +${otherActiveCount}` : `신물 ${activeRelicCount}종`;
      pills.push(
        `<span class="relic-buff-pill active-relics">${iconUrl ? `<img class="relic-mini-px" src="${iconUrl}" alt="" />` : ICON.chest}${label}</span>`,
      );
    }
    if (pills.length === 0) {
      if (meta.keys > 0) {
        pills.push(`<span class="relic-buff-pill key-ready">${ICON.key}기보함 ${meta.keys}개</span>`);
      } else {
        pills.push(`<span class="relic-buff-pill subtle">${ICON.chest}무림 신물</span>`);
      }
    }
    this.relicBuffStripEl.innerHTML = pills.join('');
  }

  public forceRefreshSelection(): void {
    if (this.lastSnapshot) {
      this.refreshDragDiscardZone(this.lastSnapshot);
      this.refreshSelectedUnitBar(this.lastSnapshot);
      this.refreshRecommendBar(this.lastSnapshot);
      this.tutorial.sync(this.lastSnapshot, this.isTutorialBlocked());
    }
  }

  private pickRecommendedRecipe(snapshot: UISnapshot): RecipeDef | null {
    let best: RecipeDef | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < this.recipeGraph.topo.length; i++) {
      const r = this.recipeGraph.recipesById.get(this.recipeGraph.topo[i]!);
      if (!r) continue;
      const st = snapshot.craft.recipes[r.id];
      if (!st) continue;
      const rank =
        this.data.gradesById.get(this.data.unitsById.get(r.output)?.grade ?? '')?.rank ?? 0;
      let score: number;
      if (st.lamp === 'ready') score = 3000 + rank * 10;
      else if (st.lamp === 'chainReady') score = 2000 + rank * 10;
      else score = (st.need > 0 ? st.have / st.need : 0) * 1000 + rank;
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    return best;
  }

  private refreshRecommendBar(snapshot: UISnapshot): void {
    const hasSelection = this.getSelectedSlotView(snapshot) !== null;
    if (hasSelection) {
      if (this.prevRecommendSignature !== 'hidden') {
        this.prevRecommendSignature = 'hidden';
        this.recommendBarEl.classList.remove('visible');
      }
      return;
    }

    const meta = this.handlers.getMetaProfile();
    const rec = this.pickRecommendedRecipe(snapshot);
    const st = rec ? snapshot.craft.recipes[rec.id] : undefined;
    const sig = `${meta.rev}:${rec?.id ?? 'none'}:${st?.lamp ?? ''}:${st?.have ?? 0}:${snapshot.craft.rev}:${snapshot.fieldOccupied + snapshot.benchOccupied}`;
    if (sig === this.prevRecommendSignature) return;
    this.prevRecommendSignature = sig;

    const outUnit = rec ? this.data.unitsById.get(rec.output) : undefined;
    const outGrade = outUnit ? this.data.gradesById.get(outUnit.grade) : undefined;
    if (!rec || !st || !outUnit || !outGrade) {
      this.recRecipeId = null;
      this.recommendBarEl.classList.remove('visible');
      return;
    }

    this.recRecipeId = rec.id;
    this.recommendBarEl.classList.add('visible');
    this.recImgEl.src = this.sprites.unitPortraitUrl(
      outUnit,
      outGrade,
      getEquippedSkinDef(this.data, outUnit.id, meta),
    );
    this.recImgEl.alt = outUnit.name;
    this.recGradeEl.textContent = outGrade.name;
    this.recGradeEl.style.backgroundColor = outGrade.color;
    this.recNameEl.textContent = outUnit.name;

    const unlocked = collectUnlockedCounts(snapshot);
    this.recIngsEl.innerHTML = rec.ingredients
      .map((ing) => {
        const u = this.data.unitsById.get(ing.unit);
        const g = u ? this.data.gradesById.get(u.grade) : undefined;
        if (!u || !g) return '';
        const owned = Math.min(ing.n, unlocked.get(ing.unit) ?? 0);
        const ok = owned >= ing.n;
        const cnt = ing.n > 1 ? `${owned}/${ing.n}` : ok ? '✓' : '✕';
        return `<span class="rec-ing ${ok ? 'ok' : 'miss'}"><img src="${this.sprites.unitPortraitUrl(u, g, getEquippedSkinDef(this.data, u.id, meta))}" alt="${escapeHtml(u.name)}" /><b>${cnt}</b></span>`;
      })
      .join('');

    const ready = st.lamp === 'ready';
    const chain = st.lamp === 'chainReady';
    this.recCtaEl.className = `rec-cta interactive${ready ? ' cta-ready' : chain ? ' cta-chain' : ''}`;
    this.recCtaEl.textContent = ready ? '합공!' : chain ? '연쇄 등선' : `${st.have}/${st.need}`;
    this.recommendBarEl.classList.toggle('rec-lit', ready || chain);
  }

  public showToast(message: string, isReject = false): void {
    const durationMs = isReject ? 1200 : 1680;
    const cur = this.activeToast;

    if (cur) {
      window.clearTimeout(cur.hideTimerId);
      if (cur.removeTimerId !== null) {
        window.clearTimeout(cur.removeTimerId);
        cur.removeTimerId = null;
      }

      if (cur.message === message) {
        cur.repeatCount = Math.min(99, cur.repeatCount + 1);
      } else {
        cur.message = message;
        cur.repeatCount = 1;
      }
      cur.isReject = isReject;
      cur.el.className = `toast-item show toast-bump${isReject ? ' reject' : ''}`;
      cur.el.textContent = cur.repeatCount >= 2 ? `${message} ×${cur.repeatCount}` : message;

      window.setTimeout(() => {
        cur.el.classList.remove('toast-bump');
      }, 150);

      cur.hideTimerId = window.setTimeout(() => {
        cur.el.classList.remove('show');
        cur.removeTimerId = window.setTimeout(() => {
          cur.el.remove();
          if (this.activeToast === cur) {
            this.activeToast = null;
          }
        }, 160);
      }, durationMs);
      return;
    }

    const item = document.createElement('div');
    item.className = isReject ? 'toast-item reject' : 'toast-item';
    item.textContent = message;
    this.toastLayerEl.replaceChildren(item);

    window.requestAnimationFrame(() => {
      item.classList.add('show');
    });

    const record: NonNullable<UIManager['activeToast']> = {
      el: item,
      message,
      isReject,
      repeatCount: 1,
      hideTimerId: 0,
      removeTimerId: null,
    };

    record.hideTimerId = window.setTimeout(() => {
      item.classList.remove('show');
      record.removeTimerId = window.setTimeout(() => {
        item.remove();
        if (this.activeToast === record) {
          this.activeToast = null;
        }
      }, 160);
    }, durationMs);

    this.activeToast = record;
  }

  private getSlotViewByRef(snapshot: UISnapshot | null, ref: SlotRef | null): SlotView | null {
    if (!snapshot || !ref) return null;
    return ref.area === 'field'
      ? (snapshot.field[ref.index] ?? null)
      : (snapshot.bench[ref.index] ?? null);
  }

  private getSelectedSlotView(snapshot: UISnapshot | null): SlotView | null {
    return this.getSlotViewByRef(snapshot, this.handlers.getSelectedSlot());
  }

  private refreshDragDiscardZone(snapshot: UISnapshot): void {
    const view = this.handlers.getDragDiscardView();
    if (!view.active || !view.fromSlot) {
      if (this.prevDiscardSig !== 'idle') {
        this.prevDiscardSig = 'idle';
        this.discardDropZoneEl.classList.remove('visible', 'is-hot', 'is-locked');
      }
      return;
    }

    const slotView = this.getSlotViewByRef(snapshot, view.fromSlot);
    if (!slotView) {
      if (this.prevDiscardSig !== 'idle') {
        this.prevDiscardSig = 'idle';
        this.discardDropZoneEl.classList.remove('visible', 'is-hot', 'is-locked');
      }
      return;
    }

    const sig = `${slotView.uid}:${slotView.locked ? 1 : 0}:${view.hot ? 1 : 0}:${slotView.sellCoin}:${slotView.sellLuck}:${slotView.sellLuckChancePct}`;
    if (sig === this.prevDiscardSig) return;
    this.prevDiscardSig = sig;

    this.discardDropZoneEl.classList.add('visible');
    this.discardDropZoneEl.classList.toggle('is-hot', view.hot && !slotView.locked);
    this.discardDropZoneEl.classList.toggle('is-locked', slotView.locked);

    if (slotView.locked) {
      this.setText(
        this.discardDropTextEl,
        `🔒 [${slotView.name}] 잠금 상태 — 먼저 잠금을 해제하세요`,
      );
      return;
    }

    const luckPart =
      slotView.sellLuck > 0
        ? ` · 영단 +${slotView.sellLuck}`
        : slotView.sellLuckChancePct > 0
          ? ` · 영단 ${slotView.sellLuckChancePct}%`
          : '';
    this.setText(
      this.discardDropTextEl,
      view.hot
        ? `🔥 놓아서 즉시 버리기! (+${slotView.sellCoin} 은자${luckPart})`
        : `🗑 여기에 놓아 버리기 (+${slotView.sellCoin} 은자${luckPart})`,
    );
  }

  private refreshSelectedUnitBar(snapshot: UISnapshot): void {
    const sel = this.handlers.getSelectedSlot();
    const slotView = this.getSelectedSlotView(snapshot);

    if (!sel || !slotView) {
      if (this.prevSelectSignature !== 'none') {
        this.prevSelectSignature = 'none';
        this.selectedBestAscendRecipe = null;
        this.unitSelectBarEl.classList.remove('visible');
      }
      return;
    }

    const meta = this.handlers.getMetaProfile();
    const sig = `${meta.rev}:${slotView.uid}:${slotView.locked}:${slotView.bonusAtk}:${slotView.tileBuffAtkPct}:${slotView.tileBuffSpeedPct}:${slotView.sealed ? 1 : 0}:${slotView.hazardWarning ? 1 : 0}:${sel.area}:${sel.index}:${snapshot.craft.rev}`;
    if (sig === this.prevSelectSignature) {
      return;
    }
    this.prevSelectSignature = sig;

    const unitDef = this.data.unitsById.get(slotView.unitId);
    const gradeDef = this.data.gradesById.get(slotView.grade);
    if (!unitDef || !gradeDef) return;

    const fMeta = FACTION_META[slotView.faction];
    const weaponProfile = getUnitCombatProfile(slotView.unitId);

    this.unitSelectBarEl.classList.add('visible');
    this.unitPortraitImgEl.src = this.sprites.unitPortraitUrl(
      unitDef,
      gradeDef,
      getEquippedSkinDef(this.data, unitDef.id, meta),
    );
    this.unitPortraitImgEl.alt = slotView.name;

    this.unitGradePillEl.textContent = gradeDef.name;
    this.unitGradePillEl.style.backgroundColor = gradeDef.color;
    this.unitFactionPillEl.textContent = fMeta.label;
    this.unitFactionPillEl.style.backgroundColor = fMeta.color;
    this.unitNameEl.textContent = slotView.name;

    const atkText =
      slotView.bonusAtk > 0
        ? `⚔ ${slotView.baseAtk + slotView.bonusAtk}(+${slotView.bonusAtk})`
        : `⚔ ${slotView.baseAtk}`;
    const statParts = [atkText, `◎${slotView.range}`];
    if (slotView.armorShred > 0) {
      statParts.push(`💥파갑${slotView.armorShred}`);
    }
    if (slotView.tileBuffAtkPct > 0 || slotView.tileBuffSpeedPct > 0) {
      statParts.push(
        `✦고무+${slotView.tileBuffAtkPct}%${slotView.tileBuffSpeedPct > 0 ? `/속+${slotView.tileBuffSpeedPct}%` : ''}`,
      );
    }
    this.unitStatEl.textContent = statParts.join(' · ');
    this.unitStatEl.title = `${weaponProfile.weaponLabel} · ${slotView.skillName}`;

    const upperRecipes = this.recipeGraph.byIngredient.get(slotView.unitId) ?? [];
    this.unitShortcutsEl.innerHTML = '';
    let bestAscend: { recipeId: string; chain: boolean; rank: number; label: string } | null = null;

    if (slotView.sealed) {
      const sealChip = document.createElement('span');
      sealChip.className = 'shortcut-chip hazard-chip sealed';
      sealChip.textContent = '⛓ 혈옥 봉인됨! 옆 칸으로 이동 시 해제';
      this.unitShortcutsEl.appendChild(sealChip);
    } else if (slotView.hazardWarning) {
      const warnChip = document.createElement('span');
      warnChip.className = 'shortcut-chip hazard-chip warn';
      warnChip.textContent = '🚨 주박 예고! 다른 칸으로 드래그 회피';
      this.unitShortcutsEl.appendChild(warnChip);
    }

    if (slotView.passiveTrait) {
      const passiveChip = document.createElement('span');
      passiveChip.className = 'shortcut-chip passive-chip';
      passiveChip.textContent = `✦ ${slotView.passiveTrait.name}: ${slotView.passiveTrait.desc}`;
      this.unitShortcutsEl.appendChild(passiveChip);
    }

    const weaponChip = document.createElement('span');
    weaponChip.className = 'shortcut-chip weapon-chip';
    weaponChip.textContent = `🗡 ${weaponProfile.weaponLabel}`;
    this.unitShortcutsEl.appendChild(weaponChip);

    if (slotView.supportAura) {
      const auraChip = document.createElement('span');
      auraChip.className = 'shortcut-chip aura-chip';
      const spdPart =
        slotView.supportAura.speedPct > 0 ? `·속+${slotView.supportAura.speedPct}%` : '';
      auraChip.textContent = `✦ 인접고무: 공+${slotView.supportAura.atkPct}%${spdPart}`;
      this.unitShortcutsEl.appendChild(auraChip);
    }

    if (upperRecipes.length === 0) {
      const doneChip = document.createElement('span');
      doneChip.className = 'shortcut-chip ready';
      doneChip.textContent = `★ 무림 지존 · ${slotView.skillName}`;
      this.unitShortcutsEl.appendChild(doneChip);
    } else {
      for (let i = 0; i < upperRecipes.length; i++) {
        const rec = upperRecipes[i]!;
        const outDef = this.data.unitsById.get(rec.output);
        const st = snapshot.craft.recipes[rec.id];
        if (!outDef || !st) continue;

        const isCraftable = st.lamp === 'ready' || st.lamp === 'chainReady';
        if (isCraftable && !slotView.locked) {
          const outRank = this.data.gradesById.get(outDef.grade)?.rank ?? 1;
          const score = (st.lamp === 'ready' ? 100 : 50) + outRank;
          if (!bestAscend || score > bestAscend.rank) {
            bestAscend = {
              recipeId: rec.id,
              chain: st.lamp === 'chainReady',
              rank: score,
              label: st.lamp === 'ready' ? '즉시합공' : '연쇄등선',
            };
          }
        }

        const isTriple = rec.ingredients.length === 1 && rec.ingredients[0]!.n >= 3;
        const routePrefix = isTriple ? '×3 ' : '';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `shortcut-chip interactive${isCraftable ? ' ready' : ''}`;
        btn.dataset.shortcutRecipe = rec.id;
        btn.textContent = isCraftable
          ? `⚡ ${routePrefix}${outDef.name}`
          : `${routePrefix}${outDef.name} ${st.have}/${st.need}`;
        this.unitShortcutsEl.appendChild(btn);
      }
    }

    if (bestAscend) {
      this.selectedBestAscendRecipe = {
        recipeId: bestAscend.recipeId,
        chain: bestAscend.chain,
      };
      this.unitAscendBtnEl.style.display = 'inline-flex';
      this.unitAscendBtnEl.innerHTML = `<span>⚡ 등선</span><span class="mini-price">${bestAscend.label}</span>`;
    } else {
      this.selectedBestAscendRecipe = null;
      this.unitAscendBtnEl.style.display = 'none';
    }

    this.unitLockBtnEl.classList.toggle('lock-on', slotView.locked);
    this.unitLockBtnEl.innerHTML = slotView.locked
      ? '<span>🔒</span><span>해제</span>'
      : '<span>🔓</span><span>잠금</span>';
    const luckRefundHtml =
      slotView.sellLuck > 0
        ? ` · ${ICON.elixir}+${slotView.sellLuck}`
        : slotView.sellLuckChancePct > 0
          ? ` · ${ICON.elixir}${slotView.sellLuckChancePct}%`
          : '';
    this.unitSellBtnEl.innerHTML = `<span>🗑 버리기</span><span class="mini-price">${ICON.coin}${slotView.sellCoin}${luckRefundHtml}</span>`;
  }

  private refreshSheet(snapshot: UISnapshot): void {
    const kind = this.activeSheet;
    if (!kind) return;
    if (kind === 'relic' && document.activeElement?.id === 'backup-code-input') {
      return;
    }

    const meta = this.handlers.getMetaProfile();
    const totalSlotsUsed = snapshot.fieldOccupied + snapshot.benchOccupied;
    const confirmArmed = this.abandonConfirmUntilMs > performance.now() ? 1 : 0;
    let sig = '';
    if (kind === 'craft') {
      sig = `craft:${meta.rev}:${this.craftTab}:${snapshot.craft.rev}:${totalSlotsUsed}`;
    } else if (kind === 'wisp') {
      const wispCountsSig = Object.entries(snapshot.wisps)
        .map(([k, v]) => `${k}=${v ?? 0}`)
        .join(',');
      sig = `wisp:${meta.rev}:${this.wispTab}:${wispCountsSig}:${snapshot.craft.rev}:${totalSlotsUsed}`;
    } else if (kind === 'gamble') {
      sig = `gamble:${meta.rev}:${snapshot.luckStone}:${snapshot.lastGambleResult?.seq ?? 0}:${snapshot.relicBonus.gambleBonusPct}:${totalSlotsUsed}`;
    } else if (kind === 'upgrade') {
      sig = `upgrade:${meta.rev}:${snapshot.coin}:${snapshot.luckStone}:${snapshot.upgradeLv.orthodox}:${snapshot.upgradeLv.unorthodox}:${snapshot.upgradeLv.demonic}:${snapshot.totalBoonStacks}:${meta.keys}:${meta.discoveredCount}`;
    } else if (kind === 'wardrobe') {
      sig = `wardrobe:${this.wardrobeSubTab}:${meta.rev}:${this.lastSkinPull?.seq ?? 0}`;
    } else if (kind === 'codex') {
      sig = `codex:${this.codexFilter}:${meta.rev}:${snapshot.difficulty}:${snapshot.trialId ?? 'std'}:${snapshot.craft.rev}`;
    } else if (kind === 'mission') {
      sig = `mission:${snapshot.missions.map((m) => `${m.id}=${m.progress}/${m.completed ? 1 : 0}`).join(',')}`;
    } else {
      sig = `relic:${this.relicFilter}:${meta.rev}:${snapshot.difficulty}:${snapshot.trialId ?? 'std'}:${snapshot.wave}:${snapshot.monstersSlain}:${snapshot.bossesSlain}:${snapshot.bounty.bountiesSlain}:${snapshot.coin}:${snapshot.victoryHold ? 1 : 0}:${snapshot.gameOver ? 1 : 0}:${this.lastRelicNotice?.seq ?? 0}:${confirmArmed}`;
    }

    if (sig === this.prevSheetSignature) {
      return;
    }
    this.prevSheetSignature = sig;

    if (kind === 'craft') {
      this.renderCraftSheet(snapshot, meta);
    } else if (kind === 'wisp') {
      this.renderWispSheet(snapshot, meta);
    } else if (kind === 'gamble') {
      this.renderGambleSheet(snapshot, meta);
    } else if (kind === 'upgrade') {
      this.renderUpgradeSheet(snapshot, meta);
    } else if (kind === 'wardrobe') {
      this.renderWardrobeSheet(meta);
    } else if (kind === 'codex') {
      this.renderCodexSheet(snapshot, meta);
    } else if (kind === 'mission') {
      this.renderMissionSheet(snapshot);
    } else {
      this.renderRelicSheet(snapshot, meta);
    }
  }

  private renderCraftSheet(snapshot: UISnapshot, meta: MetaProfile): void {
    const view = buildCraftSheetView({
      data: this.data,
      recipeGraph: this.recipeGraph,
      sprites: this.sprites,
      snapshot,
      meta,
      craftTabs: this.craftTabs,
      activeTab: this.craftTab,
    });
    this.setText(this.sheetTitleEl, '합공 · 등선');
    this.setText(this.sheetSubtitleEl, view.subtitle);
    this.sheetTabsEl.style.display = 'flex';
    this.sheetTabsEl.innerHTML = view.tabsHtml ?? '';
    this.sheetBodyEl.innerHTML = view.bodyHtml;
  }

  private renderWispSheet(snapshot: UISnapshot, meta: MetaProfile): void {
    const view = buildWispSheetView({
      data: this.data,
      recipeGraph: this.recipeGraph,
      sprites: this.sprites,
      snapshot,
      meta,
      wispTabs: this.wispTabs,
      activeTab: this.wispTab,
    });
    this.setText(this.sheetTitleEl, '기연 초빙');
    this.setText(this.sheetSubtitleEl, view.subtitle);
    this.sheetTabsEl.style.display = 'flex';
    this.sheetTabsEl.innerHTML = view.tabsHtml ?? '';
    this.sheetBodyEl.innerHTML = view.bodyHtml;
  }

  private renderGambleSheet(snapshot: UISnapshot, meta: MetaProfile): void {
    const view = buildGambleSheetView({
      data: this.data,
      sprites: this.sprites,
      snapshot,
      meta,
    });
    this.setText(this.sheetTitleEl, '영약 복용');
    this.setText(this.sheetSubtitleEl, view.subtitle);
    this.sheetTabsEl.style.display = 'none';
    this.sheetTabsEl.innerHTML = '';
    this.sheetBodyEl.innerHTML = view.bodyHtml;

    const res = snapshot.lastGambleResult;
    if (res && res.seq !== this.lastAnimatedGambleSeq) {
      this.lastAnimatedGambleSeq = res.seq;
      const bannerEl = document.getElementById('gamble-outcome-banner');
      if (bannerEl) {
        bannerEl.style.animation = 'none';
        void bannerEl.offsetWidth;
        bannerEl.style.animation = '';
      }
    }
  }

  private renderGrowthTabs(
    active: 'upgrade' | 'relic' | 'wardrobe' | 'codex',
    meta: MetaProfile,
  ): void {
    const hasRelicNotif =
      meta.keys > 0 ||
      (meta.gold >= RELIC_CHEST_GOLD_COST &&
        this.data.relics.some((d) => (meta.relics[d.id] ?? 0) < d.maxLevel));
    const relicDot = hasRelicNotif ? '<span class="sheet-tab-dot"></span>' : '';
    const totalSkins = this.data.heroSkins.length + this.data.courtSkins.length;
    const hasWardrobeNotif =
      hasUnownedGachaSkin(this.data, meta) && (meta.keys >= 1 || meta.gold >= SKIN_SINGLE_GOLD_COST);
    const wardrobeDot = hasWardrobeNotif ? '<span class="sheet-tab-dot"></span>' : '';
    this.sheetTabsEl.style.display = 'flex';
    this.sheetTabsEl.innerHTML = `
      <button type="button" class="sheet-tab-btn interactive${active === 'upgrade' ? ' active' : ''}" data-tab-id="sheet-upgrade">문파 내공</button>
      <button type="button" class="sheet-tab-btn interactive${active === 'relic' ? ' active' : ''}" data-tab-id="sheet-relic">무림 신물${relicDot}</button>
      <button type="button" class="sheet-tab-btn interactive${active === 'wardrobe' ? ' active' : ''}" data-tab-id="sheet-wardrobe">금수화장각 (${meta.ownedSkinCount}/${totalSkins})${wardrobeDot}</button>
      <button type="button" class="sheet-tab-btn interactive${active === 'codex' ? ' active' : ''}" data-tab-id="sheet-codex">명숙록 (${meta.discoveredCount}/${this.data.units.length})</button>
    `;
  }

  private renderUpgradeSheet(snapshot: UISnapshot, meta: MetaProfile): void {
    const view = buildUpgradeSheetView({
      data: this.data,
      sprites: this.sprites,
      snapshot,
      meta,
    });
    this.setText(this.sheetTitleEl, '내공 수련 · 강호 기연');
    this.setText(this.sheetSubtitleEl, view.subtitle);
    this.renderGrowthTabs('upgrade', meta);
    this.sheetBodyEl.innerHTML = view.bodyHtml;
  }

  private renderRelicSheet(snapshot: UISnapshot, meta: MetaProfile): void {
    const view = buildRelicPanelView({
      data: this.data,
      sprites: this.sprites,
      snapshot,
      meta,
      settledRec: this.handlers.getSettlementRecord(),
      lastRelicNotice: this.lastRelicNotice,
      relicFilter: this.relicFilter,
      backupInputDraft: this.backupInputDraft,
      confirmArmed: this.abandonConfirmUntilMs > performance.now(),
    });
    this.setText(this.sheetTitleEl, '무림 신물 · 기보고');
    this.setText(this.sheetSubtitleEl, view.subtitle);
    this.renderGrowthTabs('relic', meta);
    this.sheetBodyEl.innerHTML = view.bodyHtml;

    if (this.lastRelicNotice && this.lastRelicNotice.seq !== this.lastAnimatedRelicSeq) {
      this.lastAnimatedRelicSeq = this.lastRelicNotice.seq;
      const bannerEl = document.getElementById('relic-notice-banner');
      if (bannerEl) {
        bannerEl.style.animation = 'none';
        void bannerEl.offsetWidth;
        bannerEl.style.animation = '';
      }
    }
  }

  private renderWardrobeSheet(meta: MetaProfile): void {
    const view = buildWardrobePanelView({
      data: this.data,
      sprites: this.sprites,
      meta,
      subTab: this.wardrobeSubTab,
      lastSkinPull: this.lastSkinPull,
    });
    this.setText(this.sheetTitleEl, '금수화장각 · 전설 의복 & 비무대');
    this.setText(this.sheetSubtitleEl, view.subtitle);
    this.renderGrowthTabs('wardrobe', meta);
    this.sheetBodyEl.innerHTML = view.bodyHtml;

    if (this.lastSkinPull && this.lastSkinPull.seq !== this.lastAnimatedSkinSeq) {
      this.lastAnimatedSkinSeq = this.lastSkinPull.seq;
      const boxEl = document.getElementById('skin-pull-showcase');
      if (boxEl) {
        boxEl.style.animation = 'none';
        void boxEl.offsetWidth;
        boxEl.style.animation = '';
      }
    }
  }

  private renderMissionSheet(snapshot: UISnapshot): void {
    const view = buildMissionSheetView(this.data, snapshot);
    this.setText(this.sheetTitleEl, '강호 의뢰 · 밀서');
    this.setText(this.sheetSubtitleEl, view.subtitle);
    this.sheetTabsEl.style.display = 'none';
    this.sheetTabsEl.innerHTML = '';
    this.sheetBodyEl.innerHTML = view.bodyHtml;
  }

  private renderCodexSheet(snapshot: UISnapshot, meta: MetaProfile): void {
    const view = buildCodexPanelView({
      data: this.data,
      recipeGraph: this.recipeGraph,
      sprites: this.sprites,
      snapshot,
      meta,
      codexFilter: this.codexFilter,
    });
    this.setText(this.sheetTitleEl, '무림 명숙록 · 난이도 & 무림 비경');
    this.setText(this.sheetSubtitleEl, view.subtitle);
    this.renderGrowthTabs('codex', meta);
    this.sheetBodyEl.innerHTML = view.bodyHtml;
  }

  private setText(el: HTMLElement, next: string): void {
    if (this.prevTextCache.get(el) === next) return;
    this.prevTextCache.set(el, next);
    el.textContent = next;
  }

  private mustGet(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error(`[UIManager] Missing element #${id}`);
    }
    return el;
  }
}
