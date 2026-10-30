import { midiToFrequency } from '../notes';

/**
 * Petit synthétiseur au son proche du piano, sans échantillons à télécharger :
 * une onde riche en harmoniques, une attaque franche, une décroissance plus
 * longue dans les graves et un timbre qui s'adoucit en résonnant.
 */
export class PianoSynth {
  readonly output: GainNode;
  private readonly wave: PeriodicWave;

  constructor(private readonly ctx: BaseAudioContext) {
    const harmonics = [0, 1, 0.55, 0.32, 0.22, 0.14, 0.09, 0.06, 0.04, 0.025];
    const imag = Float32Array.from(harmonics);
    this.wave = ctx.createPeriodicWave(new Float32Array(harmonics.length), imag);
    this.output = ctx.createGain();
  }

  /** Programme une note : `when` en temps du contexte audio, `duration` en secondes. */
  play(midi: number, when: number, duration: number, velocity = 80): void {
    const { ctx } = this;
    const frequency = midiToFrequency(midi);
    const loudness = 0.3 * Math.pow(Math.min(127, Math.max(1, velocity)) / 127, 1.5);
    // Une corde grave résonne plus longtemps qu'une corde aiguë.
    const sustain = Math.min(2.5, Math.max(0.35, 2.5 - (midi - 36) * 0.04));

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.wave);
    osc.frequency.value = frequency;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(12000, frequency * 10), when);
    filter.frequency.setTargetAtTime(Math.min(6000, frequency * 3), when, 0.25);

    const gain = ctx.createGain();
    const attackEnd = when + 0.005;
    const release = Math.max(when + duration, attackEnd + 0.02);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(loudness, attackEnd);
    gain.gain.setTargetAtTime(loudness * 0.45, attackEnd, 0.08);
    if (release > attackEnd + 0.12) gain.gain.setTargetAtTime(0, attackEnd + 0.12, sustain);
    // Touche relâchée : l'étouffoir coupe le son en douceur.
    gain.gain.setTargetAtTime(0, release, 0.07);

    osc.connect(filter).connect(gain).connect(this.output);
    osc.start(when);
    osc.stop(release + 0.5);
    osc.onended = () => gain.disconnect();
  }
}
