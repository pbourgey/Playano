import type { App } from '../app';
import { el } from './dom';

/** Fenêtre des réglages (vitesse, espacement, tolérance d'octave, étiquettes). */
export function openSettingsDialog(app: App): void {
  const s = app.settings;

  const range = (label: string, help: string, min: number, max: number, step: number, value: number, format: (v: number) => string, onChange: (v: number) => void) => {
    const output = el('output', {}, format(value));
    const input = el('input', { type: 'range', min, max, step, value });
    input.addEventListener('input', () => {
      output.textContent = format(Number(input.value));
      onChange(Number(input.value));
    });
    return el('label', { class: 'field' }, el('span', {}, label, output), input, el('small', { class: 'muted' }, help));
  };

  const toggle = (label: string, help: string, checked: boolean, onChange: (v: boolean) => void) => {
    const input = el('input', { type: 'checkbox', checked });
    input.addEventListener('change', () => onChange(input.checked));
    return el('label', { class: 'field toggle' }, input, el('span', {}, label, el('small', { class: 'muted' }, help)));
  };

  const dialog = el(
    'dialog',
    { class: 'settings' },
    el(
      'form',
      { method: 'dialog' },
      el('h2', {}, 'Réglages'),
      range('Vitesse', 'Tempo du morceau. Ralentis pour apprendre un passage.', 25, 150, 5, Math.round(s.speed * 100), (v) => `${v} %`, (v) =>
        app.updateSettings({ speed: v / 100 }),
      ),
      range('Espacement des notes', 'Plus de secondes = notes plus serrées, tu vois plus loin à l’avance.', 2, 6, 0.5, s.visibleSeconds, (v) => `${v} s`, (v) =>
        app.updateSettings({ visibleSeconds: v }),
      ),
      range('Sensibilité du micro', 'À ajuster dans « Tester le micro ».', 0, 100, 1, Math.round(s.micSensitivity * 100), (v) => `${v} %`, (v) =>
        app.updateSettings({ micSensitivity: v / 100 }),
      ),
      toggle(
        'Accepter la note dans une autre octave',
        'Le micro confond parfois un Do grave et un Do aigu. Désactive pour être strict.',
        s.octaveTolerant,
        (v) => app.updateSettings({ octaveTolerant: v }),
      ),
      toggle('Noms des notes sur le clavier', 'Affiche Do, Ré, Mi… sur chaque touche blanche.', s.showKeyLabels, (v) =>
        app.updateSettings({ showKeyLabels: v }),
      ),
      el('div', { class: 'dialog-actions' }, el('button', { class: 'primary', value: 'close' }, 'Fermer')),
    ),
  );

  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
