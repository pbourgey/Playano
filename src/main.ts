import './styles.css';
import type { App, SongSource } from './app';
import { MicrophoneListener } from './audio/microphone';
import { MidiKeyboardInput } from './input/midiInput';
import { loadSettings, micGate, saveSettings, type Settings } from './settings';
import type { MidiNote } from './midi/parser';
import type { SongNote } from './song/melody';
import type { Screen } from './ui/dom';
import { homeScreen } from './ui/home';
import { micTestScreen } from './ui/micTest';
import { playScreen } from './ui/play';
import { openSettingsDialog } from './ui/settingsDialog';
import { setupScreen } from './ui/setup';

const container = document.getElementById('app')!;
let current: Screen | null = null;

function show(screen: Screen): void {
  current?.dispose?.();
  current = screen;
  container.replaceChildren(screen.root);
  window.scrollTo(0, 0);
}

const settings: Settings = loadSettings();

const app: App = {
  settings,
  updateSettings(patch) {
    Object.assign(settings, patch);
    saveSettings(settings);
  },
  mic: new MicrophoneListener(micGate(settings.micSensitivity)),
  midiKeyboard: new MidiKeyboardInput(),
  goHome: () => show(homeScreen(app)),
  openSong(song: SongSource) {
    try {
      show(setupScreen(app, song));
    } catch {
      alert(`Impossible d'ouvrir « ${song.name} » : le fichier MIDI semble abîmé.`);
      show(homeScreen(app));
    }
  },
  play: (song: SongSource, notes: SongNote[], accompaniment: MidiNote[]) =>
    show(playScreen(app, song, notes, accompaniment)),
  openMicTest: () => show(micTestScreen(app)),
  openSettings: () => openSettingsDialog(app),
};

app.goHome();
