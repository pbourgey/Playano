import type { MicrophoneListener } from './audio/microphone';
import type { MidiKeyboardInput } from './input/midiInput';
import type { Settings } from './settings';
import type { SongNote } from './song/melody';

/** Un morceau prêt à être ouvert : démo intégrée ou fichier importé. */
export interface SongSource {
  id: string;
  name: string;
  data: Uint8Array;
  /** Vrai si le morceau est enregistré dans la bibliothèque (donc supprimable). */
  stored: boolean;
  selectedTracks?: number[];
}

/** Services partagés et navigation entre les écrans. */
export interface App {
  readonly settings: Settings;
  updateSettings(patch: Partial<Settings>): void;
  readonly mic: MicrophoneListener;
  readonly midiKeyboard: MidiKeyboardInput;
  goHome(): void;
  openSong(song: SongSource): void;
  play(song: SongSource, notes: SongNote[]): void;
  openMicTest(): void;
  openSettings(): void;
}
