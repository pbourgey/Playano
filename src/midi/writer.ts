/**
 * Petit générateur de fichiers MIDI (format 1). Sert à fabriquer les morceaux
 * de démonstration : ils passent ainsi par le même chemin qu'un fichier importé.
 */

export interface WriterNote {
  midi: number;
  /** Début, en temps (noires). */
  beat: number;
  /** Durée, en temps (noires). */
  beats: number;
  velocity?: number;
}

export interface WriterTrack {
  name: string;
  channel?: number;
  program?: number;
  notes: WriterNote[];
}

const TICKS_PER_QUARTER = 480;

export function writeMidi(tracks: WriterTrack[], bpm = 120): Uint8Array {
  const tempoTrack = [
    ...metaText(0x03, 'Tempo'),
    ...varLen(0),
    0xff,
    0x51,
    0x03,
    ...u24(Math.round(60_000_000 / bpm)),
    ...endOfTrack(),
  ];

  const chunks = [chunk('MTrk', tempoTrack), ...tracks.map((t) => chunk('MTrk', encodeTrack(t)))];
  const header = chunk('MThd', [...u16(1), ...u16(chunks.length), ...u16(TICKS_PER_QUARTER)]);
  return Uint8Array.from([...header, ...chunks.flat()]);
}

function encodeTrack(track: WriterTrack): number[] {
  const channel = track.channel ?? 0;
  const events: { tick: number; order: number; bytes: number[] }[] = [];
  for (const note of track.notes) {
    const start = Math.round(note.beat * TICKS_PER_QUARTER);
    const end = Math.round((note.beat + note.beats) * TICKS_PER_QUARTER);
    // À tick égal, les relâchements passent avant les nouvelles notes.
    events.push({ tick: start, order: 1, bytes: [0x90 | channel, note.midi, note.velocity ?? 80] });
    events.push({ tick: end, order: 0, bytes: [0x80 | channel, note.midi, 0] });
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const out = [...metaText(0x03, track.name)];
  if (track.program !== undefined) out.push(...varLen(0), 0xc0 | channel, track.program);
  let last = 0;
  for (const event of events) {
    out.push(...varLen(event.tick - last), ...event.bytes);
    last = event.tick;
  }
  out.push(...endOfTrack());
  return out;
}

function metaText(type: number, text: string): number[] {
  const bytes = [...new TextEncoder().encode(text)];
  return [...varLen(0), 0xff, type, ...varLen(bytes.length), ...bytes];
}

function endOfTrack(): number[] {
  return [...varLen(0), 0xff, 0x2f, 0x00];
}

function chunk(id: string, body: number[]): number[] {
  return [...[...id].map((c) => c.charCodeAt(0)), ...u32(body.length), ...body];
}

function varLen(value: number): number[] {
  const bytes = [value & 0x7f];
  value >>= 7;
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value >>= 7;
  }
  return bytes;
}

function u16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function u24(value: number): number[] {
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}
