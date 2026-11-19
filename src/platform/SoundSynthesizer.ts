import type { FactionId } from '../data/types';
import type { StorageLike } from './MetaStore';

const MUTE_STORAGE_KEY = 'murim_sound_muted_v1';

function resolveDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Private browsing or non-DOM test environment
  }
  return null;
}

/**
 * Zero-asset procedural Web Audio synthesizer for Wuxia combat, gacha, and UI cues.
 * Strictly presentation-only (zero effect on Simulation state or RNG) and unlocks
 * AudioContext on first user gesture for iOS Safari / mobile PWA compliance (AGENTS.md §6).
 */
export class SoundSynthesizer {
  private readonly storage: StorageLike | null;
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private unlocked = false;

  private lastHitAt = 0;
  private lastSkillAt = 0;
  private lastCoinAt = 0;

  public constructor(customStorage?: StorageLike | null) {
    this.storage = customStorage !== undefined ? customStorage : resolveDefaultStorage();
    if (this.storage) {
      try {
        this.muted = this.storage.getItem(MUTE_STORAGE_KEY) === '1';
      } catch {
        this.muted = false;
      }
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.storage) {
      try {
        this.storage.setItem(MUTE_STORAGE_KEY, this.muted ? '1' : '0');
      } catch {
        // Ignore quota errors
      }
    }
    if (!this.muted) {
      this.ensureContext();
      this.playUiTap();
    }
    return this.muted;
  }

