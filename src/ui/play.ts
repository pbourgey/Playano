import type { App, SongSource } from '../app';
import { AccompanimentPlayer } from '../audio/accompaniment';
import { MicrophoneUnavailableError } from '../audio/microphone';
import { GameEngine, type GameStats } from '../game/engine';
import { Renderer, keyboardRange } from '../game/renderer';
import type { MidiNote } from '../midi/parser';
import { noteName } from '../notes';
import { micGate } from '../settings';
import type { SongNote } from '../song/melody';
import { el, type Screen } from './dom';
import { ScreenWakeLock } from './wakeLock';

/** Durée d'affichage d'une note touchée à l'écran ou reçue du clavier MIDI (ms). */
const MANUAL_HEARD_MS = 300;
/** Au bout de ce temps d'attente (s), on rappelle quelle note jouer. */
const HINT_AFTER = 1.5;
/** Durée d'affichage du message « trop tôt » (ms). */
const EARLY_MESSAGE_MS = 1500;

export function playScreen(app: App, song: SongSource, notes: SongNote[], accompaniment: MidiNote[]): Screen {
  const canvas = el('canvas', { class: 'stage', 'aria-label': 'Notes qui tombent et clavier de piano' });
  const renderer = new Renderer(canvas);
  // Le téléphone est posé sur le piano : l'écran ne doit pas se mettre en veille.
  const wakeLock = new ScreenWakeLock();
  wakeLock.acquire();
  const range = keyboardRange(notes.map((n) => n.midi));
  renderer.setRange(range.low, range.high);

  // Créé ici, pendant le clic sur « Commencer » : sinon le navigateur bloquerait le son.
  const musicVolume = () => (app.settings.accompaniment ? app.settings.accompanimentVolume : 0);
  const music = accompaniment.length > 0 ? new AccompanimentPlayer(accompaniment, musicVolume()) : null;
  if (music) music.extraDelay = app.settings.audioDelayMs / 1000;

  let engine = newEngine();
  let paused = false;
  let ended = false;
  let manualHeard: { midi: number; at: number } | null = null;
  let earlyAt = -Infinity;

  function newEngine() {
    return new GameEngine(notes, {
      speed: app.settings.speed,
      octaveTolerant: app.settings.octaveTolerant,
      songEnd: music?.end,
    });
  }

  // --- Barre du haut ---
  const progressBar = el('div', { class: 'progress-fill' });
  const progressText = el('span', { class: 'progress-text' });
  const speedText = el('output', { class: 'speed-value' });
  const pauseButton = el('button', { class: 'icon-button', type: 'button', title: 'Pause', 'aria-label': 'Pause' }, '❚❚');

  const changeSpeed = (delta: number) => {
    const speed = Math.min(1.5, Math.max(0.25, Math.round((engine.speed + delta) * 100) / 100));
    engine.speed = speed;
    app.updateSettings({ speed });
    speedText.textContent = `${Math.round(speed * 100)} %`;
  };
  speedText.textContent = `${Math.round(engine.speed * 100)} %`;

  const musicButton = el('button', { class: 'icon-button', type: 'button' });
  const refreshMusicButton = () => {
    const on = app.settings.accompaniment;
    musicButton.textContent = on ? '🎵' : '🔇';
    musicButton.title = on ? "Couper l'accompagnement" : "Remettre l'accompagnement";
    musicButton.setAttribute('aria-label', musicButton.title);
  };
  musicButton.addEventListener('click', () => {
    app.updateSettings({ accompaniment: !app.settings.accompaniment });
    music?.setVolume(musicVolume());
    refreshMusicButton();
  });
  refreshMusicButton();

  const topBar = el(
    'header',
    { class: 'play-bar' },
    el('button', { class: 'icon-button', type: 'button', title: 'Quitter', 'aria-label': 'Quitter', onclick: () => app.openSong(song) }, '←'),
    el(
      'div',
      { class: 'play-title' },
      el('strong', {}, song.name),
      el('div', { class: 'progress' }, progressBar),
      progressText,
    ),
    el(
      'div',
      { class: 'speed', title: 'Vitesse' },
      el('button', { class: 'icon-button small', type: 'button', 'aria-label': 'Ralentir', onclick: () => changeSpeed(-0.05) }, '−'),
      speedText,
      el('button', { class: 'icon-button small', type: 'button', 'aria-label': 'Accélérer', onclick: () => changeSpeed(0.05) }, '+'),
    ),
    music && musicButton,
    pauseButton,
  );

  // --- Indicateurs sur la scène ---
  const micLevel = el('div', { class: 'meter-fill' });
  const micLabel = el('span', {}, '🎤 Micro…');
  const micChip = el('div', { class: 'chip' }, micLabel, el('div', { class: 'meter' }, micLevel));
  const heardChip = el('div', { class: 'chip heard' });
  const notice = el('p', { class: 'notice', hidden: true });
  const hint = el('div', { class: 'hint', hidden: true });
  const overlay = el('div', { class: 'overlay', hidden: true });

  const stageWrap = el(
    'div',
    { class: 'stage-wrap' },
    canvas,
    el('div', { class: 'stage-top' }, el('div', { class: 'chips' }, micChip, heardChip), notice, hint),
    overlay,
  );
  const root = el('main', { class: 'screen play' }, topBar, stageWrap);

  // --- Entrées : micro, clavier MIDI, touches à l'écran ---
  function handleNote(midi: number, manual: boolean) {
    if (manual) manualHeard = { midi, at: performance.now() };
    if (paused || ended) return;
    const result = engine.play(midi);
    if (result === 'correct') renderer.flash(midi, 'correct');
    else if (result === 'wrong') renderer.flash(midi, 'wrong');
    else if (result === 'early') earlyAt = performance.now();
  }

  app.midiKeyboard.onNote = (midi) => handleNote(midi, true);
  app.midiKeyboard.onDevicesChange = () => updateInputChip();
  void app.midiKeyboard.start().then(updateInputChip);

  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    const midi = renderer.keyAt(event.clientX - rect.left, event.clientY - rect.top);
    if (midi !== null) handleNote(midi, true);
  });

  let micError: string | null = null;
  app.mic.tracker.gate = micGate(app.settings.micSensitivity);
  app.mic
    .start(app.settings.micDeviceId)
    .catch((error) => {
      micError = error instanceof MicrophoneUnavailableError ? error.message : "Impossible d'utiliser le micro.";
    })
    .finally(updateInputChip);

  function updateInputChip() {
    const devices = app.midiKeyboard.deviceNames;
    if (devices.length > 0) micLabel.textContent = `🎹 ${devices[0]}`;
    else if (app.mic.active) micLabel.textContent = '🎤 Micro actif';
    else micLabel.textContent = micError ? '🎤 Micro coupé' : '🎤 Micro…';
    micChip.classList.toggle('off', !app.mic.active && devices.length === 0 && micError !== null);

    if (micError && devices.length === 0) {
      notice.hidden = false;
      notice.textContent = `${micError} En attendant, tu peux toucher les touches du piano à l'écran.`;
    } else {
      notice.hidden = true;
    }
  }

  // --- Pause, fin, reprise ---
  function setPaused(value: boolean) {
    if (ended) return;
    paused = value;
    pauseButton.textContent = paused ? '▶' : '❚❚';
    pauseButton.title = paused ? 'Reprendre' : 'Pause';
    pauseButton.setAttribute('aria-label', pauseButton.title);
    if (paused) {
      showOverlay(
        el('h2', {}, 'Pause'),
        el('div', { class: 'overlay-actions' }, button('Reprendre', () => setPaused(false), true), button('Recommencer', restart), button('Quitter', () => app.openSong(song))),
      );
    } else {
      overlay.hidden = true;
      app.mic.resume();
    }
  }
  pauseButton.addEventListener('click', () => setPaused(!paused));

  function restart() {
    engine = newEngine();
    music?.restart(engine.time);
    ended = false;
    setPaused(false);
  }

  function showEnd(stats: GameStats) {
    ended = true;
    const minutes = Math.floor(stats.elapsed / 60);
    const seconds = Math.round(stats.elapsed % 60);
    const accuracy = Math.round(stats.accuracy * 100);
    showOverlay(
      el('h2', {}, accuracy >= 90 ? 'Bravo ! 🎉' : accuracy >= 60 ? 'Bien joué !' : 'Morceau terminé'),
      el(
        'dl',
        { class: 'stats' },
        stat('Justes du premier coup', `${accuracy} %`),
        stat('Jouées en rythme', `${stats.perfect} / ${stats.total}`),
        stat('Fausses notes', String(stats.wrong)),
        stat('Durée', minutes > 0 ? `${minutes} min ${seconds} s` : `${seconds} s`),
      ),
      el('div', { class: 'overlay-actions' }, button('Rejouer', restart, true), button('Autre morceau', () => app.goHome())),
    );
  }

  function showOverlay(...children: Node[]) {
    overlay.replaceChildren(el('div', { class: 'overlay-card' }, ...children));
    overlay.hidden = false;
  }

  const onVisibility = () => {
    if (document.hidden && !paused) setPaused(true);
  };
  document.addEventListener('visibilitychange', onVisibility);

  const onKey = (event: KeyboardEvent) => {
    if (event.key === ' ' || event.key === 'Escape') {
      event.preventDefault();
      setPaused(!paused);
    }
  };
  window.addEventListener('keydown', onKey);

  // --- Boucle principale ---
  const resizeObserver = new ResizeObserver(() => renderer.resize());
  resizeObserver.observe(canvas);

  let frameId = 0;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    const played = app.mic.poll();
    if (played !== null) handleNote(played, false);

    if (!paused && !ended) {
      engine.update(dt);
      if (engine.finished) showEnd(engine.stats());
    }
    // La musique avance exactement quand la partition avance, et s'arrête avec elle.
    music?.sync({
      songTime: engine.time,
      speed: engine.speed,
      limit: engine.target?.time ?? Infinity,
      running: !paused && !ended && !engine.waiting,
    });

    const heard =
      manualHeard && now - manualHeard.at < MANUAL_HEARD_MS ? manualHeard.midi : app.mic.active ? app.mic.tracker.current : null;
    renderer.draw({
      notes: engine.notes,
      time: engine.time,
      targetIndex: engine.nextIndex,
      targetPlayable: engine.targetPlayable,
      waiting: engine.waiting,
      heard,
      visibleSeconds: app.settings.visibleSeconds,
      showKeyLabels: app.settings.showKeyLabels,
    });

    progressBar.style.width = `${(engine.nextIndex / Math.max(1, engine.notes.length)) * 100}%`;
    progressText.textContent = `${engine.nextIndex} / ${engine.notes.length}`;
    micLevel.style.width = `${Math.min(100, Math.sqrt(app.mic.tracker.level / 0.2) * 100)}%`;
    heardChip.textContent = heard !== null ? `Entendu : ${noteName(heard)}` : 'Entendu : —';

    const target = engine.target;
    const showEarly = !paused && !ended && now - earlyAt < EARLY_MESSAGE_MS;
    const showWaiting = !paused && !ended && engine.waiting && !!target && target.waited > HINT_AFTER;
    hint.hidden = !showEarly && !showWaiting;
    hint.classList.toggle('early', showEarly);
    if (showEarly) hint.textContent = 'Un peu tôt ! Attends que la note touche le clavier';
    else if (showWaiting) hint.textContent = `Joue ${noteName(target.midi)} — la touche en couleur`;

    frameId = requestAnimationFrame(frame);
  };
  frameId = requestAnimationFrame(frame);

  return {
    root,
    dispose() {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      wakeLock.release();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKey);
      app.midiKeyboard.onNote = null;
      app.midiKeyboard.onDevicesChange = null;
      app.mic.stop();
      music?.dispose();
    },
  };
}

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  return el('button', { class: primary ? 'primary' : '', type: 'button', onclick: onClick }, label);
}

function stat(label: string, value: string): HTMLDivElement {
  return el('div', {}, el('dt', {}, label), el('dd', {}, value));
}
