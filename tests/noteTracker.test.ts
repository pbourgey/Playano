import { describe, expect, it } from 'vitest';
import { NoteTracker } from '../src/audio/noteTracker';
import { midiToFrequency } from '../src/notes';

const FRAME_MS = 1000 / 60;

/** Simule une suite d'images audio et renvoie les notes reconnues. */
function run(tracker: NoteTracker, frames: { level: number; midi: number | null }[]): number[] {
  const played: number[] = [];
  frames.forEach((frame, i) => {
    const pitch = frame.midi === null ? null : { frequency: midiToFrequency(frame.midi), clarity: 0.95 };
    const note = tracker.update(i * FRAME_MS, frame.level, pitch);
    if (note !== null) played.push(note);
  });
  return played;
}

/** Une note frappée puis qui décroît lentement. */
function strike(midi: number, frames: number, peak = 0.2): { level: number; midi: number | null }[] {
  return Array.from({ length: frames }, (_, i) => ({ level: peak * Math.pow(0.97, i), midi }));
}

const silence = (frames: number) => Array.from({ length: frames }, () => ({ level: 0.001, midi: null }));

describe('NoteTracker', () => {
  it('ne signale une note tenue qu’une seule fois', () => {
    expect(run(new NoteTracker({ gate: 0.01 }), strike(60, 60))).toEqual([60]);
  });

  it('reconnaît deux notes différentes jouées à la suite', () => {
    expect(run(new NoteTracker({ gate: 0.01 }), [...strike(60, 20), ...strike(64, 20)])).toEqual([60, 64]);
  });

  it('reconnaît la même note frappée deux fois sans silence entre les deux', () => {
    expect(run(new NoteTracker({ gate: 0.01 }), [...strike(62, 25), ...strike(62, 25)])).toEqual([62, 62]);
  });

  it('reconnaît la même note rejouée après un silence', () => {
    const frames = [...strike(62, 10, 0.05), ...silence(5), ...strike(62, 10, 0.05)];
    expect(run(new NoteTracker({ gate: 0.01 }), frames)).toEqual([62, 62]);
  });

  it('ignore les sons sous le seuil de volume', () => {
    expect(run(new NoteTracker({ gate: 0.05 }), strike(60, 30, 0.03))).toEqual([]);
  });

  it('ignore une erreur de hauteur ponctuelle', () => {
    const frames = strike(60, 30);
    frames[15] = { ...frames[15], midi: 72 };
    expect(run(new NoteTracker({ gate: 0.01 }), frames)).toEqual([60]);
  });
});
