/** Utilitaires autour des notes : noms (Do Ré Mi), fréquences, touches noires. */

const NAMES = ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];

/** Couleur de chaque note naturelle, à la manière des méthodes pour débutants. */
const NATURAL_COLORS: Record<number, string> = {
  0: '#ef4444', // Do
  2: '#f97316', // Ré
  4: '#eab308', // Mi
  5: '#22c55e', // Fa
  7: '#06b6d4', // Sol
  9: '#3b82f6', // La
  11: '#a855f7', // Si
};

export const MIDDLE_C = 60;

export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/** Nom de la note sans octave : « Do », « Fa# »… */
export function noteName(midi: number): string {
  return NAMES[pitchClass(midi)];
}

/**
 * Nom avec octave selon la convention française, où le Do central (MIDI 60)
 * est « Do3 » (et non C4 comme en notation anglo-saxonne).
 */
export function noteNameWithOctave(midi: number): string {
  return `${noteName(midi)}${Math.floor(midi / 12) - 2}`;
}

export function isBlackKey(midi: number): boolean {
  return BLACK[pitchClass(midi)];
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Note MIDI (non arrondie) correspondant à une fréquence. */
export function frequencyToMidi(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440);
}

/** Couleur de la colonne d'une note. Les dièses reprennent la couleur de la note du dessous, assombrie. */
export function noteColor(midi: number): string {
  const pc = pitchClass(midi);
  if (!BLACK[pc]) return NATURAL_COLORS[pc];
  return darken(NATURAL_COLORS[pc - 1], 0.35);
}

/** Couleur de texte lisible sur la couleur de la note. */
export function noteTextColor(midi: number): string {
  return pitchClass(midi) === 4 ? '#1c1917' : '#ffffff';
}

function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.round(((n >> shift) & 0xff) * (1 - amount));
  const r = channel(16);
  const g = channel(8);
  const b = channel(0);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
