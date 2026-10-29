type ToneOptions = {
  type?: OscillatorType;
  volume?: number;
  slideTo?: number;
  delay?: number;
};

/**
 * Tiny synthesizer for retro sound effects. No audio files, no extra deps.
 * The AudioContext is created lazily on the first user gesture.
 */
class RetroAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(enabled ? 0.9 : 0.0001, this.ctx.currentTime, 0.01);
    }
  }

  isEnabled() {
    return this.enabled;
  }

  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AudioContextClass =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      this.ctx = new AudioContextClass();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.9 : 0.0001;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private tone(frequency: number, duration: number, options: ToneOptions = {}) {
    if (!this.enabled || !this.ctx || !this.master) return;
    const start = this.ctx.currentTime + (options.delay ?? 0);
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const volume = options.volume ?? 0.06;

    oscillator.type = options.type ?? "square";
    oscillator.frequency.setValueAtTime(frequency, start);
    if (options.slideTo) {
      oscillator.frequency.exponentialRampToValueAtTime(options.slideTo, start + duration);
    }

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  click() {
    this.tone(540, 0.045, { volume: 0.03 });
  }

  jump() {
    this.tone(230, 0.16, { slideTo: 660, volume: 0.045 });
  }

  bump() {
    this.tone(150, 0.1, { slideTo: 65, volume: 0.08, type: "triangle" });
  }

  coin() {
    this.tone(988, 0.07, { volume: 0.045 });
    this.tone(1319, 0.17, { volume: 0.045, delay: 0.07 });
  }

  milestone() {
    [523, 659, 784, 1047].forEach((frequency, index) => {
      this.tone(frequency, 0.13, { volume: 0.045, delay: index * 0.085 });
    });
  }

  megaMilestone() {
    [523, 659, 784, 1047, 1319, 1568, 2093].forEach((frequency, index) => {
      this.tone(frequency, 0.16, { volume: 0.05, delay: index * 0.08 });
    });
    this.tone(131, 0.5, { volume: 0.04, type: "triangle", delay: 0.1 });
  }

  wrap() {
    [784, 659, 523, 392].forEach((frequency, index) => {
      this.tone(frequency, 0.15, { volume: 0.05, delay: index * 0.09 });
    });
  }
}

export const retroAudio = new RetroAudio();
