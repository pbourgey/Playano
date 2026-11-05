import { pitchClass } from '../notes';
import { CHORD_TOLERANCE, type SongNote } from '../song/playable';

export interface GameNote extends SongNote {
  hit: boolean;
  /** Index de l'étape (groupe de notes jouées ensemble) à laquelle appartient la note. */
  step: number;
}

/** Notes qui tombent ensemble sur le clavier : une note seule, un accord, ou une note par main. */
export interface Step {
  time: number;
  notes: GameNote[];
  hit: boolean;
  /** Fausses notes jouées pendant qu'on attendait cette étape. */
  mistakes: number;
  /** Temps réel (s) pendant lequel le défilement a attendu cette étape. */
  waited: number;
}

export interface GameOptions {
  /** Accepte la bonne note jouée dans une autre octave (le micro confond parfois les octaves). */
  octaveTolerant: boolean;
  /** Vitesse de lecture (1 = tempo d'origine). */
  speed: number;
  /** Temps (s, en temps réel) affiché avant la première note. */
  leadIn?: number;
  /** Fin du morceau (s), quand l'accompagnement continue après la dernière note à jouer. */
  songEnd?: number;
  /** Saute les longs passages où l'élève n'a rien à jouer (intro, pause de sa partie, fin). */
  skipGaps?: boolean;
}

/**
 * - `correct` : une des notes attendues, l'étape est validée ;
 * - `wrong` : une autre note alors que l'étape est à jouer ;
 * - `early` : une note attendue, mais jouée trop tôt (elle n'est pas validée) ;
 * - `ignored` : rien à jouer pour l'instant.
 */
export type PlayResult = 'correct' | 'wrong' | 'early' | 'ignored';

export interface GameStats {
  /** Nombre d'étapes du morceau. */
  total: number;
  hit: number;
  wrong: number;
  /** Étapes jouées à temps, sans faute et sans faire attendre le défilement. */
  perfect: number;
  /** Part des étapes jouées justes du premier coup (0-1). */
  accuracy: number;
  /** Durée réelle de la partie (s). */
  elapsed: number;
}

/** Une note peut être jouée un peu en avance, jusqu'à ce délai (s, temps réel) avant d'atteindre le clavier. */
export const EARLY_WINDOW = 0.4;
/** Attente (s) en dessous de laquelle une étape compte encore comme jouée « à temps ». */
const ON_TIME_TOLERANCE = 0.3;
/** Temps laissé après la dernière note avant d'afficher la fin. */
const OUTRO = 1;
/** Au-delà de cette attente sans rien à jouer (s, temps réel), on avance directement. */
export const MAX_GAP = 6;

/**
 * Logique du mode « attente » : le morceau défile en rythme, mais s'arrête sur
 * chaque étape tant qu'elle n'a pas été jouée. Pour un accord ou des notes aux
 * deux mains, une seule des notes entendue suffit : le micro du téléphone ne
 * sait pas séparer toutes les notes d'un accord.
 */
export class GameEngine {
  readonly notes: GameNote[];
  readonly steps: Step[];
  /** Position dans le morceau (s). */
  time: number;
  speed: number;
  octaveTolerant: boolean;
  /** Index de la prochaine étape à jouer. */
  nextStep = 0;
  waiting = false;
  wrongCount = 0;
  elapsed = 0;
  /** Nombre de passages sautés : l'affichage s'en sert pour resynchroniser la musique. */
  skipCount = 0;
  private readonly endTime: number;
  private readonly leadIn: number;
  private readonly skipGaps: boolean;

  constructor(notes: readonly SongNote[], options: GameOptions) {
    this.notes = [];
    this.steps = [];
    for (const note of [...notes].sort((a, b) => a.time - b.time || a.midi - b.midi)) {
      let step = this.steps[this.steps.length - 1];
      if (!step || note.time - step.time > CHORD_TOLERANCE) {
        step = { time: note.time, notes: [], hit: false, mistakes: 0, waited: 0 };
        this.steps.push(step);
      }
      // Les notes d'une même étape touchent le clavier ensemble.
      const gameNote: GameNote = { ...note, time: step.time, hit: false, step: this.steps.length - 1 };
      step.notes.push(gameNote);
      this.notes.push(gameNote);
    }

    this.speed = options.speed;
    this.octaveTolerant = options.octaveTolerant;
    this.leadIn = options.leadIn ?? 3;
    this.skipGaps = options.skipGaps ?? false;
    const first = this.steps[0]?.time ?? 0;
    this.time = Math.min(0, first) - this.leadIn * this.speed;
    // Une partie qui ne commence qu'au milieu du morceau : on démarre juste avant sa première note.
    if (this.skipGaps) this.time = Math.max(this.time, first - this.leadIn * this.speed);
    const notesEnd = this.notes.reduce((end, n) => Math.max(end, n.time + n.duration), 0);
    let songEnd = options.songEnd ?? 0;
    // Une longue fin sans rien à jouer n'est pas attendue non plus.
    if (this.skipGaps && songEnd - notesEnd > MAX_GAP) songEnd = 0;
    this.endTime = Math.max(notesEnd, songEnd) + OUTRO;
  }

  get target(): Step | undefined {
    return this.steps[this.nextStep];
  }

  get finished(): boolean {
    return this.nextStep >= this.steps.length && this.time >= this.endTime;
  }

  /** L'étape attendue est-elle assez proche pour être jouée ? */
  get targetPlayable(): boolean {
    const target = this.target;
    return !!target && (target.time - this.time) / this.speed <= EARLY_WINDOW;
  }

  /** Avance le temps de `dt` secondes réelles. */
  update(dt: number): void {
    if (this.finished) return;
    this.elapsed += dt;
    const target = this.target;
    if (this.skipGaps && target && (target.time - this.time) / this.speed > MAX_GAP) {
      this.time = target.time - this.leadIn * this.speed;
      this.skipCount++;
    }
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

    const matches = target.notes.some(
      (n) => n.midi === midi || (this.octaveTolerant && pitchClass(n.midi) === pitchClass(midi)),
    );
    if (!this.targetPlayable) return matches ? 'early' : 'ignored';
    if (!matches) {
      target.mistakes++;
      this.wrongCount++;
      return 'wrong';
    }
    target.hit = true;
    for (const note of target.notes) note.hit = true;
    this.nextStep++;
    this.waiting = false;
    return 'correct';
  }

  stats(): GameStats {
    const hit = this.steps.filter((s) => s.hit);
    const firstTry = hit.filter((s) => s.mistakes === 0);
    return {
      total: this.steps.length,
      hit: hit.length,
      wrong: this.wrongCount,
      perfect: firstTry.filter((s) => s.waited <= ON_TIME_TOLERANCE).length,
      accuracy: hit.length === 0 ? 0 : firstTry.length / hit.length,
      elapsed: this.elapsed,
    };
  }
}
