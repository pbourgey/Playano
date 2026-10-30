import { writeMidi, type WriterNote } from '../midi/writer';

/** Morceaux du domaine public, intégrés pour essayer l'appli sans fichier. */
export interface DemoSong {
  id: string;
  name: string;
  data: Uint8Array;
}

type Step = [midi: number | null, beats: number];

/** Enchaîne des notes (null = silence) à partir d'un temps donné. */
function sequence(steps: Step[], startBeat = 0): WriterNote[] {
  const notes: WriterNote[] = [];
  let beat = startBeat;
  for (const [midi, beats] of steps) {
    if (midi !== null) notes.push({ midi, beat, beats });
    beat += beats;
  }
  return notes;
}

const DO = 60, RE = 62, MI = 64, FA = 65, SOL = 67;
const SOL2 = 55, LA2 = 57, SI2 = 59;

function auClairDeLaLune(): Uint8Array {
  const a: Step[] = [
    [DO, 1], [DO, 1], [DO, 1], [RE, 1],
    [MI, 2], [RE, 2],
    [DO, 1], [MI, 1], [RE, 1], [RE, 1],
    [DO, 4],
  ];
  const b: Step[] = [
    [RE, 1], [RE, 1], [RE, 1], [RE, 1],
    [LA2, 2], [LA2, 2],
    [RE, 1], [DO, 1], [SI2, 1], [LA2, 1],
    [SOL2, 4],
  ];
  const bassA: Step[] = [[48, 4], [43, 4], [48, 2], [43, 2], [48, 4]];
  const bassB: Step[] = [[43, 4], [50, 4], [50, 4], [43, 4]];

  return writeMidi(
    [
      { name: 'Main droite', program: 0, notes: sequence([...a, ...a, ...b, ...a]) },
      {
        name: 'Main gauche',
        channel: 1,
        program: 0,
        notes: sequence([...bassA, ...bassA, ...bassB, ...bassA]).map((n) => ({ ...n, velocity: 60 })),
      },
    ],
    100,
  );
}

function odeALaJoie(): Uint8Array {
  const phrase1: Step[] = [
    [MI, 1], [MI, 1], [FA, 1], [SOL, 1],
    [SOL, 1], [FA, 1], [MI, 1], [RE, 1],
    [DO, 1], [DO, 1], [RE, 1], [MI, 1],
  ];
  const end1: Step[] = [[MI, 1.5], [RE, 0.5], [RE, 2]];
  const end2: Step[] = [[RE, 1.5], [DO, 0.5], [DO, 2]];
  const middle: Step[] = [
    [RE, 1], [RE, 1], [MI, 1], [DO, 1],
    [RE, 1], [MI, 0.5], [FA, 0.5], [MI, 1], [DO, 1],
    [RE, 1], [MI, 0.5], [FA, 0.5], [MI, 1], [RE, 1],
    [DO, 1], [RE, 1], [SOL2, 2],
  ];

  // Main gauche : une basse par mesure (Do / Sol).
  const bassA: Step[] = [[48, 4], [43, 4], [48, 4], [43, 4]];
  const bassB: Step[] = [[48, 4], [43, 4], [48, 4], [43, 2], [48, 2]];
  const bassMiddle: Step[] = [[43, 4], [48, 4], [43, 4], [48, 2], [43, 2]];

  return writeMidi(
    [
      {
        name: 'Mélodie',
        program: 0,
        notes: sequence([...phrase1, ...end1, ...phrase1, ...end2, ...middle, ...phrase1, ...end2]),
      },
      {
        name: 'Main gauche',
        channel: 1,
        program: 0,
        notes: sequence([...bassA, ...bassB, ...bassMiddle, ...bassB]).map((n) => ({ ...n, velocity: 60 })),
      },
    ],
    100,
  );
}

export const DEMO_SONGS: DemoSong[] = [
  { id: 'demo-clair-de-lune', name: 'Au clair de la lune', data: auClairDeLaLune() },
  { id: 'demo-ode-joie', name: 'Ode à la joie (Beethoven)', data: odeALaJoie() },
];
