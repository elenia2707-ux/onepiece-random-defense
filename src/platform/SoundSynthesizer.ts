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

  public playHit(faction: FactionId, isCrit: boolean, isSkill: boolean): void {
    if (this.muted) return;
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (isSkill) {
      if (now - this.lastSkillAt < 95) return;
      this.lastSkillAt = now;
    } else {
      if (now - this.lastHitAt < 62) return;
      this.lastHitAt = now;
    }

    if (faction === 'orthodox') {
      // Crisp sword slash / monk fist strike
      this.playNoiseSwish(isSkill ? 2400 : 1900, isSkill ? 0.09 : 0.055, isSkill ? 0.075 : 0.045);
      this.playTone(isSkill ? 920 : 720, 310, isSkill ? 0.095 : 0.06, 'triangle', 0.055);
    } else if (faction === 'unorthodox') {
      // Dart / saber whip snap
      this.playNoiseSwish(3100, 0.05, 0.05);
      this.playTone(1120, 420, 0.065, 'sawtooth', 0.038);
    } else {
      // Deep demonic qi burst
      this.playTone(isSkill ? 210 : 175, 68, isSkill ? 0.13 : 0.08, 'sawtooth', 0.06);
      this.playNoiseSwish(950, 0.075, 0.05);
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
