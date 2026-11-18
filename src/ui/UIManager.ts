import type { GameCommand, SlotRef } from '../core/CommandQueue';
import {
  DIFFICULTY_CONFIGS,
  DIFFICULTY_ORDER,
  formatCompactNumber,
  formatRelicStatSummary,
  getVaultInterestCap,
  getVaultInterestPct,
} from '../core/relicFormulas';
import type { SlotView, UISnapshot } from '../core/Simulation';
import { ticksToClock } from '../core/time';
import type { RecipeGraph } from '../craft/RecipeGraph';
import type {
  CourtSkinId,
  DifficultyId,
  FactionId,
  GameDataBundle,
  GradeId,
  HeroSkinDef,
  RecipeDef,
  RelicId,
  SkinRarity,
  SkinUnlockCond,
  UnitDef,
  UnitId,
  UpgradeGroupId,
} from '../data/types';
import {
  computeSettlementReward,
  getCodexDiscoveryReward,
  getRelicUpgradeGoldCost,
  type MetaProfile,
  RELIC_CHEST_GOLD_COST,
  type RelicDrawResult,
  type RelicUpgradeResult,
  type SettlementRecord,
  SKIN_MULTI5_GOLD_COST,
  SKIN_SINGLE_GOLD_COST,
  type SkinCraftResult,
  type SkinGachaResult,
  type SkinPullItem,
} from '../platform/MetaStore';
import type { SpriteCache } from '../render/SpriteCache';

export interface UIControlHandlers {
  onDispatch(cmd: GameCommand): void;
  onCycleSpeed(): void;
  onTogglePause(): void;
  isSoundMuted(): boolean;
  onToggleMute(): boolean;
  onSelectDifficulty(diff: DifficultyId): boolean;
  onEnterEndless(): void;
  onRestart(): void;
  onSettleAndRestart(): void;
  getMetaProfile(): MetaProfile;
  getSettlementRecord(): SettlementRecord | null;
  onDrawRelic(payWith: 'key' | 'gold'): RelicDrawResult;
  onUpgradeRelic(relicId: RelicId): RelicUpgradeResult;
  onDrawSkin(count: 1 | 5, payWith: 'gold' | 'key'): SkinGachaResult;
  onCraftSkin(skinId: string): SkinCraftResult;
  onEquipHeroSkin(unitId: UnitId, skinId: string | null): boolean;
  onEquipCourtSkin(courtId: CourtSkinId): boolean;
  onGrantDevMeta(): void;
  getSelectedSlot(): SlotRef | null;
  clearSelection(): void;
}

type SheetKind = 'craft' | 'wisp' | 'gamble' | 'upgrade' | 'relic' | 'wardrobe' | 'codex' | 'mission';
type CraftTabId = 'all' | GradeId;
type CodexFilterId = 'all' | FactionId;
type WardrobeSubTab = 'hero' | 'court';

const NORMAL_SYNC_INTERVAL_MS = 100; // Max 10Hz for non-priority HUD fields (AGENTS.md §4)

const GAMBLE_REP_UNIT: Readonly<Record<string, UnitId>> = {
  uncommon: 'plum_swordsman',
  rare: 'plum_elder',
  legendary: 'hwasan_master',
};

const UPGRADE_REP_UNIT: Readonly<Record<UpgradeGroupId, UnitId>> = {
  orthodox: 'hwasan_master',
  unorthodox: 'tang_patriarch',
  demonic: 'cheonma',
};

const FACTION_META: Readonly<Record<FactionId, { readonly label: string; readonly color: string }>> = {
  orthodox: { label: '정파', color: '#0284c7' },
  unorthodox: { label: '사파', color: '#15803d' },
  demonic: { label: '마교', color: '#be123c' },
};

const SKIN_RARITY_META: Readonly<
  Record<SkinRarity, { readonly label: string; readonly color: string; readonly rank: number }>
> = {
  achievement: { label: '한정업적', color: '#7c3aed', rank: 4 },
  mythic: { label: '신화', color: '#e11d48', rank: 3 },
  legendary: { label: '전설', color: '#d97706', rank: 2 },
  rare: { label: '명품', color: '#0284c7', rank: 1 },
};

const UNLOCK_COND_LABEL: Readonly<Record<SkinUnlockCond, string>> = {
  any_clear: '제 30 장 천하통일 제패 시 영구 해금',
  hell_clear: '아수라 혈겁 난이도 제 30 장 제패 시 영구 해금',
  wave_35: '무한 혈투 제 35 장 도달 시 영구 해금',
};

/** Inline Oriental Wuxia SVG game icons (thick #1a1224 ink outline + bright cel fill). */
const SVG_OPEN = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">';
const INK = '#1a1224';
const ICON = {
  // 엽전/은자 (Square-holed brass Oriental coin)
  coin: `${SVG_OPEN}<circle cx="12" cy="12" r="9.5" fill="#ffd23f" stroke="${INK}" stroke-width="2.4"/><circle cx="12" cy="12" r="6.8" fill="none" stroke="#d97706" stroke-width="1.5"/><rect x="8.8" y="8.8" width="6.4" height="6.4" rx="1" fill="${INK}"/><path d="M7.5 7.2l1.8-1.2" stroke="#fffbeb" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  // 천하주화 (Octagonal imperial gold coin with crimson jewel core)
  goldCoin: `${SVG_OPEN}<polygon points="8.2,2.5 15.8,2.5 21.5,8.2 21.5,15.8 15.8,21.5 8.2,21.5 2.5,15.8 2.5,8.2" fill="#fde047" stroke="${INK}" stroke-width="2.3" stroke-linejoin="round"/><polygon points="9.2,5.2 14.8,5.2 18.8,9.2 18.8,14.8 14.8,18.8 9.2,18.8 5.2,14.8 5.2,9.2" fill="#f59e0b" stroke="#b45309" stroke-width="1.2"/><circle cx="12" cy="12" r="3.4" fill="#e11d48" stroke="${INK}" stroke-width="1.8"/><circle cx="11" cy="11" r="1.1" fill="#fef08a"/></svg>`,
  // 기보함 열쇠 (Ornate golden treasury key with crimson tassel)
  key: `${SVG_OPEN}<circle cx="8" cy="9" r="5.2" fill="#fde047" stroke="${INK}" stroke-width="2.3"/><circle cx="8" cy="9" r="2" fill="${INK}"/><path d="M12.2 12l8.3 6.5M16.5 15.4l-2.2 2.8M19.5 17.7l-2.3 2.9" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/><path d="M12.2 12l8.3 6.5M16.5 15.4l-2.2 2.8M19.5 17.7l-2.3 2.9" stroke="#facc15" stroke-width="2.1" stroke-linecap="round"/><path d="M4.2 13.2l-1.7 4.2" stroke="#ef4444" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  // 운금비단 (Rolled imperial brocade silk bolt with golden sash)
  silk: `${SVG_OPEN}<rect x="3.5" y="6" width="17" height="12" rx="4" fill="#c084fc" stroke="${INK}" stroke-width="2.3"/><ellipse cx="7.5" cy="12" rx="2.7" ry="5.5" fill="#f3e8ff" stroke="${INK}" stroke-width="1.8"/><path d="M13 6v12" stroke="#facc15" stroke-width="2.8"/><path d="M11 12h4" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/></svg>`,
  // 전설 금의 (Imperial martial silk robe)
  robe: `${SVG_OPEN}<path d="M8 4l4 3.5L16 4l4.5 3.5-2.5 4.2-2-1.2V20H8v-9.5L6 11.7 3.5 7.5 8 4z" fill="#f43f5e" stroke="${INK}" stroke-width="2.3" stroke-linejoin="round"/><path d="M9.5 5.2L12 10l2.5-4.8" fill="none" stroke="#fef08a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="8" y="12.2" width="8" height="2.4" fill="#facc15" stroke="${INK}" stroke-width="1.5"/></svg>`,
  // 기보함 (Lacquered Wuxia relic chest)
  chest: `${SVG_OPEN}<rect x="3" y="8.5" width="18" height="12" rx="2.5" fill="#b45309" stroke="${INK}" stroke-width="2.3"/><path d="M3 9.5C3 6.5 6 5 12 5s9 1.5 9 4.5H3z" fill="#ef4444" stroke="${INK}" stroke-width="2.3" stroke-linejoin="round"/><rect x="3" y="10.5" width="18" height="2.6" fill="#facc15" stroke="${INK}" stroke-width="1.6"/><rect x="10" y="9.5" width="4" height="5" rx="1" fill="#fef08a" stroke="${INK}" stroke-width="1.8"/></svg>`,
  // 영단 (Glowing crimson-gold medicinal elixir pill)
  elixir: `${SVG_OPEN}<circle cx="12" cy="12.5" r="8.8" fill="#f43f5e" stroke="${INK}" stroke-width="2.4"/><path d="M6.5 14.5a7 7 0 0 0 11.2 1.2" fill="none" stroke="#9f1239" stroke-width="2.2" stroke-linecap="round"/><circle cx="9.4" cy="9.2" r="2.6" fill="#fef08a"/><circle cx="16.5" cy="6" r="2" fill="#4ade80" stroke="${INK}" stroke-width="1.6"/></svg>`,
  // 기연 비급 (Rolled jade-and-gold martial arts scroll)
  wisp: `${SVG_OPEN}<path d="M6 4.5h11a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5H6a2.5 2.5 0 0 1-2.5-2.5V7A2.5 2.5 0 0 1 6 4.5z" fill="#5eead4" stroke="${INK}" stroke-width="2.4"/><rect x="4" y="3.5" width="3.6" height="17" rx="1.6" fill="#facc15" stroke="${INK}" stroke-width="2"/><path d="M11 9h5M11 13h5M13.5 7v10" stroke="#0f766e" stroke-width="2" stroke-linecap="round"/></svg>`,
  // 초출강호 (Bamboo satgat + martial sword)
  summon: `${SVG_OPEN}<path d="M3 14.5L12 6l9 8.5H3z" fill="#fde047" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M6.5 14.5c1.5 3 3.5 4.5 5.5 4.5s4-1.5 5.5-4.5" fill="#fef3c7" stroke="${INK}" stroke-width="2.2"/><path d="M7.5 11.5h9" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  // 영약 호리병 (Double-bulb Wuxia elixir gourd)
  gourd: `${SVG_OPEN}<path d="M10.2 3h3.6v2.5h-3.6z" fill="#b45309" stroke="${INK}" stroke-width="2"/><circle cx="12" cy="8.5" r="4" fill="#4ade80" stroke="${INK}" stroke-width="2.3"/><circle cx="12" cy="16" r="5.8" fill="#22c55e" stroke="${INK}" stroke-width="2.4"/><path d="M8.2 11.6h7.6" stroke="#dc2626" stroke-width="2.6" stroke-linecap="round"/><circle cx="9.8" cy="14.5" r="1.5" fill="#dcfce7"/></svg>`,
  // 합공·등선 (Crossed jian & saber)
  swords: `${SVG_OPEN}<g stroke-linecap="round"><g stroke="${INK}" stroke-width="5.2"><path d="M4 4l11 11M20 4L9 15M14 18l4-4M6 14l4 4M17.5 17.5l2.5 2.5M6.5 17.5L4 20"/></g><g stroke="#f8fafc" stroke-width="2.4"><path d="M4 4l11 11M20 4L9 15"/></g><g stroke="#facc15" stroke-width="2.4"><path d="M14 18l4-4M6 14l4 4M17.5 17.5l2.5 2.5M6.5 17.5L4 20"/></g></g></svg>`,
  // 내공 수련 (Rising golden dantian qi flame)
  qi: `${SVG_OPEN}<path d="M12 2.2c3.8 4.4 6.8 7.5 6.8 11.8a6.8 6.8 0 0 1-13.6 0c0-2.8 1.5-5 3.2-6.6.3 1.7 1.1 2.8 2.2 3.1C10.2 7.8 10.8 5 12 2.2z" fill="#fb923c" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M12 10.5c1.9 2.1 3.2 3.5 3.2 5.2a3.2 3.2 0 0 1-6.4 0c0-1.6 1.2-3.1 3.2-5.2z" fill="#fef08a"/></svg>`,
  // 문파 대기석 (Oriental dancheong roof)
  pavilion: `${SVG_OPEN}<path d="M2.5 11.5L12 4l9.5 7.5H2.5z" fill="#ef4444" stroke="${INK}" stroke-width="2.3" stroke-linejoin="round"/><rect x="5.5" y="11.5" width="13" height="8" rx="1.5" fill="#fef3c7" stroke="${INK}" stroke-width="2.2"/><path d="M9.5 19.5v-5h5v5" fill="#991b1b" stroke="${INK}" stroke-width="1.8"/></svg>`,
} as const;

