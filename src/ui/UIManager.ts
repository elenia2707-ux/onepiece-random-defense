import type { GameCommand, SlotRef } from '../core/CommandQueue';
import type { SlotView, UISnapshot } from '../core/Simulation';
import { ticksToClock } from '../core/time';
import type { GameDataBundle } from '../data/types';

export interface UIControlHandlers {
  onDispatch(cmd: GameCommand): void;
  onCycleSpeed(): void;
  onTogglePause(): void;
  onTriggerTestFx(): void;
  getSelectedSlot(): SlotRef | null;
  clearSelection(): void;
}

const NORMAL_SYNC_INTERVAL_MS = 100; // Max 10Hz for non-priority HUD fields (AGENTS.md §4)

export class UIManager {
  private readonly root: HTMLElement;
  private readonly data: GameDataBundle;
  private readonly handlers: UIControlHandlers;

  private waveBadgeEl!: HTMLElement;
  private waveTimerEl!: HTMLElement;
  private simMetaEl!: HTMLElement;
  private monsterGaugeBoxEl!: HTMLElement;
  private monsterCountEl!: HTMLElement;
  private monsterFillEl!: HTMLElement;
  private speedBtnEl!: HTMLButtonElement;
  private pauseBtnEl!: HTMLButtonElement;

  private contextTitleEl!: HTMLElement;
  private contextSubEl!: HTMLElement;
  private contextActionsEl!: HTMLElement;

  private coinValEl!: HTMLElement;
  private luckValEl!: HTMLElement;
  private wispValEl!: HTMLElement;
  private occupancyEl!: HTMLElement;

  private summonBtnEl!: HTMLButtonElement;
  private summonCostEl!: HTMLElement;
  private wispBtnEl!: HTMLButtonElement;
  private wispBadgeEl!: HTMLElement;
  private craftBtnEl!: HTMLButtonElement;
  private craftCostEl!: HTMLElement;
  private craftBadgeEl!: HTMLElement;

  private toastLayerEl!: HTMLElement;

  private lastSyncMs = -1000;
  private lastSnapshot: UISnapshot | null = null;
  private prevContextSignature = '';
  private prevTextCache = new Map<HTMLElement, string>();

  public constructor(data: GameDataBundle, handlers: UIControlHandlers) {
    const el = document.getElementById('ui-root');
    if (!(el instanceof HTMLElement)) {
      throw new Error('[UIManager] Missing #ui-root container');
    }
    this.root = el;
    this.data = data;
    this.handlers = handlers;
  }

