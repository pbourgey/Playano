import { describe, expect, it } from 'vitest';
import { choosePhoneMic, micDisplayName } from '../src/audio/micChoice';

// Noms donnés par Chrome sur Android.
const android = [
  { deviceId: 'a', label: 'Speakerphone' },
  { deviceId: 'b', label: 'Headset earpiece' },
  { deviceId: 'c', label: 'Bluetooth headset' },
];

describe('choosePhoneMic', () => {
  it('prend le micro du téléphone quand des écouteurs Bluetooth sont connectés', () => {
    expect(choosePhoneMic(android, '')).toBe('a');
  });

  it('sur Android sans écouteurs, prend aussi le micro du téléphone (son sur le haut-parleur)', () => {
    expect(choosePhoneMic(android.slice(0, 2), '')).toBe('a');
  });

  it('laisse le navigateur choisir quand il n’y a pas d’écouteurs', () => {
    expect(choosePhoneMic([{ deviceId: 'x', label: 'MacBook Pro Microphone' }], '')).toBeUndefined();
  });

  it('respecte le micro choisi par l’utilisateur', () => {
    expect(choosePhoneMic(android, 'c')).toBe('c');
  });

  it('ignore un micro choisi qui n’est plus branché', () => {
    expect(choosePhoneMic(android, 'disparu')).toBe('a');
  });

  it('prend un micro intégré sur ordinateur quand un casque est branché', () => {
    const desktop = [
      { deviceId: 'h', label: 'Casque AirPods de Pierre' },
      { deviceId: 'i', label: 'Microphone interne' },
    ];
    expect(choosePhoneMic(desktop, '')).toBe('i');
  });

  it('ne choisit rien tant que les noms des micros sont inconnus', () => {
    expect(choosePhoneMic([{ deviceId: 'a', label: '' }, { deviceId: 'b', label: '' }], '')).toBeUndefined();
  });
});

describe('micDisplayName', () => {
  it('traduit les noms de Chrome sur Android', () => {
    expect(micDisplayName('Speakerphone')).toBe('Micro du téléphone');
    expect(micDisplayName('Bluetooth headset')).toContain('Bluetooth');
    expect(micDisplayName('Mon micro USB')).toBe('Mon micro USB');
  });
});
