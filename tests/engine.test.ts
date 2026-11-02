import { describe, expect, it } from 'vitest';
import { EARLY_WINDOW, GameEngine } from '../src/game/engine';

const song = [
  { midi: 60, time: 0, duration: 0.5, hand: 'right' as const },
  { midi: 62, time: 0.5, duration: 0.5, hand: 'right' as const },
  { midi: 64, time: 1, duration: 1, hand: 'right' as const },
];

/** Fait avancer le moteur par petits pas, comme l'affichage à 60 images/s. */
function advance(engine: GameEngine, seconds: number) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) engine.update(1 / 60);
}

describe('GameEngine', () => {
  it('commence avant la première note pour la laisser tomber', () => {
    const engine = new GameEngine(song, { speed: 1, octaveTolerant: false, leadIn: 2 });
    expect(engine.time).toBeCloseTo(-2);
  });

  it('attend sur une note tant qu’elle n’est pas jouée', () => {
    const engine = new GameEngine(song, { speed: 1, octaveTolerant: false, leadIn: 1 });
    advance(engine, 5);
    expect(engine.time).toBe(0);
    expect(engine.waiting).toBe(true);
    expect(engine.target?.notes[0].midi).toBe(60);
    expect(engine.target?.waited).toBeGreaterThan(3.9);
  });

  it('reprend le défilement quand la bonne note est jouée', () => {
    const engine = new GameEngine(song, { speed: 1, octaveTolerant: false, leadIn: 1 });
    advance(engine, 2);
    expect(engine.play(60)).toBe('correct');
    expect(engine.waiting).toBe(false);
    advance(engine, 0.25);
    expect(engine.time).toBeCloseTo(0.25, 1);
    advance(engine, 1);
    expect(engine.time).toBe(0.5);
    expect(engine.target?.notes[0].midi).toBe(62);
  });

  it('compte une fausse note sans avancer', () => {
    const engine = new GameEngine(song, { speed: 1, octaveTolerant: false, leadIn: 1 });
    advance(engine, 2);
    expect(engine.play(61)).toBe('wrong');
    expect(engine.nextStep).toBe(0);
    expect(engine.wrongCount).toBe(1);
    expect(engine.target?.mistakes).toBe(1);
  });

  it('signale la bonne note jouée trop tôt sans la valider', () => {
    const engine = new GameEngine(song, { speed: 1, octaveTolerant: false, leadIn: 2 });
    expect(engine.play(60)).toBe('early');
    expect(engine.play(61)).toBe('ignored');
    expect(engine.nextStep).toBe(0);
    expect(engine.wrongCount).toBe(0);
    advance(engine, 2 - EARLY_WINDOW / 2);
    expect(engine.play(60)).toBe('correct');
  });

  it('accepte une autre octave seulement si l’option est active', () => {
    const strict = new GameEngine(song, { speed: 1, octaveTolerant: false, leadIn: 0 });
    expect(strict.play(72)).toBe('wrong');
    const tolerant = new GameEngine(song, { speed: 1, octaveTolerant: true, leadIn: 0 });
    expect(tolerant.play(72)).toBe('correct');
  });

  it('ralentit le défilement selon la vitesse choisie', () => {
    const engine = new GameEngine(song, { speed: 0.5, octaveTolerant: false, leadIn: 2 });
    expect(engine.time).toBeCloseTo(-1);
    advance(engine, 1);
    expect(engine.time).toBeCloseTo(-0.5);
  });

  it('laisse finir l’accompagnement après la dernière note à jouer', () => {
    const engine = new GameEngine(song, { speed: 1, octaveTolerant: false, leadIn: 0, songEnd: 6 });
    engine.play(60);
    advance(engine, 0.5);
    engine.play(62);
    advance(engine, 0.5);
    engine.play(64);
    advance(engine, 4);
    expect(engine.finished).toBe(false);
    expect(engine.waiting).toBe(false);
    advance(engine, 3.5);
    expect(engine.finished).toBe(true);
  });

  it('se termine après la dernière note et calcule les statistiques', () => {
    const engine = new GameEngine(song, { speed: 1, octaveTolerant: false, leadIn: 0 });
    expect(engine.play(60)).toBe('correct');
    advance(engine, 0.5);
    expect(engine.play(65)).toBe('wrong');
    expect(engine.play(62)).toBe('correct');
    advance(engine, 2);
    expect(engine.play(64)).toBe('correct');
    expect(engine.finished).toBe(false);
    advance(engine, 3);
    expect(engine.finished).toBe(true);

    const stats = engine.stats();
    expect(stats.total).toBe(3);
    expect(stats.hit).toBe(3);
    expect(stats.wrong).toBe(1);
    expect(stats.accuracy).toBeCloseTo(2 / 3);
    // La 2e note a eu une faute, la 3e a fait attendre le défilement.
    expect(stats.perfect).toBe(1);
  });
});

describe('GameEngine — deux mains et accords', () => {
  const twoHands = [
    { midi: 48, time: 0, duration: 1, hand: 'left' as const },
    { midi: 64, time: 0.01, duration: 0.5, hand: 'right' as const },
    { midi: 67, time: 0.02, duration: 0.5, hand: 'right' as const },
    { midi: 65, time: 0.5, duration: 0.5, hand: 'right' as const },
    { midi: 43, time: 1, duration: 1, hand: 'left' as const },
  ];

  it('regroupe les notes jouées ensemble en une étape qui touche le clavier en même temps', () => {
    const engine = new GameEngine(twoHands, { speed: 1, octaveTolerant: false, leadIn: 0 });
    expect(engine.steps.map((s) => s.notes.map((n) => n.midi))).toEqual([[48, 64, 67], [65], [43]]);
    expect(engine.steps[0].notes.every((n) => n.time === 0)).toBe(true);
    expect(engine.notes).toHaveLength(5);
  });

  it('valide tout l’accord dès qu’une de ses notes est entendue', () => {
    const engine = new GameEngine(twoHands, { speed: 1, octaveTolerant: false, leadIn: 0 });
    expect(engine.play(48)).toBe('correct');
    expect(engine.steps[0].notes.every((n) => n.hit)).toBe(true);
    expect(engine.target?.notes[0].midi).toBe(65);
  });

  it('accepte aussi la note de l’autre main', () => {
    const engine = new GameEngine(twoHands, { speed: 1, octaveTolerant: false, leadIn: 0 });
    expect(engine.play(67)).toBe('correct');
  });

  it('attend une note de la main gauche seule', () => {
    const engine = new GameEngine(twoHands, { speed: 1, octaveTolerant: false, leadIn: 0 });
    engine.play(64);
    advance(engine, 0.5);
    engine.play(65);
    advance(engine, 2);
    expect(engine.waiting).toBe(true);
    expect(engine.time).toBe(1);
    expect(engine.play(60)).toBe('wrong');
    expect(engine.play(43)).toBe('correct');
  });

  it('compte la progression par étape', () => {
    const engine = new GameEngine(twoHands, { speed: 1, octaveTolerant: false, leadIn: 0 });
    engine.play(64);
    expect(engine.nextStep).toBe(1);
    expect(engine.stats().total).toBe(3);
  });
});
