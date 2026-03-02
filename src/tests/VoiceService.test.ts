import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceService } from '../services/VoiceService';

type MockUtterance = {
  text?: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: SpeechSynthesisVoice;
};

describe('VoiceService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis as Record<string, unknown>, 'window');
  });

  it('no lanza errores cuando speech synthesis no existe', () => {
    const service = new VoiceService();
    expect(() => service.speakCardName('El Gallo')).not.toThrow();
  });

  it('debe hablar el nombre de la carta y cancelar la locucion anterior', () => {
    const cancel = vi.fn();
    const speak = vi.fn();

    const voice = {
      voiceURI: 'es-MX-1',
      lang: 'es-MX',
    } as SpeechSynthesisVoice;

    const mockSpeechSynthesis = {
      cancel,
      speak,
      getVoices: () => [voice],
    } as unknown as SpeechSynthesis;

    const MockSpeechSynthesisUtterance = function (this: MockUtterance, text?: string): void {
      this.text = text;
    } as unknown as new (text?: string) => SpeechSynthesisUtterance;

    (globalThis as Record<string, unknown>).window = {
      speechSynthesis: mockSpeechSynthesis,
      SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
    };

    const service = new VoiceService();
    service.speakCardName('La Sirena');

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);

    const utterance = speak.mock.calls[0][0] as MockUtterance;
    expect(utterance.text).toBe('La Sirena');
    expect(utterance.lang).toBe('es-MX');
    expect(utterance.voice).toBe(voice);
  });

  it('debe priorizar una voz femenina en espanol cuando esta disponible', () => {
    const speak = vi.fn();
    const cancel = vi.fn();

    const voices = [
      { voiceURI: 'es-mx-jorge', lang: 'es-MX', name: 'Jorge' },
      { voiceURI: 'es-mx-paulina', lang: 'es-MX', name: 'Paulina Natural' },
    ] as SpeechSynthesisVoice[];

    const mockSpeechSynthesis = {
      cancel,
      speak,
      getVoices: () => voices,
    } as unknown as SpeechSynthesis;

    const MockSpeechSynthesisUtterance = function (this: MockUtterance, text?: string): void {
      this.text = text;
    } as unknown as new (text?: string) => SpeechSynthesisUtterance;

    (globalThis as Record<string, unknown>).window = {
      speechSynthesis: mockSpeechSynthesis,
      SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
    };

    const service = new VoiceService();
    service.speakCardName('La Dama');

    const utterance = speak.mock.calls[0][0] as MockUtterance;
    expect((utterance.voice as SpeechSynthesisVoice).voiceURI).toBe('es-mx-paulina');
    expect(utterance.rate).toBe(1.2);
  });

  it('si se desactiva la voz, no debe hablar', () => {
    const speak = vi.fn();
    const cancel = vi.fn();

    const mockSpeechSynthesis = {
      cancel,
      speak,
      getVoices: () => [],
    } as unknown as SpeechSynthesis;

    const MockSpeechSynthesisUtterance = function (this: MockUtterance, text?: string): void {
      this.text = text;
    } as unknown as new (text?: string) => SpeechSynthesisUtterance;

    (globalThis as Record<string, unknown>).window = {
      speechSynthesis: mockSpeechSynthesis,
      SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
    };

    const service = new VoiceService();
    service.setEnabled(false);
    service.speakCardName('El Mundo');

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).not.toHaveBeenCalled();
  });
});
