type Child = Node | string | null | undefined | false;
type Attributes = Record<string, string | number | boolean | EventListener | undefined>;

/**
 * Crée un élément DOM. Les textes passent par des nœuds texte : un nom de
 * fichier importé ne peut donc jamais être interprété comme du HTML.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue;
    if (typeof value === 'function') element.addEventListener(name.replace(/^on/, '').toLowerCase(), value);
    else if (value === true) element.setAttribute(name, '');
    else element.setAttribute(name, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child);
  }
  return element;
}

/** Un écran de l'appli : son élément racine et ce qu'il faut arrêter en le quittant. */
export interface Screen {
  root: HTMLElement;
  dispose?: () => void;
}