  public mount(): void {
    if (typeof window === 'undefined') return;

    const unlock = (): void => {
      if (this.unlocked) return;
      this.ensureContext();
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      this.unlocked = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('pointerup', unlock);
      window.removeEventListener('touchend', unlock);
      window.removeEventListener('keydown', unlock);
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('pointerup', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      try {
        this.ctx = new AudioCtor();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (!this.noiseBuffer && this.ctx) {
      const sampleRate = this.ctx.sampleRate;
      const length = Math.floor(sampleRate * 0.18);
      const buf = this.ctx.createBuffer(1, length, sampleRate);
      const ch = buf.getChannelData(0);
      // Deterministic LCG noise buffer so audio buffer setup never calls Math.random
      let s = 0x13579bdf;
      for (let i = 0; i < length; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        ch[i] = (s / 0xffffffff) * 2 - 1;
      }
      this.noiseBuffer = buf;
    }
    return this.ctx;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType,
    peakGain: number,
    delaySec = 0,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t0 = ctx.currentTime + delaySec;
    const t1 = t0 + durationSec;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, freqStart), t0);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t1);
    }

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t0 + Math.min(0.012, durationSec * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t1 + 0.01);
  }

  private playNoiseSwish(
    filterFreq: number,
    durationSec: number,
    peakGain: number,
    delaySec = 0,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const t0 = ctx.currentTime + delaySec;
    const t1 = t0 + durationSec;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, t0);
    filter.Q.setValueAtTime(2.2, t0);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(t0);
    src.stop(t1 + 0.01);
  }

  public playUiTap(): void {
    this.playTone(660, 880, 0.055, 'triangle', 0.06);
  }

  public playSummon(): void {
    this.playTone(523.25, 659.25, 0.08, 'triangle', 0.08, 0);
    this.playTone(783.99, 1046.5, 0.11, 'sine', 0.07, 0.045);
  }

  public playHit(
    faction: FactionId,
    isCrit: boolean,
    isSkill: boolean,
    weaponStyle?:
      | 'sword'
      | 'dual_sword'
      | 'flying_sword'
      | 'saber'
      | 'spear_staff'
      | 'palm_fist'
      | 'fan'
      | 'dagger_hidden'
      | 'staff_gourd'
      | 'sorcery_qi',
  ): void {
    if (this.muted) return;
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (isSkill) {
      if (now - this.lastSkillAt < 95) return;
      this.lastSkillAt = now;
    } else {
      if (now - this.lastHitAt < 62) return;
      this.lastHitAt = now;
    }

    switch (weaponStyle) {
      case 'fan': {
        // Snappy silk-iron folding fan snap ('착-!') + airy wind/needle hiss
        this.playNoiseSwish(isSkill ? 3600 : 3200, isSkill ? 0.085 : 0.05, isSkill ? 0.07 : 0.048);
        this.playTone(isSkill ? 1280 : 1040, 480, 0.055, 'triangle', 0.045);
        break;
      }
      case 'saber': {
        // Heavy curved blade cleave ('콰직!')
        this.playNoiseSwish(1350, isSkill ? 0.095 : 0.065, isSkill ? 0.072 : 0.05);
        this.playTone(isSkill ? 340 : 280, 95, isSkill ? 0.11 : 0.075, 'sawtooth', 0.055);
        break;
      }
      case 'palm_fist': {
        // Deep martial drum-fist impact ('쿵!')
        this.playTone(isSkill ? 230 : 185, 58, isSkill ? 0.11 : 0.075, 'sine', 0.075);
        this.playNoiseSwish(900, 0.05, 0.042);
        break;
      }
      case 'spear_staff': {
        // Polearm shaft whip + crisp thrust crack
        this.playNoiseSwish(1650, 0.06, 0.048);
        this.playTone(isSkill ? 620 : 510, 190, 0.07, 'triangle', 0.055);
        break;
      }
      case 'dagger_hidden': {
        // High-velocity throwing blade zip ('슈슉!')
        this.playNoiseSwish(3800, 0.042, 0.045);
        this.playTone(1420, 620, 0.05, 'sawtooth', 0.035);
        break;
      }
      case 'staff_gourd': {
        // Bubbling venom splash hiss ('치이익!')
        this.playNoiseSwish(2650, isSkill ? 0.095 : 0.065, 0.05);
        this.playTone(540, 780, 0.07, 'sine', 0.038);
        break;
      }
      case 'sorcery_qi': {
        // Resonant dark-flame burst
        this.playTone(isSkill ? 195 : 165, 64, isSkill ? 0.13 : 0.085, 'sawtooth', 0.058);
        this.playNoiseSwish(1050, 0.075, 0.048);
        break;
      }
      case 'dual_sword':
      case 'flying_sword': {
        // Double metallic blade ring
        this.playNoiseSwish(2500, 0.055, 0.046);
        this.playTone(860, 380, 0.055, 'triangle', 0.048);
        this.playTone(1140, 520, 0.05, 'triangle', 0.038, 0.024);
        break;
      }
      case 'sword':
      default: {
        if (faction === 'orthodox') {
          this.playNoiseSwish(
            isSkill ? 2450 : 2050,
            isSkill ? 0.085 : 0.055,
            isSkill ? 0.072 : 0.045,
          );
          this.playTone(isSkill ? 960 : 780, 330, isSkill ? 0.09 : 0.06, 'triangle', 0.052);
        } else if (faction === 'unorthodox') {
          this.playNoiseSwish(2900, 0.052, 0.048);
          this.playTone(980, 390, 0.065, 'sawtooth', 0.038);
        } else {
          this.playTone(isSkill ? 240 : 195, 72, isSkill ? 0.12 : 0.08, 'sawtooth', 0.058);
          this.playNoiseSwish(1150, 0.07, 0.048);
        }
        break;
      }
    }

    if (isCrit) {
      this.playTone(1318.5, 1760, 0.075, 'sine', 0.055, 0.015);
    }
  }

  public playCraft(rank: number): void {
    // Oriental pentatonic (C - D - E - G - A - C) ascending fanfare
    const notes = rank >= 4 ? [523.25, 659.25, 783.99, 880, 1046.5] : [523.25, 659.25, 783.99];
    for (let i = 0; i < notes.length; i++) {
      this.playTone(notes[i]!, notes[i]! * 1.01, 0.14, 'triangle', 0.085, i * 0.055);
    }
  }

  public playGamble(success: boolean, refunded: boolean): void {
    if (success) {
      this.playTone(587.33, 783.99, 0.09, 'triangle', 0.085, 0);
      this.playTone(880, 1174.66, 0.16, 'triangle', 0.095, 0.07);
    } else if (refunded) {
      this.playTone(330, 523.25, 0.14, 'sine', 0.075, 0);
    } else {
      this.playTone(190, 82, 0.2, 'sawtooth', 0.07, 0);
    }
  }

  public playBossHorn(): void {
    // Deep bronze temple gong + war drum
    this.playTone(130.81, 98, 0.42, 'sawtooth', 0.095, 0);
    this.playTone(261.63, 196, 0.36, 'triangle', 0.075, 0.02);
    this.playNoiseSwish(620, 0.18, 0.07, 0);
  }

  public playCoinReward(): void {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (now - this.lastCoinAt < 120) return;
    this.lastCoinAt = now;
    this.playTone(1046.5, 1318.5, 0.07, 'sine', 0.07, 0);
    this.playTone(1318.5, 1567.98, 0.11, 'sine', 0.075, 0.055);
  }

  public playVictory(): void {
    const fanfare = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    for (let i = 0; i < fanfare.length; i++) {
      this.playTone(fanfare[i]!, fanfare[i]!, 0.22, 'triangle', 0.095, i * 0.075);
    }
  }

  public playDefeat(): void {
    const notes = [329.63, 293.66, 246.94, 164.81];
    for (let i = 0; i < notes.length; i++) {
      this.playTone(notes[i]!, notes[i]! * 0.96, 0.24, 'sawtooth', 0.065, i * 0.09);
    }
  }

  public playHazardWarn(): void {
    // Urgent double woodblock + low crimson gong pulse for boss pattern / tile seal telegraph
    this.playTone(880, 587.33, 0.085, 'triangle', 0.085, 0);
    this.playTone(987.77, 659.25, 0.095, 'triangle', 0.09, 0.11);
    this.playTone(146.83, 98, 0.28, 'sawtooth', 0.065, 0.02);
  }

  public playBoonOffer(): void {
    // Auspicious Wuxia jade scroll chime (C5 - E5 - G5 - B5 - D6)
    const chime = [523.25, 659.25, 783.99, 987.77, 1174.66];
    for (let i = 0; i < chime.length; i++) {
      this.playTone(chime[i]!, chime[i]! * 1.005, 0.2, 'sine', 0.075, i * 0.05);
    }
  }
}
