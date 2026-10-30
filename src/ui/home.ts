import type { App, SongSource } from '../app';
import { MidiParseError, parseMidi } from '../midi/parser';
import { DEMO_SONGS } from '../song/demoSongs';
import { deleteSong, listSongs, saveSong } from '../storage/library';
import { el, type Screen } from './dom';

const MIDI_ACCEPT = '.mid,.midi,.kar,audio/midi,audio/x-midi';

export function homeScreen(app: App): Screen {
  const status = el('p', { class: 'status', role: 'status' });
  const myList = el('ul', { class: 'song-list' });
  const fileInput = el('input', { type: 'file', accept: MIDI_ACCEPT, multiple: true, hidden: true });

  const setStatus = (message: string, isError = false) => {
    status.textContent = message;
    status.classList.toggle('error', isError);
  };

  async function importFiles(files: FileList | File[]) {
    const imported: SongSource[] = [];
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const data = new Uint8Array(await file.arrayBuffer());
        const midi = parseMidi(data);
        if (!midi.tracks.some((t) => t.notes.length > 0)) throw new MidiParseError('Aucune note dans ce fichier.');
        const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        const name = file.name.replace(/\.(mid|midi|kar)$/i, '').replace(/_+/g, ' ').trim() || file.name;
        await saveSong({ id, name, addedAt: Date.now(), data: data.slice().buffer });
        imported.push({ id, name, data, stored: true });
      } catch (error) {
        const reason = error instanceof MidiParseError ? error.message : "Impossible de lire le fichier.";
        failures.push(`${file.name} : ${reason}`);
      }
    }
    if (imported.length === 1 && failures.length === 0) {
      app.openSong(imported[0]);
      return;
    }
    setStatus(
      [imported.length ? `${imported.length} morceau(x) ajouté(s).` : '', ...failures].filter(Boolean).join(' '),
      failures.length > 0,
    );
    await refresh();
  }

  async function refresh() {
    let songs;
    try {
      songs = await listSongs();
    } catch {
      myList.replaceChildren(el('li', { class: 'empty' }, "La bibliothèque n'est pas disponible dans ce navigateur."));
      return;
    }
    if (songs.length === 0) {
      myList.replaceChildren(el('li', { class: 'empty' }, 'Aucun morceau pour le moment. Importe un fichier MIDI !'));
      return;
    }
    myList.replaceChildren(
      ...songs.map((song) =>
        songItem(
          { id: song.id, name: song.name, data: new Uint8Array(song.data), stored: true, selectedTracks: song.selectedTracks },
          new Date(song.addedAt).toLocaleDateString('fr-FR'),
          async () => {
            if (!confirm(`Supprimer « ${song.name} » de ta bibliothèque ?`)) return;
            await deleteSong(song.id);
            await refresh();
          },
        ),
      ),
    );
  }

  function songItem(song: SongSource, detail: string, onDelete?: () => void): HTMLLIElement {
    return el(
      'li',
      { class: 'song' },
      el(
        'button',
        { class: 'song-open', type: 'button', onclick: () => app.openSong(song) },
        el('span', { class: 'song-icon', 'aria-hidden': 'true' }, '♪'),
        el('span', { class: 'song-text' }, el('strong', {}, song.name), el('small', {}, detail)),
      ),
      onDelete &&
        el('button', { class: 'icon-button danger', type: 'button', title: 'Supprimer', 'aria-label': `Supprimer ${song.name}`, onclick: onDelete }, '✕'),
    );
  }

  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) void importFiles(fileInput.files);
    fileInput.value = '';
  });

  const dropZone = el(
    'div',
    { class: 'drop-zone' },
    el('p', { class: 'drop-title' }, 'Importe un morceau'),
    el('p', { class: 'muted' }, 'Choisis un fichier MIDI (.mid) ou dépose-le ici.'),
    el('button', { class: 'primary', type: 'button', onclick: () => fileInput.click() }, 'Choisir un fichier MIDI'),
    fileInput,
  );

  const root = el(
    'main',
    { class: 'screen home' },
    el(
      'header',
      { class: 'brand' },
      el('h1', {}, 'Playano'),
      el('p', { class: 'muted' }, 'Les notes tombent et attendent que tu les joues sur ton piano.'),
    ),
    dropZone,
    status,
    el('section', {}, el('h2', {}, 'Mes morceaux'), myList),
    el(
      'section',
      {},
      el('h2', {}, 'Pour essayer'),
      el(
        'ul',
        { class: 'song-list' },
        ...DEMO_SONGS.map((demo) =>
          songItem({ id: demo.id, name: demo.name, data: demo.data, stored: false }, 'Morceau de démonstration'),
        ),
      ),
    ),
    el(
      'footer',
      { class: 'home-actions' },
      el('button', { type: 'button', onclick: () => app.openMicTest() }, '🎤 Tester le micro'),
      el('button', { type: 'button', onclick: () => app.openSettings() }, '⚙ Réglages'),
    ),
  );

  // Glisser-déposer sur tout l'écran d'accueil.
  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    dropZone.classList.add('dragging');
  };
  const onDragLeave = () => dropZone.classList.remove('dragging');
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    dropZone.classList.remove('dragging');
    if (event.dataTransfer?.files.length) void importFiles(event.dataTransfer.files);
  };
  root.addEventListener('dragover', onDragOver);
  root.addEventListener('dragleave', onDragLeave);
  root.addEventListener('drop', onDrop);

  void refresh();
  return { root };
}