  public mount(): void {
    this.root.innerHTML = `
      <header class="hud-bar" aria-label="전투 상태 표시줄">
        <div class="wave-box">
          <div class="wave-label">
            <span id="hud-wave-badge" class="wave-badge">W 01</span>
            <span id="hud-wave-timer" class="wave-timer">00:30</span>
          </div>
          <span id="hud-sim-meta" class="sim-meta">30Hz · Tick 0</span>
        </div>

        <div id="hud-monster-gauge" class="monster-gauge">
          <div class="monster-gauge-top">
            <span class="monster-gauge-title">경로 몬스터</span>
            <span id="hud-monster-count" class="monster-gauge-count">0 / 100</span>
          </div>
          <div class="monster-gauge-track">
            <div id="hud-monster-fill" class="monster-gauge-fill"></div>
          </div>
        </div>

        <div class="hud-controls">
          <button id="btn-speed" type="button" class="hud-btn interactive active" aria-label="배속 전환">1x</button>
          <button id="btn-pause" type="button" class="hud-btn interactive" aria-label="일시정지 전환">⏸</button>
        </div>
      </header>

      <div id="toast-layer" class="toast-layer" aria-live="polite"></div>

      <section id="context-strip" class="context-strip" aria-label="선택 유닛 및 테스트 도구">
        <div class="context-info">
          <div id="context-title" class="context-title">그리드 소환 · 드래그 이동 테스트</div>
          <div id="context-sub" class="context-sub">유닛을 드래그하거나 다른 칸을 탭해 필드(18칸) ↔ 대기석(12칸) 교체</div>
        </div>
        <div id="context-actions" class="context-actions"></div>
      </section>

      <footer class="bottom-dock" aria-label="하단 조작 바">
        <div class="currency-bar">
          <div class="currency-group">
            <span class="currency-item"><span class="currency-icon">🪙</span><span id="val-coin">500</span></span>
            <span class="currency-item"><span class="currency-icon luck">🍀</span><span id="val-luck">5</span></span>
            <span class="currency-item"><span class="currency-icon wisp">✦</span><span id="val-wisp">2</span></span>
          </div>
          <span id="val-occupancy" class="slot-occupancy">필드 0/18 · 대기 0/12</span>
        </div>

        <div class="action-row">
          <button id="btn-summon" type="button" class="action-btn primary interactive">
            <span class="action-title">소환</span>
            <span id="val-summon-cost" class="action-cost">🪙 20</span>
          </button>

          <button id="btn-gamble" type="button" class="action-btn muted interactive">
            <span class="action-title">도박</span>
            <span class="action-cost">🍀 1</span>
          </button>

          <button id="btn-wisp" type="button" class="action-btn interactive">
            <span id="badge-wisp" class="lamp-badge">0</span>
            <span class="action-title">위습</span>
            <span class="action-cost">선택 소환</span>
          </button>

          <button id="btn-craft" type="button" class="action-btn interactive">
            <span id="badge-craft" class="lamp-badge">0</span>
            <span class="action-title">조합</span>
            <span id="val-craft-state" class="action-cost">대기 중</span>
          </button>

          <button id="btn-upgrade" type="button" class="action-btn muted interactive">
            <span class="action-title">강화</span>
            <span class="action-cost">2단계</span>
          </button>
        </div>
      </footer>
    `;

    this.waveBadgeEl = this.mustGet('hud-wave-badge');
    this.waveTimerEl = this.mustGet('hud-wave-timer');
    this.simMetaEl = this.mustGet('hud-sim-meta');
    this.monsterGaugeBoxEl = this.mustGet('hud-monster-gauge');
    this.monsterCountEl = this.mustGet('hud-monster-count');
    this.monsterFillEl = this.mustGet('hud-monster-fill');
    this.speedBtnEl = this.mustGet('btn-speed') as HTMLButtonElement;
    this.pauseBtnEl = this.mustGet('btn-pause') as HTMLButtonElement;

    this.contextTitleEl = this.mustGet('context-title');
    this.contextSubEl = this.mustGet('context-sub');
    this.contextActionsEl = this.mustGet('context-actions');

    this.coinValEl = this.mustGet('val-coin');
    this.luckValEl = this.mustGet('val-luck');
    this.wispValEl = this.mustGet('val-wisp');
    this.occupancyEl = this.mustGet('val-occupancy');

    this.summonBtnEl = this.mustGet('btn-summon') as HTMLButtonElement;
    this.summonCostEl = this.mustGet('val-summon-cost');
    this.wispBtnEl = this.mustGet('btn-wisp') as HTMLButtonElement;
    this.wispBadgeEl = this.mustGet('badge-wisp');
    this.craftBtnEl = this.mustGet('btn-craft') as HTMLButtonElement;
    this.craftCostEl = this.mustGet('val-craft-state');
    this.craftBadgeEl = this.mustGet('badge-craft');
    this.toastLayerEl = this.mustGet('toast-layer');

    this.speedBtnEl.addEventListener('click', () => this.handlers.onCycleSpeed());
    this.pauseBtnEl.addEventListener('click', () => this.handlers.onTogglePause());
    this.summonBtnEl.addEventListener('click', () =>
      this.handlers.onDispatch({ type: 'summon' }),
    );

    this.mustGet('btn-gamble').addEventListener('click', () => {
      this.showToast('도박 패널은 2단계에서 연결됩니다.');
    });

    this.mustGet('btn-upgrade').addEventListener('click', () => {
      this.showToast('등급 강화 패널은 2단계에서 연결됩니다.');
    });

    this.wispBtnEl.addEventListener('click', () => {
      const snap = this.lastSnapshot;
      if (!snap) return;
      const grades = Object.keys(snap.wisps).filter((g) => (snap.wisps[g] ?? 0) > 0);
      if (grades.length === 0) {
        this.showToast('보유한 위습이 없습니다.', true);
        return;
      }
      const targetGrade = grades[0]!;
      const hints = snap.wispHints[targetGrade];
      const bestUnit = hints?.[0]?.unitId ?? this.data.wispPools[targetGrade]?.[0];
      if (!bestUnit) return;
      const uName = this.data.unitsById.get(bestUnit)?.name ?? bestUnit;
      this.handlers.onDispatch({ type: 'useWisp', grade: targetGrade, unitId: bestUnit });
      this.showToast(`위습 추천 선택: ${uName}`);
    });

    this.craftBtnEl.addEventListener('click', () => {
      const snap = this.lastSnapshot;
      if (!snap) return;
      let chosenRecipeId: string | null = null;
      let isChain = false;

      for (const [rid, st] of Object.entries(snap.craft.recipes)) {
        if (st.lamp === 'ready') {
          chosenRecipeId = rid;
          isChain = false;
          break;
        }
      }
      if (!chosenRecipeId) {
        for (const [rid, st] of Object.entries(snap.craft.recipes)) {
          if (st.lamp === 'chainReady') {
            chosenRecipeId = rid;
            isChain = true;
            break;
          }
        }
      }

      if (!chosenRecipeId) {
        this.showToast('조합 가능한 상위 유닛 재료가 아직 부족합니다.', true);
        return;
      }
      this.handlers.onDispatch({ type: 'craft', recipeId: chosenRecipeId, chain: isChain });
    });
  }

