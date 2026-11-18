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
  }

  public mount(): void {
    this.root.innerHTML = `
      <header class="hud-bar" aria-label="전투 상태 표시줄">
        <div id="hud-wave-box" class="wave-box">
          <span id="hud-wave-badge" class="wave-badge">WAVE 01</span>
          <span id="hud-wave-timer" class="wave-timer">00:28</span>
        </div>

        <div id="hud-monster-gauge" class="monster-gauge">
          <div class="monster-gauge-top">
            <span id="hud-monster-title" class="monster-gauge-title">경로 몬스터 한도</span>
            <span id="hud-monster-count" class="monster-gauge-count">0 / 100</span>
          </div>
          <div class="monster-gauge-track">
            <div id="hud-monster-fill" class="monster-gauge-fill"></div>
          </div>
        </div>

        <div class="hud-controls">
          <button id="btn-speed" type="button" class="hud-btn interactive active" aria-label="배속 전환">1x</button>
          <button id="btn-pause" type="button" class="hud-btn interactive" aria-label="일시정지 전환">⏸</button>
          <button id="btn-dev" type="button" class="hud-btn dev-btn interactive" aria-label="개발자 테스트 메뉴">DEV</button>
        </div>
      </header>

      <aside id="dev-popover" class="dev-popover interactive" aria-label="개발자 치트 도구">
        <div id="dev-sim-meta" class="dev-popover-meta">30Hz · Tick 0</div>
        <div class="dev-popover-grid">
          <button type="button" class="dev-chip-btn interactive" data-dev-action="coin">+500 🪙 코인</button>
          <button type="button" class="dev-chip-btn interactive" data-dev-action="luck">+5 🍀 행운석</button>
          <button type="button" class="dev-chip-btn interactive" data-dev-action="wisp-common">+1 흔함 위습</button>
          <button type="button" class="dev-chip-btn interactive" data-dev-action="wisp-rare">+1 희귀 위습</button>
        </div>
      </aside>

      <div id="toast-layer" class="toast-layer" aria-live="polite"></div>

      <section id="unit-select-bar" class="unit-select-bar" aria-label="선택 유닛 상세 및 상위 조합식">
        <div class="unit-select-left">
          <div class="unit-portrait-box">
            <img id="sel-unit-img" alt="" />
          </div>
          <div class="unit-meta-col">
            <div class="unit-title-row">
              <span id="sel-unit-grade" class="grade-pill">흔함</span>
              <span id="sel-unit-name" class="unit-name-label">루피</span>
            </div>
            <div id="sel-unit-stat" class="unit-stat-label">공격력 26 · 사거리 155</div>
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
            <span class="currency-pill"><span>🪙</span><span id="val-coin">220</span></span>
            <span class="currency-pill"><span>🍀</span><span id="val-luck">4</span></span>
            <span class="currency-pill"><span>✦</span><span id="val-wisp">3</span></span>
          </div>
          <span id="val-occupancy" class="slot-occupancy">필드 0/18 · 대기 0/12</span>
        </div>

        <div class="action-row">
          <button id="btn-summon" type="button" class="action-btn btn-summon interactive">
            <span class="action-icon">⚓</span>
            <span class="action-title">소환</span>
            <span id="val-summon-cost" class="action-cost">🪙 20</span>
          </button>

          <button id="btn-gamble" type="button" class="action-btn btn-gamble interactive">
            <span id="badge-gamble" class="lamp-badge">0</span>
            <span class="action-icon">🎲</span>
            <span class="action-title">도박</span>
            <span class="action-cost">🍀 1~4</span>
          </button>

          <button id="btn-wisp" type="button" class="action-btn btn-wisp interactive">
            <span id="badge-wisp" class="lamp-badge">0</span>
            <span class="action-icon">✦</span>
            <span class="action-title">위습</span>
            <span class="action-cost">선택 소환</span>
          </button>

          <button id="btn-craft" type="button" class="action-btn btn-craft interactive">
            <span id="badge-craft" class="lamp-badge">0</span>
            <span class="action-icon">⚔️</span>
            <span class="action-title">조합</span>
            <span id="val-craft-state" class="action-cost">조합 도감</span>
          </button>

          <button id="btn-upgrade" type="button" class="action-btn btn-upgrade interactive">
            <span class="action-icon">🔥</span>
            <span class="action-title">강화</span>
            <span id="val-upgrade-state" class="action-cost">공격 증폭</span>
          </button>
        </div>
      </footer>

      <div id="sheet-backdrop" class="sheet-backdrop interactive" role="dialog" aria-modal="true">
        <div id="bottom-sheet" class="bottom-sheet">
          <div class="sheet-header">
            <div class="sheet-title-wrap">
              <div id="sheet-title" class="sheet-title">조합 도감</div>
              <div id="sheet-subtitle" class="sheet-subtitle">원터치로 상위 해적을 완성하세요</div>
            </div>
            <button id="btn-sheet-close" type="button" class="sheet-close-btn interactive" aria-label="닫기">✕</button>
          </div>
          <div id="sheet-tabs" class="sheet-tabs"></div>
          <div id="sheet-body" class="sheet-body"></div>
        </div>
      </div>

      <div id="gameover-modal" class="gameover-modal interactive" role="alertdialog" aria-modal="true">
        <div class="gameover-card">
          <div class="gameover-title">해적단 방어선 돌파!</div>
          <div id="gameover-sub" class="gameover-sub">경로 몬스터 한도(100마리)를 초과했습니다.</div>
          <div class="gameover-actions">
            <button id="btn-gameover-inspect" type="button" class="card-cta-btn interactive">전장 확인</button>
            <button id="btn-gameover-restart" type="button" class="card-cta-btn cta-green interactive">새 항해 시작</button>
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
      snapshot.isBossWave ? `⚠️ BOSS W${waveStr}` : `WAVE ${waveStr}`,
    );
    this.setText(this.waveTimerEl, ticksToClock(snapshot.waveTicksLeft));
    this.setText(this.devSimMetaEl, `30Hz · Tick ${snapshot.tick}`);

    if (snapshot.boss) {
      const bossPct = Math.max(0, Math.round((snapshot.boss.hp / Math.max(1, snapshot.boss.maxHp)) * 100));
      this.setText(this.monsterTitleEl, `⚠️ ${snapshot.boss.name} (${bossPct}%) · 경로`);
    } else {
      this.setText(this.monsterTitleEl, '경로 몬스터 한도');
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

    this.setText(
      this.occupancyEl,
      `필드 ${snapshot.fieldOccupied}/18 · 대기 ${snapshot.benchOccupied}/12`,
    );
    this.setText(this.summonCostEl, `🪙 ${snapshot.summonCost}`);

    const totalCraftable = snapshot.craft.readyCount + snapshot.craft.chainReadyCount;
    this.setText(this.craftBadgeEl, String(totalCraftable));
    this.craftBadgeEl.classList.toggle('visible', totalCraftable > 0);
    this.craftBtnEl.classList.toggle('craft-lit', totalCraftable > 0);
    this.setText(
      this.craftCostEl,
      snapshot.craft.readyCount > 0
        ? `즉시 합성 ${snapshot.craft.readyCount}`
        : snapshot.craft.chainReadyCount > 0
          ? `연쇄 합성 ${snapshot.craft.chainReadyCount}`
          : '조합 도감',
    );

    const totalUpLv =
      snapshot.upgradeLv.common +
      snapshot.upgradeLv.rare +
      snapshot.upgradeLv.legendary +
      snapshot.upgradeLv.mythic;
    this.setText(this.upgradeCostEl, totalUpLv > 0 ? `총 +${totalUpLv}강` : '공격 증폭');

    // 3. Reject notices
    for (let i = 0; i < snapshot.rejects.length; i++) {
      this.showToast(snapshot.rejects[i]!.reason, true);
    }

    // 4. Selected unit bar (hidden when no unit is selected)
    this.refreshSelectedUnitBar(snapshot);

    // 5. Active BottomSheet
    if (this.activeSheet) {
      this.refreshSheet(snapshot);
    }

    // 6. Game Over Modal
    if (snapshot.gameOver && !this.gameOverDismissed) {
      this.setText(
        this.gameOverSubEl,
        `WAVE ${waveStr}에서 경로 몬스터 한도(${snapshot.monsterCap}마리)를 초과했습니다.`,
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
    }
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
        ? `⚔️ ${slotView.baseAtk + slotView.bonusAtk} (+${slotView.bonusAtk})`
        : `⚔️ ${slotView.baseAtk}`;
    const areaNote = sel.area === 'bench' ? ' · 대기석(비전투)' : '';
    this.unitStatEl.textContent = `${atkText} · 사거리 ${slotView.range} · ⚡${slotView.skillName}${areaNote}`;

    // Upper recipe shortcuts
    const upperRecipes = this.recipeGraph.byIngredient.get(slotView.unitId) ?? [];
    this.unitShortcutsEl.innerHTML = '';
    if (upperRecipes.length === 0) {
      const doneChip = document.createElement('span');
      doneChip.className = 'shortcut-chip ready';
      doneChip.textContent = '★ 최종 각성 등급';
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
        btn.textContent = isCraftable
          ? `⚡ ${outDef.name} 합성!`
          : `▶ ${outDef.name} (${st.have}/${st.need})`;
        this.unitShortcutsEl.appendChild(btn);
      }
    }

    this.unitLockBtnEl.classList.toggle('lock-on', slotView.locked);
    this.unitLockBtnEl.innerHTML = slotView.locked
      ? '<span>🔒</span><span>잠금됨</span>'
      : '<span>🔓</span><span>잠금</span>';
    this.unitSellBtnEl.innerHTML = `<span>판매</span><span>+${slotView.sellCoin}🪙</span>`;
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
    this.setText(this.sheetTitleEl, '⚔️ 원피스 해적 조합 도감');
    this.setText(
      this.sheetSubtitleEl,
      `즉시 합성 ${snapshot.craft.readyCount}종 · 연쇄 합성 ${snapshot.craft.chainReadyCount}종 (잠금 유닛은 재료에서 보호됨)`,
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
      parts.push('<div class="sheet-section-label">⚡ 지금 바로 원터치 합성 가능!</div>');
      for (let i = 0; i < readyList.length; i++) {
        parts.push(this.buildRecipeCardHtml(readyList[i]!, snapshot, unlocked));
      }
    }

    const sectionTitle =
      this.craftTab === 'all'
        ? '📜 전체 상위 조합 트리 (보유 / 부족 재료)'
        : `📜 ${this.craftTabs.find((t) => t.id === this.craftTab)?.label ?? ''} 등급 조합식`;
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
        const statusText = ok
          ? ing.n > 1
            ? `${owned}/${ing.n} ✓`
            : '보유 ✓'
          : `부족 ${ing.n - owned}`;
        return `<span class="ing-chip ${ok ? 'ing-ok' : 'ing-miss'}"><img src="${ingImg}" alt="" /><span>${escapeHtml(ingUnit.name)} · ${statusText}</span></span>`;
      })
      .join('');

    let ctaHtml = '';
    if (lamp === 'ready') {
      ctaHtml = `<button type="button" class="card-cta-btn interactive" data-sheet-action="craft" data-recipe-id="${recipe.id}" data-chain="0"><span>⚡ 즉시 합성</span><span>원터치 완성</span></button>`;
    } else if (lamp === 'chainReady') {
      ctaHtml = `<button type="button" class="card-cta-btn cta-sky interactive" data-sheet-action="craft" data-recipe-id="${recipe.id}" data-chain="1"><span>🔗 연쇄 합성</span><span>하위 자동조합</span></button>`;
    } else {
      ctaHtml = `<button type="button" class="card-cta-btn cta-disabled" disabled><span>재료 부족</span><span>${st?.have ?? 0} / ${st?.need ?? recipe.ingredients.length}</span></button>`;
    }

    return `
      <div class="sheet-card${cardStateClass}">
        <div class="card-left">
          <div class="card-avatar"><img src="${portraitUrl}" alt="" /></div>
          <div class="card-info">
            <div class="card-name-row">
              <span class="grade-pill" style="background:${outGrade.color}">${escapeHtml(outGrade.name)}</span>
              <span class="card-name">${escapeHtml(outUnit.name)}</span>
              <span class="card-sub">⚔️${outUnit.atk} · ⚡${escapeHtml(outUnit.skill.name)}</span>
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
    this.setText(this.sheetTitleEl, '✦ 위습 선택 소환');
    this.setText(
      this.sheetSubtitleEl,
      `부족한 조합 재료를 확정 소환합니다 · 보유 위습 총 ${totalWisps}개`,
    );

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
          hintBadge = `<span class="hint-pill">⚡ ${escapeHtml(outName)} 완성!</span>`;
          recommendClass = ' wisp-recommend';
        } else if (hint && hint.gain > 0) {
          hintBadge = '<span class="hint-pill sub">조합 재료</span>';
        }

        const canSummon = gradeCount > 0 && hasFreeSlot;
        const btnLabel = !hasFreeSlot ? '슬롯 가득참' : gradeCount > 0 ? '선택 소환' : '위습 없음';

        return `
          <div class="wisp-card${recommendClass}">
            <div class="card-left">
              <div class="card-avatar"><img src="${portrait}" alt="" /></div>
              <div class="card-info">
                <div class="card-name-row">
                  <span class="card-name">${escapeHtml(u.name)}</span>
                  ${hintBadge}
                </div>
                <div class="card-sub">보유 ${owned}기 · ⚔️${u.atk}</div>
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
              <span>✦ 1 소모</span>
            </button>
          </div>
        `;
      })
      .join('');

    this.sheetBodyEl.innerHTML = `<div class="wisp-grid">${cardsHtml}</div>`;
  }

  private renderGambleSheet(snapshot: UISnapshot): void {
    this.setText(this.sheetTitleEl, '🎲 행운석 해적 도박장');
    this.setText(
      this.sheetSubtitleEl,
      `행운석(🍀)으로 상위 등급 영웅을 단번에 노려보세요! · 보유 🍀 ${snapshot.luckStone}`,
    );
    this.sheetTabsEl.style.display = 'none';
    this.sheetTabsEl.innerHTML = '';

    const res = snapshot.lastGambleResult;
    let bannerClass = 'gamble-result-box';
    let bannerText = '🍀 도박 등급을 선택해 확률 대박에 도전하세요!';

    if (res) {
      const gName = this.data.gradesById.get(res.tier)?.name ?? res.tier;
      if (res.success && res.unitId) {
        const uName = this.data.unitsById.get(res.unitId)?.name ?? res.unitId;
        bannerClass = 'gamble-result-box win';
        bannerText = `🎉 도박 대성공! [${gName}] ${uName} 합류!`;
      } else {
        bannerClass = 'gamble-result-box lose';
        bannerText = `💨 도박 실패... [${gName}] 영웅 영입에 실패했습니다.`;
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
        const btnText = !hasFreeSlot
          ? '슬롯 가득참'
          : snapshot.luckStone >= rate.costLuck
            ? '도박 도전!'
            : '행운석 부족';

        return `
          <div class="sheet-card">
            <div class="card-left">
              <div class="card-avatar"><img src="${portrait}" alt="" /></div>
              <div class="card-info">
                <div class="card-name-row">
                  <span class="grade-pill" style="background:${gradeDef?.color ?? '#34d399'}">${escapeHtml(gradeDef?.name ?? rate.tier)}</span>
                  <span class="card-name">${escapeHtml(rate.label)}</span>
                  <span class="hint-pill">성공 확률 ${rate.chancePct}%</span>
                </div>
                <div class="card-sub">${escapeHtml(rate.desc)}</div>
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
              <span>🍀 ${rate.costLuck}</span>
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
    this.setText(this.sheetTitleEl, '🔥 패기 & 해적단 공격력 강화');
    this.setText(
      this.sheetSubtitleEl,
      `등급군별 기본 공격력을 영구 증폭합니다 · 보유 🪙 ${snapshot.coin.toLocaleString('ko-KR')} · 🍀 ${snapshot.luckStone}`,
    );
    this.sheetTabsEl.style.display = 'none';
    this.sheetTabsEl.innerHTML = '';

    const cards = this.data.upgrades
      .map((up) => {
        const lv = snapshot.upgradeLv[up.id] ?? 0;
        const isMax = lv >= up.maxLevel;
        const cost = up.baseCost + lv * up.costStep;
        const icon = up.currency === 'coin' ? '🪙' : '🍀';
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
                  ${isMax ? `최대 강화 달성! (공격력 +${curPct}%)` : `공격력 증폭: +${curPct}% → +${nextPct}% (+${up.atkBonusPctPerLv}%)`}
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
              <span>${isMax ? 'MAX' : '강화하기'}</span>
              <span>${isMax ? '완료' : `${icon} ${cost}`}</span>
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
