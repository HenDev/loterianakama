export class VoiceService {
  private enabled = true;
  private selectedVoiceURI: string | null = null;
  private hasPreloadedVoices = false;

  speakCardName(cardName: string): void {
    const text = cardName.trim();
    if (!text || !this.enabled) return;

    const speech = this.getSpeechSynthesis();
    const UtteranceCtor = this.getUtteranceConstructor();
    if (!speech || !UtteranceCtor) return;

    const utterance = new UtteranceCtor(text);
    utterance.lang = 'es-MX';
    utterance.rate = 1.2;//Mas Rapido
    utterance.pitch = 2;//1.5 Mas agudo 0 a 2
    utterance.volume = 1.5;

    const voice = this.pickVoice(speech);
    if (voice) utterance.voice = voice;

    speech.cancel();
    speech.speak(utterance);
  }

  stop(): void {
    this.getSpeechSynthesis()?.cancel();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  preloadVoices(): void {
    const speech = this.getSpeechSynthesis();
    if (!speech || this.hasPreloadedVoices) return;

    // Initial call triggers async voice population in several browsers.
    this.getAvailableVoices(speech);

    if (this.getAvailableVoices(speech).length > 0) {
      this.hasPreloadedVoices = true;
      return;
    }

    const onVoicesChanged = (): void => {
      this.getAvailableVoices(speech);
      this.hasPreloadedVoices = true;
      speech.removeEventListener('voiceschanged', onVoicesChanged);
    };

    speech.addEventListener('voiceschanged', onVoicesChanged);
  }

  private getSpeechSynthesis(): SpeechSynthesis | null {
    if (typeof window === 'undefined') return null;
    return window.speechSynthesis ?? null;
  }

  private getUtteranceConstructor():
    | (new (text?: string) => SpeechSynthesisUtterance)
    | null {
    if (typeof window === 'undefined') return null;
    return window.SpeechSynthesisUtterance ?? null;
  }

  private pickVoice(speech: SpeechSynthesis): SpeechSynthesisVoice | null {
    const voices = this.getAvailableVoices(speech);
    if (voices.length === 0) return null;

    if (this.selectedVoiceURI) {
      const cached = voices.find(v => v.voiceURI === this.selectedVoiceURI);
      if (cached) return cached;
    }

    const preferred = [...voices]
      .sort((a, b) => this.scoreVoice(b) - this.scoreVoice(a))[0] ?? null;

    this.selectedVoiceURI = preferred?.voiceURI ?? null;
    return preferred;
  }

  private getAvailableVoices(speech: SpeechSynthesis): SpeechSynthesisVoice[] {
    return speech.getVoices().filter(v => v.lang.toLowerCase().startsWith('es'));
  }

  private scoreVoice(voice: SpeechSynthesisVoice): number {
    const lang = voice.lang.toLowerCase();
    const name = voice.name.toLowerCase();
    let score = 0;

    if (lang.startsWith('es-mx')) score += 50;
    else if (lang.startsWith('es-us') || lang.startsWith('es-419')) score += 35;
    else if (lang.startsWith('es')) score += 20;

    const femaleHints = [
      'female', 'woman', 'mujer', 'sofia', 'lucia', 'paulina', 'paloma',
      'monica', 'sabina', 'helena', 'dalia', 'mia', 'maria'
    ];
    if (femaleHints.some(h => name.includes(h))) score += 45;

    const youngHints = ['young', 'joven', 'teen', 'girl'];
    if (youngHints.some(h => name.includes(h))) score += 12;

    if (name.includes('google') || name.includes('microsoft') || name.includes('natural')) {
      score += 8;
    }

    return score;
  }
}

let _voiceService: VoiceService | null = null;
export function getVoiceService(): VoiceService {
  if (!_voiceService) _voiceService = new VoiceService();
  return _voiceService;
}
