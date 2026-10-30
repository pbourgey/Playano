import { describe, expect, it } from 'vitest';
import { MidiParseError, instrumentName, parseMidi } from '../src/midi/parser';
import { writeMidi } from '../src/midi/writer';
import { DEMO_SONGS } from '../src/song/demoSongs';

/** Construit un fichier MIDI à la main, octet par octet. */
function rawMidi(format: number, division: number, tracks: number[][]): Uint8Array {
  const u32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  const header = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, format, 0, tracks.length, division >> 8, division & 0xff];
  const body = tracks.flatMap((t) => [0x4d, 0x54, 0x72, 0x6b, ...u32(t.length), ...t]);
  return Uint8Array.from([...header, ...body]);
}

describe('parseMidi', () => {
  it('relit un fichier produit par le générateur', () => {
    const data = writeMidi(
      [
        { name: 'Main droite', program: 0, notes: [{ midi: 60, beat: 0, beats: 1 }, { midi: 64, beat: 1, beats: 2 }] },
        { name: 'Basse', channel: 1, program: 33, notes: [{ midi: 36, beat: 0, beats: 4 }] },
      ],
      120,
    );
    const midi = parseMidi(data);

    expect(midi.format).toBe(1);
    expect(midi.tracks.map((t) => t.name)).toEqual(['Main droite', 'Basse']);
    expect(midi.tracks[0].notes.map((n) => [n.midi, n.time, n.duration])).toEqual([
      [60, 0, 0.5],
      [64, 0.5, 1],
    ]);
    expect(instrumentName(midi.tracks[1])).toBe('Basse');
    expect(midi.duration).toBeCloseTo(2);
  });

  it('gère le running status et les note-on de vélocité nulle', () => {
    // Format 0, 96 ticks par noire, tempo par défaut (120 bpm).
    const track = [
      0x00, 0x90, 60, 100, // note-on Do
      0x60, 62, 100, //       (running status) note-on Ré une noire plus tard
      0x00, 60, 0, //         note-off Do (vélocité 0)
      0x60, 62, 0, //         note-off Ré
      0x00, 0xff, 0x2f, 0x00,
    ];
    const midi = parseMidi(rawMidi(0, 96, [track]));
    expect(midi.tracks[0].notes.map((n) => [n.midi, n.time, n.duration])).toEqual([
      [60, 0, 0.5],
      [62, 0.5, 0.5],
    ]);
  });

  it('tient compte des changements de tempo', () => {
    const track = [
      0x00, 0xff, 0x51, 0x03, 0x0f, 0x42, 0x40, // tempo : 1 s par noire (60 bpm)
      0x00, 0x90, 60, 100,
      0x60, 0x80, 60, 0, //                        une noire = 1 s
      0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // tempo : 0,5 s par noire (120 bpm)
      0x00, 0x90, 64, 100,
      0x60, 0x80, 64, 0,
      0x00, 0xff, 0x2f, 0x00,
    ];
    const midi = parseMidi(rawMidi(0, 96, [track]));
    const [first, second] = midi.tracks[0].notes;
    expect(first.time).toBeCloseTo(0);
    expect(first.duration).toBeCloseTo(1);
    expect(second.time).toBeCloseTo(1);
    expect(second.duration).toBeCloseTo(0.5);
  });

  it('sépare les canaux mélangés dans une même piste', () => {
    const track = [
      0x00, 0xff, 0x03, 0x04, 0x53, 0x6f, 0x6e, 0x67, // nom « Song »
      0x00, 0x90, 72, 90,
      0x00, 0x99, 36, 90, // batterie (canal 10)
      0x60, 0x80, 72, 0,
      0x00, 0x89, 36, 0,
      0x00, 0xff, 0x2f, 0x00,
    ];
    const midi = parseMidi(rawMidi(0, 96, [track]));
    expect(midi.tracks.map((t) => [t.name, t.channel, instrumentName(t)])).toEqual([
      ['Song (canal 1)', 0, 'Piano'],
      ['Song (canal 10)', 9, 'Batterie'],
    ]);
  });

  it("termine les notes jamais relâchées à la fin de la piste", () => {
    const track = [0x00, 0x90, 60, 100, 0x60, 0xff, 0x2f, 0x00];
    const midi = parseMidi(rawMidi(0, 96, [track]));
    expect(midi.tracks[0].notes[0].duration).toBeCloseTo(0.5);
  });

  it('refuse un fichier qui n’est pas du MIDI', () => {
    expect(() => parseMidi(new TextEncoder().encode('bonjour, je ne suis pas un MIDI'))).toThrow(MidiParseError);
  });

  it('signale un fichier tronqué', () => {
    const data = writeMidi([{ name: 'x', notes: [{ midi: 60, beat: 0, beats: 1 }] }]);
    expect(() => parseMidi(data.subarray(0, data.length - 6))).toThrow(MidiParseError);
  });

  it('lit les morceaux de démonstration', () => {
    for (const song of DEMO_SONGS) {
      const midi = parseMidi(song.data);
      expect(midi.tracks.length).toBeGreaterThan(0);
      expect(midi.tracks[0].notes.length).toBeGreaterThan(20);
    }
  });
});
