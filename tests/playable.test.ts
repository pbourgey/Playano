import { describe, expect, it } from 'vitest';
import { extractAccompaniment, playableNotes, trackHands } from '../src/song/playable';

const note = (midi: number, time: number, duration = 0.5) => ({ midi, time, duration, velocity: 80 });

describe('playableNotes', () => {
  it('garde toutes les notes des deux mains, accords compris', () => {
    const right = { name: 'Main droite', notes: [note(64, 0), note(67, 0), note(65, 0.5)] };
    const left = { name: 'Main gauche', notes: [note(48, 0, 1)] };
    const notes = playableNotes([right, left]);
    expect(notes.map((n) => [n.midi, n.time, n.hand])).toEqual([
      [48, 0, 'left'],
      [64, 0, 'right'],
      [67, 0, 'right'],
      [65, 0.5, 'right'],
    ]);
  });

  it('ne fait qu’une colonne pour la même touche jouée par deux pistes', () => {
    const notes = playableNotes([
      { name: 'A', notes: [note(60, 0)] },
      { name: 'B', notes: [note(60, 0.01), note(48, 0)] },
    ]);
    expect(notes.map((n) => n.midi)).toEqual([48, 60]);
  });

  it('relâche une touche quand elle est rejouée', () => {
    const notes = playableNotes([{ name: 'A', notes: [note(60, 0, 2), note(60, 1, 1)] }]);
    expect(notes[0].duration).toBeCloseTo(1);
  });
});

describe('trackHands', () => {
  it('se fie au nom des pistes', () => {
    expect(trackHands([{ name: 'Left Hand', notes: [note(72, 0)] }, { name: 'Right Hand', notes: [note(40, 0)] }])).toEqual([
      'left',
      'right',
    ]);
  });

  it('prend la piste la plus grave pour la main gauche', () => {
    expect(trackHands([{ name: 'Piano 1', notes: [note(72, 0)] }, { name: 'Piano 2', notes: [note(45, 0)] }])).toEqual([
      'right',
      'left',
    ]);
  });

  it('sépare au Do central une piste seule qui couvre les deux mains', () => {
    expect(trackHands([{ name: 'Piano', notes: [note(43, 0), note(72, 0)] }])).toEqual([null]);
    const notes = playableNotes([{ name: 'Piano', notes: [note(43, 0), note(72, 0)] }]);
    expect(notes.map((n) => n.hand)).toEqual(['left', 'right']);
  });

  it('considère une mélodie seule comme la main droite', () => {
    expect(trackHands([{ name: 'Track 1', notes: [note(57, 0), note(72, 0)] }])).toEqual(['right']);
  });
});

describe('extractAccompaniment', () => {
  it('retire les notes qui doublent celles jouées par l’élève', () => {
    const played = playableNotes([{ name: 'Main droite', notes: [note(72, 1)] }]);
    const accompaniment = extractAccompaniment([note(72, 1.01), note(72, 2), note(55, 1)], played);
    expect(accompaniment.map((n) => [n.midi, n.time])).toEqual([
      [55, 1],
      [72, 2],
    ]);
  });
});