export class UIManager {
  private readonly root: HTMLElement;
  private readonly data: GameDataBundle;
  private readonly recipeGraph: RecipeGraph;
  private readonly sprites: SpriteCache;
  private readonly handlers: UIControlHandlers;

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
  private wardrobeSubTab: WardrobeSubTab = 'hero';
  private wispTab: GradeId;
  private readonly craftTabs: readonly { readonly id: CraftTabId; readonly label: string }[];
  private readonly wispTabs: readonly { readonly id: GradeId; readonly label: string }[];
  private devOpen = false;
  private gameOverDismissed = false;
  private victoryDismissed = false;
  private lastAnimatedGambleSeq = 0;
  private lastRelicNotice: {
    readonly text: string;
    readonly isWin: boolean;
    readonly seq: number;
    readonly relicId?: RelicId;
    readonly prevLevel?: number;
    readonly newLevel?: number;
    readonly isNew?: boolean;
  } | null = null;
  private relicNoticeSeq = 0;
  private lastAnimatedRelicSeq = 0;
  private lastSkinPull: {
    readonly items: readonly SkinPullItem[];
    readonly totalSilkRefund: number;
    readonly seq: number;
  } | null = null;
  private skinPullSeq = 0;
  private lastAnimatedSkinSeq = 0;

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
      .map((g) => ({ id: g.id, label: `${g.name} 기연` }));
    this.wispTab = this.wispTabs[0]?.id ?? data.grades[0]!.id;

    // External PNG pixel-sheet arrived (public/sprites/{id}.png) -> refresh DOM portraits.
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
    const mutedInit = this.handlers.isSoundMuted();
    this.root.innerHTML = `
      <header class="hud-bar" aria-label="무림 전황">
        <button id="hud-wave-box" type="button" class="wave-box interactive" title="출정 난이도 및 명숙록 보기">
          <span id="hud-wave-badge" class="wave-badge">제 01 장 · 초입</span>
          <span id="hud-wave-timer" class="wave-timer">00:28</span>
        </button>

        <div id="hud-monster-gauge" class="monster-gauge">
          <div class="monster-gauge-top">
            <span id="hud-monster-title" class="monster-gauge-title">침입 마물</span>
            <span id="hud-monster-count" class="monster-gauge-count">0 / 100</span>
          </div>
          <div class="monster-gauge-track">
            <div id="hud-monster-fill" class="monster-gauge-fill"></div>
          </div>
        </div>

        <div class="hud-controls">
          <button id="btn-relic" type="button" class="hud-btn relic-btn interactive" aria-label="무림 신물 기보고">
            ${ICON.chest}<span>기보</span>
            <span id="badge-relic" class="hud-mini-badge">0</span>
          </button>
          <button id="btn-speed" type="button" class="hud-btn interactive active" aria-label="배속">1x</button>
          <button id="btn-pause" type="button" class="hud-btn interactive" aria-label="일시정지">⏸</button>
          <button id="btn-mute" type="button" class="hud-btn mute-btn interactive${mutedInit ? ' muted' : ''}" aria-label="효과음 전환">${mutedInit ? '🔇' : '🔊'}</button>
          <button id="btn-dev" type="button" class="hud-btn dev-btn interactive" aria-label="개발자 메뉴">DEV</button>
        </div>
      </header>

      <div id="boss-hud-bar" class="boss-hud-bar" aria-live="polite">
        <div class="boss-hud-avatar">
          <img id="boss-hud-img" alt="" />
        </div>
        <div class="boss-hud-main">
          <div class="boss-hud-top">
            <span id="boss-hud-tag" class="boss-hud-tag">영물 강림</span>
            <span id="boss-hud-name" class="boss-hud-name">영물 백호</span>
            <span id="boss-hud-hp" class="boss-hud-hp">0 / 0</span>
          </div>
          <div class="boss-hud-track">
            <div id="boss-hud-trail" class="boss-hud-trail"></div>
            <div id="boss-hud-fill" class="boss-hud-fill"></div>
          </div>
        </div>
      </div>

      <nav id="tactical-strip" class="tactical-strip" aria-label="강호 전술 지휘">
        <button id="btn-bounty" type="button" class="tac-pill bounty interactive" title="강호 현상수배범 호출 (30초 내 처치 시 영단·은자 획득)">📜 수배 (2장~)</button>
        <button id="btn-mission" type="button" class="tac-pill mission interactive" title="강호 의뢰 목록">📋 의뢰 0/10</button>
        <button id="btn-dps" type="button" class="tac-pill dps interactive" title="실시간 협객 딜량 순위표">⚔ 딜량표</button>
        <button id="btn-wardrobe" type="button" class="tac-pill wardrobe interactive" title="금수화장각 — 의복·검기 스킨 뽑기 및 비무대 테마">👘 화장각 1/14</button>
        <button id="btn-codex" type="button" class="tac-pill codex interactive" title="무림 32인 명숙록 및 난이도">📖 명숙록 0/32</button>
      </nav>

      <aside id="dps-panel" class="dps-panel interactive" aria-label="실시간 협객 딜량표">
        <div class="dps-panel-head">
          <span class="dps-panel-title">⚔ 협객 딜량 순위</span>
          <span id="dps-total-val" class="dps-panel-total">총 0</span>
          <button id="btn-dps-close" type="button" class="dps-close-btn interactive" aria-label="닫기">✕</button>
        </div>
        <div id="dps-list" class="dps-list"></div>
      </aside>

      <aside id="dev-popover" class="dev-popover interactive" aria-label="개발자 도구">
        <div id="dev-sim-meta" class="dev-popover-meta">30Hz · Tick 0</div>
        <div class="dev-popover-grid">
          <button type="button" class="dev-chip-btn interactive" data-dev-action="coin">+500 은자</button>
          <button type="button" class="dev-chip-btn interactive" data-dev-action="luck">+5 영단</button>
          <button type="button" class="dev-chip-btn interactive" data-dev-action="wisp-common">+1 삼류 기연</button>
          <button type="button" class="dev-chip-btn interactive" data-dev-action="wisp-rare">+1 일류 기연</button>
          <button type="button" class="dev-chip-btn dev-span-2 interactive" data-dev-action="meta">+250 주화 · +2 열쇠 · +180 비단 (난이도 해금)</button>
        </div>
      </aside>

      <div id="toast-layer" class="toast-layer" aria-live="polite"></div>

      <div id="bench-badge" class="bench-badge">${ICON.pavilion}<span>문파 대기석</span><b id="val-bench-count">0/12</b></div>
      <button id="btn-auto-arrange" type="button" class="auto-arrange-btn interactive" title="비무대 빈칸 자동출전 및 대기석 서열 정렬">⚡ 자동출전·정렬</button>

      <div id="synergy-bar" class="synergy-bar" aria-label="출전 문파 진법 공명">
        <button id="btn-syn-orthodox" type="button" class="syn-pill syn-orthodox interactive" data-syn="orthodox" title="정파 북두검진">정<b id="syn-val-orthodox">0</b></button>
        <button id="btn-syn-unorthodox" type="button" class="syn-pill syn-unorthodox interactive" data-syn="unorthodox" title="사파 만독혈진">사<b id="syn-val-unorthodox">0</b></button>
        <button id="btn-syn-demonic" type="button" class="syn-pill syn-demonic interactive" data-syn="demonic" title="마교 천마혈진">마<b id="syn-val-demonic">0</b></button>
        <button id="btn-syn-trinity" type="button" class="syn-pill syn-trinity interactive" data-syn="trinity" title="삼재귀원 삼재합진">삼재</button>
      </div>

      <section id="recommend-bar" class="recommend-bar interactive" aria-label="추천 합공식">
        <span class="recommend-tag">등선 추천</span>
        <div class="unit-portrait-box rec-portrait"><img id="rec-img" alt="" /></div>
        <div class="rec-meta">
          <div class="unit-title-row">
            <span id="rec-grade" class="grade-pill">이류</span>
            <span id="rec-name" class="unit-name-label">-</span>
          </div>
          <div id="rec-ings" class="rec-ings"></div>
        </div>
        <button id="btn-rec-cta" type="button" class="rec-cta interactive">합공보</button>
      </section>

      <section id="unit-select-bar" class="unit-select-bar" aria-label="선택 협객">
        <div class="unit-select-left">
          <div class="unit-portrait-box">
            <img id="sel-unit-img" alt="" />
          </div>
          <div class="unit-meta-col">
            <div class="unit-title-row">
              <span id="sel-unit-grade" class="grade-pill">삼류</span>
              <span id="sel-unit-faction" class="grade-pill">정파</span>
              <span id="sel-unit-name" class="unit-name-label">화산 막내도사</span>
              <span id="sel-unit-stat" class="unit-stat-label">⚔ 27</span>
            </div>
            <div id="sel-unit-shortcuts" class="unit-recipe-shortcuts"></div>
          </div>
        </div>
        <div class="unit-select-actions">
          <button id="btn-unit-ascend" type="button" class="mini-3d-btn ascend-btn interactive">⚡ 등선</button>
          <button id="btn-unit-lock" type="button" class="mini-3d-btn interactive">잠금</button>
          <button id="btn-unit-sell" type="button" class="mini-3d-btn sell-btn interactive">하산</button>
        </div>
      </section>

      <footer class="bottom-dock" aria-label="무림 지휘 독">
        <div class="currency-bar">
          <div class="currency-group">
            <span class="currency-pill coin" title="은자">${ICON.coin}<span id="val-coin">0</span></span>
            <span class="currency-pill luck" title="영단">${ICON.elixir}<span id="val-luck">0</span></span>
            <span class="currency-pill wisp" title="기연 비급">${ICON.wisp}<span id="val-wisp">0</span></span>
          </div>
          <button id="relic-buff-strip" type="button" class="relic-buff-strip interactive" title="무림 신물 기보고 열기"></button>
          <span id="val-occupancy" class="slot-occupancy">비무대 0/18</span>
        </div>

        <div class="action-row">
          <button id="btn-summon" type="button" class="action-btn btn-summon interactive">
            <span class="action-icon">${ICON.summon}</span>
            <span class="action-title">초출강호</span>
            <span class="action-cost">${ICON.coin}<span id="val-summon-cost">20</span></span>
          </button>

          <button id="btn-gamble" type="button" class="action-btn btn-gamble interactive">
            <span id="badge-gamble" class="lamp-badge">0</span>
            <span class="action-icon">${ICON.gourd}</span>
            <span class="action-title">영약 복용</span>
            <span class="action-cost">${ICON.elixir}<span>1~4</span></span>
          </button>

          <button id="btn-wisp" type="button" class="action-btn btn-wisp interactive">
            <span id="badge-wisp" class="lamp-badge">0</span>
            <span class="action-icon">${ICON.wisp}</span>
            <span class="action-title">기연</span>
            <span class="action-cost">비급 초빙</span>
          </button>

          <button id="btn-craft" type="button" class="action-btn btn-craft interactive">
            <span id="badge-craft" class="lamp-badge">0</span>
            <span class="action-icon">${ICON.swords}</span>
            <span class="action-title">합공·등선</span>
            <span id="val-craft-state" class="action-cost">합공보</span>
          </button>

          <button id="btn-upgrade" type="button" class="action-btn btn-upgrade interactive">
            <span class="action-icon">${ICON.qi}</span>
            <span class="action-title">내공 수련</span>
            <span id="val-upgrade-state" class="action-cost">Lv.0</span>
          </button>
        </div>
      </footer>

      <div id="sheet-backdrop" class="sheet-backdrop interactive" role="dialog" aria-modal="true">
        <div id="bottom-sheet" class="bottom-sheet">
          <div class="sheet-header">
            <div class="sheet-title-wrap">
              <div id="sheet-title" class="sheet-title">합공 · 등선</div>
              <div id="sheet-subtitle" class="sheet-subtitle"></div>
            </div>
            <button id="btn-sheet-close" type="button" class="sheet-close-btn interactive" aria-label="닫기">✕</button>
          </div>
          <div id="sheet-tabs" class="sheet-tabs"></div>
          <div id="sheet-body" class="sheet-body"></div>
        </div>
      </div>

      <div id="gameover-modal" class="gameover-modal interactive" role="alertdialog" aria-modal="true">
        <div id="gameover-card" class="gameover-card">
          <div id="gameover-title" class="gameover-title">비무대 함락 · 출정 정산</div>
          <div id="gameover-sub" class="gameover-sub">제 01 장</div>
          <div id="gameover-loot" class="gameover-loot"></div>
          <div class="gameover-actions">
            <button id="btn-gameover-endless" type="button" class="card-cta-btn cta-crimson interactive">⚔ 무한 혈투 (31장~)</button>
            <button id="btn-gameover-inspect" type="button" class="card-cta-btn interactive">전장 확인</button>
            <button id="btn-gameover-relic" type="button" class="card-cta-btn cta-sky interactive">무림 신물</button>
            <button id="btn-gameover-restart" type="button" class="card-cta-btn cta-green interactive">재출정</button>
          </div>
        </div>
      </div>
    `;

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

