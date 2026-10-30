import type { App, SongSource } from '../app';
import { instrumentName, isDrumTrack, parseMidi, type MidiTrack } from '../midi/parser';
import { noteNameWithOctave } from '../notes';
import { extractAccompaniment, extractMelody } from '../song/melody';
import { getSong, saveSong } from '../storage/library';
import { el, type Screen } from './dom';

/** Noms de pistes qui désignent souvent la mélodie / main droite. */
const MELODY_HINT = /droit|right|r\.?h\b|m[ée]lod|chant|lead|soprano|voice|vocal|treble/i;

/** Pistes cochées par défaut : celle qui ressemble à la mélodie, sinon toutes sauf la batterie. */
function defaultSelection(tracks: MidiTrack[]): number[] {
  const playable = tracks.map((t, i) => ({ t, i })).filter(({ t }) => t.notes.length > 0 && !isDrumTrack(t));
  const hinted = playable.filter(({ t }) => MELODY_HINT.test(t.name));
  return (hinted.length > 0 ? hinted : playable).map(({ i }) => i);
}

/** Retient le choix des pistes pour la prochaine fois. */
async function rememberSelection(id: string, selectedTracks: number[]): Promise<void> {
  try {
    const stored = await getSong(id);
    if (stored) await saveSong({ ...stored, selectedTracks });
  } catch {
    // Sans bibliothèque disponible, on rechoisira simplement les pistes.
  }
}

export function setupScreen(app: App, song: SongSource): Screen {
  const midi = parseMidi(song.data);
  const valid = (song.selectedTracks ?? []).filter((i) => midi.tracks[i]?.notes.length);
  const selected = new Set(valid.length > 0 ? valid : defaultSelection(midi.tracks));

  const summary = el('p', { class: 'summary' });
  const startButton = el('button', { class: 'primary big', type: 'button' }, 'Commencer');

  const accompanimentSummary = el('p', { class: 'muted' });

  const melody = () => extractMelody([...selected].flatMap((i) => midi.tracks[i].notes));
  // La batterie n'est pas jouée : le petit synthétiseur ne sait faire que du piano.
  const accompaniment = (notes = melody()) =>
    extractAccompaniment(
      midi.tracks.filter((t) => !isDrumTrack(t)).flatMap((t) => t.notes),
      notes,
    );

  const refreshSummary = () => {
    const notes = melody();
    const count = notes.length;
    summary.textContent =
      count === 0 ? 'Coche au moins une piste avec des notes.' : `${count} notes à jouer, une à la fois (la plus aiguë de chaque accord).`;
    startButton.disabled = count === 0;
    const extra = count === 0 ? 0 : accompaniment(notes).length;
    accompanimentSummary.textContent =
      extra > 0
        ? `L'appli joue le reste du morceau (${extra} notes) et s'arrête avec toi quand elle attend une note.`
        : "Ce morceau n'a pas d'accompagnement : toutes ses notes sont dans ta mélodie.";
  };

  const trackRows = midi.tracks.map((track, index) => {
    const checkbox = el('input', { type: 'checkbox', checked: selected.has(index), disabled: track.notes.length === 0 });
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selected.add(index);
      else selected.delete(index);
      refreshSummary();
    });
    const pitches = track.notes.map((n) => n.midi);
    const range = pitches.length
      ? `${noteNameWithOctave(Math.min(...pitches))} → ${noteNameWithOctave(Math.max(...pitches))}`
      : '';
    return el(
      'li',
      {},
      el(
        'label',
        { class: 'track' },
        checkbox,
        el(
          'span',
          { class: 'track-text' },
          el('strong', {}, track.name),
          el(
            'small',
            {},
            [instrumentName(track), `${track.notes.length} note${track.notes.length > 1 ? 's' : ''}`, range].filter(Boolean).join(' · '),
          ),
        ),
      ),
    );
  });

  const speedValue = el('output', {}, `${Math.round(app.settings.speed * 100)} %`);
  const speedInput = el('input', { type: 'range', min: 25, max: 150, step: 5, value: Math.round(app.settings.speed * 100) });
  speedInput.addEventListener('input', () => {
    speedValue.textContent = `${speedInput.value} %`;
    app.updateSettings({ speed: Number(speedInput.value) / 100 });
  });

  startButton.addEventListener('click', () => {
    const notes = melody();
    if (notes.length === 0) return;
    const selectedTracks = [...selected].sort((a, b) => a - b);
    if (song.stored) void rememberSelection(song.id, selectedTracks);
    // Lancé directement dans le clic : nécessaire pour que le micro et le son démarrent sur téléphone.
    app.play({ ...song, selectedTracks }, notes, accompaniment(notes));
  });

  const accompanimentToggle = el('input', { type: 'checkbox', checked: app.settings.accompaniment });
  accompanimentToggle.addEventListener('change', () => app.updateSettings({ accompaniment: accompanimentToggle.checked }));

  refreshSummary();

  const minutes = Math.floor(midi.duration / 60);
  const seconds = Math.round(midi.duration % 60).toString().padStart(2, '0');

  const root = el(
    'main',
    { class: 'screen setup' },
    el('button', { class: 'back', type: 'button', onclick: () => app.goHome() }, '← Morceaux'),
    el('h1', {}, song.name),
    el('p', { class: 'muted' }, `Durée : ${minutes} min ${seconds} s · ${midi.tracks.length} piste(s)`),
    el(
      'section',
      {},
      el('h2', {}, 'Quelles pistes veux-tu jouer ?'),
      el('p', { class: 'muted' }, 'Souvent, la main droite porte la mélodie. Tu peux en cocher plusieurs.'),
      el('ul', { class: 'track-list' }, ...trackRows),
      summary,
    ),
    el(
      'section',
      {},
      el('h2', {}, 'Vitesse'),
      el('label', { class: 'slider' }, speedInput, speedValue),
      el('p', { class: 'muted' }, 'Pas de panique : le morceau attend toujours que tu joues la bonne note.'),
    ),
    el(
      'section',
      {},
      el('h2', {}, 'Musique'),
      el(
        'label',
        { class: 'field toggle' },
        accompanimentToggle,
        el(
          'span',
          {},
          "Jouer l'accompagnement",
          el('small', { class: 'muted' }, 'Mets des écouteurs : sinon le micro entend aussi la musique et peut se tromper.'),
        ),
      ),
      accompanimentSummary,
    ),
    startButton,
  );
  return { root };
}
