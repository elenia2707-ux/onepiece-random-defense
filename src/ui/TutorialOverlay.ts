import type { UISnapshot } from '../core/Simulation';
import type { GameDataBundle } from '../data/types';

export interface TutorialOverlayDeps {
  readonly data: GameDataBundle;
  readonly isTutorialDone: () => boolean;
  readonly onSetTutorialDone: (done: boolean) => void;
  readonly onToast: (msg: string) => void;
}

interface TutorialStepSpec {
  readonly badge: string;
  readonly title: string;
  readonly body: string;
  readonly highlightIds: readonly string[];
}

const TUTORIAL_STEPS: readonly TutorialStepSpec[] = [
  {
    badge: '입문 교범 1 / 4 · 시간 정지중',
    title: '① 초출강호 — 비무대에 협객 배치',
    body: '교범 중에는 마물이 멈춰 있습니다! 하단 황금색 [초출강호]를 3~4번 눌러 협객을 먼저 불러보세요.',
    highlightIds: ['btn-summon'],
  },
  {
    badge: '입문 교범 2 / 4 · 시간 정지중',
    title: '② 합공·등선 — 추천 합공 & 전부 합공',
    body: '재료가 모이면 하단 [등선 추천] 바나 [합공·등선]에 불이 켜집니다! 합공창의 [⚡ 전부 합공]으로 한 번에 상위 고수를 등선시킬 수 있어요.',
    highlightIds: ['recommend-bar', 'btn-craft'],
  },
  {
    badge: '입문 교범 3 / 4 · 시간 정지중',
    title: '③ 기연 · 영약 · 내공 — 5장 영물 대비 핵심',
    body: '5장마다 강한 영물 보스가 등장합니다! [영약 복용]으로 영단을 쓰고 [내공 수련]으로 문파 공격력을 올려두면 훨씬 수월합니다.',
    highlightIds: ['btn-wisp', 'btn-gamble', 'btn-upgrade'],
  },
  {
    badge: '입문 교범 4 / 4 · 출정 준비 완료',
    title: '④ 마물 100기 한계 · 영물 패턴 · 신물 계승',
    body: '마물 100기 돌파나 영물 제한시간 초과 시 정산됩니다. 붉은 마법진 칸의 협객은 드래그로 피하세요! [완료 ✓]를 누르면 출정이 시작됩니다.',
    highlightIds: ['hud-monster-gauge', 'btn-relic'],
  },
];

const ALL_HIGHLIGHT_IDS: readonly string[] = [
  'btn-summon',
  'recommend-bar',
  'btn-craft',
  'btn-wisp',
  'btn-gamble',
  'btn-upgrade',
  'hud-monster-gauge',
  'btn-relic',
];

/**
 * Interactive 4-step onboarding coach (`강호 입문 교범`).
 * Positioned at y = 594..706 (strictly below 6x3 field y=222..586 and above bench y=752..930)
 * so all field tiles, bench tiles, recommend bar, and bottom dock buttons remain 100% playable.
 */
export class TutorialOverlay {
  private readonly deps: TutorialOverlayDeps;
  private el: HTMLElement | null = null;
  private badgeEl: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private nextBtnEl: HTMLButtonElement | null = null;
  private stepIndex = 0;
  private active = false;
  private manualReplay = false;
  private prevRenderSig = '';

  public constructor(deps: TutorialOverlayDeps) {
    this.deps = deps;
    this.active = !deps.isTutorialDone();
  }

  public mount(root: HTMLElement): void {
    const coach = document.createElement('aside');
    coach.id = 'tutorial-coach';
    coach.className = 'tutorial-coach interactive';
    coach.setAttribute('aria-live', 'polite');
    coach.innerHTML = `
      <div class="tutorial-coach-head">
        <span id="tutorial-badge" class="tutorial-badge">입문 교범 1 / 4</span>
        <span id="tutorial-title" class="tutorial-title">초출강호</span>
        <button id="btn-tutorial-skip" type="button" class="tutorial-skip-btn interactive">건너뛰기 ✕</button>
      </div>
      <div class="tutorial-coach-main">
        <p id="tutorial-body" class="tutorial-body"></p>
        <button id="btn-tutorial-next" type="button" class="tutorial-next-btn interactive">다음 ▸</button>
      </div>
    `;
    root.appendChild(coach);

    this.el = coach;
    this.badgeEl = coach.querySelector('#tutorial-badge');
    this.titleEl = coach.querySelector('#tutorial-title');
    this.bodyEl = coach.querySelector('#tutorial-body');
    this.nextBtnEl = coach.querySelector('#btn-tutorial-next');

    coach.querySelector('#btn-tutorial-skip')?.addEventListener('click', () => {
      this.complete(true);
    });
    this.nextBtnEl?.addEventListener('click', () => {
      if (this.stepIndex + 1 >= TUTORIAL_STEPS.length) {
        this.complete(false);
      } else {
        this.stepIndex++;
        this.prevRenderSig = '';
      }
    });
  }

