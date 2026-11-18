import { GameLoop } from './GameLoop';
import { Simulation } from './Simulation';
import { loadGameData } from '../data/loader';
import { DragController } from '../input/DragController';
import { InputManager } from '../input/InputManager';
import { AudioUnlock } from '../platform/AudioUnlock';
import { Lifecycle } from '../platform/Lifecycle';
import { Viewport } from '../platform/Viewport';
import { BackgroundPainter } from '../render/BackgroundPainter';
import { CanvasStack } from '../render/CanvasStack';
import { Renderer } from '../render/Renderer';
import { SpriteCache } from '../render/SpriteCache';
import { UIManager } from '../ui/UIManager';
import { VfxSystem } from '../vfx/VfxSystem';

export class Game {
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
  private readonly audioUnlock: AudioUnlock;

  private slowFrameStreak = 0;

  public constructor() {
    const data = loadGameData();
    const appEl = document.getElementById('app');
    if (!(appEl instanceof HTMLElement)) {
      throw new Error('[Game] Missing #app root');
    }

    this.sim = new Simulation(data);
    this.stack = new CanvasStack();
    this.sprites = new SpriteCache();
    this.bgPainter = new BackgroundPainter();
    this.vfx = new VfxSystem(this.sprites);
    this.renderer = new Renderer(this.stack, this.sprites, this.vfx);

    this.drag = new DragController(
      this.sim,
      (cmd) => this.sim.commands.enqueue(cmd),
      () => this.ui.forceRefreshSelection(),
    );

    this.ui = new UIManager(data, {
      onDispatch: (cmd) => this.sim.commands.enqueue(cmd),
      onCycleSpeed: () => {
        const next = this.loop.cycleSpeed();
        if (this.loop.isPaused()) {
          this.loop.setPaused(false);
        }
        this.ui.sync(this.sim.buildSnapshot(next, false), performance.now(), true);
      },
      onTogglePause: () => {
        const paused = this.loop.togglePaused();
        this.ui.sync(
          this.sim.buildSnapshot(this.loop.getSpeed(), paused),
          performance.now(),
          true,
        );
      },
      onTriggerTestFx: () => {
        const t = this.sim.tickCount;
        this.vfx.spawnArrivalFx(360, 404, '#ffb02e', 4, t);
        this.ui.showToast('화면 흔들림(#shake-layer) + 플래시(#overlay-canvas) 테스트');
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

    this.audioUnlock = new AudioUnlock();

    this.bindSimulationEvents();
  }

  private bindSimulationEvents(): void {
    this.sim.events.on('unit:added', (ev) => {
      const gradeDef = this.sim.data.gradesById.get(ev.grade);
      const color = gradeDef?.color ?? '#cfd6e0';
      const rank = gradeDef?.rank ?? 1;
      this.vfx.spawnArrivalFx(ev.pos.x, ev.pos.y, color, rank, ev.tick);

      if (ev.source === 'craft') {
        const unitName = this.sim.data.unitsById.get(ev.unitId)?.name ?? ev.unitId;
        this.ui.showToast(`${gradeDef?.name ?? ''} 조합 완성: ${unitName}!`);
      }
    });

    this.sim.events.on('unit:moved', (ev) => {
      const dest = this.sim.board.getSlotCenter(ev.to);
      this.vfx.spawnMovePulse(dest.x, dest.y, ev.tick);
    });

    this.sim.events.on('monster:hit', (ev) => {
      this.vfx.spawnHitFx(ev.entityId, ev.x, ev.y, ev.damage, ev.color, ev.slain, ev.tick);
    });
  }

  public start(): void {
    this.sprites.ensureGlyphAtlas();
    this.ui.mount();
    this.viewport.mount();
    this.input.mount();
    this.lifecycle.mount();
    this.audioUnlock.mount();

    const initialSnap = this.sim.buildSnapshot(this.loop.getSpeed(), this.loop.isPaused());
    this.ui.sync(initialSnap, performance.now(), true);
    this.loop.start();
  }
}