  private bindEvents(): void {
    this.waveBoxEl.addEventListener('click', () => this.toggleSheet('codex'));
    this.relicBtnEl.addEventListener('click', () => this.toggleSheet('relic'));
    this.relicBuffStripEl.addEventListener('click', () => this.toggleSheet('relic'));
    this.speedBtnEl.addEventListener('click', () => this.handlers.onCycleSpeed());
    this.pauseBtnEl.addEventListener('click', () => this.handlers.onTogglePause());
    this.muteBtnEl.addEventListener('click', () => {
      const muted = this.handlers.onToggleMute();
      this.muteBtnEl.classList.toggle('muted', muted);
      this.setText(this.muteBtnEl, muted ? '🔇' : '🔊');
    });

    this.bountyBtnEl.addEventListener('click', () => {
      this.handlers.onDispatch({ type: 'callBounty' });
    });
    this.missionBtnEl.addEventListener('click', () => this.toggleSheet('mission'));
    this.dpsBtnEl.addEventListener('click', () => {
      this.dpsOpen = !this.dpsOpen;
      this.dpsBtnEl.classList.toggle('active', this.dpsOpen);
      this.dpsPanelEl.classList.toggle('open', this.dpsOpen);
      if (this.dpsOpen && this.lastSnapshot) {
        this.prevDpsSig = '';
        this.refreshDpsPanel(this.lastSnapshot);
      }
    });
    this.mustGet('btn-dps-close').addEventListener('click', () => {
      this.dpsOpen = false;
      this.dpsBtnEl.classList.remove('active');
      this.dpsPanelEl.classList.remove('open');
    });
    this.wardrobeBtnEl.addEventListener('click', () => this.toggleSheet('wardrobe'));
    this.codexBtnEl.addEventListener('click', () => this.toggleSheet('codex'));

    this.autoArrangeBtnEl.addEventListener('click', () => {
      this.handlers.onDispatch({ type: 'autoArrange' });
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
      } else if (act === 'wisp-common') {
        this.handlers.onDispatch({ type: 'grantTestResource', wispGrade: 'common' });
        this.showToast('DEV: +1 삼류 기연 지급');
      } else if (act === 'wisp-rare') {
        this.handlers.onDispatch({ type: 'grantTestResource', wispGrade: 'rare' });
        this.showToast('DEV: +1 일류 기연 지급');
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
      const chip = (ev.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-shortcut-recipe]');
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
      const btn = (ev.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-sheet-action]');
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
      } else if (action === 'relic-draw') {
        const payWith = btn.dataset.pay === 'key' ? 'key' : 'gold';
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
        if (this.lastSnapshot && diff === this.lastSnapshot.difficulty) {
          this.showToast(`현재 [${DIFFICULTY_CONFIGS[diff].name}] 난이도로 출정 중입니다.`);
          return;
        }
        const ok = this.handlers.onSelectDifficulty(diff);
        if (!ok) {
          this.showToast('이전 난이도 제 30 장을 먼저 제패해야 해금됩니다!', true);
        }
      } else if (action === 'codex-filter') {
        this.codexFilter = (btn.dataset.filter ?? 'all') as CodexFilterId;
        this.prevSheetSignature = '';
        if (this.lastSnapshot) this.refreshSheet(this.lastSnapshot);
      } else if (action === 'enter-endless') {
        this.victoryDismissed = true;
        this.closeSheet();
        this.gameOverModalEl.classList.remove('open');
        this.handlers.onEnterEndless();
      } else if (action === 'settle-run') {
        this.handlers.onSettleAndRestart();
      } else if (action === 'restart-run') {
        this.handlers.onRestart();
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
    }
  }

  public closeSheet(): void {
    this.activeSheet = null;
    this.prevSheetSignature = '';
    this.sheetBackdropEl.classList.remove('open');
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
      return;
    }
    this.lastSyncMs = nowMs;
    this.lastSnapshot = snapshot;
    const meta = this.handlers.getMetaProfile();

    // 1. Top HUD Wave, Difficulty & Boss status
    const waveStr = String(snapshot.wave).padStart(2, '0');
    const diffCfg = DIFFICULTY_CONFIGS[snapshot.difficulty];
    this.waveBoxEl.classList.toggle('boss-mode', snapshot.isBossWave);
    this.waveBoxEl.classList.toggle('endless-mode', snapshot.endlessMode);
    const prefix = snapshot.isBossWave ? '영물' : snapshot.endlessMode ? '혈투' : '제';
    const shortDiff = diffCfg.badge.split(' ')[0] ?? diffCfg.badge;
    this.setText(this.waveBadgeEl, `${prefix} ${waveStr}장 · ${shortDiff}`);
    this.setText(this.waveTimerEl, ticksToClock(snapshot.waveTicksLeft));
    this.setText(this.devSimMetaEl, `30Hz · Tick ${snapshot.tick} · ${diffCfg.badge}`);

    this.setText(this.monsterTitleEl, '침입 마물');
    this.setText(this.monsterCountEl, `${snapshot.monsterCount} / ${snapshot.monsterCap}`);
    const pct = Math.min(100, Math.max(0, (snapshot.monsterCount / snapshot.monsterCap) * 100));
    this.monsterFillEl.style.width = `${pct.toFixed(1)}%`;
    this.monsterGaugeBoxEl.classList.toggle('danger', pct >= 75);

    const hasBoss = Boolean(snapshot.boss);
    this.bossHudBarEl.classList.toggle('visible', hasBoss);
    this.bossHudBarEl.classList.toggle('bounty-mode', Boolean(snapshot.boss?.isBounty));
    this.tacticalStripEl.classList.toggle('boss-active', hasBoss);
    this.dpsPanelEl.classList.toggle('boss-active', hasBoss);
    this.toastLayerEl.classList.toggle('boss-active', hasBoss);

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
      this.setText(
        this.bossHudHpEl,
        `${Math.ceil(snapshot.boss.hp).toLocaleString('ko-KR')} / ${snapshot.boss.maxHp.toLocaleString('ko-KR')}`,
      );
      const bossPct = Math.min(
        100,
        Math.max(0, (snapshot.boss.hp / Math.max(1, snapshot.boss.maxHp)) * 100),
      );
      const wCss = `${bossPct.toFixed(1)}%`;
      this.bossHudFillEl.style.width = wCss;
      this.bossHudTrailEl.style.width = wCss;
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
    const hasUnownedGachaSkin = this.hasUnownedGachaSkin(meta);
    const canDrawSkinNow =
      hasUnownedGachaSkin && (meta.keys >= 1 || meta.gold >= SKIN_SINGLE_GOLD_COST);
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
        this.showToast('✦ 삼재귀원 『삼재합진』 발동! 전 협객 공격력 +18% · 공속 +10%');
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
      snapshot.upgradeLv.orthodox +
      snapshot.upgradeLv.unorthodox +
      snapshot.upgradeLv.demonic;
    this.setText(this.upgradeCostEl, `Lv.${totalUpLv}`);

    // 3. Reject notices
    for (let i = 0; i < snapshot.rejects.length; i++) {
      this.showToast(snapshot.rejects[i]!.reason, true);
    }

    // 4. Selected unit bar / recommended ascension bar
    this.refreshSelectedUnitBar(snapshot);
    this.refreshRecommendBar(snapshot);

    // 5. Active BottomSheet
    if (this.activeSheet) {
      this.refreshSheet(snapshot);
    }

    // 6. Victory / Game Over Settlement Modal
    this.refreshSettlementModal(snapshot, waveStr);
  }

  private getEquippedSkinDef(unitId: UnitId, meta: MetaProfile): HeroSkinDef | null {
    const skinId = meta.equippedHeroSkins[unitId];
    if (!skinId) return null;
    return this.data.heroSkinsById.get(skinId) ?? null;
  }

  private hasUnownedGachaSkin(meta: MetaProfile): boolean {
    for (let i = 0; i < this.data.heroSkins.length; i++) {
      const s = this.data.heroSkins[i]!;
      if (s.rarity !== 'achievement' && !s.unlockCond && !meta.ownedSkins[s.id]) {
        return true;
      }
    }
    for (let i = 0; i < this.data.courtSkins.length; i++) {
      const c = this.data.courtSkins[i]!;
      if (
        c.id !== 'court_bamboo_dawn' &&
        c.rarity !== 'achievement' &&
        !c.unlockCond &&
        !meta.ownedSkins[c.id]
      ) {
        return true;
      }
    }
    return false;
  }

  private buildUnitRoleBadgesHtml(u: UnitDef): string {
    const chips: string[] = [];
    if (u.supportAura) {
      const spdPart = u.supportAura.speedPct > 0 ? `·속+${u.supportAura.speedPct}%` : '';
      chips.push(
        `<span class="role-chip totem" title="${escapeHtml(u.supportAura.name)}: 비무대 십자 인접 아군 공격력 +${u.supportAura.atkPct}%${spdPart}">✦고무 +${u.supportAura.atkPct}%</span>`,
      );
    }
    if ((u.armorShred ?? 0) > 0) {
      chips.push(
        `<span class="role-chip shred" title="타격 시 마물 호신강기 -${u.armorShred} 파쇄 (중첩)">💥파갑 ${u.armorShred}</span>`,
      );
    }
    return chips.join('');
  }