  public sync(snapshot: UISnapshot, nowMs: number, forcePriority: boolean): void {
    if (!forcePriority && nowMs - this.lastSyncMs < NORMAL_SYNC_INTERVAL_MS) {
      return;
    }
    this.lastSyncMs = nowMs;
    this.lastSnapshot = snapshot;

    this.setText(this.waveBadgeEl, `W ${String(snapshot.wave).padStart(2, '0')}`);
    this.setText(this.waveTimerEl, ticksToClock(snapshot.waveTicksLeft));
    this.setText(
      this.simMetaEl,
      snapshot.gameOver ? '패배 (몬스터 한도 초과)' : `30Hz · Tick ${snapshot.tick}`,
    );

    this.setText(this.monsterCountEl, `${snapshot.monsterCount} / ${snapshot.monsterCap}`);
    const pct = Math.min(100, Math.max(0, (snapshot.monsterCount / snapshot.monsterCap) * 100));
    this.monsterFillEl.style.width = `${pct.toFixed(1)}%`;
    this.monsterGaugeBoxEl.classList.toggle('danger', pct >= 80);

    this.setText(this.speedBtnEl, `${snapshot.speed === 0 ? 1 : snapshot.speed}x`);
    this.setText(this.pauseBtnEl, snapshot.paused ? '▶' : '⏸');
    this.pauseBtnEl.classList.toggle('active', snapshot.paused);

    this.setText(this.coinValEl, snapshot.coin.toLocaleString('ko-KR'));
    this.setText(this.luckValEl, String(snapshot.luckStone));

    const totalWisps = Object.values(snapshot.wisps).reduce((s, n) => s + (n ?? 0), 0);
    this.setText(this.wispValEl, String(totalWisps));
    this.setText(this.wispBadgeEl, String(totalWisps));
    this.wispBadgeEl.classList.toggle('visible', totalWisps > 0);
    this.wispBtnEl.classList.toggle('muted', totalWisps === 0);

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
        ? `즉시 조합 ${snapshot.craft.readyCount}`
        : snapshot.craft.chainReadyCount > 0
          ? `연쇄 조합 ${snapshot.craft.chainReadyCount}`
          : '재료 탐색 중',
    );

