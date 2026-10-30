import { describe, expect, it } from 'vitest';
import { AccompanimentScheduler } from '../src/audio/accompaniment';

const note = (midi: number, time: number, duration = 0.5) => ({ midi, time, duration, velocity: 70 });
const notes = [note(48, 0), note(52, 0.5), note(55, 1), note(48, 1.5, 2)];

describe('AccompanimentScheduler', () => {
  it('programme les notes à venir, une seule fois', () => {
    const scheduler = new AccompanimentScheduler(notes);
    expect(scheduler.take(-0.2, 0.2).map((n) => n.midi)).toEqual([48]);
    expect(scheduler.take(0, 0.2)).toEqual([]);
    expect(scheduler.take(0.4, 0.6).map((n) => n.midi)).toEqual([52]);
  });

  it('ne dépasse jamais la note que l’élève doit jouer', () => {
    const scheduler = new AccompanimentScheduler(notes);
    // L'élève doit jouer une note à 1 s : l'accord à 1 s attend qu'elle soit jouée.
    expect(scheduler.take(0, Math.min(1.2, 1)).map((n) => n.midi)).toEqual([48, 52]);
    expect(scheduler.take(1, Math.min(1.2, 1))).toEqual([]);
    // Note jouée : l'accord part tout de suite.
    expect(scheduler.take(1, 1.2).map((n) => n.midi)).toEqual([55]);
  });

  it('saute les notes déjà largement passées', () => {
    const scheduler = new AccompanimentScheduler(notes);
    expect(scheduler.take(1.2, 1.4).map((n) => n.time)).toEqual([]);
    expect(scheduler.take(1.4, 1.6).map((n) => n.time)).toEqual([1.5]);
  });

  it('repart du début après « Recommencer »', () => {
    const scheduler = new AccompanimentScheduler(notes);
    scheduler.take(0, 10);
    scheduler.seek(-3);
    expect(scheduler.take(-0.1, 0.1).map((n) => n.midi)).toEqual([48]);
  });

  it('connaît la fin du dernier son', () => {
    expect(new AccompanimentScheduler(notes).lastEnd).toBe(3.5);
  });
});