  private refreshDpsPanel(snapshot: UISnapshot): void {
    const meta = this.handlers.getMetaProfile();
    const dm = snapshot.damageMeter;
    const sig = `${meta.rev}:${dm.totalDamage}:${dm.entries.map((e) => `${e.unitId}=${e.damage}`).join(',')}`;
    if (sig === this.prevDpsSig) return;
    this.prevDpsSig = sig;

    this.setText(this.dpsTotalEl, `총 ${formatCompactNumber(dm.totalDamage)}`);
    if (dm.entries.length === 0) {
      this.dpsListEl.innerHTML =
        '<div class="dps-empty">전투 개시 후 협객별 누적 피해량이 집계됩니다.</div>';
      return;
    }

    this.dpsListEl.innerHTML = dm.entries
      .map((entry, idx) => {
        const u = this.data.unitsById.get(entry.unitId);
        const g = u ? this.data.gradesById.get(u.grade) : undefined;
        const imgUrl =
          u && g ? this.sprites.unitPortraitUrl(u, g, this.getEquippedSkinDef(u.id, meta)) : '';
        const fColor = FACTION_META[entry.faction].color;
        return `
          <div class="dps-row">
            <span class="dps-rank">${idx + 1}</span>
            <div class="dps-avatar"><img src="${imgUrl}" alt="" /></div>
            <div class="dps-main">
              <div class="dps-meta-line">
                <span class="dps-name">${escapeHtml(entry.name)}</span>
                <span class="dps-val">${formatCompactNumber(entry.damage)} <b>(${entry.sharePct.toFixed(1)}%)</b></span>
              </div>
              <div class="dps-bar-track">
                <div class="dps-bar-fill" style="width:${Math.max(3, entry.sharePct).toFixed(1)}%;background:${fColor}"></div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
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
    this.gameOverCardEl.classList.toggle('victory-theme', showVictory || snapshot.victoryAchieved);

    if (showVictory) {
      this.setText(this.gameOverTitleEl, '🏆 천하통일 대승리 · 출정 정산');
      this.setText(
        this.gameOverSubEl,
        `제 ${waveStr} 장 천마대제 토벌 완료! (${diffCfg.name} · 마물 ${snapshot.monstersSlain}기)`,
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
      const subTxt = rec
        ? `제 ${waveStr} 장 도달${rec.isNewBest ? ' (최고 기록!)' : ''} · ${reasonTag} · 영물 ${rec.bossesSlain}기 토벌`
        : `제 ${waveStr} 장 · ${reasonTag}`;
      this.setText(this.gameOverSubEl, subTxt);

      this.gameOverEndlessBtnEl.style.display = 'none';
      this.gameOverInspectBtnEl.style.display = 'inline-flex';
      this.setText(this.gameOverRestartBtnEl, '재출정');
    }

    const sig = `${showVictory ? 'V' : 'D'}:${rec?.goldEarned ?? 0}:${rec?.keysEarned ?? 0}:${rec?.totalGold ?? 0}:${rec?.firstClearBonusGold ?? 0}:${rec?.unlockedSkinIds.join(',') ?? ''}`;
    if (rec && sig !== this.prevSettlementRenderedSig) {
      this.prevSettlementRenderedSig = sig;
      const multBadge =
        diffCfg.rewardMult > 1 ? ` <span class="settlement-mult-badge">${diffCfg.badge}</span>` : '';
      let firstClearBanner = '';
      if (rec.firstClearBonusGold > 0) {
        const nextDiffName = rec.unlockedNextDifficulty
          ? ` · [${DIFFICULTY_CONFIGS[rec.unlockedNextDifficulty].name}] 해금!`
          : '';
        firstClearBanner = `
          <div class="first-clear-banner">
            🎉 초회 천하통일 보너스 포함! (+${rec.firstClearBonusGold} 주화 · 열쇠 +${rec.firstClearBonusKeys}${escapeHtml(nextDiffName)})
          </div>
        `;
      }

      let skinUnlockBanner = '';
      if (rec.unlockedSkinIds.length > 0) {
        const names = rec.unlockedSkinIds.map(
          (id) =>
            this.data.heroSkinsById.get(id)?.name ??
            this.data.courtSkinsById.get(id as CourtSkinId)?.name ??
            id,
        );
        skinUnlockBanner = `
          <div class="first-clear-banner skin-unlock-banner">
            👘 한정 전설 외형 영구 해금! [${escapeHtml(names.join(', '))}]
          </div>
        `;
      }

      this.gameOverLootEl.innerHTML = `
        <div class="settlement-loot-title">출정 정산 영구 보상${multBadge}</div>
        ${firstClearBanner}
        ${skinUnlockBanner}
        <div class="settlement-loot-row">
          <div class="settlement-loot-item">
            ${ICON.goldCoin}
            <div class="settlement-loot-meta">
              <span class="settlement-loot-gain">+${rec.goldEarned.toLocaleString('ko-KR')} 천하주화</span>
              <span class="settlement-loot-total">보유 ${rec.totalGold.toLocaleString('ko-KR')}</span>
            </div>
          </div>
          <div class="settlement-loot-item">
            ${ICON.key}
            <div class="settlement-loot-meta">
              <span class="settlement-loot-gain">+${rec.keysEarned} 기보함 열쇠</span>
              <span class="settlement-loot-total">보유 ${rec.totalKeys}개</span>
            </div>
          </div>
        </div>
      `;
    }

    this.gameOverModalEl.classList.add('open');
  }

  private refreshRelicBuffStrip(snapshot: UISnapshot, meta: MetaProfile): void {
    const vaultLv = snapshot.relics.golden_vault ?? 0;
    const vaultPct = snapshot.relicBonus.interestPct;
    const swordLv = snapshot.relics.million_sword_seal ?? 0;
    const swordBps = snapshot.relicBonus.wealthAtkBps;
    const activeRelicCount = this.data.relics.filter((d) => (snapshot.relics[d.id] ?? 0) > 0).length;
    const sig = `${vaultLv}:${vaultPct}:${swordLv}:${swordBps}:${activeRelicCount}:${meta.keys}`;
    if (sig === this.prevRelicStripSig) return;
    this.prevRelicStripSig = sig;

    const pills: string[] = [];
    if (vaultPct > 0) {
      const iconUrl = this.sprites.relicPortraitUrl('golden_vault', Math.max(1, vaultLv));
      pills.push(
        `<span class="relic-buff-pill vault"><img class="relic-mini-px" src="${iconUrl}" alt="" />금고 +${vaultPct}%</span>`,
      );
    }
    if (swordLv > 0) {
      const iconUrl = this.sprites.relicPortraitUrl('million_sword_seal', swordLv);
      const pctStr = (swordBps / 100).toFixed(1);
      pills.push(
        `<span class="relic-buff-pill sword"><img class="relic-mini-px" src="${iconUrl}" alt="" />쾌검 +${pctStr}%</span>`,
      );
    }
    if (pills.length === 0 && activeRelicCount > 0) {
      const firstActive = this.data.relics.find((d) => (snapshot.relics[d.id] ?? 0) > 0);
      const iconUrl = firstActive
        ? this.sprites.relicPortraitUrl(firstActive.id, snapshot.relics[firstActive.id] ?? 1)
        : '';
      pills.push(
        `<span class="relic-buff-pill active-relics">${iconUrl ? `<img class="relic-mini-px" src="${iconUrl}" alt="" />` : ICON.chest}신물 ${activeRelicCount}종 발동</span>`,
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
      this.refreshSelectedUnitBar(this.lastSnapshot);
      this.refreshRecommendBar(this.lastSnapshot);
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
      const rank = this.data.gradesById.get(this.data.unitsById.get(r.output)?.grade ?? '')?.rank ?? 0;
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
      this.getEquippedSkinDef(outUnit.id, meta),
    );
    this.recImgEl.alt = outUnit.name;
    this.recGradeEl.textContent = outGrade.name;
    this.recGradeEl.style.backgroundColor = outGrade.color;
    this.recNameEl.textContent = outUnit.name;

    const unlocked = this.collectUnlockedCounts(snapshot);
    this.recIngsEl.innerHTML = rec.ingredients
      .map((ing) => {
        const u = this.data.unitsById.get(ing.unit);
        const g = u ? this.data.gradesById.get(u.grade) : undefined;
        if (!u || !g) return '';
        const owned = Math.min(ing.n, unlocked.get(ing.unit) ?? 0);
        const ok = owned >= ing.n;
        const cnt = ing.n > 1 ? `${owned}/${ing.n}` : ok ? '✓' : '✕';
        return `<span class="rec-ing ${ok ? 'ok' : 'miss'}"><img src="${this.sprites.unitPortraitUrl(u, g, this.getEquippedSkinDef(u.id, meta))}" alt="${escapeHtml(u.name)}" /><b>${cnt}</b></span>`;
      })
      .join('');

    const ready = st.lamp === 'ready';
    const chain = st.lamp === 'chainReady';
    this.recCtaEl.className = `rec-cta interactive${ready ? ' cta-ready' : chain ? ' cta-chain' : ''}`;
    this.recCtaEl.textContent = ready ? '합공!' : chain ? '연쇄 등선' : `${st.have}/${st.need}`;
    this.recommendBarEl.classList.toggle('rec-lit', ready || chain);
  }

  public showToast(message: string, isReject = false): void {
    const item = document.createElement('div');
    item.className = isReject ? 'toast-item reject' : 'toast-item';
    item.textContent = message;
    this.toastLayerEl.appendChild(item);

    window.requestAnimationFrame(() => {
      item.classList.add('show');
    });

    window.setTimeout(() => {
      item.classList.remove('show');
      window.setTimeout(() => {
        item.remove();
      }, 180);
    }, 1750);
  }

  private getSelectedSlotView(snapshot: UISnapshot | null): SlotView | null {
    if (!snapshot) return null;
    const sel = this.handlers.getSelectedSlot();
    if (!sel) return null;
    return sel.area === 'field'
      ? (snapshot.field[sel.index] ?? null)
      : (snapshot.bench[sel.index] ?? null);
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
    const sig = `${meta.rev}:${slotView.uid}:${slotView.locked}:${slotView.bonusAtk}:${slotView.tileBuffAtkPct}:${slotView.tileBuffSpeedPct}:${sel.area}:${sel.index}:${snapshot.craft.rev}`;
    if (sig === this.prevSelectSignature) {
      return;
    }
    this.prevSelectSignature = sig;

    const unitDef = this.data.unitsById.get(slotView.unitId);
    const gradeDef = this.data.gradesById.get(slotView.grade);
    if (!unitDef || !gradeDef) return;

    const fMeta = FACTION_META[slotView.faction];

    this.unitSelectBarEl.classList.add('visible');
    this.unitPortraitImgEl.src = this.sprites.unitPortraitUrl(
      unitDef,
      gradeDef,
      this.getEquippedSkinDef(unitDef.id, meta),
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
    this.unitStatEl.title = slotView.skillName;

    const upperRecipes = this.recipeGraph.byIngredient.get(slotView.unitId) ?? [];
    this.unitShortcutsEl.innerHTML = '';
    let bestAscend: { recipeId: string; chain: boolean; rank: number; label: string } | null = null;

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

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `shortcut-chip interactive${isCraftable ? ' ready' : ''}`;
        btn.dataset.shortcutRecipe = rec.id;
        btn.textContent = isCraftable ? `⚡ ${outDef.name}` : `${outDef.name} ${st.have}/${st.need}`;
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
    this.unitSellBtnEl.innerHTML = `<span>하산</span><span class="mini-price">${ICON.coin}${slotView.sellCoin}</span>`;
  }

  private refreshSheet(snapshot: UISnapshot): void {
    const kind = this.activeSheet;
    if (!kind) return;

    const meta = this.handlers.getMetaProfile();
    const totalSlotsUsed = snapshot.fieldOccupied + snapshot.benchOccupied;
    let sig = '';
    if (kind === 'craft') {
      sig = `craft:${meta.rev}:${this.craftTab}:${snapshot.craft.rev}:${totalSlotsUsed}`;
    } else if (kind === 'wisp') {
      sig = `wisp:${meta.rev}:${this.wispTab}:${snapshot.wisps.common ?? 0}:${snapshot.wisps.uncommon ?? 0}:${snapshot.wisps.rare ?? 0}:${snapshot.craft.rev}:${totalSlotsUsed}`;
    } else if (kind === 'gamble') {
      sig = `gamble:${meta.rev}:${snapshot.luckStone}:${snapshot.lastGambleResult?.seq ?? 0}:${snapshot.relicBonus.gambleBonusPct}:${totalSlotsUsed}`;
    } else if (kind === 'upgrade') {
      sig = `upgrade:${meta.rev}:${snapshot.coin}:${snapshot.luckStone}:${snapshot.upgradeLv.orthodox}:${snapshot.upgradeLv.unorthodox}:${snapshot.upgradeLv.demonic}:${meta.keys}:${meta.discoveredCount}`;
    } else if (kind === 'wardrobe') {
      sig = `wardrobe:${this.wardrobeSubTab}:${meta.rev}:${this.lastSkinPull?.seq ?? 0}`;
    } else if (kind === 'codex') {
      sig = `codex:${this.codexFilter}:${meta.rev}:${snapshot.difficulty}:${snapshot.craft.rev}`;
    } else if (kind === 'mission') {
      sig = `mission:${snapshot.missions.map((m) => `${m.id}=${m.progress}/${m.completed ? 1 : 0}`).join(',')}`;
    } else {
      sig = `relic:${meta.rev}:${snapshot.wave}:${snapshot.monstersSlain}:${snapshot.bossesSlain}:${snapshot.bounty.bountiesSlain}:${snapshot.coin}:${snapshot.victoryHold ? 1 : 0}:${snapshot.gameOver ? 1 : 0}:${this.lastRelicNotice?.seq ?? 0}`;
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

  private collectUnlockedCounts(snapshot: UISnapshot): Map<UnitId, number> {
    const counts = new Map<UnitId, number>();
    for (let i = 0; i < snapshot.field.length; i++) {
      const s = snapshot.field[i];
      if (s && !s.locked) {
        counts.set(s.unitId, (counts.get(s.unitId) ?? 0) + 1);
      }
    }
    for (let i = 0; i < snapshot.bench.length; i++) {
      const s = snapshot.bench[i];
      if (s && !s.locked) {
        counts.set(s.unitId, (counts.get(s.unitId) ?? 0) + 1);
      }
    }
    return counts;
  }

  private renderCraftSheet(snapshot: UISnapshot, meta: MetaProfile): void {
    this.setText(this.sheetTitleEl, '합공 · 등선');
    this.setText(
      this.sheetSubtitleEl,
      `즉시 합공 ${snapshot.craft.readyCount} · 연쇄 등선 ${snapshot.craft.chainReadyCount}`,
    );

    this.sheetTabsEl.style.display = 'flex';
    this.sheetTabsEl.innerHTML = this.craftTabs
      .map((tab) => {
        const active = this.craftTab === tab.id ? ' active' : '';
        let hasReady = false;
        if (tab.id === 'all') {
          hasReady = snapshot.craft.readyCount + snapshot.craft.chainReadyCount > 0;
        } else {
          const gStat = snapshot.craft.byGrade[tab.id];
          hasReady = Boolean(gStat && gStat.ready + gStat.chainReady > 0);
        }
        const dot = hasReady ? '<span class="sheet-tab-dot"></span>' : '';
        return `<button type="button" class="sheet-tab-btn interactive${active}" data-tab-id="${tab.id}">${escapeHtml(tab.label)}${dot}</button>`;
      })
      .join('');

    const unlocked = this.collectUnlockedCounts(snapshot);

    const allRecipes: RecipeDef[] = [];
    for (let i = 0; i < this.recipeGraph.topo.length; i++) {
      const r = this.recipeGraph.recipesById.get(this.recipeGraph.topo[i]!);
      if (r) allRecipes.push(r);
    }

    const readyList = allRecipes
      .filter((r) => {
        const st = snapshot.craft.recipes[r.id];
        return st && (st.lamp === 'ready' || st.lamp === 'chainReady');
      })
      .sort((a, b) => {
        const rankA = this.data.gradesById.get(this.data.unitsById.get(a.output)?.grade ?? '')?.rank ?? 0;
        const rankB = this.data.gradesById.get(this.data.unitsById.get(b.output)?.grade ?? '')?.rank ?? 0;
        return rankB !== rankA ? rankB - rankA : a.priority - b.priority;
      });

    const readyIds = new Set(readyList.map((r) => r.id));

    const restRecipes = allRecipes.filter((r) => {
      const outUnit = this.data.unitsById.get(r.output);
      if (!outUnit) return false;
      if (this.craftTab === 'all') {
        return !readyIds.has(r.id);
      }
      return outUnit.grade === this.craftTab;
    });

    const parts: string[] = [];

    if (readyList.length > 0 && this.craftTab === 'all') {
      parts.push('<div class="sheet-section-label">⚡ 지금 합공 · 등선 가능</div>');
      for (let i = 0; i < readyList.length; i++) {
        parts.push(this.buildRecipeCardHtml(readyList[i]!, snapshot, unlocked, meta));
      }
    }

    const sectionTitle =
      this.craftTab === 'all'
        ? '전체 무림 합공보'
        : `${this.craftTabs.find((t) => t.id === this.craftTab)?.label ?? ''} 경지 합공보`;
    parts.push(`<div class="sheet-section-label">${escapeHtml(sectionTitle)}</div>`);

    for (let i = 0; i < restRecipes.length; i++) {
      parts.push(this.buildRecipeCardHtml(restRecipes[i]!, snapshot, unlocked, meta));
    }

    this.sheetBodyEl.innerHTML = parts.join('');
  }

  private buildRecipeCardHtml(
    recipe: RecipeDef,
    snapshot: UISnapshot,
    unlocked: ReadonlyMap<UnitId, number>,
    meta: MetaProfile,
  ): string {
    const outUnit = this.data.unitsById.get(recipe.output);
    if (!outUnit) return '';
    const outGrade = this.data.gradesById.get(outUnit.grade);
    if (!outGrade) return '';

    const fMeta = FACTION_META[outUnit.faction];
    const st = snapshot.craft.recipes[recipe.id];
    const lamp = st?.lamp ?? 'none';
    const cardStateClass =
      lamp === 'ready' ? ' card-ready' : lamp === 'chainReady' ? ' card-chain' : '';

    const portraitUrl = this.sprites.unitPortraitUrl(
      outUnit,
      outGrade,
      this.getEquippedSkinDef(outUnit.id, meta),
    );
    const roleBadges = this.buildUnitRoleBadgesHtml(outUnit);

    const ingChips = recipe.ingredients
      .map((ing) => {
        const ingUnit = this.data.unitsById.get(ing.unit);
        if (!ingUnit) return '';
        const ingGrade = this.data.gradesById.get(ingUnit.grade);
        const ingImg = ingGrade
          ? this.sprites.unitPortraitUrl(ingUnit, ingGrade, this.getEquippedSkinDef(ingUnit.id, meta))
          : '';
        const owned = unlocked.get(ing.unit) ?? 0;
        const ok = owned >= ing.n;
        const statusText = ok ? (ing.n > 1 ? `${ing.n}/${ing.n}` : '✓') : `${owned}/${ing.n}`;
        return `<span class="ing-chip ${ok ? 'ing-ok' : 'ing-miss'}"><img src="${ingImg}" alt="" /><span>${escapeHtml(ingUnit.name)}</span><b>${statusText}</b></span>`;
      })
      .join('');

    let ctaHtml = '';
    if (lamp === 'ready') {
      ctaHtml = `<button type="button" class="card-cta-btn interactive" data-sheet-action="craft" data-recipe-id="${recipe.id}" data-chain="0"><span>합공</span></button>`;
    } else if (lamp === 'chainReady') {
      ctaHtml = `<button type="button" class="card-cta-btn cta-sky interactive" data-sheet-action="craft" data-recipe-id="${recipe.id}" data-chain="1"><span>연쇄 등선</span></button>`;
    } else {
      ctaHtml = `<button type="button" class="card-cta-btn cta-disabled" disabled><span>${st?.have ?? 0}/${st?.need ?? recipe.ingredients.length}</span></button>`;
    }

    return `
      <div class="sheet-card${cardStateClass}">
        <div class="card-left">
          <div class="card-avatar"><img src="${portraitUrl}" alt="" /></div>
          <div class="card-info">
            <div class="card-name-row">
              <span class="grade-pill" style="background:${outGrade.color}">${escapeHtml(outGrade.name)}</span>
              <span class="grade-pill" style="background:${fMeta.color}">${fMeta.label}</span>
              <span class="card-name">${escapeHtml(outUnit.name)}</span>
              ${roleBadges}
              <span class="card-sub">⚔${outUnit.atk} · ${escapeHtml(outUnit.skill.name)}</span>
            </div>
            <div class="ing-list">${ingChips}</div>
          </div>
        </div>
        ${ctaHtml}
      </div>
    `;
  }

  private renderWispSheet(snapshot: UISnapshot, meta: MetaProfile): void {
    const totalWisps = Object.values(snapshot.wisps).reduce((s, n) => s + (n ?? 0), 0);
    this.setText(this.sheetTitleEl, '기연 초빙');
    this.setText(this.sheetSubtitleEl, `비급 초빙권 ${totalWisps}장`);

    this.sheetTabsEl.style.display = 'flex';
    this.sheetTabsEl.innerHTML = this.wispTabs
      .map((tab) => {
        const cnt = snapshot.wisps[tab.id] ?? 0;
        const active = this.wispTab === tab.id ? ' active' : '';
        const dot = cnt > 0 ? '<span class="sheet-tab-dot"></span>' : '';
        return `<button type="button" class="sheet-tab-btn interactive${active}" data-tab-id="${tab.id}">${escapeHtml(tab.label)} (${cnt})${dot}</button>`;
      })
      .join('');

    const gradeCount = snapshot.wisps[this.wispTab] ?? 0;
    const hasFreeSlot = snapshot.fieldOccupied + snapshot.benchOccupied < 30;
    const unlocked = this.collectUnlockedCounts(snapshot);

    const pool = this.data.wispPools[this.wispTab] ?? [];
    const hints = snapshot.wispHints[this.wispTab];
    const hintMap = new Map<UnitId, { completes?: string; gain: number }>();
    if (hints) {
      for (let i = 0; i < hints.length; i++) {
        const h = hints[i]!;
        hintMap.set(h.unitId, h);
      }
    }

    const orderedUnitIds: UnitId[] = hints
      ? hints.map((h) => h.unitId)
      : [...pool];

    const cardsHtml = orderedUnitIds
      .map((uid) => {
        const u = this.data.unitsById.get(uid);
        if (!u) return '';
        const g = this.data.gradesById.get(u.grade);
        if (!g) return '';
        const fMeta = FACTION_META[u.faction];
        const portrait = this.sprites.unitPortraitUrl(u, g, this.getEquippedSkinDef(u.id, meta));
        const owned = unlocked.get(uid) ?? 0;
        const hint = hintMap.get(uid);
        const roleBadges = this.buildUnitRoleBadgesHtml(u);

        let hintBadge = `<span class="grade-pill" style="background:${fMeta.color}">${fMeta.label}</span>`;
        let recommendClass = '';
        if (hint?.completes) {
          const completedOut = this.recipeGraph.recipesById.get(hint.completes)?.output;
          const outName = completedOut ? (this.data.unitsById.get(completedOut)?.name ?? '상위 고수') : '상위 고수';
          hintBadge = `<span class="hint-pill">⚡ ${escapeHtml(outName)}</span>`;
          recommendClass = ' wisp-recommend';
        } else if (hint && hint.gain > 0) {
          hintBadge += ' <span class="hint-pill sub">인연 재료</span>';
        }

        const canSummon = gradeCount > 0 && hasFreeSlot;
        const btnLabel = !hasFreeSlot ? '가득참' : gradeCount > 0 ? '초빙' : '기연 0';

        return `
          <div class="wisp-card${recommendClass}">
            <div class="card-left">
              <div class="card-avatar"><img src="${portrait}" alt="" /></div>
              <div class="card-info">
                <div class="card-name-row">
                  <span class="card-name">${escapeHtml(u.name)}</span>
                  ${hintBadge}
                  ${roleBadges}
                </div>
                <div class="card-sub">보유 ${owned} · ⚔${u.atk}</div>
              </div>
            </div>
            <button
              type="button"
              class="card-cta-btn ${canSummon ? 'cta-sky interactive' : 'cta-disabled'}"
              data-sheet-action="wisp"
              data-grade="${this.wispTab}"
              data-unit-id="${u.id}"
              ${canSummon ? '' : 'disabled'}
            >
              <span>${btnLabel}</span>
              <span class="mini-price">${ICON.wisp}1</span>
            </button>
          </div>
        `;
      })
      .join('');

    this.sheetBodyEl.innerHTML = `<div class="wisp-grid">${cardsHtml}</div>`;
  }

  private renderGambleSheet(snapshot: UISnapshot, meta: MetaProfile): void {
    const furnaceBonus = snapshot.relicBonus.gambleBonusPct;
    const furnaceRefund = snapshot.relicBonus.gambleRefundPct;
    this.setText(this.sheetTitleEl, '영약 복용');
    this.setText(
      this.sheetSubtitleEl,
      furnaceBonus > 0
        ? `보유 영단 ${snapshot.luckStone}개 · 만년단로 성공률 +${furnaceBonus}% / 실패 환급 ${furnaceRefund}%`
        : `보유 영단 ${snapshot.luckStone}개`,
    );
    this.sheetTabsEl.style.display = 'none';
    this.sheetTabsEl.innerHTML = '';

    const res = snapshot.lastGambleResult;
    let bannerClass = 'gamble-result-box';
    let bannerText = '🧪 영약을 복용해 환골탈태의 경지에 도전하세요!';

    if (res) {
      const gName = this.data.gradesById.get(res.tier)?.name ?? res.tier;
      if (res.success && res.unitId) {
        const uName = this.data.unitsById.get(res.unitId)?.name ?? res.unitId;
        bannerClass = 'gamble-result-box win';
        bannerText = `✨ 환골탈태 대성공! [${gName}] ${uName}`;
      } else if (res.refundedLuck) {
        bannerClass = 'gamble-result-box win';
        bannerText = `🔥 주화입마! 만년단로가 영단 1개를 환급했습니다 (${gName})`;
      } else {
        bannerClass = 'gamble-result-box lose';
        bannerText = `🩸 주화입마! 기혈이 역류했습니다 (${gName})`;
      }
    }

    const hasFreeSlot = snapshot.fieldOccupied + snapshot.benchOccupied < 30;

    const rateCards = this.data.gambleRates
      .map((rate) => {
        const gradeDef = this.data.gradesById.get(rate.tier);
        const repId = GAMBLE_REP_UNIT[rate.tier] ?? 'plum_swordsman';
        const repUnit = this.data.unitsById.get(repId);
        const portrait =
          repUnit && gradeDef
            ? this.sprites.unitPortraitUrl(repUnit, gradeDef, this.getEquippedSkinDef(repUnit.id, meta))
            : '';

        const canRoll = snapshot.luckStone >= rate.costLuck && hasFreeSlot;
        const btnText = !hasFreeSlot ? '가득참' : snapshot.luckStone >= rate.costLuck ? '복용!' : '영단 부족';
        const effectivePct = Math.min(95, rate.chancePct + furnaceBonus);
        const pctLabel =
          furnaceBonus > 0
            ? `환골탈태 ${effectivePct}% (+${furnaceBonus}%)`
            : `환골탈태 ${rate.chancePct}%`;

        return `
          <div class="sheet-card">
            <div class="card-left">
              <div class="card-avatar"><img src="${portrait}" alt="" /></div>
              <div class="card-info">
                <div class="card-name-row">
                  <span class="grade-pill" style="background:${gradeDef?.color ?? '#16a34a'}">${escapeHtml(gradeDef?.name ?? rate.tier)}</span>
                  <span class="card-name">${escapeHtml(rate.label)}</span>
                </div>
                <div class="card-sub"><span class="rate-pct">${pctLabel}</span> · ${escapeHtml(rate.desc)}</div>
              </div>
            </div>
            <button
              type="button"
              class="card-cta-btn ${canRoll ? 'cta-green interactive' : 'cta-disabled'}"
              data-sheet-action="gamble"
              data-tier="${rate.tier}"
              ${canRoll ? '' : 'disabled'}
            >
              <span>${btnText}</span>
              <span class="mini-price">${ICON.elixir}${rate.costLuck}</span>
            </button>
          </div>
        `;
      })
      .join('');

    this.sheetBodyEl.innerHTML = `
      <div id="gamble-outcome-banner" class="${bannerClass}">${escapeHtml(bannerText)}</div>
      ${rateCards}
    `;

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
      this.hasUnownedGachaSkin(meta) && (meta.keys >= 1 || meta.gold >= SKIN_SINGLE_GOLD_COST);
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
    this.setText(this.sheetTitleEl, '내공 수련');
    this.setText(
      this.sheetSubtitleEl,
      `보유 은자 ${snapshot.coin.toLocaleString('ko-KR')} · 정파 내공 / 사파 외공 / 마교 마공`,
    );
    this.renderGrowthTabs('upgrade', meta);

    const cards = this.data.upgrades
      .map((up) => {
        const lv = snapshot.upgradeLv[up.id] ?? 0;
        const isMax = lv >= up.maxLevel;
        const cost = up.baseCost + lv * up.costStep;
        const icon = up.currency === 'coin' ? ICON.coin : ICON.elixir;
        const affordable = up.currency === 'coin' ? snapshot.coin >= cost : snapshot.luckStone >= cost;

        const fMeta = FACTION_META[up.faction];
        const repUnit = this.data.unitsById.get(UPGRADE_REP_UNIT[up.id]);
        const repGrade = repUnit ? this.data.gradesById.get(repUnit.grade) : undefined;
        const portrait =
          repUnit && repGrade
            ? this.sprites.unitPortraitUrl(repUnit, repGrade, this.getEquippedSkinDef(repUnit.id, meta))
            : '';

        const curPct = lv * up.atkBonusPctPerLv;
        const nextPct = Math.min(up.maxLevel, lv + 1) * up.atkBonusPctPerLv;

        return `
          <div class="sheet-card">
            <div class="card-left">
              <div class="card-avatar"><img src="${portrait}" alt="" /></div>
              <div class="card-info">
                <div class="card-name-row">
                  <span class="grade-pill" style="background:${fMeta.color}">${fMeta.label} · Lv.${lv}</span>
                  <span class="card-name">${escapeHtml(up.name)}</span>
                </div>
                <div class="card-sub">
                  ${escapeHtml(up.desc)} · ${isMax ? `공격력 +${curPct}% (극의)` : `공격력 +${curPct}% → <b class="up-next">+${nextPct}%</b>`}
                </div>
              </div>
            </div>
            <button
              type="button"
              class="card-cta-btn ${!isMax && affordable ? 'interactive' : 'cta-disabled'}"
              data-sheet-action="upgrade"
              data-group="${up.id}"
              ${!isMax && affordable ? '' : 'disabled'}
            >
              <span>${isMax ? '극의' : '수련'}</span>
              ${isMax ? '' : `<span class="mini-price">${icon}${cost}</span>`}
            </button>
          </div>
        `;
      })
      .join('');

    this.sheetBodyEl.innerHTML = cards;
  }

  private renderRelicSheet(snapshot: UISnapshot, meta: MetaProfile): void {
    const ownedCount = this.data.relics.filter((d) => (meta.relics[d.id] ?? 0) > 0).length;
    const allMaxed = this.data.relics.every((d) => (meta.relics[d.id] ?? 0) >= d.maxLevel);
    const bestWaveStr = String(meta.bestWave).padStart(2, '0');

    this.setText(this.sheetTitleEl, '무림 신물 · 기보고');
    this.setText(
      this.sheetSubtitleEl,
      `해금 ${ownedCount}/${this.data.relics.length} · 최고 기록 제 ${bestWaveStr} 장 · 영구 계승`,
    );
    this.renderGrowthTabs('relic', meta);

    const canDrawKey = !allMaxed && meta.keys >= 1;
    const canDrawGold = !allMaxed && meta.gold >= RELIC_CHEST_GOLD_COST;

    let noticeHtml = '';
    if (this.lastRelicNotice?.relicId) {
      const n = this.lastRelicNotice;
      const rDef = this.data.relicsById.get(n.relicId!);
      const rLv = n.newLevel ?? 1;
      const rPrev = n.prevLevel ?? 0;
      const rPortrait = this.sprites.relicPortraitUrl(n.relicId!, rLv);
      const badgeLabel = n.isNew
        ? '✨ NEW 신물 해금'
        : rLv >= (rDef?.maxLevel ?? 10)
          ? '👑 극의 달성!'
          : `⬆️ 제련 승급 Lv.${rPrev} → Lv.${rLv}`;
      const tierCls = rLv >= 10 ? ' tier-mythic' : rLv >= 5 ? ' tier-master' : '';
      noticeHtml = `
        <div id="relic-notice-banner" class="relic-pull-showcase${tierCls}">
          <div class="relic-pull-avatar">
            <img src="${rPortrait}" alt="${escapeHtml(rDef?.name ?? '')}" />
          </div>
          <div class="relic-pull-meta">
            <div class="relic-pull-badges">
              <span class="relic-pull-state">${badgeLabel}</span>
              ${rDef ? `<span class="grade-pill relic-tag-pill">${escapeHtml(rDef.tag)}</span>` : ''}
            </div>
            <div class="relic-pull-title">${escapeHtml(rDef?.name ?? n.text)}</div>
            <div class="relic-pull-stat">${escapeHtml(formatRelicStatSummary(n.relicId!, rLv))}</div>
          </div>
        </div>
      `;
    } else {
      const noticeText = this.lastRelicNotice
        ? this.lastRelicNotice.text
        : '🏺 기보함을 개봉해 복리 이자(금고)·이자 데미지(만금쾌검패) 등 무림 6대 신물을 제련하세요!';
      const noticeClass = this.lastRelicNotice ? 'relic-notice-banner win' : 'relic-notice-banner';
      noticeHtml = `<div id="relic-notice-banner" class="${noticeClass}">${escapeHtml(noticeText)}</div>`;
    }

    const cardsHtml = this.data.relics
      .map((def) => {
        const lv = meta.relics[def.id] ?? 0;
        const isOwned = lv > 0;
        const isMax = lv >= def.maxLevel;
        const cost = getRelicUpgradeGoldCost(def, lv);
        const affordable = !isMax && meta.gold >= cost;

        let liveBadgeHtml = '';
        if (def.id === 'golden_vault' && isOwned) {
          const pct = getVaultInterestPct(lv);
          const cap = getVaultInterestCap(lv);
          const est = Math.min(cap, Math.floor((snapshot.coin * pct) / 100));
          liveBadgeHtml = `<span class="relic-live-chip">예상 이자 +${est} 은자</span>`;
        } else if (def.id === 'million_sword_seal' && isOwned) {
          const curPct = (snapshot.relicBonus.wealthAtkBps / 100).toFixed(1);
          liveBadgeHtml = `<span class="relic-live-chip">현재 공증 +${curPct}%</span>`;
        } else if (def.id === 'bandit_dagger' && snapshot.relicBonus.pilferedCoinTotal > 0) {
          liveBadgeHtml = `<span class="relic-live-chip">강탈 +${snapshot.relicBonus.pilferedCoinTotal} 은자</span>`;
        }

        let statLine = '';
        if (!isOwned) {
          statLine = `<span class="relic-lore">${escapeHtml(def.desc)}</span> · 해금(Lv.1): <b class="up-next">${escapeHtml(formatRelicStatSummary(def.id, 1))}</b>`;
        } else if (isMax) {
          statLine = `<b>${escapeHtml(formatRelicStatSummary(def.id, lv))}</b> <span class="relic-max-note">(천하제일 극의 달성)</span>`;
        } else {
          statLine = `${escapeHtml(formatRelicStatSummary(def.id, lv))} → <b class="up-next">Lv.${lv + 1}: ${escapeHtml(formatRelicStatSummary(def.id, lv + 1))}</b>`;
        }

        const lvBadgeBg = isMax ? '#dc2626' : lv >= 5 ? '#b45309' : isOwned ? '#d97706' : '#334155';
        const lvBadgeTxt = isMax ? `극의 Lv.${lv}` : isOwned ? `Lv.${lv}/${def.maxLevel}` : '봉인됨';
        const ctaLabel = isMax ? '극의' : isOwned ? '제련' : '지정 해금';
        const cardTierCls = isMax
          ? ' relic-owned relic-mythic'
          : lv >= 5
            ? ' relic-owned relic-master'
            : isOwned
              ? ' relic-owned'
              : ' relic-locked';
        const portraitUrl = this.sprites.relicPortraitUrl(def.id, lv);
        const pipsHtml = Array.from({ length: def.maxLevel }, (_, idx) => {
          const filled = idx < lv;
          const pipCls = !filled ? '' : isMax ? ' max' : lv >= 5 ? ' high' : ' on';
          return `<span class="relic-lv-pip${pipCls}"></span>`;
        }).join('');

        return `
          <div class="sheet-card relic-card${cardTierCls}">
            <div class="card-left">
              <div class="card-avatar relic-avatar">
                <img src="${portraitUrl}" alt="${escapeHtml(def.name)}" />
              </div>
              <div class="card-info">
                <div class="card-name-row">
                  <span class="grade-pill" style="background:${lvBadgeBg}">${lvBadgeTxt}</span>
                  <span class="grade-pill relic-tag-pill">${escapeHtml(def.tag)}</span>
                  <span class="card-name">${escapeHtml(def.name)}</span>
                  ${liveBadgeHtml}
                </div>
                <div class="card-sub">${statLine}</div>
                <div class="relic-lv-track" aria-hidden="true">${pipsHtml}</div>
              </div>
            </div>
            <button
              type="button"
              class="card-cta-btn ${affordable ? (isOwned ? 'interactive' : 'cta-sky interactive') : 'cta-disabled'}"
              data-sheet-action="relic-upgrade"
              data-relic-id="${def.id}"
              ${affordable ? '' : 'disabled'}
            >
              <span>${ctaLabel}</span>
              ${isMax ? '' : `<span class="mini-price">${ICON.goldCoin}${cost}</span>`}
            </button>
          </div>
        `;
      })
      .join('');

    const settledRec = this.handlers.getSettlementRecord();
    const diffCfg = DIFFICULTY_CONFIGS[snapshot.difficulty];
    const preview = computeSettlementReward({
      wave: snapshot.wave,
      monstersSlain: snapshot.monstersSlain,
      bossesSlain: snapshot.bossesSlain,
      bountiesSlain: snapshot.bounty.bountiesSlain,
      difficulty: snapshot.difficulty,
      victory: snapshot.victoryAchieved,
    });
    const canEarlySettle = !snapshot.gameOver && !snapshot.victoryHold && snapshot.wave >= 2;

    let settleFooterHtml = '';
    if (snapshot.victoryHold) {
      settleFooterHtml = `
        <div class="settlement-preview-bar victory-bar">
          <div class="settlement-preview-info">
            <span class="settlement-preview-title">🏆 제 30 장 천하통일 정산 완료!</span>
            <span class="settlement-preview-sub">신물을 제련한 뒤 즉시 31장 무한 혈투에 돌입하거나 금의환향할 수 있습니다!</span>
          </div>
          <div class="relic-draw-btns">
            <button type="button" class="card-cta-btn cta-crimson interactive" data-sheet-action="enter-endless">
              <span>⚔ 무한 혈투</span>
            </button>
            <button type="button" class="card-cta-btn cta-green interactive" data-sheet-action="restart-run">
              <span>새 출정</span>
            </button>
          </div>
        </div>
      `;
    } else if (snapshot.gameOver) {
      settleFooterHtml = `
        <div class="settlement-preview-bar">
          <div class="settlement-preview-info">
            <span class="settlement-preview-title">이번 출정 정산 완료!</span>
            <span class="settlement-preview-sub">획득 보상: 천하주화 +${settledRec?.goldEarned ?? preview.goldEarned} · 열쇠 +${settledRec?.keysEarned ?? preview.keysEarned}</span>
          </div>
          <button type="button" class="card-cta-btn cta-green interactive" data-sheet-action="restart-run">
            <span>재출정</span>
          </button>
        </div>
      `;
    } else {
      settleFooterHtml = `
        <div class="settlement-preview-bar">
          <div class="settlement-preview-info">
            <span class="settlement-preview-title">현재 출정 정산 예상 (제 ${String(snapshot.wave).padStart(2, '0')} 장 · ${diffCfg.badge})</span>
            <span class="settlement-preview-sub">회군 시 영구 보상: 천하주화 +${preview.goldEarned.toLocaleString('ko-KR')} · 기보함 열쇠 +${preview.keysEarned}개</span>
          </div>
          <button
            type="button"
            class="card-cta-btn ${canEarlySettle ? 'cta-green interactive' : 'cta-disabled'}"
            data-sheet-action="settle-run"
            ${canEarlySettle ? '' : 'disabled'}
          >
            <span>${canEarlySettle ? '회군 정산' : '2장부터'}</span>
          </button>
        </div>
      `;
    }

    this.sheetBodyEl.innerHTML = `
      <div class="relic-gacha-panel">
        <div class="relic-wallet-row">
          <div class="relic-wallet-pills">
            <span class="relic-wallet-pill">${ICON.goldCoin}<span>천하주화</span><b>${meta.gold.toLocaleString('ko-KR')}</b></span>
            <span class="relic-wallet-pill key">${ICON.key}<span>기보함 열쇠</span><b>${meta.keys}</b></span>
          </div>
          <div class="relic-draw-btns">
            <button
              type="button"
              class="card-cta-btn cta-green ${canDrawKey ? 'interactive' : 'cta-disabled'}"
              data-sheet-action="relic-draw"
              data-pay="key"
              ${canDrawKey ? '' : 'disabled'}
            >
              <span>열쇠 개봉</span>
              <span class="mini-price">${ICON.key}1</span>
            </button>
            <button
              type="button"
              class="card-cta-btn ${canDrawGold ? 'interactive' : 'cta-disabled'}"
              data-sheet-action="relic-draw"
              data-pay="gold"
              ${canDrawGold ? '' : 'disabled'}
            >
              <span>주화 개봉</span>
              <span class="mini-price">${ICON.goldCoin}${RELIC_CHEST_GOLD_COST}</span>
            </button>
          </div>
        </div>
        ${noticeHtml}
      </div>
      ${cardsHtml}
      ${settleFooterHtml}
    `;

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
    const totalSkins = this.data.heroSkins.length + this.data.courtSkins.length;
    const ownedHeroCount = this.data.heroSkins.filter((s) => Boolean(meta.ownedSkins[s.id])).length;
    const ownedCourtCount = this.data.courtSkins.filter((c) => Boolean(meta.ownedSkins[c.id])).length;

    this.setText(this.sheetTitleEl, '금수화장각 · 전설 의복 & 비무대');
    this.setText(
      this.sheetSubtitleEl,
      `수집 ${meta.ownedSkinCount}/${totalSkins}종 · 의복·검기·절기 이펙트 영구 변모 (전투 능력치 변동 없음)`,
    );
    this.renderGrowthTabs('wardrobe', meta);

    const canDrawKey1 = meta.keys >= 1;
    const canDrawGold1 = meta.gold >= SKIN_SINGLE_GOLD_COST;
    const canDrawGold5 = meta.gold >= SKIN_MULTI5_GOLD_COST;

    let showcaseHtml = '';
    if (this.lastSkinPull) {
      const pullCards = this.lastSkinPull.items
        .map((item) => {
          const rMeta = SKIN_RARITY_META[item.rarity];
          let imgUrl = '';
          let subName = '비무대 테마';
          if (item.kind === 'hero') {
            const skinDef = this.data.heroSkinsById.get(item.skinId);
            const u = item.unitId ? this.data.unitsById.get(item.unitId) : undefined;
            const g = u ? this.data.gradesById.get(u.grade) : undefined;
            if (u && g && skinDef) {
              imgUrl = this.sprites.unitPortraitUrl(u, g, skinDef);
              subName = u.name;
            }
          } else {
            const courtDef = this.data.courtSkinsById.get(item.skinId as CourtSkinId);
            if (courtDef) {
              imgUrl = this.sprites.courtPreviewUrl(courtDef);
            }
          }

          const tagHtml = item.isNew
            ? '<span class="pull-tag new">✨ NEW</span>'
            : `<span class="pull-tag refund">+${item.silkRefund}필</span>`;

          return `
            <div class="skin-pull-card rarity-${item.rarity}">
              <span class="skin-rarity-pill" style="background:${rMeta.color}">${rMeta.label}</span>
              <div class="skin-pull-avatar"><img src="${imgUrl}" alt="${escapeHtml(item.name)}" /></div>
              <div class="skin-pull-name">${escapeHtml(item.name)}</div>
              <div class="skin-pull-target">${escapeHtml(subName)}</div>
              ${tagHtml}
            </div>
          `;
        })
        .join('');

      const multiClass = this.lastSkinPull.items.length > 1 ? ' multi-5' : ' single-1';
      const refundNote =
        this.lastSkinPull.totalSilkRefund > 0
          ? `<div class="skin-pull-summary">🧶 중복 의복 환급 합계: <b>운금비단 +${this.lastSkinPull.totalSilkRefund}필</b> (보유 ${meta.silk}필)</div>`
          : '';
      showcaseHtml = `
        <div id="skin-pull-showcase" class="skin-pull-showcase${multiClass}">
          <div class="skin-pull-grid">${pullCards}</div>
          ${refundNote}
        </div>
      `;
    }

    let listHtml = '';
    if (this.wardrobeSubTab === 'hero') {
      const sortedHeroSkins = [...this.data.heroSkins].sort((a, b) => {
        const eqA = meta.equippedHeroSkins[a.unitId] === a.id ? 1 : 0;
        const eqB = meta.equippedHeroSkins[b.unitId] === b.id ? 1 : 0;
        if (eqA !== eqB) return eqB - eqA;
        const ownA = meta.ownedSkins[a.id] ? 1 : 0;
        const ownB = meta.ownedSkins[b.id] ? 1 : 0;
        if (ownA !== ownB) return ownB - ownA;
        return SKIN_RARITY_META[b.rarity].rank - SKIN_RARITY_META[a.rarity].rank;
      });

      listHtml = sortedHeroSkins
        .map((skin) => {
          const u = this.data.unitsById.get(skin.unitId);
          const g = u ? this.data.gradesById.get(u.grade) : undefined;
          if (!u || !g) return '';
          const rMeta = SKIN_RARITY_META[skin.rarity];
          const fMeta = FACTION_META[u.faction];
          const isOwned = Boolean(meta.ownedSkins[skin.id]);
          const isEquipped = meta.equippedHeroSkins[skin.unitId] === skin.id;
          const portrait = this.sprites.unitPortraitUrl(u, g, skin);

          const condText =
            !isOwned && skin.unlockCond
              ? ` · <b class="skin-cond-note">🏆 ${escapeHtml(UNLOCK_COND_LABEL[skin.unlockCond])}</b>`
              : '';

          let ctaHtml = '';
          if (isEquipped) {
            ctaHtml = `
              <button type="button" class="card-cta-btn cta-green interactive" data-sheet-action="skin-equip-hero" data-unit-id="${skin.unitId}" data-skin-id="">
                <span>장착중 ✓</span>
                <span class="mini-price">해제</span>
              </button>
            `;
          } else if (isOwned) {
            ctaHtml = `
              <button type="button" class="card-cta-btn cta-sky interactive" data-sheet-action="skin-equip-hero" data-unit-id="${skin.unitId}" data-skin-id="${skin.id}">
                <span>의복 장착</span>
              </button>
            `;
          } else if (skin.unlockCond) {
            ctaHtml = `
              <button type="button" class="card-cta-btn cta-disabled" disabled>
                <span>업적 전용</span>
              </button>
            `;
          } else {
            const canCraft = meta.silk >= skin.silkCost;
            ctaHtml = `
              <button
                type="button"
                class="card-cta-btn ${canCraft ? 'interactive' : 'cta-disabled'}"
                data-sheet-action="skin-craft"
                data-skin-id="${skin.id}"
                ${canCraft ? '' : 'disabled'}
              >
                <span>확정 재단</span>
                <span class="mini-price">${ICON.silk}${skin.silkCost}필</span>
              </button>
            `;
          }

          return `
            <div class="sheet-card skin-card${isEquipped ? ' skin-equipped' : isOwned ? ' skin-owned' : ' skin-locked'}">
              <div class="card-left">
                <div class="card-avatar skin-avatar"><img src="${portrait}" alt="${escapeHtml(skin.name)}" /></div>
                <div class="card-info">
                  <div class="card-name-row">
                    <span class="grade-pill" style="background:${rMeta.color}">${rMeta.label}</span>
                    <span class="grade-pill" style="background:${fMeta.color}">${escapeHtml(u.name)}</span>
                    <span class="card-name">${escapeHtml(skin.name)}</span>
                    <span class="skin-swatches" title="검기·절기 색상">
                      <i style="background:${skin.primaryColor}"></i>
                      <i style="background:${skin.secondaryColor}"></i>
                    </span>
                  </div>
                  <div class="card-sub">${escapeHtml(skin.desc)}${condText}</div>
                </div>
              </div>
              ${ctaHtml}
            </div>
          `;
        })
        .join('');
    } else {
      listHtml = this.data.courtSkins
        .map((court) => {
          const rMeta = SKIN_RARITY_META[court.rarity];
          const isOwned = Boolean(meta.ownedSkins[court.id]);
          const isEquipped = meta.equippedCourtSkin === court.id;
          const previewUrl = this.sprites.courtPreviewUrl(court);
          const condText =
            !isOwned && court.unlockCond
              ? ` · <b class="skin-cond-note">🏆 ${escapeHtml(UNLOCK_COND_LABEL[court.unlockCond])}</b>`
              : '';

          let ctaHtml = '';
          if (isEquipped) {
            ctaHtml = `
              <button type="button" class="card-cta-btn cta-green cta-disabled" disabled>
                <span>적용중 ✓</span>
              </button>
            `;
          } else if (isOwned) {
            ctaHtml = `
              <button type="button" class="card-cta-btn cta-sky interactive" data-sheet-action="skin-equip-court" data-court-id="${court.id}">
                <span>테마 적용</span>
              </button>
            `;
          } else if (court.unlockCond) {
            ctaHtml = `
              <button type="button" class="card-cta-btn cta-disabled" disabled>
                <span>업적 전용</span>
              </button>
            `;
          } else {
            const canCraft = meta.silk >= court.silkCost;
            ctaHtml = `
              <button
                type="button"
                class="card-cta-btn ${canCraft ? 'interactive' : 'cta-disabled'}"
                data-sheet-action="skin-craft"
                data-skin-id="${court.id}"
                ${canCraft ? '' : 'disabled'}
              >
                <span>확정 재단</span>
                <span class="mini-price">${ICON.silk}${court.silkCost}필</span>
              </button>
            `;
          }

          return `
            <div class="sheet-card skin-card${isEquipped ? ' skin-equipped' : isOwned ? ' skin-owned' : ' skin-locked'}">
              <div class="card-left">
                <div class="card-avatar court-avatar"><img src="${previewUrl}" alt="${escapeHtml(court.name)}" /></div>
                <div class="card-info">
                  <div class="card-name-row">
                    <span class="grade-pill" style="background:${rMeta.color}">${rMeta.label}</span>
                    <span class="card-name">${escapeHtml(court.name)}</span>
                    <span class="skin-swatches" title="등불·꽃잎 분위기 색상">
                      <i style="background:${court.lanternColor}"></i>
                      <i style="background:${court.petalPrimary}"></i>
                    </span>
                  </div>
                  <div class="card-sub">${escapeHtml(court.desc)}${condText}</div>
                </div>
              </div>
              ${ctaHtml}
            </div>
          `;
        })
        .join('');
    }

    this.sheetBodyEl.innerHTML = `
      <div class="wardrobe-gacha-panel">
        <div class="relic-wallet-row">
          <div class="relic-wallet-pills">
            <span class="relic-wallet-pill">${ICON.goldCoin}<span>천하주화</span><b>${meta.gold.toLocaleString('ko-KR')}</b></span>
            <span class="relic-wallet-pill key">${ICON.key}<span>열쇠</span><b>${meta.keys}</b></span>
            <span class="relic-wallet-pill silk">${ICON.silk}<span>운금비단</span><b>${meta.silk}필</b></span>
          </div>
          <div class="relic-draw-btns">
            <button
              type="button"
              class="card-cta-btn cta-green ${canDrawKey1 ? 'interactive' : 'cta-disabled'}"
              data-sheet-action="skin-draw"
              data-count="1"
              data-pay="key"
              ${canDrawKey1 ? '' : 'disabled'}
            >
              <span>열쇠 초빙</span>
              <span class="mini-price">${ICON.key}1</span>
            </button>
            <button
              type="button"
              class="card-cta-btn ${canDrawGold1 ? 'interactive' : 'cta-disabled'}"
              data-sheet-action="skin-draw"
              data-count="1"
              data-pay="gold"
              ${canDrawGold1 ? '' : 'disabled'}
            >
              <span>1회 초빙</span>
              <span class="mini-price">${ICON.goldCoin}${SKIN_SINGLE_GOLD_COST}</span>
            </button>
            <button
              type="button"
              class="card-cta-btn cta-crimson ${canDrawGold5 ? 'interactive' : 'cta-disabled'}"
              data-sheet-action="skin-draw"
              data-count="5"
              data-pay="gold"
              ${canDrawGold5 ? '' : 'disabled'}
            >
              <span>5연속 (10%↓)</span>
              <span class="mini-price">${ICON.goldCoin}${SKIN_MULTI5_GOLD_COST}</span>
            </button>
          </div>
        </div>
        <div class="wardrobe-rate-note">
          ✨ 확률: <b>신화 15%</b> · <b>전설 35%</b> · <b>명품 50%</b> ｜ 중복 당첨 시 운금비단 자동 환급 (+15/+30/+50필)
        </div>
        ${showcaseHtml}
      </div>

      <div class="wardrobe-subtabs">
        <button
          type="button"
          class="wardrobe-subtab-btn interactive${this.wardrobeSubTab === 'hero' ? ' active' : ''}"
          data-sheet-action="wardrobe-subtab"
          data-subtab="hero"
        >
          👘 협객 전설 의복 (${ownedHeroCount}/${this.data.heroSkins.length})
        </button>
        <button
          type="button"
          class="wardrobe-subtab-btn interactive${this.wardrobeSubTab === 'court' ? ' active' : ''}"
          data-sheet-action="wardrobe-subtab"
          data-subtab="court"
        >
          🏯 비무대 테마 (${ownedCourtCount}/${this.data.courtSkins.length})
        </button>
      </div>
      ${listHtml}
    `;

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
    this.setText(this.sheetTitleEl, '강호 의뢰 · 밀서');
    this.setText(
      this.sheetSubtitleEl,
      `달성 ${snapshot.missionsCompletedCount} / ${snapshot.missions.length} · 조건 달성 시 즉시 보상 자동 지급`,
    );
    this.sheetTabsEl.style.display = 'none';
    this.sheetTabsEl.innerHTML = '';

    const sorted = [...snapshot.missions].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const ratioA = a.target > 0 ? a.progress / a.target : 0;
      const ratioB = b.target > 0 ? b.progress / b.target : 0;
      return ratioB - ratioA;
    });

    const html = sorted
      .map((m) => {
        const pct = Math.min(100, Math.round((m.progress / Math.max(1, m.target)) * 100));
        const rewards: string[] = [];
        if (m.rewardCoin > 0) {
          rewards.push(`<span class="mission-reward-pill coin">${ICON.coin}+${m.rewardCoin}</span>`);
        }
        if (m.rewardLuck > 0) {
          rewards.push(`<span class="mission-reward-pill luck">${ICON.elixir}+${m.rewardLuck}</span>`);
        }
        if (m.rewardWispGrade) {
          const gName = this.data.gradesById.get(m.rewardWispGrade)?.name ?? m.rewardWispGrade;
          rewards.push(
            `<span class="mission-reward-pill wisp">${ICON.wisp}${escapeHtml(gName)} +1</span>`,
          );
        }

        const stamp = m.completed
          ? '<span class="mission-stamp done">달성 완료 ✓</span>'
          : `<span class="mission-stamp">${m.progress.toLocaleString('ko-KR')} / ${m.target.toLocaleString('ko-KR')}</span>`;

        return `
          <div class="sheet-card mission-card${m.completed ? ' mission-done' : ''}">
            <div class="mission-main">
              <div class="card-name-row">
                <span class="card-name">${escapeHtml(m.name)}</span>
                <div class="mission-rewards">${rewards.join('')}</div>
              </div>
              <div class="card-sub">${escapeHtml(m.desc)}</div>
              <div class="mission-prog-track">
                <div class="mission-prog-fill" style="width:${pct}%"></div>
              </div>
            </div>
            ${stamp}
          </div>
        `;
      })
      .join('');

    this.sheetBodyEl.innerHTML = html;
  }

  private renderCodexSheet(snapshot: UISnapshot, meta: MetaProfile): void {
    this.setText(this.sheetTitleEl, '무림 명숙록 · 출정 난이도');
    this.setText(
      this.sheetSubtitleEl,
      `등재 협객 ${meta.discoveredCount}/${this.data.units.length}인 · 최초 합류 시 천하주화 영구 보상`,
    );
    this.renderGrowthTabs('codex', meta);

    const diffCards = DIFFICULTY_ORDER.map((diff) => {
      const cfg = DIFFICULTY_CONFIGS[diff];
      const unlocked = meta.unlockedDifficulties[diff];
      const cleared = meta.clearedDifficulties[diff];
      const active = snapshot.difficulty === diff;

      const clearBadge = cleared
        ? '<span class="diff-clear-pill">🏆 30장 제패</span>'
        : `<span class="diff-bonus-pill">초회 +${cfg.firstClearGold}주화 · 열쇠+${cfg.firstClearKeys}</span>`;

      const btnLabel = active ? '출정 중 ✓' : unlocked ? '출정 전환' : '🔒 미해금';
      const btnClass = active
        ? 'card-cta-btn cta-green interactive'
        : unlocked
          ? 'card-cta-btn interactive'
          : 'card-cta-btn cta-disabled';

      return `
        <div class="diff-card${active ? ' diff-active' : ''}${!unlocked ? ' diff-locked' : ''}">
          <div class="diff-info">
            <div class="card-name-row">
              <span class="grade-pill" style="background:${diff === 'hell' ? '#be123c' : diff === 'hard' ? '#d97706' : '#0f766e'}">${cfg.badge}</span>
              <span class="card-name">${escapeHtml(cfg.name)}</span>
              ${clearBadge}
            </div>
            <div class="card-sub">${escapeHtml(cfg.desc)}</div>
          </div>
          <button
            type="button"
            class="${btnClass}"
            data-sheet-action="select-difficulty"
            data-difficulty="${diff}"
            ${unlocked ? '' : 'disabled'}
          >
            <span>${btnLabel}</span>
          </button>
        </div>
      `;
    }).join('');

    const orthodoxTotal = this.data.units.filter((u) => u.faction === 'orthodox').length;
    const unorthodoxTotal = this.data.units.filter((u) => u.faction === 'unorthodox').length;
    const demonicTotal = this.data.units.filter((u) => u.faction === 'demonic').length;

    const filters: readonly { readonly id: CodexFilterId; readonly label: string }[] = [
      { id: 'all', label: `전체 (${this.data.units.length})` },
      { id: 'orthodox', label: `정파 (${orthodoxTotal})` },
      { id: 'unorthodox', label: `사파 (${unorthodoxTotal})` },
      { id: 'demonic', label: `마교 (${demonicTotal})` },
    ];
    const filterHtml = filters
      .map(
        (f) =>
          `<button type="button" class="codex-filter-btn interactive${this.codexFilter === f.id ? ' active' : ''}" data-sheet-action="codex-filter" data-filter="${f.id}">${f.label}</button>`,
      )
      .join('');

    const filteredUnits = this.data.units
      .filter((u) => this.codexFilter === 'all' || u.faction === this.codexFilter)
      .sort((a, b) => {
        const rA = this.data.gradesById.get(a.grade)?.rank ?? 0;
        const rB = this.data.gradesById.get(b.grade)?.rank ?? 0;
        if (rA !== rB) return rB - rA;
        if (a.faction !== b.faction) return a.faction.localeCompare(b.faction);
        return b.atk - a.atk;
      });

    const unitCards = filteredUnits
      .map((u) => {
        const g = this.data.gradesById.get(u.grade);
        if (!g) return '';
        const fMeta = FACTION_META[u.faction];
        const discovered = Boolean(meta.discoveredUnits[u.id]);
        const discReward = getCodexDiscoveryReward(g.rank);
        const portrait = this.sprites.unitPortraitUrl(u, g, this.getEquippedSkinDef(u.id, meta));
        const roleBadges = this.buildUnitRoleBadgesHtml(u);

        const lowerRec = this.recipeGraph.byOutput.get(u.id)?.[0];
        let lowerLine = '획득처: 초출강호(일반 소환) · 기연 초빙';
        if (lowerRec) {
          const parts = lowerRec.ingredients.map((ing) => {
            const ingName = this.data.unitsById.get(ing.unit)?.name ?? ing.unit;
            return ing.n > 1 ? `${ingName} ×${ing.n}` : ingName;
          });
          lowerLine = `하위 조합: ${parts.join(' + ')}`;
        } else if (!u.leaf) {
          lowerLine = '획득처: 영약 복용 · 기연 초빙';
        }

        const upperRecs = this.recipeGraph.byIngredient.get(u.id) ?? [];
        const upperNames = upperRecs
          .map((r) => this.data.unitsById.get(r.output)?.name)
          .filter((n): n is string => Boolean(n));
        const upperLine =
          upperNames.length > 0
            ? `상위 등선: ${upperNames.join(' / ')}`
            : '상위 등선: ★ 최종 지존 경지';

        const statusBadge = discovered
          ? '<span class="codex-disc-badge ok">등재 완료 ✓</span>'
          : `<span class="codex-disc-badge locked">미등재 · 초회 +${discReward.gold}주화${discReward.keys > 0 ? ` · 열쇠+${discReward.keys}` : ''}</span>`;

        const extraTactical: string[] = [];
        if (u.supportAura) {
          const spd = u.supportAura.speedPct > 0 ? `·속+${u.supportAura.speedPct}%` : '';
          extraTactical.push(`인접고무 [${u.supportAura.name}] 공+${u.supportAura.atkPct}%${spd}`);
        }
        if ((u.armorShred ?? 0) > 0) {
          extraTactical.push(`호신강기 파쇄 -${u.armorShred}`);
        }
        const tacticalNote =
          extraTactical.length > 0 ? ` · <b>${escapeHtml(extraTactical.join(' / '))}</b>` : '';

        return `
          <div class="sheet-card codex-card${discovered ? ' codex-discovered' : ' codex-undiscovered'}">
            <div class="card-left">
              <div class="card-avatar"><img src="${portrait}" alt="${escapeHtml(u.name)}" /></div>
              <div class="card-info">
                <div class="card-name-row">
                  <span class="grade-pill" style="background:${g.color}">${escapeHtml(g.name)}</span>
                  <span class="grade-pill" style="background:${fMeta.color}">${fMeta.label}</span>
                  <span class="card-name">${escapeHtml(u.name)}</span>
                  ${roleBadges}
                  ${statusBadge}
                </div>
                <div class="card-sub">⚔${u.atk} · 사거리 ${u.range} · 절기 <b>[${escapeHtml(u.skill.name)}]</b>${tacticalNote}</div>
                <div class="codex-lineage">${escapeHtml(lowerLine)} · <span>${escapeHtml(upperLine)}</span></div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    this.sheetBodyEl.innerHTML = `
      <div class="sheet-section-label">⚔ 출정 난이도 선택 (제 30 장 제패 시 상위 난이도 해금)</div>
      <div class="diff-list">${diffCards}</div>
      <div class="codex-header-bar">
        <span class="sheet-section-label">📖 무림 ${this.data.units.length}인 명숙록 (${meta.discoveredCount}/${this.data.units.length})</span>
        <div class="codex-filter-row">${filterHtml}</div>
      </div>
      ${unitCards}
    `;
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

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
