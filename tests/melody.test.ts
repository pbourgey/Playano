import { describe, expect, it } from 'vitest';
import { extractAccompaniment, extractMelody } from '../src/song/melody';

const note = (midi: number, time: number, duration = 0.5) => ({ midi, time, duration, velocity: 80 });

describe('extractMelody', () => {
  it('garde la note la plus aiguë de chaque accord', () => {
    const melody = extractMelody([note(48, 0), note(64, 0), note(60, 0.01), note(62, 0.5), note(43, 0.5)]);
    expect(melody.map((n) => [n.midi, n.time])).toEqual([
      [64, 0],
      [62, 0.5],
    ]);
  });

  it('fusionne les notes de plusieurs pistes dans l’ordre du temps', () => {
    const melody = extractMelody([note(67, 1), note(60, 0), note(64, 0.5)]);
    expect(melody.map((n) => n.midi)).toEqual([60, 64, 67]);
  });

  it('raccourcit une note qui déborde sur la suivante', () => {
    const melody = extractMelody([note(60, 0, 2), note(62, 0.5, 0.5)]);
    expect(melody[0].duration).toBeCloseTo(0.5);
    expect(melody[1].duration).toBeCloseTo(0.5);
  });

  it('impose une durée minimale lisible', () => {
    const melody = extractMelody([note(60, 0, 0.01)]);
    expect(melody[0].duration).toBeGreaterThanOrEqual(0.08);
  });
});

describe('extractAccompaniment', () => {
  it('garde tout sauf les notes de la mélodie', () => {
    const notes = [note(64, 0), note(60, 0), note(48, 0), note(62, 0.5), note(43, 0.5)];
    const accompaniment = extractAccompaniment(notes, extractMelody(notes));
    expect(accompaniment.map((n) => [n.midi, n.time])).toEqual([
      [48, 0],
      [60, 0],
      [43, 0.5],
    ]);
  });

  it('retire aussi un autre instrument qui double la mélodie', () => {
    const melody = extractMelody([note(72, 1)]);
    const accompaniment = extractAccompaniment([note(72, 1), note(72, 1.01), note(72, 2), note(55, 1)], melody);
    expect(accompaniment.map((n) => [n.midi, n.time])).toEqual([
      [55, 1],
      [72, 2],
    ]);
  });
});
