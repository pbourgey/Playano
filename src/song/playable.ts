import type { MidiNote } from '../midi/parser';
import { MIDDLE_C } from '../notes';

export type Hand = 'left' | 'right';

export interface SongNote {
  midi: number;
  /** Début, en secondes. */
  time: number;
  /** Durée affichée, en secondes. */
  duration: number;
  /** Main qui joue la note (repère visuel). */
  hand: Hand;
}

export interface SourceTrack {
  name: string;
  notes: readonly MidiNote[];
}

/** Notes démarrant à moins de cet écart (s) sont jouées ensemble (accord, ou une note par main). */
export const CHORD_TOLERANCE = 0.035;
/** Durée minimale affichée d'une note (s). */
const MIN_DURATION = 0.08;

const LEFT_HINT = /gauche|left|\bl\.?h\b|\bmg\b|bass/i;
const RIGHT_HINT = /droit|right|\br\.?h\b|\bmd\b|m[ée]lod|chant|lead|soprano|treble|voice|vocal/i;

/**
 * Main de chaque piste choisie : d'après son nom, sinon la piste la plus grave
 * est la main gauche. `null` : une piste seule qui couvre les deux mains, à
 * séparer note par note au Do central.
 */
export function trackHands(tracks: readonly SourceTrack[]): (Hand | null)[] {
  const named = (t: SourceTrack): Hand | null => (LEFT_HINT.test(t.name) ? 'left' : RIGHT_HINT.test(t.name) ? 'right' : null);
  if (tracks.length === 1) {
    const [track] = tracks;
    const pitches = track.notes.map((n) => n.midi);
    const spansBothHands = pitches.some((m) => m < MIDDLE_C - 5) && pitches.some((m) => m > MIDDLE_C + 4);
    return [named(track) ?? (spansBothHands ? null : 'right')];
  }
  const averages = tracks.map((t) => t.notes.reduce((sum, n) => sum + n.midi, 0) / Math.max(1, t.notes.length));
  const lowest = averages.indexOf(Math.min(...averages));
  return tracks.map((t, i) => named(t) ?? (i === lowest ? 'left' : 'right'));
}

/**
 * Toutes les notes à jouer des pistes choisies (les deux mains, accords compris),
 * triées par temps, prêtes à tomber sur le clavier.
 */
export function playableNotes(tracks: readonly SourceTrack[]): SongNote[] {
  const hands = trackHands(tracks);
  const all: SongNote[] = tracks.flatMap((track, i) =>
    track.notes.map((n) => ({
      midi: n.midi,
      time: n.time,
      duration: n.duration,
      hand: hands[i] ?? (n.midi < MIDDLE_C ? 'left' : 'right'),
    })),
  );
  all.sort((a, b) => a.time - b.time || a.midi - b.midi);

  // Même touche au même moment dans deux pistes : une seule colonne.
  const notes: SongNote[] = [];
  const lastByKey = new Map<number, SongNote>();
  for (const note of all) {
    const previous = lastByKey.get(note.midi);
    if (previous && note.time - previous.time <= CHORD_TOLERANCE) {
      previous.duration = Math.max(previous.duration, note.duration);
      continue;
    }
    // Une touche rejouée relâche la précédente : les colonnes ne se chevauchent pas.
    if (previous) previous.duration = Math.min(previous.duration, note.time - previous.time);
    notes.push(note);
    lastByKey.set(note.midi, note);
  }
  for (const note of notes) note.duration = Math.max(note.duration, MIN_DURATION);
  return notes;
}

/**
 * Accompagnement joué par l'appli : les notes des pistes que l'élève ne joue
 * pas, sauf celles qui doublent ses propres notes.
 */
export function extractAccompaniment(notes: readonly MidiNote[], played: readonly SongNote[]): MidiNote[] {
  const playedTimes = new Map<number, number[]>();
  for (const note of played) {
    const times = playedTimes.get(note.midi);
    if (times) times.push(note.time);
    else playedTimes.set(note.midi, [note.time]);
  }
  const isPlayed = (note: MidiNote) =>
    playedTimes.get(note.midi)?.some((time) => Math.abs(time - note.time) <= CHORD_TOLERANCE) ?? false;
  return notes.filter((note) => !isPlayed(note)).sort((a, b) => a.time - b.time || a.midi - b.midi);
}
