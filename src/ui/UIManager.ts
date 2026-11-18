import type { GameCommand, SlotRef } from '../core/CommandQueue';
import type { SlotView, UISnapshot } from '../core/Simulation';
import { ticksToClock } from '../core/time';
import type { RecipeGraph } from '../craft/RecipeGraph';
import type {
  GameDataBundle,
  GradeId,
  RecipeDef,
  UnitId,
  UpgradeGroupId,
} from '../data/types';
import type { SpriteCache } from '../render/SpriteCache';

export interface UIControlHandlers {
  onDispatch(cmd: GameCommand): void;
  onCycleSpeed(): void;
  onTogglePause(): void;
  onRestart(): void;
  getSelectedSlot(): SlotRef | null;
  clearSelection(): void;
}

type SheetKind = 'craft' | 'wisp' | 'gamble' | 'upgrade';
type CraftTabId = 'all' | GradeId;

const NORMAL_SYNC_INTERVAL_MS = 100; // Max 10Hz for non-priority HUD fields (AGENTS.md §4)

const GAMBLE_REP_UNIT: Readonly<Record<string, UnitId>> = {
  uncommon: 'luffy_gear2',
  rare: 'ace',
  legendary: 'luffy_gear4',
};

const UPGRADE_REP_UNIT: Readonly<Record<UpgradeGroupId, UnitId>> = {
  common: 'luffy',
  rare: 'law',
  legendary: 'zoro_ashura',
  mythic: 'luffy_nika',
};

