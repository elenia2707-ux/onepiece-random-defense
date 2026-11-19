export interface AtlasFrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface SpriteAtlasManifest {
  readonly version: number;
  readonly image: string;
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly frames: Readonly<Record<string, AtlasFrameRect>>;
}

type FrameReadyCallback = (atlasImage: HTMLImageElement, frame: AtlasFrameRect) => void;

/**
 * Loads the single packed WebP sprite atlas (`assets/sprites_atlas.webp` + `assets/sprites_atlas.json`)
 * once and dispatches nearest-neighbor frame rects to `SpriteCache` (AGENTS.md §6).
 */
class SpriteAtlasLoader {
  private manifest: SpriteAtlasManifest | null = null;
  private atlasImage: HTMLImageElement | null = null;
  private loadingStarted = false;
  private failed = false;
  private readonly pendingById = new Map<string, FrameReadyCallback[]>();

  public requestFrame(id: string, cb: FrameReadyCallback): void {
    if (this.failed) return;
    if (typeof Image === 'undefined' || typeof fetch === 'undefined') return;

    if (this.manifest && this.atlasImage) {
      const frame = this.manifest.frames[id];
      if (frame) {
        cb(this.atlasImage, frame);
      }
      return;
    }

    const list = this.pendingById.get(id);
    if (list) {
      list.push(cb);
    } else {
      this.pendingById.set(id, [cb]);
    }

    if (!this.loadingStarted) {
      this.loadingStarted = true;
      this.startLoad();
    }
  }

  private startLoad(): void {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const manifestUrl = `${baseUrl}assets/sprites_atlas.json`;

    fetch(manifestUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SpriteAtlasManifest>;
      })
      .then((manifest) => {
        if (!manifest || typeof manifest.frames !== 'object') {
          throw new Error('Invalid sprite atlas manifest');
        }
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            this.manifest = manifest;
            this.atlasImage = img;
            this.flushPending();
          } else {
            this.failAll();
          }
        };
        img.onerror = () => {
          this.failAll();
        };
        img.src = `${baseUrl}${manifest.image}`;
      })
      .catch(() => {
        this.failAll();
      });
  }

  private flushPending(): void {
    if (!this.manifest || !this.atlasImage) return;
    for (const [id, callbacks] of this.pendingById.entries()) {
      const frame = this.manifest.frames[id];
      if (!frame) continue;
      for (const cb of callbacks) {
        cb(this.atlasImage, frame);
      }
    }
    this.pendingById.clear();
  }

  private failAll(): void {
    this.failed = true;
    this.pendingById.clear();
  }
}

export const spriteAtlasLoader = new SpriteAtlasLoader();
