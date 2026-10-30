import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Chemins relatifs : l'appli fonctionne aussi bien à la racine d'un domaine
  // que dans un sous-dossier (ex. GitHub Pages : /Playano/).
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
