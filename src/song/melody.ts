import type { MidiNote } from '../midi/parser';

export interface SongNote {
  midi: number;
  /** Début, en secondes. */
  time: number;
  /** Durée affichée, en secondes. */
  duration: number;
}

/** Notes démarrant à moins de cet écart (s) sont considérées comme un accord. */
const CHORD_TOLERANCE = 0.035;
/** Durée minimale affichée d'une note (s). */
const MIN_DURATION = 0.08;

/**
 * Réduit des pistes à une mélodie jouable une note à la fois : pour chaque
 * accord, on garde la note la plus aiguë. Les durées sont raccourcies pour
 * qu'une note se termine au plus tard quand la suivante commence.
 */
export function extractMelody(notes: readonly MidiNote[]): SongNote[] {
  const sorted = [...notes].sort((a, b) => a.time - b.time || b.midi - a.midi);
  const melody: SongNote[] = [];

  let i = 0;
  while (i < sorted.length) {
    const groupStart = sorted[i].time;
    let top = sorted[i];
    let j = i + 1;
    while (j < sorted.length && sorted[j].time - groupStart <= CHORD_TOLERANCE) {
      if (sorted[j].midi > top.midi) top = sorted[j];
      j++;
    }
    melody.push({ midi: top.midi, time: groupStart, duration: top.duration });
    i = j;
  }

  for (let k = 0; k < melody.length; k++) {
    const next = melody[k + 1];
    let duration = melody[k].duration;
    if (next) duration = Math.min(duration, next.time - melody[k].time);
    melody[k].duration = Math.max(duration, MIN_DURATION);
  }
  return melody;
}