    for (let i = 0; i < snapshot.rejects.length; i++) {
      this.showToast(snapshot.rejects[i]!.reason, true);
    }

    this.refreshContextStrip(snapshot);
  }

  public forceRefreshSelection(): void {
    if (this.lastSnapshot) {
      this.refreshContextStrip(this.lastSnapshot);
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
    }, 1700);
  }

  private refreshContextStrip(snapshot: UISnapshot): void {
    const sel = this.handlers.getSelectedSlot();
    let slotView: SlotView | null = null;
    if (sel) {
      slotView =
        sel.area === 'field'
          ? (snapshot.field[sel.index] ?? null)
          : (snapshot.bench[sel.index] ?? null);
    }

    const sig = slotView && sel
      ? `unit:${slotView.uid}:${slotView.locked}:${sel.area}:${sel.index}`
      : 'default-test-strip';

    if (sig === this.prevContextSignature) {
      return;
    }
    this.prevContextSignature = sig;

    if (!slotView || !sel) {
      this.contextTitleEl.textContent = '1단계 그리드 소환 · 드래그 이동 테스트';
      this.contextSubEl.textContent =
        '유닛을 드래그하거나 다른 칸을 탭해 필드(18칸) ↔ 대기석(12칸) 이동·교체';
      this.contextActionsEl.innerHTML = `
        <button id="btn-test-coin" type="button" class="mini-btn sell interactive">+500 코인</button>
        <button id="btn-test-fx" type="button" class="mini-btn interactive">화면 FX</button>
      `;
      this.mustGet('btn-test-coin').addEventListener('click', () => {
        this.handlers.onDispatch({ type: 'grantTestCoin', amount: 500 });
      });
      this.mustGet('btn-test-fx').addEventListener('click', () => {
        this.handlers.onTriggerTestFx();
      });
      return;
    }

    const gradeDef = this.data.gradesById.get(slotView.grade);
    const unitDef = this.data.unitsById.get(slotView.unitId);
    const coordLabel =
      sel.area === 'field'
        ? `필드 ${Math.floor(sel.index / 6) + 1}행 ${(sel.index % 6) + 1}열`
        : `대기석 ${sel.index + 1}번 칸`;

    this.contextTitleEl.innerHTML = '';
    const badge = document.createElement('span');
    badge.className = 'grade-tag';
    badge.style.color = gradeDef?.color ?? '#cfd6e0';
    badge.textContent = gradeDef?.name ?? slotView.grade;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = slotView.name;
    this.contextTitleEl.append(badge, nameSpan);

    this.contextSubEl.textContent = `${coordLabel} · 공격력 ${unitDef?.atk ?? 0} · 사거리 ${unitDef?.range ?? 0}${sel.area === 'bench' ? ' (대기석 비전투)' : ''}`;

    const targetUid = slotView.uid;
    const nextLock = !slotView.locked;

    this.contextActionsEl.innerHTML = `
      <button id="btn-unit-lock" type="button" class="mini-btn interactive ${slotView.locked ? 'lock-on' : ''}">
        ${slotView.locked ? '잠금됨' : '잠금'}
      </button>
      <button id="btn-unit-sell" type="button" class="mini-btn sell interactive">
        판매 +${slotView.sellCoin}
      </button>
    `;

    this.mustGet('btn-unit-lock').addEventListener('click', () => {
      this.handlers.onDispatch({ type: 'lock', uid: targetUid, locked: nextLock });
    });
    this.mustGet('btn-unit-sell').addEventListener('click', () => {
      this.handlers.onDispatch({ type: 'sell', uid: targetUid });
      this.handlers.clearSelection();
    });
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
