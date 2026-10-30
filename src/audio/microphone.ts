import { choosePhoneMic, micDisplayName } from './micChoice';
import { NoteTracker } from './noteTracker';
import { PitchDetector, rms } from './pitch';

/** Fenêtre (en échantillons) utilisée pour mesurer le volume et repérer les attaques. */
const LEVEL_WINDOW = 1024;

export class MicrophoneUnavailableError extends Error {}

/**
 * Écoute le micro et signale chaque note de piano jouée.
 * L'analyse est faite à chaque appel de `poll()` (à chaque image affichée).
 */
export class MicrophoneListener {
  readonly tracker: NoteTracker;
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private detector: PitchDetector | null = null;
  private buffer = new Float32Array(0);
  private pitchBuffer = new Float32Array(0);
  /** Change à chaque démarrage et arrêt : permet d'abandonner un démarrage encore en cours. */
  private generation = 0;

  constructor(gate: number) {
    this.tracker = new NoteTracker({ gate });
  }

  get active(): boolean {
    return this.analyser !== null;
  }

  /** Nom du micro utilisé. */
  get deviceName(): string {
    return micDisplayName(this.stream?.getAudioTracks()[0]?.label ?? '');
  }

  /** `preferredId` : micro choisi par l'utilisateur (vide = automatique, micro du téléphone de préférence). */
  async start(preferredId = ''): Promise<void> {
    if (this.active) return;
    const generation = ++this.generation;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new MicrophoneUnavailableError(
        "Ce navigateur ne permet pas d'utiliser le micro (il faut une page en https ou en local).",
      );
    }
    // Le contexte audio est créé tout de suite, pendant le clic de l'utilisateur :
    // Safari (iPhone, iPad) le laisserait sinon en pause, sans aucun son analysé.
    const context = new AudioContext();
    void context.resume();
    let stream: MediaStream;
    try {
      stream = await openMic(choosePhoneMic(await MicrophoneListener.inputs(), preferredId));
      // À la toute première autorisation, les noms des micros n'étaient pas encore connus :
      // on vérifie maintenant qu'on n'a pas pris celui des écouteurs.
      const chosen = choosePhoneMic(await MicrophoneListener.inputs(), preferredId);
      if (chosen && chosen !== stream.getAudioTracks()[0]?.getSettings().deviceId) {
        stream.getTracks().forEach((track) => track.stop());
        stream = await openMic(chosen);
      }
    } catch (error) {
      void context.close();
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      throw new MicrophoneUnavailableError(
        denied
          ? "L'accès au micro a été refusé. Autorise-le dans les réglages du navigateur puis réessaie."
          : "Impossible d'accéder au micro.",
      );
    }

    if (generation !== this.generation) {
      // L'écran a été quitté pendant la demande d'autorisation.
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
      return;
    }
    this.stream = stream;
    this.context = context;
    const source = context.createMediaStreamSource(stream);
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 4096;
    source.connect(this.analyser);

    this.detector = new PitchDetector({ sampleRate: context.sampleRate, minFrequency: 60, maxFrequency: 4200 });
    this.buffer = new Float32Array(this.analyser.fftSize);
    const pitchSize = Math.min(this.analyser.fftSize, Math.max(2048, this.detector.recommendedBufferSize));
    this.pitchBuffer = this.buffer.subarray(this.buffer.length - pitchSize);
    this.tracker.reset();
  }

  /** Micros disponibles (leurs noms ne sont connus qu'une fois le micro autorisé). */
  static async inputs(): Promise<MediaDeviceInfo[]> {
    const devices = (await navigator.mediaDevices?.enumerateDevices?.().catch(() => [])) ?? [];
    return devices.filter(
      (d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications',
    );
  }

  /** Relance l'analyse si le navigateur l'a suspendue (onglet masqué, appel…). À appeler lors d'un clic. */
  resume(): void {
    void this.context?.resume();
  }

  /** Analyse le son le plus récent ; renvoie une note si une frappe vient d'être reconnue. */
  poll(): number | null {
    if (!this.analyser || !this.detector) return null;
    this.analyser.getFloatTimeDomainData(this.buffer);
    const level = rms(this.buffer, LEVEL_WINDOW);
    // Inutile de chercher une hauteur dans le silence.
    const pitch = level >= this.tracker.gate ? this.detector.detect(this.pitchBuffer) : null;
    return this.tracker.update(performance.now(), level, pitch);
  }

  stop(): void {
    this.generation++;
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close();
    this.stream = null;
    this.context = null;
    this.analyser = null;
    this.detector = null;
  }
}

/** Ouvre un micro précis, ou celui par défaut s'il n'est plus disponible. */
async function openMic(deviceId: string | undefined): Promise<MediaStream> {
  // Ces traitements, pensés pour la voix, déforment le son d'un instrument.
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  if (!deviceId) return navigator.mediaDevices.getUserMedia({ audio });
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { ...audio, deviceId: { exact: deviceId } } });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') throw error;
    return navigator.mediaDevices.getUserMedia({ audio });
  }
}
