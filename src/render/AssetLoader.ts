import bundledAtlasManifest from '../../public/assets/sprites_atlas.json';

export interface AtlasFrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface SpriteAtlasManifest {
  readonly version: number;
  readonly hash?: string;
  readonly image: string;
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly frames: Readonly<Record<string, AtlasFrameRect>>;
}

type FrameReadyCallback = (atlasImage: HTMLImageElement, frame: AtlasFrameRect) => void;

/**
 * Loads the single packed WebP sprite atlas (`assets/sprites_atlas.webp`) using the
 * Vite-bundled manifest (`sprites_atlas.json`) + content hash query string (`?v=<hash>`)
 * so the JS bundle and WebP image stay 100% atomically synchronized across deployments
 * without stale-cache fallback placeholders (AGENTS.md §6).
 */
class SpriteAtlasLoader {
  private readonly bundled: SpriteAtlasManifest = bundledAtlasManifest as SpriteAtlasManifest;
  private manifest: SpriteAtlasManifest | null = null;
  private atlasImage: HTMLImageElement | null = null;
  private loadingStarted = false;
  private failed = false;
  private readonly pendingById = new Map<string, FrameReadyCallback[]>();

  public requestFrame(id: string, cb: FrameReadyCallback): void {
    if (this.failed) return;
    if (typeof Image === 'undefined') return;

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
    const manifest = this.bundled;
    if (!manifest || typeof manifest.frames !== 'object') {
      this.failAll();
      return;
    }

    const cacheTag = manifest.hash ? `?v=${manifest.hash}` : `?v=${manifest.version}`;
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
    img.src = `${baseUrl}${manifest.image}${cacheTag}`;
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
