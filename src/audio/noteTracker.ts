import { frequencyToMidi } from '../notes';
import type { PitchResult } from './pitch';

/**
 * Transforme une suite d'analyses audio (volume + hauteur, ~60 par seconde)
 * en événements « note jouée ».
 *
 * - Une note n'est validée que si sa hauteur reste stable quelques millisecondes,
 *   pour ignorer le bruit de l'attaque et les erreurs ponctuelles.
 * - Chaque frappe de touche ne produit qu'un seul événement : rejouer la même
 *   note est reconnu grâce à la remontée brusque du volume (attaque).
 */

export interface TrackerOptions {
  /** Volume minimal (RMS) pour considérer qu'un son est joué. */
  gate: number;
  /** Confiance minimale de la détection de hauteur. */
  minClarity?: number;
}

/** Remontée du volume (par rapport au minimum récent) qui signale une nouvelle frappe. */
const ONSET_RATIO = 1.5;
// La fenêtre de comparaison doit rester plus courte que la période réfractaire :
// sinon le silence qui précède une attaque déclencherait une seconde « frappe ».
const ONSET_LOOKBACK_MS = 60;
const ONSET_REFRACTORY_MS = 90;
/** Durée de stabilité requise juste après une frappe détectée. */
const STABLE_AFTER_ONSET_MS = 30;
/** Durée de stabilité requise quand seule la hauteur change (jeu lié, sans attaque nette). */
const STABLE_ON_PITCH_CHANGE_MS = 80;

export class NoteTracker {
  gate: number;
  private readonly minClarity: number;

  private levels: { time: number; level: number }[] = [];
  private lastOnset = -Infinity;
  private onsetPending = false;
  private candidate: number | null = null;
  private candidateSince = 0;
  private candidateFrames = 0;
  private lastEmitted: number | null = null;

  /** Note actuellement entendue (stable), pour l'affichage. */
  current: number | null = null;
  /** Dernier volume mesuré. */
  level = 0;

  constructor(options: TrackerOptions) {
    this.gate = options.gate;
    this.minClarity = options.minClarity ?? 0.75;
  }

  /** Renvoie la note MIDI jouée si une nouvelle frappe vient d'être reconnue. */
  update(time: number, level: number, pitch: PitchResult | null): number | null {
    this.level = level;
    const recentMin = this.recentMinimum(time);
    this.levels.push({ time, level });

    if (level < this.gate) {
      // Silence : la prochaine note jouée sera forcément une nouvelle frappe.
      this.current = null;
      this.lastEmitted = null;
      this.resetCandidate();
      return null;
    }

    if (level > recentMin * ONSET_RATIO && time - this.lastOnset > ONSET_REFRACTORY_MS) {
      this.lastOnset = time;
      this.onsetPending = true;
      this.resetCandidate();
    }

    const midi = pitch && pitch.clarity >= this.minClarity ? Math.round(frequencyToMidi(pitch.frequency)) : null;
    if (midi === null) {
      this.resetCandidate();
      return null;
    }

    if (midi === this.candidate) {
      this.candidateFrames++;
    } else {
      this.candidate = midi;
      this.candidateSince = time;
      this.candidateFrames = 1;
    }

    const stableFor = time - this.candidateSince;
    if (this.candidateFrames < 2) return null;
    if (stableFor >= STABLE_AFTER_ONSET_MS) this.current = midi;

    const isNewStrike = this.onsetPending && stableFor >= STABLE_AFTER_ONSET_MS;
    const isNewPitch = midi !== this.lastEmitted && stableFor >= STABLE_ON_PITCH_CHANGE_MS;
    if (isNewStrike || isNewPitch) {
      this.onsetPending = false;
      this.lastEmitted = midi;
      this.current = midi;
      return midi;
    }
    return null;
  }

  reset(): void {
    this.levels = [];
    this.lastOnset = -Infinity;
    this.onsetPending = false;
    this.lastEmitted = null;
    this.current = null;
    this.resetCandidate();
  }

  private resetCandidate(): void {
    this.candidate = null;
    this.candidateFrames = 0;
  }

  private recentMinimum(time: number): number {
    while (this.levels.length > 0 && time - this.levels[0].time > ONSET_LOOKBACK_MS) this.levels.shift();
    let min = Infinity;
    for (const entry of this.levels) min = Math.min(min, entry.level);
    // Avant tout son (ou après un silence), on compare au seuil.
    return Math.max(Number.isFinite(min) ? min : 0, this.gate / ONSET_RATIO);
  }
}
