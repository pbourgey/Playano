import type { App } from '../app';
import { micDisplayName } from '../audio/micChoice';
import { MicrophoneListener, MicrophoneUnavailableError } from '../audio/microphone';
import { PianoSynth } from '../audio/synth';
import { Renderer } from '../game/renderer';
import { noteName, noteNameWithOctave } from '../notes';
import { micGate } from '../settings';
import { el, type Screen } from './dom';
import { ScreenWakeLock } from './wakeLock';

/** Niveau (RMS) correspondant à une jauge pleine. */
const METER_MAX = 0.2;

/** Jauge en échelle racine : les sons faibles restent visibles. */
function meterPercent(level: number): number {
  return Math.min(100, Math.sqrt(level / METER_MAX) * 100);
}

export function micTestScreen(app: App): Screen {
  const bigNote = el('div', { class: 'big-note' }, '—');
  const detail = el('p', { class: 'muted' }, 'Joue une note sur ton piano…');
  const meterFill = el('div', { class: 'meter-fill' });
  const gateMark = el('div', { class: 'meter-gate', title: 'Seuil : en dessous, le son est ignoré' });
  const status = el('p', { class: 'status', role: 'status' }, 'Autorise le micro quand le navigateur le demande.');
  const lastPlayed = el('p', { class: 'muted' });
  const canvas = el('canvas', { class: 'mini-keyboard', 'aria-hidden': 'true' });
  const renderer = new Renderer(canvas, true);
  const wakeLock = new ScreenWakeLock();
  wakeLock.acquire();
  renderer.setRange(36, 95);

  const sensitivityInput = el('input', { type: 'range', min: 0, max: 100, step: 1, value: Math.round(app.settings.micSensitivity * 100) });
  const applyGate = () => {
    const sensitivity = Number(sensitivityInput.value) / 100;
    app.mic.tracker.gate = micGate(sensitivity);
    gateMark.style.left = `${meterPercent(app.mic.tracker.gate)}%`;
    return sensitivity;
  };
  sensitivityInput.addEventListener('input', () => app.updateSettings({ micSensitivity: applyGate() }));
  applyGate();

  const played: string[] = [];
  const showPlayed = (midi: number) => {
    played.unshift(noteName(midi));
    played.length = Math.min(played.length, 8);
    lastPlayed.textContent = `Dernières notes reconnues : ${played.join(', ')}`;
  };

  // Choix du micro : utile si le navigateur prend celui des écouteurs au lieu de celui du téléphone.
  const micSelect = el('select');
  const micField = el(
    'label',
    { class: 'field', hidden: true },
    el('span', {}, 'Micro utilisé'),
    micSelect,
    el(
      'small',
      { class: 'muted' },
      "En automatique, l'appli prend le micro du téléphone plutôt que celui des écouteurs : il est posé tout près du piano.",
    ),
  );
  micSelect.addEventListener('change', () => {
    app.updateSettings({ micDeviceId: micSelect.value });
    app.mic.stop();
    startMic();
  });

  async function listMics() {
    const inputs = await MicrophoneListener.inputs().catch(() => []);
    micField.hidden = inputs.length < 2;
    micSelect.replaceChildren(
      el('option', { value: '' }, 'Automatique (micro du téléphone)'),
      ...inputs.map((input, i) => el('option', { value: input.deviceId }, input.label ? micDisplayName(input.label) : `Micro ${i + 1}`)),
    );
    micSelect.value = inputs.some((i) => i.deviceId === app.settings.micDeviceId) ? app.settings.micDeviceId : '';
  }

  // Quelques notes jouées comme le ferait l'accompagnement, micro actif : on entend par où sort la musique.
  let soundContext: AudioContext | null = null;
  const soundButton = el('button', { type: 'button' }, '🔊 Tester le son');
  soundButton.addEventListener('click', () => {
    soundContext ??= new AudioContext();
    void soundContext.resume();
    const synth = new PianoSynth(soundContext);
    synth.output.connect(soundContext.destination);
    const start = soundContext.currentTime + 0.05;
    [60, 64, 67, 72].forEach((midi, i) => synth.play(midi, start + i * 0.3, 0.5, 100));
  });
  const soundField = el(
    'div',
    { class: 'field' },
    el('span', {}, 'Son de la musique'),
    soundButton,
    el(
      'small',
      { class: 'muted' },
      "Sur Android, quand le micro du téléphone est utilisé, Chrome peut envoyer le son sur le haut-parleur plutôt que dans les écouteurs Bluetooth. Ce n'est pas grave : garde un volume modéré, l'appli ignore les notes de sa propre musique.",
    ),
  );

  function startMic() {
    status.classList.remove('error');
    app.mic
      .start(app.settings.micDeviceId)
      .then(() => {
        status.textContent = `${app.mic.deviceName} actif. Pose ton téléphone sur le pupitre du piano et joue quelques notes.`;
        return listMics();
      })
      .catch((error) => {
        status.textContent = error instanceof MicrophoneUnavailableError ? error.message : "Impossible d'utiliser le micro.";
        status.classList.add('error');
      });
  }
  startMic();

  app.midiKeyboard.onNote = showPlayed;
  void app.midiKeyboard.start().then(() => {
    const devices = app.midiKeyboard.deviceNames;
    if (devices.length > 0) status.textContent = `Clavier MIDI détecté : ${devices.join(', ')}. Le micro reste aussi actif.`;
  });

  const root = el(
    'main',
    { class: 'screen mic-test' },
    el('button', { class: 'back', type: 'button', onclick: () => app.goHome() }, '← Retour'),
    el('h1', {}, 'Tester le micro'),
    status,
    el('div', { class: 'mic-card' }, bigNote, detail, el('div', { class: 'meter large' }, meterFill, gateMark)),
    micField,
    el(
      'label',
      { class: 'field' },
      el('span', {}, 'Sensibilité du micro'),
      sensitivityInput,
      el('small', { class: 'muted' }, 'Si des notes sont reconnues alors que tu ne joues pas, baisse-la. Si tes notes ne sont pas entendues, monte-la.'),
    ),
    lastPlayed,
    soundField,
    canvas,
    !ScreenWakeLock.supported &&
      el(
        'p',
        { class: 'muted' },
        "Ton navigateur ne peut pas garder l'écran allumé : désactive la mise en veille automatique du téléphone le temps de jouer.",
      ),
  );

  const resizeObserver = new ResizeObserver(() => renderer.resize());
  resizeObserver.observe(canvas);

  let frameId = 0;
  const frame = () => {
    const note = app.mic.poll();
    if (note !== null) showPlayed(note);
    const current = app.mic.tracker.current;
    bigNote.textContent = current !== null ? noteName(current) : '—';
    detail.textContent = current !== null ? `${noteNameWithOctave(current)} (Do central = Do3)` : 'Joue une note sur ton piano…';
    meterFill.style.width = `${meterPercent(app.mic.tracker.level)}%`;
    renderer.draw({
      notes: [],
      time: 0,
      targetIndex: 0,
      targetPlayable: false,
      waiting: false,
      heard: current,
      visibleSeconds: 3,
      showKeyLabels: true,
    });
    frameId = requestAnimationFrame(frame);
  };
  frameId = requestAnimationFrame(frame);

  return {
    root,
    dispose() {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      wakeLock.release();
      app.midiKeyboard.onNote = null;
      app.mic.stop();
      void soundContext?.close();
    },
  };
}
