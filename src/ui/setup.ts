import type { App, SongSource } from '../app';
import { instrumentName, isDrumTrack, parseMidi, type MidiTrack } from '../midi/parser';
import { noteNameWithOctave } from '../notes';
import { extractAccompaniment, playableNotes, type SongNote } from '../song/playable';
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
  const startButton = el('button', { class: 'primary big start', type: 'button' }, 'Commencer');
  const accompanimentSummary = el('p', { class: 'muted' });
  const accompanimentToggle = el('input', { type: 'checkbox' });
  accompanimentToggle.addEventListener('change', () => app.updateSettings({ accompaniment: accompanimentToggle.checked }));

  /** Toutes les notes des pistes cochées : les deux mains, accords compris. */
  const toPlay = () => playableNotes([...selected].sort((a, b) => a - b).map((i) => midi.tracks[i]));
  // L'appli joue les pistes non cochées (sauf la batterie : le synthétiseur ne sait faire que du piano).
  const accompaniment = (notes: SongNote[]) =>
    extractAccompaniment(
      midi.tracks.filter((t, i) => !selected.has(i) && !isDrumTrack(t)).flatMap((t) => t.notes),
      notes,
    );

  const refreshSummary = () => {
    const notes = toPlay();
    const bothHands = new Set(notes.map((n) => n.hand)).size === 2;
    summary.textContent =
      notes.length === 0
        ? 'Coche au moins une piste avec des notes.'
        : `${notes.length} notes à jouer${bothHands ? ', aux deux mains' : ''}. Pour un accord, une des notes suffit pour avancer.`;
    startButton.disabled = notes.length === 0;

    const extra = notes.length === 0 ? 0 : accompaniment(notes).length;
    // Rien à accompagner quand toutes les pistes sont jouées : l'option ne peut pas être cochée.
    accompanimentToggle.disabled = extra === 0;
    accompanimentToggle.checked = extra > 0 && app.settings.accompaniment;
    accompanimentSummary.textContent =
      extra > 0
        ? `L'appli joue les pistes non cochées (${extra} notes) et s'arrête avec toi quand elle attend une note.`
        : "Tu joues toutes les pistes : il n'y a rien à accompagner.";
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
    const notes = toPlay();
    if (notes.length === 0) return;
    const selectedTracks = [...selected].sort((a, b) => a - b);
    if (song.stored) void rememberSelection(song.id, selectedTracks);
    // Lancé directement dans le clic : nécessaire pour que le micro et le son démarrent sur téléphone.
    app.play({ ...song, selectedTracks }, notes, accompaniment(notes));
  });

  refreshSummary();

  const minutes = Math.floor(midi.duration / 60);
  const seconds = Math.round(midi.duration % 60).toString().padStart(2, '0');

  const root = el(
    'main',
    { class: 'screen setup' },
    el('button', { class: 'back', type: 'button', onclick: () => app.goHome() }, '← Morceaux'),
    el(
      'header',
      {},
      el('h1', {}, song.name),
      el('p', { class: 'muted' }, `Durée : ${minutes} min ${seconds} s · ${midi.tracks.length} piste(s)`),
    ),
    el(
      'div',
      { class: 'columns' },
      el(
        'section',
        {},
        el('h2', {}, 'Quelles pistes veux-tu jouer ?'),
        el('p', { class: 'muted' }, 'Coche la main droite, la main gauche, ou les deux.'),
        el('ul', { class: 'track-list' }, ...trackRows),
        summary,
      ),
      el(
        'div',
        { class: 'column' },
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
              el(
                'small',
                { class: 'muted' },
                "Écouteurs ou haut-parleur : l'appli ignore les notes de sa propre musique. Avec le haut-parleur, garde un volume modéré.",
              ),
            ),
          ),
          accompanimentSummary,
        ),
        startButton,
      ),
    ),
  );
  return { root };
}
