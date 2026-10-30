/** Réglages de l'utilisateur, mémorisés dans le navigateur. */

export interface Settings {
  /** Vitesse de défilement (1 = tempo d'origine). */
  speed: number;
  /** Secondes de morceau visibles au-dessus du clavier : plus c'est grand, plus les notes sont serrées. */
  visibleSeconds: number;
  /** Accepte la bonne note dans une autre octave. */
  octaveTolerant: boolean;
  /** Sensibilité du micro, de 0 (peu sensible) à 1 (très sensible). */
  micSensitivity: number;
  /** Affiche le nom de chaque touche blanche sur le clavier. */
  showKeyLabels: boolean;
}

const KEY = 'playano.settings';

const DEFAULTS: Settings = {
  speed: 1,
  visibleSeconds: 3,
  octaveTolerant: true,
  micSensitivity: 0.5,
  showKeyLabels: true,
};

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Stockage indisponible (navigation privée…) : les réglages valent pour cette session.
  }
}

/** Convertit la sensibilité (0-1) en seuil de volume pour le micro (échelle logarithmique). */
export function micGate(sensitivity: number): number {
  const quiet = Math.log10(0.03);
  const loud = Math.log10(0.0015);
  return Math.pow(10, quiet + sensitivity * (loud - quiet));
}
