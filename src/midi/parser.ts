/**
 * Lecteur de fichiers MIDI standard (SMF, formats 0, 1 et 2).
 *
 * On ne garde que ce qui sert à l'appli : les notes (avec leurs temps en
 * secondes, tempo pris en compte), le nom et l'instrument de chaque piste.
 */

export interface MidiNote {
  midi: number;
  /** Début de la note, en secondes. */
  time: number;
  /** Durée, en secondes. */
  duration: number;
  velocity: number;
}

export interface MidiTrack {
  name: string;
  channel: number;
  /** Programme General MIDI (0-127), ou -1 si aucun changement de programme. */
  program: number;
  notes: MidiNote[];
}

export interface MidiFile {
  format: number;
  /** Durée totale, en secondes. */
  duration: number;
  tracks: MidiTrack[];
}

export class MidiParseError extends Error {}

interface RawNote {
  channel: number;
  midi: number;
  startTick: number;
  endTick: number;
  velocity: number;
}

interface RawTrack {
  name: string;
  notes: RawNote[];
  programs: Map<number, number>;
}

interface TempoEvent {
  tick: number;
  microsPerQuarter: number;
}

const DEFAULT_TEMPO = 500_000; // 120 bpm

class Reader {
  pos = 0;
  constructor(private readonly data: Uint8Array, readonly end = data.length) {}

  get done(): boolean {
    return this.pos >= this.end;
  }

  private need(count: number): void {
    if (this.pos + count > this.end) throw new MidiParseError('Fichier MIDI tronqué.');
  }

  u8(): number {
    this.need(1);
    return this.data[this.pos++];
  }

  u16(): number {
    return (this.u8() << 8) | this.u8();
  }

  u32(): number {
    return ((this.u8() << 24) >>> 0) + (this.u8() << 16) + (this.u8() << 8) + this.u8();
  }

  ascii(length: number): string {
    return String.fromCharCode(...this.bytes(length));
  }

  bytes(length: number): Uint8Array {
    this.need(length);
    const out = this.data.subarray(this.pos, this.pos + length);
    this.pos += length;
    return out;
  }

  /** Quantité de longueur variable (VLQ). */
  varLen(): number {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const byte = this.u8();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new MidiParseError('Longueur variable invalide.');
  }
}

export function parseMidi(buffer: ArrayBuffer | Uint8Array): MidiFile {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const reader = new Reader(data);

  if (data.length < 14 || reader.ascii(4) !== 'MThd') {
    throw new MidiParseError("Ce fichier n'est pas un fichier MIDI.");
  }
  const headerLength = reader.u32();
  const format = reader.u16();
  reader.u16(); // Nombre de pistes annoncé : on lit plutôt tous les blocs MTrk présents.
  const division = reader.u16();
  reader.pos = 8 + headerLength;

  const rawTracks: RawTrack[] = [];
  const tempos: TempoEvent[] = [];

  while (reader.pos + 8 <= data.length) {
    const id = reader.ascii(4);
    const length = reader.u32();
    const start = reader.pos;
    const end = Math.min(start + length, data.length);
    if (id === 'MTrk') {
      rawTracks.push(readTrack(new Reader(data, end), start, tempos));
    }
    reader.pos = end;
  }

  if (rawTracks.length === 0) throw new MidiParseError('Aucune piste trouvée dans ce fichier MIDI.');

  const toSeconds = buildTickConverter(division, tempos);

  const tracks: MidiTrack[] = [];
  let duration = 0;
  rawTracks.forEach((raw, trackIndex) => {
    // Une piste peut mélanger plusieurs canaux (surtout en format 0) :
    // on la découpe pour que chaque instrument soit sélectionnable à part.
    const channels = [...new Set(raw.notes.map((n) => n.channel))].sort((a, b) => a - b);
    for (const channel of channels) {
      const notes = raw.notes
        .filter((n) => n.channel === channel)
        .map((n) => {
          const time = toSeconds(n.startTick);
          return { midi: n.midi, time, duration: toSeconds(n.endTick) - time, velocity: n.velocity };
        })
        .sort((a, b) => a.time - b.time || a.midi - b.midi);
      for (const note of notes) duration = Math.max(duration, note.time + note.duration);
      const baseName = raw.name.trim() || `Piste ${trackIndex + 1}`;
      tracks.push({
        name: channels.length > 1 ? `${baseName} (canal ${channel + 1})` : baseName,
        channel,
        program: raw.programs.get(channel) ?? -1,
        notes,
      });
    }
  });

  return { format, duration, tracks };
}