  public restart(): void {
    this.stepIndex = 0;
    this.active = true;
    this.manualReplay = true;
    this.prevRenderSig = '';
    this.deps.onSetTutorialDone(false);
  }

  private complete(skipped: boolean): void {
    this.active = false;
    this.manualReplay = false;
    this.prevRenderSig = '';
    this.deps.onSetTutorialDone(true);
    this.clearHighlights();
    this.el?.classList.remove('visible');
    if (!skipped) {
      this.deps.onToast('🎓 강호 입문 교범 수료! 건투를 빕니다, 소협!');
    }
  }

  public sync(snapshot: UISnapshot, overlayBlocked: boolean): void {
    if (!this.el) return;

    if (!this.active && this.deps.isTutorialDone()) {
      if (this.prevRenderSig !== 'done') {
        this.prevRenderSig = 'done';
        this.el.classList.remove('visible');
        this.clearHighlights();
      }
      return;
    }

    if (!this.active && !this.deps.isTutorialDone()) {
      this.active = true;
    }

    // Auto-advance Step 1 & Step 2 on first-run natural gameplay actions
    if (!this.manualReplay) {
      const totalOwned = snapshot.fieldOccupied + snapshot.benchOccupied;
      if (this.stepIndex === 0 && totalOwned >= 1) {
        this.stepIndex = 1;
      }
      if (this.stepIndex === 1 && this.hasAscendedUnit(snapshot)) {
        this.stepIndex = 2;
      }
      const totalUpLv =
        snapshot.upgradeLv.orthodox + snapshot.upgradeLv.unorthodox + snapshot.upgradeLv.demonic;
      if (this.stepIndex === 2 && (totalUpLv > 0 || snapshot.lastGambleResult !== null)) {
        this.stepIndex = 3;
      }
    }

    const shouldHideTemporarily =
      overlayBlocked || snapshot.gameOver || snapshot.victoryHold || Boolean(snapshot.pendingBoonOffer);

    const sig = `${this.stepIndex}:${shouldHideTemporarily ? 1 : 0}`;
    if (sig === this.prevRenderSig) {
      return;
    }
    this.prevRenderSig = sig;

    if (shouldHideTemporarily) {
      this.el.classList.remove('visible');
      this.clearHighlights();
      return;
    }

    const spec = TUTORIAL_STEPS[this.stepIndex] ?? TUTORIAL_STEPS[0]!;
    if (this.badgeEl) this.badgeEl.textContent = spec.badge;
    if (this.titleEl) this.titleEl.textContent = spec.title;
    if (this.bodyEl) this.bodyEl.textContent = spec.body;
    if (this.nextBtnEl) {
      this.nextBtnEl.textContent =
        this.stepIndex + 1 >= TUTORIAL_STEPS.length ? '완료 ✓' : '다음 ▸';
    }

    this.el.classList.add('visible');
    this.applyHighlights(spec.highlightIds);
  }

  private hasAscendedUnit(snapshot: UISnapshot): boolean {
    for (let i = 0; i < snapshot.field.length; i++) {
      const s = snapshot.field[i];
      if (s && !this.deps.data.unitsById.get(s.unitId)?.leaf) {
        return true;
      }
    }
    for (let i = 0; i < snapshot.bench.length; i++) {
      const s = snapshot.bench[i];
      if (s && !this.deps.data.unitsById.get(s.unitId)?.leaf) {
        return true;
      }
    }
    return false;
  }

  private applyHighlights(ids: readonly string[]): void {
    const activeSet = new Set(ids);
    for (let i = 0; i < ALL_HIGHLIGHT_IDS.length; i++) {
      const id = ALL_HIGHLIGHT_IDS[i]!;
      const node = document.getElementById(id);
      if (node) {
        node.classList.toggle('tutorial-focus-ring', activeSet.has(id));
      }
    }
  }

  private clearHighlights(): void {
    for (let i = 0; i < ALL_HIGHLIGHT_IDS.length; i++) {
      const node = document.getElementById(ALL_HIGHLIGHT_IDS[i]!);
      node?.classList.remove('tutorial-focus-ring');
    }
  }
}
