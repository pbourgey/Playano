/**
 * Détection de hauteur monophonique par l'algorithme YIN
 * (de Cheveigné & Kawahara, 2002), adapté à la tessiture du piano.
 */

export interface PitchResult {
  /** Fréquence fondamentale estimée, en Hz. */
  frequency: number;
  /** Confiance entre 0 et 1 (1 = son parfaitement périodique). */
  clarity: number;
}

export interface PitchOptions {
  sampleRate: number;
  /** Fréquence la plus grave cherchée (Hz). */
  minFrequency?: number;
  /** Fréquence la plus aiguë cherchée (Hz). */
  maxFrequency?: number;
  /** Seuil YIN : plus il est bas, plus la détection est stricte. */
  threshold?: number;
}

/** Au-delà de ce score YIN, on considère qu'il n'y a pas de note claire. */
const MAX_ACCEPTED = 0.4;

export class PitchDetector {
  private readonly minLag: number;
  private readonly maxLag: number;
  private readonly threshold: number;
  private readonly sampleRate: number;
  private diff: Float32Array;

  constructor(options: PitchOptions) {
    this.sampleRate = options.sampleRate;
    this.minLag = Math.max(2, Math.floor(options.sampleRate / (options.maxFrequency ?? 4200)));
    this.maxLag = Math.ceil(options.sampleRate / (options.minFrequency ?? 60));
    this.threshold = options.threshold ?? 0.15;
    this.diff = new Float32Array(this.maxLag + 2);
  }

  /** Nombre d'échantillons à fournir pour couvrir les notes les plus graves. */
  get recommendedBufferSize(): number {
    return this.maxLag * 2 + 2;
  }

  detect(buffer: Float32Array): PitchResult | null {
    const maxLag = Math.min(this.maxLag, Math.floor(buffer.length / 2) - 1);
    if (maxLag <= this.minLag) return null;
    const window = buffer.length - maxLag;
    const d = this.diff;

    // 1. Fonction de différence.
    d[0] = 0;
    for (let tau = 1; tau <= maxLag; tau++) {
      let sum = 0;
      for (let j = 0; j < window; j++) {
        const delta = buffer[j] - buffer[j + tau];
        sum += delta * delta;
      }
      d[tau] = sum;
    }

    // 2. Différence normalisée par la moyenne cumulée.
    d[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= maxLag; tau++) {
      running += d[tau];
      d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
    }

    // 3. Premier creux sous le seuil (ou, à défaut, le minimum global).
    let tau = -1;
    for (let t = this.minLag; t <= maxLag; t++) {
      if (d[t] < this.threshold) {
        while (t + 1 <= maxLag && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      let best = this.minLag;
      for (let t = this.minLag + 1; t <= maxLag; t++) if (d[t] < d[best]) best = t;
      if (d[best] > MAX_ACCEPTED) return null;
      tau = best;
    }

    // 4. Interpolation parabolique pour une estimation plus fine.
    let refined = tau;
    if (tau > 1 && tau < maxLag) {
      const a = d[tau - 1];
      const b = d[tau];
      const c = d[tau + 1];
      const denominator = a + c - 2 * b;
      if (denominator > 0) refined = tau + (a - c) / (2 * denominator);
    }

    return { frequency: this.sampleRate / refined, clarity: Math.max(0, Math.min(1, 1 - d[tau])) };
  }
}

/** Volume (moyenne quadratique) des `length` derniers échantillons. */
export function rms(buffer: Float32Array, length = buffer.length): number {
  const start = Math.max(0, buffer.length - length);
  let sum = 0;
  for (let i = start; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / (buffer.length - start || 1));
}
