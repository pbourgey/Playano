import type { MidiNote } from '../midi/parser';
import { PianoSynth } from './synth';

/** Une note déjà passée de plus de ce délai (s de morceau) n'est plus jouée. */
const LATE_TOLERANCE = 0.05;
/** Avance (s, temps réel) avec laquelle les notes sont programmées. */
const LOOKAHEAD = 0.15;
/** Durée du fondu (s) quand la musique s'arrête pour attendre l'élève. */
const FADE = 0.015;

/**
 * Choisit les notes d'accompagnement à programmer. Il ne dépasse jamais la
 * note que l'élève doit jouer : un accord qui tombe en même temps qu'elle ne
 * part que lorsqu'elle a été jouée, comme si l'accompagnateur l'attendait.
 */
export class AccompanimentScheduler {
  private next = 0;

  /** `notes` triées par temps. */
  constructor(private readonly notes: readonly MidiNote[]) {}

  get lastEnd(): number {
    return this.notes.reduce((end, n) => Math.max(end, n.time + n.duration), 0);
  }

  /** Notes qui commencent avant `horizon` (exclu) et pas encore programmées. */
  take(songTime: number, horizon: number): MidiNote[] {
    const due: MidiNote[] = [];
    while (this.next < this.notes.length && this.notes[this.next].time < horizon) {
      const note = this.notes[this.next++];
      if (note.time >= songTime - LATE_TOLERANCE) due.push(note);
    }
    return due;
  }

  /** Repart d'une position du morceau (après « Recommencer »). */
  seek(songTime: number): void {
    this.next = this.notes.findIndex((n) => n.time >= songTime);
    if (this.next < 0) this.next = this.notes.length;
  }
}

export interface SyncState {
  /** Position dans le morceau (s). */
  songTime: number;
  speed: number;
  /** Temps de la note que l'élève doit jouer (Infinity s'il n'y en a plus). */
  limit: number;
  /** Faux quand la partition attend l'élève ou est en pause. */
  running: boolean;
}

/**
 * Joue l'accompagnement en suivant exactement la partition. Quand la partition
 * s'arrête, le contexte audio est suspendu : les notes en train de sonner
 * s'interrompent et reprennent là où elles en étaient.
 */
export class AccompanimentPlayer {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private synth: PianoSynth;
  private readonly scheduler: AccompanimentScheduler;
  private running = true;
  private suspendTimer = 0;
  private volume: number;
  /** Retard supplémentaire (s) choisi par l'utilisateur, pour les écouteurs Bluetooth. */
  extraDelay = 0;

  /** À créer pendant un clic : sinon le navigateur bloque le son. */
  constructor(notes: readonly MidiNote[], volume: number) {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    void this.ctx.resume();
    this.scheduler = new AccompanimentScheduler(notes);
    this.volume = volume;

    const compressor = this.ctx.createDynamicsCompressor();
    compressor.connect(this.ctx.destination);
    this.master = this.ctx.createGain();
    this.master.gain.value = volume;
    this.master.connect(compressor);
    this.synth = this.newSynth();
  }

  /** Fin du dernier son d'accompagnement (s de morceau). */
  get end(): number {
    return this.scheduler.lastEnd;
  }

  /** Retard entre la programmation d'un son et le moment où on l'entend (s). */
  private get delay(): number {
    const reported = this.ctx.outputLatency || this.ctx.baseLatency || 0;
    return reported + this.extraDelay;
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.running) this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02);
  }

  /** À appeler à chaque image, après la mise à jour de la partition. */
  sync(state: SyncState): void {
    if (state.running !== this.running) {
      this.running = state.running;
      if (state.running) this.resumeAudio();
      else this.pauseAudio();
    }
    if (!state.running) return;

    const delay = this.delay;
    const horizon = Math.min(state.songTime + (LOOKAHEAD + delay) * state.speed, state.limit);
    for (const note of this.scheduler.take(state.songTime, horizon)) {
      if (this.volume <= 0) continue;
      // On programme en avance du retard de sortie pour entendre la note au bon moment.
      const when = this.ctx.currentTime + Math.max(0, (note.time - state.songTime) / state.speed - delay);
      this.synth.play(note.midi, when, note.duration / state.speed, note.velocity);
    }
  }

  /** Coupe tout ce qui sonne et repart de `songTime`. */
  restart(songTime: number): void {
    this.synth.output.disconnect();
    this.synth = this.newSynth();
    this.scheduler.seek(songTime);
  }

  dispose(): void {
    window.clearTimeout(this.suspendTimer);
    void this.ctx.close();
  }

  private newSynth(): PianoSynth {
    const synth = new PianoSynth(this.ctx);
    synth.output.connect(this.master);
    return synth;
  }

  private pauseAudio(): void {
    // Court fondu pour éviter un clic, puis le temps audio s'arrête.
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, FADE);
    window.clearTimeout(this.suspendTimer);
    this.suspendTimer = window.setTimeout(() => {
      if (!this.running) void this.ctx.suspend();
    }, FADE * 4000);
  }

  private resumeAudio(): void {
    window.clearTimeout(this.suspendTimer);
    void this.ctx.resume();
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.005);
  }
}
