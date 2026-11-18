export class AudioUnlock {
  private ctx: AudioContext | null = null;
  private unlocked = false;

  public mount(): void {
    const unlock = (): void => {
      if (this.unlocked) return;
      const AudioCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) {
        this.unlocked = true;
        return;
      }
      if (!this.ctx) {
        this.ctx = new AudioCtor();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      this.unlocked = true;
      window.removeEventListener('pointerup', unlock);
      window.removeEventListener('touchend', unlock);
    };

    window.addEventListener('pointerup', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
  }
}
