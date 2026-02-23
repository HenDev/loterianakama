export type SoundKey = 'card_flip' | 'mark' | 'loteria' | 'win' | 'lose' | 'tick' | 'button';

export class AudioService {
  private context: AudioContext | null = null;
  private muted = false;

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return this.context;
  }

  play(key: SoundKey): void {
    if (this.muted) return;
    try {
      const ctx = this.getContext();
      switch (key) {
        case 'card_flip': this.playTone(ctx, 440, 0.1, 'sine', 0.3); break;
        case 'mark':      this.playTone(ctx, 660, 0.08, 'sine', 0.2); break;
        case 'loteria':   this.playFanfare(ctx); break;
        case 'win':       this.playWin(ctx); break;
        case 'lose':      this.playTone(ctx, 220, 0.2, 'sawtooth', 0.5); break;
        case 'tick':      this.playTone(ctx, 800, 0.05, 'square', 0.05); break;
        case 'button':    this.playTone(ctx, 520, 0.06, 'sine', 0.1); break;
      }
    } catch {
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  private playTone(
    ctx: AudioContext,
    frequency: number,
    gain: number,
    type: OscillatorType,
    duration: number
  ): void {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  private playFanfare(ctx: AudioContext): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(ctx, freq, 0.15, 'sine', 0.3), i * 150);
    });
  }

  private playWin(ctx: AudioContext): void {
    const notes = [523, 659, 784, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(ctx, freq, 0.12, 'sine', 0.25), i * 120);
    });
  }
}

let _audioService: AudioService | null = null;
export function getAudioService(): AudioService {
  if (!_audioService) _audioService = new AudioService();
  return _audioService;
}
