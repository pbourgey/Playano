import { pitchClass } from '../notes';
import type { SongNote } from '../song/melody';

export interface GameNote extends SongNote {
  hit: boolean;
  /** Fausses notes jouées pendant qu'on attendait celle-ci. */
  mistakes: number;
  /** Temps réel (s) pendant lequel le défilement a attendu cette note. */
  waited: number;
}

export interface GameOptions {
  /** Accepte la bonne note jouée dans une autre octave (le micro confond parfois les octaves). */
  octaveTolerant: boolean;
  /** Vitesse de lecture (1 = tempo d'origine). */
  speed: number;
  /** Temps (s, en temps réel) affiché avant la première note. */
  leadIn?: number;
}

/**
 * - `correct` : la note attendue, validée ;
 * - `wrong` : une autre note alors que la note attendue est à jouer ;
 * - `early` : la note attendue, mais jouée trop tôt (elle n'est pas validée) ;
 * - `ignored` : rien à jouer pour l'instant.
 */
export type PlayResult = 'correct' | 'wrong' | 'early' | 'ignored';

export interface GameStats {
  total: number;
  hit: number;
  wrong: number;
  /** Notes jouées à temps, sans faute et sans faire attendre le défilement. */
  perfect: number;
  /** Part des notes jouées justes du premier coup (0-1). */
  accuracy: number;
  /** Durée réelle de la partie (s). */
  elapsed: number;
}

/** Une note peut être jouée un peu en avance, jusqu'à ce délai (s, temps réel) avant d'atteindre le clavier. */
export const EARLY_WINDOW = 0.4;
/** Attente (s) en dessous de laquelle une note compte encore comme jouée « à temps ». */
const ON_TIME_TOLERANCE = 0.3;
/** Temps laissé après la dernière note avant d'afficher la fin. */
const OUTRO = 1;

/**
 * Logique du mode « attente » : le morceau défile en rythme, mais s'arrête sur
 * chaque note tant qu'elle n'a pas été jouée.
 */
export class GameEngine {
  readonly notes: GameNote[];
  /** Position dans le morceau (s). */
  time: number;
  speed: number;
  octaveTolerant: boolean;
  /** Index de la prochaine note à jouer. */
  nextIndex = 0;
  waiting = false;
  wrongCount = 0;
  elapsed = 0;
  private readonly endTime: number;

  constructor(notes: readonly SongNote[], options: GameOptions) {
    this.notes = notes.map((n) => ({ ...n, hit: false, mistakes: 0, waited: 0 }));
    this.speed = options.speed;
    this.octaveTolerant = options.octaveTolerant;
    const first = this.notes[0]?.time ?? 0;
    this.time = Math.min(0, first) - (options.leadIn ?? 3) * this.speed;
    const last = this.notes[this.notes.length - 1];
    this.endTime = last ? last.time + last.duration + OUTRO : 0;
  }

  get target(): GameNote | undefined {
    return this.notes[this.nextIndex];
  }

  get finished(): boolean {
    return this.nextIndex >= this.notes.length && this.time >= this.endTime;
  }

  /** La note attendue est-elle assez proche pour être jouée ? */
  get targetPlayable(): boolean {
    const target = this.target;
    return !!target && (target.time - this.time) / this.speed <= EARLY_WINDOW;
  }

  /** Avance le temps de `dt` secondes réelles. */
  update(dt: number): void {
    if (this.finished) return;
    this.elapsed += dt;
    const target = this.target;
    const next = this.time + dt * this.speed;
    if (target && next >= target.time) {
      if (this.waiting) target.waited += dt;
      else target.waited += (next - target.time) / this.speed;
      this.time = target.time;
      this.waiting = true;
    } else {
      this.time = Math.min(next, this.endTime);
      this.waiting = false;
    }
  }

  /** Traite une note jouée au piano. */
  play(midi: number): PlayResult {
    const target = this.target;
    if (!target) return 'ignored';

    const matches = midi === target.midi || (this.octaveTolerant && pitchClass(midi) === pitchClass(target.midi));
    if (!this.targetPlayable) return matches ? 'early' : 'ignored';
    if (!matches) {
      target.mistakes++;
      this.wrongCount++;
      return 'wrong';
    }
    target.hit = true;
    this.nextIndex++;
    this.waiting = false;
    return 'correct';
  }

  stats(): GameStats {
    const hit = this.notes.filter((n) => n.hit).length;
    const perfect = this.notes.filter((n) => n.hit && n.mistakes === 0 && n.waited <= ON_TIME_TOLERANCE).length;
    const firstTry = this.notes.filter((n) => n.hit && n.mistakes === 0).length;
    return {
      total: this.notes.length,
      hit,
      wrong: this.wrongCount,
      perfect,
      accuracy: hit === 0 ? 0 : firstTry / hit,
      elapsed: this.elapsed,
    };
  }
}
