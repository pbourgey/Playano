/**
 * Choix du micro. Sur Android, Chrome passe en mode « appel » dès qu'on utilise
 * le micro : avec des écouteurs Bluetooth, il prend alors leur micro (qualité
 * téléphone, loin du piano). On préfère donc le micro du téléphone.
 *
 * Chrome sur Android nomme ses entrées « Speakerphone » (micro du téléphone),
 * « Headset earpiece », « Wired headset », « Bluetooth headset » et « USB audio ».
 */

export interface MicInput {
  deviceId: string;
  label: string;
}

/** Micros d'écouteurs ou de casque, à éviter pour écouter un piano. */
const HEADSET = /bluetooth|headset|hands-?free|earpiece|airpods|buds|casque|[ée]couteur|oreillette/i;
/** Micro intégré du téléphone ou de l'ordinateur. */
const BUILT_IN = /^speakerphone$|built-?in|internal|interne|int[ée]gr[ée]|t[ée]l[ée]phone|\bphone\b/i;

/**
 * Renvoie le micro à demander, ou `undefined` pour laisser le navigateur choisir.
 * `preferred` : micro choisi par l'utilisateur (vide = automatique).
 */
export function choosePhoneMic(inputs: readonly MicInput[], preferred: string): string | undefined {
  if (preferred && inputs.some((i) => i.deviceId === preferred)) return preferred;
  // Sans écouteurs, le micro par défaut est le bon.
  if (!inputs.some((i) => HEADSET.test(i.label))) return undefined;
  const builtIn =
    inputs.find((i) => BUILT_IN.test(i.label) && !HEADSET.test(i.label)) ??
    inputs.find((i) => i.label && !HEADSET.test(i.label));
  return builtIn?.deviceId;
}

/** Nom compréhensible d'un micro. */
export function micDisplayName(label: string): string {
  if (/^speakerphone$/i.test(label)) return 'Micro du téléphone';
  if (/^headset earpiece$/i.test(label)) return "Micro du téléphone (son dans l'écouteur d'appel)";
  if (/bluetooth/i.test(label)) return 'Micro des écouteurs Bluetooth (qualité téléphone)';
  if (/^wired headset$/i.test(label)) return 'Micro des écouteurs filaires';
  if (/^usb audio$/i.test(label)) return 'Micro USB';
  return label || 'Micro';
}
