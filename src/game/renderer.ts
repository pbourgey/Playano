import { MIDDLE_C, isBlackKey, noteColor, noteName, noteTextColor, pitchClass } from '../notes';
import type { GameNote } from './engine';

export interface RenderState {
  notes: readonly GameNote[];
  /** Position dans le morceau (s). */
  time: number;
  targetIndex: number;
  targetPlayable: boolean;
  waiting: boolean;
  /** Note entendue en ce moment (micro ou clavier MIDI). */
  heard: number | null;
  /** Secondes de morceau visibles au-dessus du clavier. */
  visibleSeconds: number;
  showKeyLabels: boolean;
}

interface KeyRect {
  x: number;
  width: number;
  black: boolean;
}

interface Flash {
  midi: number;
  kind: 'correct' | 'wrong';
  start: number;
}

const FLASH_MS = 450;
const COLORS = {
  background: '#0b1020',
  lane: 'rgba(255,255,255,0.035)',
  octaveLine: 'rgba(255,255,255,0.10)',
  hitLine: '#fbbf24',
  whiteKey: '#f8fafc',
  whiteKeyEdge: '#94a3b8',
  blackKey: '#111827',
  heard: '#38bdf8',
  wrong: '#ef4444',
};

/** Choisit une plage de clavier (de Do à Si) couvrant les notes, sur au moins deux octaves. */
export function keyboardRange(midis: readonly number[]): { low: number; high: number } {
  let low = midis.length ? Math.min(...midis) : MIDDLE_C;
  let high = midis.length ? Math.max(...midis) : MIDDLE_C + 11;
  low -= pitchClass(low);
  high += 11 - pitchClass(high);
  while (high - low + 1 < 24) {
    // On élargit du côté où la mélodie est la plus proche du bord.
    if (MIDDLE_C - low < high - MIDDLE_C) low -= 12;
    else high += 12;
  }
  return { low: Math.max(21, low), high: Math.min(108, high) };
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private keys = new Map<number, KeyRect>();
  private low = 48;
  private high = 83;
  private flashes: Flash[] = [];

  /** `keyboardOnly` : le clavier occupe tout le canvas (pas de zone de chute). */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly keyboardOnly = false,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponible.');
    this.ctx = ctx;
  }

  get keyboardHeight(): number {
    if (this.keyboardOnly) return this.height;
    return Math.round(Math.min(220, Math.max(90, this.height * 0.24)));
  }

  get hitY(): number {
    return this.height - this.keyboardHeight;
  }

  setRange(low: number, high: number): void {
    this.low = low;
    this.high = high;
    this.layoutKeys();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layoutKeys();
  }

  flash(midi: number, kind: Flash['kind']): void {
    this.flashes.push({ midi, kind, start: performance.now() });
  }

  /** Touche sous un point (coordonnées CSS relatives au canvas), ou null. */
  keyAt(x: number, y: number): number | null {
    if (y < this.hitY) return null;
    const blackBottom = this.hitY + this.keyboardHeight * 0.62;
    let white: number | null = null;
    for (const [midi, key] of this.keys) {
      if (x < key.x || x > key.x + key.width) continue;
      if (key.black && y <= blackBottom) return midi;
      if (!key.black) white = midi;
    }
    return white;
  }

  private layoutKeys(): void {
    this.keys.clear();
    let whiteCount = 0;
    for (let m = this.low; m <= this.high; m++) if (!isBlackKey(m)) whiteCount++;
    const whiteWidth = this.width / Math.max(1, whiteCount);
    const blackWidth = whiteWidth * 0.62;
    let whiteIndex = 0;
    for (let m = this.low; m <= this.high; m++) {
      if (isBlackKey(m)) {
        this.keys.set(m, { x: whiteIndex * whiteWidth - blackWidth / 2, width: blackWidth, black: true });
      } else {
        this.keys.set(m, { x: whiteIndex * whiteWidth, width: whiteWidth, black: false });
        whiteIndex++;
      }
    }
  }

  draw(state: RenderState): void {
    const { ctx, width, height } = this;
    const now = performance.now();
    this.flashes = this.flashes.filter((f) => now - f.start < FLASH_MS);

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);
    this.drawLanes();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, this.hitY);
    ctx.clip();
    this.drawNotes(state, now);
    ctx.restore();

    this.drawHitLine(state, now);
    this.drawKeyboard(state, now);
  }

  private drawLanes(): void {
    const { ctx } = this;
    for (const [midi, key] of this.keys) {
      if (key.black) {
        ctx.fillStyle = COLORS.lane;
        ctx.fillRect(key.x, 0, key.width, this.hitY);
      } else if (pitchClass(midi) === 0 || pitchClass(midi) === 5) {
        // Repères entre Si|Do et Mi|Fa, comme sur un vrai clavier.
        ctx.fillStyle = pitchClass(midi) === 0 ? COLORS.octaveLine : COLORS.lane;
        ctx.fillRect(Math.round(key.x), 0, 1, this.hitY);
      }
    }
  }

  private drawNotes(state: RenderState, now: number): void {
    const { ctx } = this;
    const pixelsPerSecond = this.hitY / state.visibleSeconds;
    const pulse = 0.5 + 0.5 * Math.sin(now / 180);

    for (let i = 0; i < state.notes.length; i++) {
      const note = state.notes[i];
      const key = this.keys.get(note.midi);
      if (!key) continue;
      const bottom = this.hitY - (note.time - state.time) * pixelsPerSecond;
      if (bottom < 0) break; // Notes triées : les suivantes sont encore plus haut.
      const columnHeight = Math.max(note.duration * pixelsPerSecond - 2, 18);
      const top = bottom - columnHeight;
      if (top > this.hitY) continue;

      const inset = key.black ? 1 : 3;
      const x = key.x + inset;
      const w = key.width - inset * 2;
      const isTarget = i === state.targetIndex;

      ctx.globalAlpha = note.hit ? 0.3 : 1;
      if (isTarget && state.targetPlayable) {
        ctx.shadowColor = noteColor(note.midi);
        ctx.shadowBlur = state.waiting ? 12 + 14 * pulse : 14;
      }
      ctx.fillStyle = noteColor(note.midi);
      roundRect(ctx, x, top, w, columnHeight, Math.min(6, w / 3));
      ctx.fill();
      ctx.shadowBlur = 0;

      if (isTarget) {
        ctx.lineWidth = state.waiting ? 2 + pulse * 1.5 : 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }

      if (!note.hit) {
        const fontSize = Math.max(9, Math.min(16, w * 0.42));
        ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = noteTextColor(note.midi);
        ctx.fillText(noteName(note.midi), x + w / 2, bottom - 4, w);
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawHitLine(state: RenderState, now: number): void {
    const { ctx } = this;
    const glow = state.waiting ? 0.6 + 0.4 * Math.sin(now / 180) : 0.6;
    ctx.fillStyle = COLORS.hitLine;
    ctx.globalAlpha = glow;
    ctx.fillRect(0, this.hitY - 2, this.width, 3);
    ctx.globalAlpha = 1;
  }

  private drawKeyboard(state: RenderState, now: number): void {
    const { ctx } = this;
    const top = this.hitY;
    const keyboardHeight = this.keyboardHeight;
    const blackHeight = keyboardHeight * 0.62;
    const target = state.notes[state.targetIndex];
    const targetMidi = target && state.targetPlayable ? target.midi : null;

    const drawKey = (midi: number, key: KeyRect) => {
      const h = key.black ? blackHeight : keyboardHeight;
      const flash = [...this.flashes].reverse().find((f) => f.midi === midi);

      ctx.fillStyle = key.black ? COLORS.blackKey : COLORS.whiteKey;
      roundRect(ctx, key.x + (key.black ? 0 : 1), top, key.width - (key.black ? 0 : 2), h, 4, true);
      ctx.fill();

      // Touche à jouer : teintée de la couleur de la note.
      if (midi === targetMidi) {
        ctx.globalAlpha = key.black ? 0.9 : 0.55;
        ctx.fillStyle = noteColor(midi);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (flash) {
        const fade = 1 - (now - flash.start) / FLASH_MS;
        ctx.globalAlpha = Math.max(0, fade);
        ctx.fillStyle = flash.kind === 'correct' ? noteColor(midi) : COLORS.wrong;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (!key.black) {
        ctx.strokeStyle = COLORS.whiteKeyEdge;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      const centerX = key.x + key.width / 2;
      if (flash?.kind === 'wrong') {
        ctx.font = `800 ${Math.min(22, key.width * 0.8)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('✗', centerX, top + h * 0.45);
      }

      if (midi === state.heard) {
        // Pastille au-dessus du nom de la touche.
        const radius = Math.min(key.width * 0.28, 8);
        const labelSpace = key.black ? 6 : Math.min(13, key.width * 0.36) + 10;
        ctx.beginPath();
        ctx.arc(centerX, top + h - labelSpace - radius, radius, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.heard;
        ctx.fill();
      }

      if (!key.black && (state.showKeyLabels || pitchClass(midi) === 0)) {
        const fontSize = Math.max(8, Math.min(13, key.width * 0.36));
        ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        // Sur la touche à jouer (teintée), un texte foncé reste lisible.
        ctx.fillStyle = midi === targetMidi ? '#0f172a' : noteColor(midi);
        ctx.fillText(noteName(midi), centerX, top + h - 4, key.width - 2);
      }
      if (midi === MIDDLE_C) {
        // Repère du Do central.
        ctx.beginPath();
        ctx.arc(centerX, top + blackHeight + 8, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#64748b';
        ctx.fill();
      }
    };

    for (const [midi, key] of this.keys) if (!key.black) drawKey(midi, key);
    for (const [midi, key] of this.keys) if (key.black) drawKey(midi, key);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  squareTop = false,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (squareTop) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
  } else {
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
  }
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  if (squareTop) ctx.lineTo(x, y);
  else ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
