import type { StorageLike } from './MetaStore';

const HAPTICS_STORAGE_KEY = 'murim_haptics_enabled_v1';

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning';

function resolveDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Non-DOM or private browsing
  }
  return null;
}

const VIBRATE_PATTERNS: Readonly<Record<HapticStyle, number | readonly number[]>> = {
  light: 12,
  medium: 24,
  heavy: [32, 20, 40],
  success: [18, 24, 34],
  warning: [40, 28, 40],
};

/**
 * Cross-platform tactile feedback helper:
 * - Fires native Vibration API on Android / supported mobile browsers.
 * - Triggers a subtle, zero-layout-cost micro-pulse CSS hook on iOS Safari / desktop
 *   where navigator.vibrate is unsupported.
 * - Presentation-only (zero effect on Simulation state or RNG).
 */
export class HapticsController {
  private readonly storage: StorageLike | null;
  private enabled = true;
  private lastPulseAt = 0;

  public constructor(customStorage?: StorageLike | null) {
    this.storage = customStorage !== undefined ? customStorage : resolveDefaultStorage();
    if (this.storage) {
      try {
        if (this.storage.getItem(HAPTICS_STORAGE_KEY) === '0') {
          this.enabled = false;
        }
      } catch {
        this.enabled = true;
      }
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.storage) {
      try {
        this.storage.setItem(HAPTICS_STORAGE_KEY, this.enabled ? '1' : '0');
      } catch {
        // ignore quota errors
      }
    }
    if (this.enabled) {
      this.trigger('light');
    }
    return this.enabled;
  }

  public trigger(style: HapticStyle): void {
    if (!this.enabled || typeof window === 'undefined') return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (style === 'light' && now - this.lastPulseAt < 70) return;
    this.lastPulseAt = now;

    // 1. Native hardware vibration where available (Android Chrome / PWA)
    try {
      const nav = window.navigator as Navigator & {
        vibrate?: (pattern: number | readonly number[]) => boolean;
      };
      if (typeof nav?.vibrate === 'function') {
        nav.vibrate(VIBRATE_PATTERNS[style]);
      }
    } catch {
      // ignore unsupported or blocked vibration
    }

    // 2. Subtle tactile micro-kick class on #app for iOS Safari & desktop feel
    if (style === 'heavy' || style === 'success' || style === 'warning') {
      try {
        const appEl = document.getElementById('app');
        if (appEl) {
          const cls = style === 'warning' ? 'haptic-kick-warn' : 'haptic-kick-impact';
          appEl.classList.remove('haptic-kick-impact', 'haptic-kick-warn');
          void appEl.offsetWidth;
          appEl.classList.add(cls);
        }
      } catch {
        // ignore DOM issues in non-browser tests
      }
    }
  }
}