/** Inline SVG game icons (thick dark outline + bright fill) — no emoji font dependency. */
const SVG_OPEN = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">';
const INK = '#0a0f1f';
const ICON = {
  coin: `${SVG_OPEN}<circle cx="12" cy="12" r="9.5" fill="#ffd23f" stroke="${INK}" stroke-width="2.4"/><circle cx="12" cy="12" r="5.6" fill="none" stroke="#e09a12" stroke-width="2"/><path d="M8 7.6l1.6-1.2" stroke="#fff8c8" stroke-width="2" stroke-linecap="round"/></svg>`,
  clover: `${SVG_OPEN}<g fill="#5ee36a" stroke="${INK}" stroke-width="2"><circle cx="8.2" cy="8.4" r="4.2"/><circle cx="15.8" cy="8.4" r="4.2"/><circle cx="8.2" cy="15.6" r="4.2"/><circle cx="15.8" cy="15.6" r="4.2"/></g><circle cx="12" cy="12" r="2.4" fill="#2fbf4a"/><path d="M7 6.8l1.2-.8M14.6 6.8l1.2-.8" stroke="#d9ffd6" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  wisp: `${SVG_OPEN}<path d="M12 1.8c3.8 4.6 7 7.6 7 12.2a7 7 0 0 1-14 0c0-2.6 1.4-4.6 3-6.2.2 1.8 1 3 2.2 3.4C9.8 8 10.6 4.8 12 1.8z" fill="#7cd3ff" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 11.5c1.8 2 3 3.2 3 4.8a3 3 0 0 1-6 0c0-1.4 1.2-2.8 3-4.8z" fill="#ffffff"/></svg>`,
  anchor: `${SVG_OPEN}<g fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="${INK}" stroke-width="5.4"><circle cx="12" cy="5" r="2.4"/><path d="M12 7.4V21M7.5 11h9M4 14.5c.8 3.6 4 6.5 8 6.5s7.2-2.9 8-6.5"/></g><g stroke="#ffffff" stroke-width="2.4"><circle cx="12" cy="5" r="2.4"/><path d="M12 7.4V21M7.5 11h9M4 14.5c.8 3.6 4 6.5 8 6.5s7.2-2.9 8-6.5"/></g></g></svg>`,
  dice: `${SVG_OPEN}<rect x="3" y="3" width="18" height="18" rx="4.5" fill="#ffffff" stroke="${INK}" stroke-width="2.4"/><path d="M5 17.5V7.5A2.5 2.5 0 0 1 7.5 5" stroke="#d6dcf0" stroke-width="0" fill="none"/><g fill="${INK}"><circle cx="8" cy="8" r="1.8"/><circle cx="16" cy="8" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="8" cy="16" r="1.8"/><circle cx="16" cy="16" r="1.8"/></g></svg>`,
  swords: `${SVG_OPEN}<g stroke-linecap="round"><g stroke="${INK}" stroke-width="5.2"><path d="M4 4l11 11M20 4L9 15M14 18l4-4M6 14l4 4M17.5 17.5l2.5 2.5M6.5 17.5L4 20"/></g><g stroke="#e8eef8" stroke-width="2.4"><path d="M4 4l11 11M20 4L9 15"/></g><g stroke="#ffd23f" stroke-width="2.4"><path d="M14 18l4-4M6 14l4 4M17.5 17.5l2.5 2.5M6.5 17.5L4 20"/></g></g></svg>`,
  up: `${SVG_OPEN}<path d="M12 2.5l8 8.5h-4.6v9.5H8.6V11H4z" fill="#ffffff" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M12 6l3.6 3.8" stroke="#ffe08a" stroke-width="1.8" stroke-linecap="round"/></svg>`,
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
  private speedBtnEl!: HTMLButtonElement;
  private pauseBtnEl!: HTMLButtonElement;
  private devBtnEl!: HTMLButtonElement;
  private devPopoverEl!: HTMLElement;
  private devSimMetaEl!: HTMLElement;

  private unitSelectBarEl!: HTMLElement;
  private unitPortraitImgEl!: HTMLImageElement;
  private unitGradePillEl!: HTMLElement;
  private unitNameEl!: HTMLElement;
  private unitStatEl!: HTMLElement;
  private unitShortcutsEl!: HTMLElement;
  private unitLockBtnEl!: HTMLButtonElement;
  private unitSellBtnEl!: HTMLButtonElement;

  private coinValEl!: HTMLElement;
  private luckValEl!: HTMLElement;
  private wispValEl!: HTMLElement;
  private occupancyEl!: HTMLElement;

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
  private recRecipeId: string | null = null;
  private prevRecommendSignature = '';

  private toastLayerEl!: HTMLElement;
  private gameOverModalEl!: HTMLElement;
  private gameOverSubEl!: HTMLElement;

  private lastSyncMs = -1000;
  private lastSnapshot: UISnapshot | null = null;
  private prevSelectSignature = '';
  private prevSheetSignature = '';
  private prevTextCache = new Map<HTMLElement, string>();

  private activeSheet: SheetKind | null = null;
  private craftTab: CraftTabId = 'all';
  private wispTab: GradeId;
  private readonly craftTabs: readonly { readonly id: CraftTabId; readonly label: string }[];
  private readonly wispTabs: readonly { readonly id: GradeId; readonly label: string }[];
  private devOpen = false;
  private gameOverDismissed = false;
  private lastAnimatedGambleSeq = 0;

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
      .map((g) => ({ id: g.id, label: `${g.name} 위습` }));
    this.wispTab = this.wispTabs[0]?.id ?? data.grades[0]!.id;

    // External PNG art arrived (public/sprites/{id}.png) → rebuild DOM portraits.
    this.sprites.onSpriteUpdated(() => {
      this.prevSelectSignature = '';
      this.prevSheetSignature = '';
      this.prevRecommendSignature = '';
      if (this.lastSnapshot) {
        this.refreshSelectedUnitBar(this.lastSnapshot);
        if (this.activeSheet) this.refreshSheet(this.lastSnapshot);
      }
    });
  }

  public mount(): void {
    this.root.innerHTML = `
      <header class="hud-bar" aria-label="전투 상태">
        <div id="hud-wave-box" class="wave-box">
          <span id="hud-wave-badge" class="wave-badge">WAVE 01</span>
          <span id="hud-wave-timer" class="wave-timer">00:28</span>
        </div>

        <div id="hud-monster-gauge" class="monster-gauge">
          <div class="monster-gauge-top">
            <span id="hud-monster-title" class="monster-gauge-title">몬스터</span>
            <span id="hud-monster-count" class="monster-gauge-count">0 / 100</span>
          </div>
          <div class="monster-gauge-track">
            <div id="hud-monster-fill" class="monster-gauge-fill"></div>
          </div>
        </div>

        <div class="hud-controls">
          <button id="btn-speed" type="button" class="hud-btn interactive active" aria-label="배속">1x</button>
          <button id="btn-pause" type="button" class="hud-btn interactive" aria-label="일시정지">⏸</button>
          <button id="btn-dev" type="button" class="hud-btn dev-btn interactive" aria-label="개발자 메뉴">DEV</button>
        </div>
      </header>

      <aside id="dev-popover" class="dev-popover interactive" aria-label="개발자 도구">
        <div id="dev-sim-meta" class="dev-popover-meta">30Hz · Tick 0</div>
        <div class="dev-popover-grid">
          <button type="button" class="dev-chip-btn interactive" data-dev-action="coin">+500 코인</button>
          <button type="button" class="dev-chip-btn interactive" data-dev-action="luck">+5 행운석</button>
          <button type="button" class="dev-chip-btn interactive" data-dev-action="wisp-common">+1 흔함 위습</button>
          <button type="button" class="dev-chip-btn interactive" data-dev-action="wisp-rare">+1 희귀 위습</button>
        </div>
      </aside>

      <div id="toast-layer" class="toast-layer" aria-live="polite"></div>

      <div id="bench-badge" class="bench-badge">${ICON.anchor}<span>대기석</span><b id="val-bench-count">0/12</b></div>

      <section id="recommend-bar" class="recommend-bar interactive" aria-label="추천 조합">
        <span class="recommend-tag">추천</span>
        <div class="unit-portrait-box rec-portrait"><img id="rec-img" alt="" /></div>
        <div class="rec-meta">
          <div class="unit-title-row">
            <span id="rec-grade" class="grade-pill">희귀</span>
            <span id="rec-name" class="unit-name-label">-</span>
          </div>
          <div id="rec-ings" class="rec-ings"></div>
        </div>
        <button id="btn-rec-cta" type="button" class="rec-cta interactive">도감</button>
      </section>

      <section id="unit-select-bar" class="unit-select-bar" aria-label="선택 유닛">
        <div class="unit-select-left">
          <div class="unit-portrait-box">
            <img id="sel-unit-img" alt="" />
          </div>
          <div class="unit-meta-col">
            <div class="unit-title-row">
              <span id="sel-unit-grade" class="grade-pill">흔함</span>
              <span id="sel-unit-name" class="unit-name-label">루피</span>
              <span id="sel-unit-stat" class="unit-stat-label">⚔ 26</span>
            </div>
            <div id="sel-unit-shortcuts" class="unit-recipe-shortcuts"></div>
          </div>
        </div>
        <div class="unit-select-actions">
          <button id="btn-unit-lock" type="button" class="mini-3d-btn interactive">잠금</button>
          <button id="btn-unit-sell" type="button" class="mini-3d-btn sell-btn interactive">판매</button>
        </div>
      </section>

      <footer class="bottom-dock" aria-label="하단 조작 바">
        <div class="currency-bar">
          <div class="currency-group">
            <span class="currency-pill coin">${ICON.coin}<span id="val-coin">0</span></span>
            <span class="currency-pill luck">${ICON.clover}<span id="val-luck">0</span></span>
            <span class="currency-pill wisp">${ICON.wisp}<span id="val-wisp">0</span></span>
          </div>
          <span id="val-occupancy" class="slot-occupancy">0/18</span>
        </div>

        <div class="action-row">
          <button id="btn-summon" type="button" class="action-btn btn-summon interactive">
            <span class="action-icon">${ICON.anchor}</span>
            <span class="action-title">소환</span>
            <span class="action-cost">${ICON.coin}<span id="val-summon-cost">20</span></span>
          </button>

          <button id="btn-gamble" type="button" class="action-btn btn-gamble interactive">
            <span id="badge-gamble" class="lamp-badge">0</span>
            <span class="action-icon">${ICON.dice}</span>
            <span class="action-title">도박</span>
            <span class="action-cost">${ICON.clover}<span>1~4</span></span>
          </button>

          <button id="btn-wisp" type="button" class="action-btn btn-wisp interactive">
            <span id="badge-wisp" class="lamp-badge">0</span>
            <span class="action-icon">${ICON.wisp}</span>
            <span class="action-title">위습</span>
            <span class="action-cost">선택</span>
          </button>

          <button id="btn-craft" type="button" class="action-btn btn-craft interactive">
            <span id="badge-craft" class="lamp-badge">0</span>
            <span class="action-icon">${ICON.swords}</span>
            <span class="action-title">조합</span>
            <span id="val-craft-state" class="action-cost">도감</span>
          </button>

          <button id="btn-upgrade" type="button" class="action-btn btn-upgrade interactive">
            <span class="action-icon">${ICON.up}</span>
            <span class="action-title">강화</span>
            <span id="val-upgrade-state" class="action-cost">Lv.0</span>
          </button>
        </div>
      </footer>

      <div id="sheet-backdrop" class="sheet-backdrop interactive" role="dialog" aria-modal="true">
        <div id="bottom-sheet" class="bottom-sheet">
          <div class="sheet-header">
            <div class="sheet-title-wrap">
              <div id="sheet-title" class="sheet-title">조합</div>
              <div id="sheet-subtitle" class="sheet-subtitle"></div>
            </div>
            <button id="btn-sheet-close" type="button" class="sheet-close-btn interactive" aria-label="닫기">✕</button>
          </div>
          <div id="sheet-tabs" class="sheet-tabs"></div>
          <div id="sheet-body" class="sheet-body"></div>
        </div>
      </div>

      <div id="gameover-modal" class="gameover-modal interactive" role="alertdialog" aria-modal="true">
        <div class="gameover-card">
          <div class="gameover-title">방어선 돌파!</div>
          <div id="gameover-sub" class="gameover-sub">WAVE 01</div>
          <div class="gameover-actions">
            <button id="btn-gameover-inspect" type="button" class="card-cta-btn interactive">전장 보기</button>
            <button id="btn-gameover-restart" type="button" class="card-cta-btn cta-green interactive">다시 시작</button>
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
    this.speedBtnEl = this.mustGet('btn-speed') as HTMLButtonElement;
    this.pauseBtnEl = this.mustGet('btn-pause') as HTMLButtonElement;
    this.devBtnEl = this.mustGet('btn-dev') as HTMLButtonElement;
    this.devPopoverEl = this.mustGet('dev-popover');
    this.devSimMetaEl = this.mustGet('dev-sim-meta');

    this.unitSelectBarEl = this.mustGet('unit-select-bar');
    this.unitPortraitImgEl = this.mustGet('sel-unit-img') as HTMLImageElement;
    this.unitGradePillEl = this.mustGet('sel-unit-grade');
    this.unitNameEl = this.mustGet('sel-unit-name');
    this.unitStatEl = this.mustGet('sel-unit-stat');
    this.unitShortcutsEl = this.mustGet('sel-unit-shortcuts');
    this.unitLockBtnEl = this.mustGet('btn-unit-lock') as HTMLButtonElement;
    this.unitSellBtnEl = this.mustGet('btn-unit-sell') as HTMLButtonElement;

    this.coinValEl = this.mustGet('val-coin');
    this.luckValEl = this.mustGet('val-luck');
    this.wispValEl = this.mustGet('val-wisp');
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

    this.toastLayerEl = this.mustGet('toast-layer');
    this.gameOverModalEl = this.mustGet('gameover-modal');
    this.gameOverSubEl = this.mustGet('gameover-sub');

    this.bindEvents();
  }

  private bindEvents(): void {
    this.speedBtnEl.addEventListener('click', () => this.handlers.onCycleSpeed());
    this.pauseBtnEl.addEventListener('click', () => this.handlers.onTogglePause());

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
        this.showToast('DEV: +500 코인 지급');
      } else if (act === 'luck') {
        this.handlers.onDispatch({ type: 'grantTestResource', luck: 5 });
        this.showToast('DEV: +5 행운석 지급');
      } else if (act === 'wisp-common') {
        this.handlers.onDispatch({ type: 'grantTestResource', wispGrade: 'common' });
        this.showToast('DEV: +1 흔함 위습 지급');
      } else if (act === 'wisp-rare') {
        this.handlers.onDispatch({ type: 'grantTestResource', wispGrade: 'rare' });
        this.showToast('DEV: +1 희귀 위습 지급');
      }
    });

    // Selected unit bar events
    this.unitLockBtnEl.addEventListener('click', () => {
      const slotView = this.getSelectedSlotView(this.lastSnapshot);
      if (!slotView) return;
      this.handlers.onDispatch({ type: 'lock', uid: slotView.uid, locked: !slotView.locked });
    });

    this.unitSellBtnEl.addEventListener('click', () => {
      const slotView = this.getSelectedSlotView(this.lastSnapshot);
      if (!slotView) return;
      if (slotView.locked) {
        this.showToast('잠금 상태인 유닛은 먼저 잠금을 해제해 주세요.', true);
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

    // Recommended craft preview bar (shown while no unit is selected)
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

    // Bottom 5 Dock Buttons
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

    // BottomSheet backdrop & close & delegated actions
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
      }
    });

    // GameOver buttons
    this.mustGet('btn-gameover-inspect').addEventListener('click', () => {
      this.gameOverDismissed = true;
      this.gameOverModalEl.classList.remove('open');
    });

    this.mustGet('btn-gameover-restart').addEventListener('click', () => {
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

    // 1. Top HUD Wave & Boss status
    const waveStr = String(snapshot.wave).padStart(2, '0');
    this.waveBoxEl.classList.toggle('boss-mode', snapshot.isBossWave);
    this.setText(
      this.waveBadgeEl,
      snapshot.isBossWave ? `BOSS ${waveStr}` : `WAVE ${waveStr}`,
    );
    this.setText(this.waveTimerEl, ticksToClock(snapshot.waveTicksLeft));
    this.setText(this.devSimMetaEl, `30Hz · Tick ${snapshot.tick}`);

    if (snapshot.boss) {
      const bossPct = Math.max(0, Math.round((snapshot.boss.hp / Math.max(1, snapshot.boss.maxHp)) * 100));
      this.setText(this.monsterTitleEl, `${snapshot.boss.name} ${bossPct}%`);
    } else {
      this.setText(this.monsterTitleEl, '몬스터');
    }

    this.setText(this.monsterCountEl, `${snapshot.monsterCount} / ${snapshot.monsterCap}`);
    const pct = Math.min(100, Math.max(0, (snapshot.monsterCount / snapshot.monsterCap) * 100));
    this.monsterFillEl.style.width = `${pct.toFixed(1)}%`;
    this.monsterGaugeBoxEl.classList.toggle('danger', pct >= 75);

    this.setText(this.speedBtnEl, `${snapshot.speed === 0 ? 1 : snapshot.speed}x`);
    this.setText(this.pauseBtnEl, snapshot.paused ? '▶' : '⏸');
    this.pauseBtnEl.classList.toggle('active', snapshot.paused);

    // 2. Currencies & Dock badges
    this.setText(this.coinValEl, snapshot.coin.toLocaleString('ko-KR'));
    this.setText(this.luckValEl, String(snapshot.luckStone));

    const totalWisps = Object.values(snapshot.wisps).reduce((s, n) => s + (n ?? 0), 0);
    this.setText(this.wispValEl, String(totalWisps));
    this.setText(this.wispBadgeEl, String(totalWisps));
    this.wispBadgeEl.classList.toggle('visible', totalWisps > 0);

    this.setText(this.gambleBadgeEl, String(snapshot.luckStone));
    this.gambleBadgeEl.classList.toggle('visible', snapshot.luckStone > 0);

    this.setText(this.occupancyEl, `필드 ${snapshot.fieldOccupied}/18`);
    this.setText(this.benchCountEl, `${snapshot.benchOccupied}/12`);
    this.setText(this.summonCostEl, String(snapshot.summonCost));

    const totalCraftable = snapshot.craft.readyCount + snapshot.craft.chainReadyCount;
    this.setText(this.craftBadgeEl, String(totalCraftable));
    this.craftBadgeEl.classList.toggle('visible', totalCraftable > 0);
    this.craftBtnEl.classList.toggle('craft-lit', totalCraftable > 0);
    this.setText(
      this.craftCostEl,
      snapshot.craft.readyCount > 0
        ? `합성 ${snapshot.craft.readyCount}`
        : snapshot.craft.chainReadyCount > 0
          ? `연쇄 ${snapshot.craft.chainReadyCount}`
          : '도감',
    );

    const totalUpLv =
      snapshot.upgradeLv.common +
      snapshot.upgradeLv.rare +
      snapshot.upgradeLv.legendary +
      snapshot.upgradeLv.mythic;
    this.setText(this.upgradeCostEl, `Lv.${totalUpLv}`);

    // 3. Reject notices
    for (let i = 0; i < snapshot.rejects.length; i++) {
      this.showToast(snapshot.rejects[i]!.reason, true);
    }

    // 4. Selected unit bar (hidden when no unit is selected) / recommended craft bar otherwise
    this.refreshSelectedUnitBar(snapshot);
    this.refreshRecommendBar(snapshot);

    // 5. Active BottomSheet
    if (this.activeSheet) {
      this.refreshSheet(snapshot);
    }

    // 6. Game Over Modal
    if (snapshot.gameOver && !this.gameOverDismissed) {
      this.setText(
        this.gameOverSubEl,
        `WAVE ${waveStr} · 몬스터 ${snapshot.monsterCap}마리 초과`,
      );
      this.gameOverModalEl.classList.add('open');
    } else if (!snapshot.gameOver) {
      this.gameOverDismissed = false;
      this.gameOverModalEl.classList.remove('open');
    }
  }

  public forceRefreshSelection(): void {
    if (this.lastSnapshot) {
      this.refreshSelectedUnitBar(this.lastSnapshot);
      this.refreshRecommendBar(this.lastSnapshot);
    }
  }

  /** Picks the most valuable recipe to surface: highest-rank craftable, else the closest to completion. */
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

    const rec = this.pickRecommendedRecipe(snapshot);
    const st = rec ? snapshot.craft.recipes[rec.id] : undefined;
    const sig = `${rec?.id ?? 'none'}:${st?.lamp ?? ''}:${st?.have ?? 0}:${snapshot.craft.rev}:${snapshot.fieldOccupied + snapshot.benchOccupied}`;
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
    this.recImgEl.src = this.sprites.unitPortraitUrl(outUnit, outGrade);
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
        return `<span class="rec-ing ${ok ? 'ok' : 'miss'}"><img src="${this.sprites.unitPortraitUrl(u, g)}" alt="${escapeHtml(u.name)}" /><b>${cnt}</b></span>`;
      })
      .join('');

    const ready = st.lamp === 'ready';
    const chain = st.lamp === 'chainReady';
    this.recCtaEl.className = `rec-cta interactive${ready ? ' cta-ready' : chain ? ' cta-chain' : ''}`;
    this.recCtaEl.textContent = ready ? '합성!' : chain ? '연쇄 합성' : `${st.have}/${st.need}`;
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
        this.unitSelectBarEl.classList.remove('visible');
      }
      return;
    }

    const sig = `${slotView.uid}:${slotView.locked}:${slotView.bonusAtk}:${sel.area}:${sel.index}:${snapshot.craft.rev}`;
    if (sig === this.prevSelectSignature) {
      return;
    }
    this.prevSelectSignature = sig;

    const unitDef = this.data.unitsById.get(slotView.unitId);
    const gradeDef = this.data.gradesById.get(slotView.grade);
    if (!unitDef || !gradeDef) return;

    this.unitSelectBarEl.classList.add('visible');
    this.unitPortraitImgEl.src = this.sprites.unitPortraitUrl(unitDef, gradeDef);
    this.unitPortraitImgEl.alt = slotView.name;

    this.unitGradePillEl.textContent = gradeDef.name;
    this.unitGradePillEl.style.backgroundColor = gradeDef.color;
    this.unitNameEl.textContent = slotView.name;

    const atkText =
      slotView.bonusAtk > 0
        ? `⚔ ${slotView.baseAtk + slotView.bonusAtk}(+${slotView.bonusAtk})`
        : `⚔ ${slotView.baseAtk}`;
    this.unitStatEl.textContent = `${atkText} · ◎${slotView.range}`;
    this.unitStatEl.title = slotView.skillName;

    // Upper recipe shortcuts
    const upperRecipes = this.recipeGraph.byIngredient.get(slotView.unitId) ?? [];
    this.unitShortcutsEl.innerHTML = '';
    if (upperRecipes.length === 0) {
      const doneChip = document.createElement('span');
      doneChip.className = 'shortcut-chip ready';
      doneChip.textContent = '★ 최종 등급';
      this.unitShortcutsEl.appendChild(doneChip);
    } else {
      for (let i = 0; i < upperRecipes.length; i++) {
        const rec = upperRecipes[i]!;
        const outDef = this.data.unitsById.get(rec.output);
        const st = snapshot.craft.recipes[rec.id];
        if (!outDef || !st) continue;

        const isCraftable = st.lamp === 'ready' || st.lamp === 'chainReady';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `shortcut-chip interactive${isCraftable ? ' ready' : ''}`;
        btn.dataset.shortcutRecipe = rec.id;
        btn.textContent = isCraftable ? `⚡ ${outDef.name}` : `${outDef.name} ${st.have}/${st.need}`;
        this.unitShortcutsEl.appendChild(btn);
      }
    }

    this.unitLockBtnEl.classList.toggle('lock-on', slotView.locked);
    this.unitLockBtnEl.innerHTML = slotView.locked
      ? '<span>🔒</span><span>해제</span>'
      : '<span>🔓</span><span>잠금</span>';
    this.unitSellBtnEl.innerHTML = `<span>판매</span><span class="mini-price">${ICON.coin}${slotView.sellCoin}</span>`;
  }

  private refreshSheet(snapshot: UISnapshot): void {
    const kind = this.activeSheet;
    if (!kind) return;

    const totalSlotsUsed = snapshot.fieldOccupied + snapshot.benchOccupied;
    let sig = '';
    if (kind === 'craft') {
      sig = `craft:${this.craftTab}:${snapshot.craft.rev}:${totalSlotsUsed}`;
    } else if (kind === 'wisp') {
      sig = `wisp:${this.wispTab}:${snapshot.wisps.common ?? 0}:${snapshot.wisps.uncommon ?? 0}:${snapshot.wisps.rare ?? 0}:${snapshot.craft.rev}:${totalSlotsUsed}`;
    } else if (kind === 'gamble') {
      sig = `gamble:${snapshot.luckStone}:${snapshot.lastGambleResult?.seq ?? 0}:${totalSlotsUsed}`;
    } else {
      sig = `upgrade:${snapshot.coin}:${snapshot.luckStone}:${snapshot.upgradeLv.common}:${snapshot.upgradeLv.rare}:${snapshot.upgradeLv.legendary}:${snapshot.upgradeLv.mythic}`;
    }

    if (sig === this.prevSheetSignature) {
      return;
    }
    this.prevSheetSignature = sig;

    if (kind === 'craft') {
      this.renderCraftSheet(snapshot);
    } else if (kind === 'wisp') {
      this.renderWispSheet(snapshot);
    } else if (kind === 'gamble') {
      this.renderGambleSheet(snapshot);
    } else {
      this.renderUpgradeSheet(snapshot);
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

  private renderCraftSheet(snapshot: UISnapshot): void {
    this.setText(this.sheetTitleEl, '조합');
    this.setText(
      this.sheetSubtitleEl,
      `합성 ${snapshot.craft.readyCount} · 연쇄 ${snapshot.craft.chainReadyCount}`,
    );

    // Grade tabs
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

    // Gather all recipes sorted by grade rank
    const allRecipes: RecipeDef[] = [];
    for (let i = 0; i < this.recipeGraph.topo.length; i++) {
      const r = this.recipeGraph.recipesById.get(this.recipeGraph.topo[i]!);
      if (r) allRecipes.push(r);
    }

    // 1) Pinned ready / chainReady recipes at the very top (highest rank first!)
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

    // 2) Filtered recipe list
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
      parts.push('<div class="sheet-section-label">⚡ 지금 합성 가능</div>');
      for (let i = 0; i < readyList.length; i++) {
        parts.push(this.buildRecipeCardHtml(readyList[i]!, snapshot, unlocked));
      }
    }

    const sectionTitle =
      this.craftTab === 'all'
        ? '전체 조합식'
        : `${this.craftTabs.find((t) => t.id === this.craftTab)?.label ?? ''} 조합식`;
    parts.push(`<div class="sheet-section-label">${escapeHtml(sectionTitle)}</div>`);

    for (let i = 0; i < restRecipes.length; i++) {
      parts.push(this.buildRecipeCardHtml(restRecipes[i]!, snapshot, unlocked));
    }

    this.sheetBodyEl.innerHTML = parts.join('');
  }

  private buildRecipeCardHtml(
    recipe: RecipeDef,
    snapshot: UISnapshot,
    unlocked: ReadonlyMap<UnitId, number>,
  ): string {
    const outUnit = this.data.unitsById.get(recipe.output);
    if (!outUnit) return '';
    const outGrade = this.data.gradesById.get(outUnit.grade);
    if (!outGrade) return '';

    const st = snapshot.craft.recipes[recipe.id];
    const lamp = st?.lamp ?? 'none';
    const cardStateClass =
      lamp === 'ready' ? ' card-ready' : lamp === 'chainReady' ? ' card-chain' : '';

    const portraitUrl = this.sprites.unitPortraitUrl(outUnit, outGrade);

    const ingChips = recipe.ingredients
      .map((ing) => {
        const ingUnit = this.data.unitsById.get(ing.unit);
        if (!ingUnit) return '';
        const ingGrade = this.data.gradesById.get(ingUnit.grade);
        const ingImg = ingGrade ? this.sprites.unitPortraitUrl(ingUnit, ingGrade) : '';
        const owned = unlocked.get(ing.unit) ?? 0;
        const ok = owned >= ing.n;
        const statusText = ok ? (ing.n > 1 ? `${ing.n}/${ing.n}` : '✓') : `${owned}/${ing.n}`;
        return `<span class="ing-chip ${ok ? 'ing-ok' : 'ing-miss'}"><img src="${ingImg}" alt="" /><span>${escapeHtml(ingUnit.name)}</span><b>${statusText}</b></span>`;
      })
      .join('');

    let ctaHtml = '';
    if (lamp === 'ready') {
      ctaHtml = `<button type="button" class="card-cta-btn interactive" data-sheet-action="craft" data-recipe-id="${recipe.id}" data-chain="0"><span>합성</span></button>`;
    } else if (lamp === 'chainReady') {
      ctaHtml = `<button type="button" class="card-cta-btn cta-sky interactive" data-sheet-action="craft" data-recipe-id="${recipe.id}" data-chain="1"><span>연쇄 합성</span></button>`;
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
              <span class="card-name">${escapeHtml(outUnit.name)}</span>
              <span class="card-sub">⚔${outUnit.atk}</span>
            </div>
            <div class="ing-list">${ingChips}</div>
          </div>
        </div>
        ${ctaHtml}
      </div>
    `;
  }

  private renderWispSheet(snapshot: UISnapshot): void {
    const totalWisps = Object.values(snapshot.wisps).reduce((s, n) => s + (n ?? 0), 0);
    this.setText(this.sheetTitleEl, '위습 소환');
    this.setText(this.sheetSubtitleEl, `보유 ${totalWisps}`);

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
        const portrait = this.sprites.unitPortraitUrl(u, g);
        const owned = unlocked.get(uid) ?? 0;
        const hint = hintMap.get(uid);

        let hintBadge = '';
        let recommendClass = '';
        if (hint?.completes) {
          const completedOut = this.recipeGraph.recipesById.get(hint.completes)?.output;
          const outName = completedOut ? (this.data.unitsById.get(completedOut)?.name ?? '상위 유닛') : '상위 유닛';
          hintBadge = `<span class="hint-pill">⚡ ${escapeHtml(outName)}</span>`;
          recommendClass = ' wisp-recommend';
        } else if (hint && hint.gain > 0) {
          hintBadge = '<span class="hint-pill sub">재료</span>';
        }

        const canSummon = gradeCount > 0 && hasFreeSlot;
        const btnLabel = !hasFreeSlot ? '가득참' : gradeCount > 0 ? '소환' : '위습 0';

        return `
          <div class="wisp-card${recommendClass}">
            <div class="card-left">
              <div class="card-avatar"><img src="${portrait}" alt="" /></div>
              <div class="card-info">
                <div class="card-name-row">
                  <span class="card-name">${escapeHtml(u.name)}</span>
                  ${hintBadge}
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

  private renderGambleSheet(snapshot: UISnapshot): void {
    this.setText(this.sheetTitleEl, '도박');
    this.setText(this.sheetSubtitleEl, `행운석 ${snapshot.luckStone}`);
    this.sheetTabsEl.style.display = 'none';
    this.sheetTabsEl.innerHTML = '';

    const res = snapshot.lastGambleResult;
    let bannerClass = 'gamble-result-box';
    let bannerText = '🎲 행운을 시험해 보세요!';

    if (res) {
      const gName = this.data.gradesById.get(res.tier)?.name ?? res.tier;
      if (res.success && res.unitId) {
        const uName = this.data.unitsById.get(res.unitId)?.name ?? res.unitId;
        bannerClass = 'gamble-result-box win';
        bannerText = `🎉 성공! ${gName} ${uName}`;
      } else {
        bannerClass = 'gamble-result-box lose';
        bannerText = `💨 실패... (${gName})`;
      }
    }

    const hasFreeSlot = snapshot.fieldOccupied + snapshot.benchOccupied < 30;

    const rateCards = this.data.gambleRates
      .map((rate) => {
        const gradeDef = this.data.gradesById.get(rate.tier);
        const repId = GAMBLE_REP_UNIT[rate.tier] ?? 'luffy_gear2';
        const repUnit = this.data.unitsById.get(repId);
        const portrait =
          repUnit && gradeDef ? this.sprites.unitPortraitUrl(repUnit, gradeDef) : '';

        const canRoll = snapshot.luckStone >= rate.costLuck && hasFreeSlot;
        const btnText = !hasFreeSlot ? '가득참' : snapshot.luckStone >= rate.costLuck ? '도전!' : '부족';

        return `
          <div class="sheet-card">
            <div class="card-left">
              <div class="card-avatar"><img src="${portrait}" alt="" /></div>
              <div class="card-info">
                <div class="card-name-row">
                  <span class="grade-pill" style="background:${gradeDef?.color ?? '#34d399'}">${escapeHtml(gradeDef?.name ?? rate.tier)}</span>
                  <span class="card-name">${escapeHtml(rate.label)}</span>
                </div>
                <div class="card-sub"><span class="rate-pct">${rate.chancePct}%</span></div>
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
              <span class="mini-price">${ICON.clover}${rate.costLuck}</span>
            </button>
          </div>
        `;
      })
      .join('');

    this.sheetBodyEl.innerHTML = `
      <div id="gamble-outcome-banner" class="${bannerClass}">${escapeHtml(bannerText)}</div>
      ${rateCards}
    `;

    // Re-trigger CSS keyframe animation when consecutive gamble rolls happen
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

  private renderUpgradeSheet(snapshot: UISnapshot): void {
    this.setText(this.sheetTitleEl, '강화');
    this.setText(
      this.sheetSubtitleEl,
      `코인 ${snapshot.coin.toLocaleString('ko-KR')} · 행운석 ${snapshot.luckStone}`,
    );
    this.sheetTabsEl.style.display = 'none';
    this.sheetTabsEl.innerHTML = '';

    const cards = this.data.upgrades
      .map((up) => {
        const lv = snapshot.upgradeLv[up.id] ?? 0;
        const isMax = lv >= up.maxLevel;
        const cost = up.baseCost + lv * up.costStep;
        const icon = up.currency === 'coin' ? ICON.coin : ICON.clover;
        const affordable = up.currency === 'coin' ? snapshot.coin >= cost : snapshot.luckStone >= cost;

        const repUnit = this.data.unitsById.get(UPGRADE_REP_UNIT[up.id]);
        const repGrade = repUnit ? this.data.gradesById.get(repUnit.grade) : undefined;
        const portrait = repUnit && repGrade ? this.sprites.unitPortraitUrl(repUnit, repGrade) : '';

        const curPct = lv * up.atkBonusPctPerLv;
        const nextPct = Math.min(up.maxLevel, lv + 1) * up.atkBonusPctPerLv;

        return `
          <div class="sheet-card">
            <div class="card-left">
              <div class="card-avatar"><img src="${portrait}" alt="" /></div>
              <div class="card-info">
                <div class="card-name-row">
                  <span class="grade-pill" style="background:${repGrade?.color ?? '#fb923c'}">Lv. ${lv}</span>
                  <span class="card-name">${escapeHtml(up.name)}</span>
                </div>
                <div class="card-sub">
                  ${isMax ? `ATK +${curPct}% · MAX` : `ATK +${curPct}% → <b class="up-next">+${nextPct}%</b>`}
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
              <span>${isMax ? 'MAX' : '강화'}</span>
              ${isMax ? '' : `<span class="mini-price">${icon}${cost}</span>`}
            </button>
          </div>
        `;
      })
      .join('');

    this.sheetBodyEl.innerHTML = cards;
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