function readTrack(reader: Reader, offset: number, tempos: TempoEvent[]): RawTrack {
  reader.pos = offset;
  const track: RawTrack = { name: '', notes: [], programs: new Map() };
  // Notes en cours, par canal et hauteur (file : une même touche peut être enfoncée deux fois).
  const open = new Map<number, RawNote[]>();
  let tick = 0;
  let runningStatus = 0;

  const closeNote = (channel: number, midi: number) => {
    const pending = open.get(channel * 128 + midi);
    const note = pending?.shift();
    if (note) note.endTick = tick;
  };

  while (!reader.done) {
    tick += reader.varLen();
    let status = reader.u8();
    let firstData: number | undefined;

    if (status < 0x80) {
      // Running status : l'octet lu est déjà une donnée.
      if (runningStatus === 0) throw new MidiParseError('Événement MIDI invalide.');
      firstData = status;
      status = runningStatus;
    }

    if (status === 0xff) {
      const type = reader.u8();
      const length = reader.varLen();
      const payload = reader.bytes(length);
      if (type === 0x51 && length === 3) {
        tempos.push({ tick, microsPerQuarter: (payload[0] << 16) | (payload[1] << 8) | payload[2] });
      } else if (type === 0x03 && !track.name) {
        track.name = decodeText(payload);
      } else if (type === 0x2f) {
        break;
      }
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      reader.bytes(reader.varLen());
      continue;
    }

    if (status >= 0xf0) {
      // Messages système temps réel / communs : rares dans un fichier, on les saute.
      const sizes: Record<number, number> = { 0xf1: 1, 0xf2: 2, 0xf3: 1 };
      reader.bytes(sizes[status] ?? 0);
      continue;
    }

    runningStatus = status;
    const kind = status & 0xf0;
    const channel = status & 0x0f;
    const d1 = firstData ?? reader.u8();
    const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : reader.u8();

    if (kind === 0x90 && d2 > 0) {
      const note: RawNote = { channel, midi: d1, startTick: tick, endTick: -1, velocity: d2 };
      track.notes.push(note);
      const key = channel * 128 + d1;
      const pending = open.get(key);
      if (pending) pending.push(note);
      else open.set(key, [note]);
    } else if (kind === 0x80 || kind === 0x90) {
      closeNote(channel, d1);
    } else if (kind === 0xc0 && !track.programs.has(channel)) {
      track.programs.set(channel, d1);
    }
  }

  // Notes jamais relâchées : on les termine à la fin de la piste.
  for (const note of track.notes) {
    if (note.endTick < 0) note.endTick = Math.max(tick, note.startTick);
  }
  return track;
}

function buildTickConverter(division: number, tempos: TempoEvent[]): (tick: number) => number {
  if (division & 0x8000) {
    // Division SMPTE : temps absolu, indépendant du tempo.
    const fps = 256 - (division >> 8);
    const ticksPerFrame = division & 0xff;
    const ticksPerSecond = (fps === 29 ? 29.97 : fps) * ticksPerFrame;
    return (tick) => tick / ticksPerSecond;
  }

  const ticksPerQuarter = division || 480;
  const sorted = [...tempos].sort((a, b) => a.tick - b.tick);
  if (sorted.length === 0 || sorted[0].tick > 0) {
    sorted.unshift({ tick: 0, microsPerQuarter: DEFAULT_TEMPO });
  }

  // Pour chaque changement de tempo, on précalcule le temps (s) auquel il survient.
  const segments: { tick: number; seconds: number; secondsPerTick: number }[] = [];
  let seconds = 0;
  for (let i = 0; i < sorted.length; i++) {
    const secondsPerTick = sorted[i].microsPerQuarter / 1e6 / ticksPerQuarter;
    if (i > 0) {
      const previous = segments[i - 1];
      seconds = previous.seconds + (sorted[i].tick - previous.tick) * previous.secondsPerTick;
    }
    segments.push({ tick: sorted[i].tick, seconds, secondsPerTick });
  }

  return (tick) => {
    let lo = 0;
    let hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segments[mid].tick <= tick) lo = mid;
      else hi = mid - 1;
    }
    const segment = segments[lo];
    return segment.seconds + (tick - segment.tick) * segment.secondsPerTick;
  };
}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

const GM_FAMILIES = [
  'Piano',
  'Percussions chromatiques',
  'Orgue',
  'Guitare',
  'Basse',
  'Cordes',
  'Ensemble',
  'Cuivres',
  'Anches',
  'Flûtes',
  'Synthé (lead)',
  'Synthé (nappe)',
  'Effets synthé',
  'Instrument ethnique',
  'Percussions',
  'Effets sonores',
];

/** Nom lisible de l'instrument d'une piste. */
export function instrumentName(track: Pick<MidiTrack, 'channel' | 'program'>): string {
  if (track.channel === 9) return 'Batterie';
  if (track.program < 0) return 'Piano';
  return GM_FAMILIES[Math.floor(track.program / 8)] ?? 'Instrument';
}

/** Le canal 10 (index 9) est réservé aux percussions en General MIDI. */
export function isDrumTrack(track: Pick<MidiTrack, 'channel'>): boolean {
  return track.channel === 9;
}
