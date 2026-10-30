import { describe, expect, it } from 'vitest';
import { PitchDetector, rms } from '../src/audio/pitch';
import { frequencyToMidi, midiToFrequency } from '../src/notes';

/** Son proche d'un piano : fondamentale + harmoniques décroissantes, légère inharmonicité. */
function pianoLike(midi: number, sampleRate: number, length: number, fundamentalWeight = 1): Float32Array {
  const f0 = midiToFrequency(midi);
  const out = new Float32Array(length);
  const harmonics = [fundamentalWeight, 0.8, 0.5, 0.35, 0.2, 0.12, 0.08];
  const inharmonicity = 0.0004;
  harmonics.forEach((amplitude, i) => {
    const n = i + 1;
    const f = n * f0 * Math.sqrt(1 + inharmonicity * n * n);
    if (f > sampleRate / 2) return;
    const phase = i * 1.3;
    for (let t = 0; t < length; t++) out[t] += amplitude * 0.2 * Math.sin((2 * Math.PI * f * t) / sampleRate + phase);
  });
  return out;
}

function sine(frequency: number, sampleRate: number, length: number): Float32Array {
  const out = new Float32Array(length);
  for (let t = 0; t < length; t++) out[t] = 0.3 * Math.sin((2 * Math.PI * frequency * t) / sampleRate);
  return out;
}

describe('PitchDetector', () => {
  for (const sampleRate of [44100, 48000]) {
    const detector = new PitchDetector({ sampleRate, minFrequency: 60, maxFrequency: 4200 });

    it(`reconnaît des sinusoïdes de Do1 à Do6 (${sampleRate} Hz)`, () => {
      for (let midi = 36; midi <= 96; midi++) {
        const result = detector.detect(sine(midiToFrequency(midi), sampleRate, 2048));
        expect(result, `note ${midi}`).not.toBeNull();
        expect(Math.round(frequencyToMidi(result!.frequency)), `note ${midi}`).toBe(midi);
      }
    });

    it(`reconnaît des sons de type piano sur la tessiture utile (${sampleRate} Hz)`, () => {
      for (let midi = 40; midi <= 96; midi++) {
        const result = detector.detect(pianoLike(midi, sampleRate, 2048));
        expect(result, `note ${midi}`).not.toBeNull();
        expect(Math.round(frequencyToMidi(result!.frequency)), `note ${midi}`).toBe(midi);
        expect(result!.clarity).toBeGreaterThan(0.75);
      }
    });

    it(`retrouve la fondamentale même quand elle est faible (${sampleRate} Hz)`, () => {
      for (const midi of [48, 55, 60, 67]) {
        const result = detector.detect(pianoLike(midi, sampleRate, 2048, 0.3));
        expect(Math.round(frequencyToMidi(result!.frequency)), `note ${midi}`).toBe(midi);
      }
    });
  }

  it('ne trouve pas de note dans du bruit blanc', () => {
    const detector = new PitchDetector({ sampleRate: 48000 });
    let seed = 1;
    const noise = new Float32Array(2048).map(() => {
      seed = (seed * 16807) % 2147483647;
      return (seed / 2147483647 - 0.5) * 0.5;
    });
    const result = detector.detect(noise);
    expect(result === null || result.clarity < 0.75).toBe(true);
  });
});

describe('rms', () => {
  it('mesure le volume sur la fin du tampon', () => {
    const buffer = new Float32Array(100);
    buffer.fill(0.5, 50);
    expect(rms(buffer, 50)).toBeCloseTo(0.5);
    expect(rms(buffer)).toBeCloseTo(Math.sqrt(0.125));
  });
});
