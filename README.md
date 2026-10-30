# Playano

Une web app pour apprendre le piano à partir de fichiers MIDI.

Les notes tombent en colonnes colorées, chacune avec son nom (Do, Ré, Mi…), vers un piano dessiné en bas de l'écran.
L'appli **écoute ton piano au micro**. Le morceau défile en rythme, mais **s'arrête sur chaque note tant que tu ne l'as pas jouée**.
Pas de stress, donc : si tu te trompes ou si tu prends ton temps, le défilement t'attend.

## Fonctionnalités

- **Import de fichiers MIDI** (`.mid`, `.midi`, `.kar`) : bouton ou glisser-déposer. Les morceaux sont gardés dans le navigateur.
- **Choix des pistes** : main droite, main gauche, autres instruments. La batterie est ignorée par défaut et le choix est mémorisé.
- **Mélodie une note à la fois** : dans chaque accord, on garde la note la plus aiguë. C'est ce que le micro reconnaît le mieux.
- **Mode attente** :
  - le morceau s'arrête sur la note à jouer et la touche correspondante s'allume ;
  - au bout d'un moment, un rappel « Joue Sol » apparaît ;
  - une fausse note fait clignoter la touche en rouge ;
  - si tu joues la bonne note beaucoup trop tôt, un message te demande d'attendre qu'elle touche le clavier.
- **Couleur par note** (Do rouge, Ré orange, Mi jaune…), reprise sur les noms du clavier.
- **Vitesse réglable** de 25 % à 150 %, même pendant le morceau.
- **Bilan en fin de morceau** : notes justes du premier coup, notes jouées en rythme, fausses notes, durée.
- **Test du micro**, avec réglage de la sensibilité.
- **Clavier MIDI (USB/Bluetooth)** reconnu automatiquement dans Chrome et Edge, sans passer par le micro.
- **Sans micro**, on peut aussi toucher les touches du piano à l'écran.
- Deux morceaux de démonstration du domaine public : *Au clair de la lune* et *L'Ode à la joie*.

## Utilisation

1. Ouvre l'appli et commence par **Tester le micro** : pose ton téléphone, ta tablette ou ton ordinateur près du piano et joue quelques notes.
   - Si des notes apparaissent alors que tu ne joues pas, baisse la sensibilité.
   - Si tes notes ne sont pas reconnues, monte-la.
2. Importe un fichier MIDI, ou choisis un morceau de démonstration.
3. Coche la ou les pistes à jouer. Souvent, c'est la main droite qui porte la mélodie.
4. Appuie sur **Commencer** et joue les notes quand elles arrivent sur le clavier.

Pendant le morceau, **Espace** ou **Échap** met en pause.

### Bon à savoir

- Le micro ne fonctionne que sur une page **https** (ou en local sur l'ordinateur). C'est le cas sur GitHub Pages.
- Le micro confond parfois un même nom de note joué à une autre octave, surtout dans les graves.
  C'est pourquoi l'option « Accepter la note dans une autre octave » est activée par défaut. Tu peux la désactiver dans les réglages.
- Les numéros d'octave suivent la convention française : le Do central est **Do3**.

## Lancer l'appli sur son ordinateur

Il faut [Node.js](https://nodejs.org) 22 ou plus récent.

```bash
npm install
npm run dev        # ouvre http://localhost:5173
npm test           # tests automatiques
npm run build      # version de production dans dist/
```

## Mettre l'appli en ligne (GitHub Pages)

Le workflow `.github/workflows/ci.yml` lance les tests à chaque push.
Sur la branche `main`, il publie aussi l'appli sur GitHub Pages.
Il faut l'activer une seule fois : **Settings → Pages → Build and deployment → Source : GitHub Actions**.

L'appli est ensuite disponible sur `https://<ton-compte>.github.io/Playano/`.
Depuis le téléphone ou la tablette, le menu du navigateur permet de l'**ajouter à l'écran d'accueil**.

## Organisation du code

| Dossier | Rôle |
| --- | --- |
| `src/midi/` | Lecture des fichiers MIDI (tempo, pistes, canaux) et petit générateur utilisé pour les démos et les tests |
| `src/song/` | Extraction de la mélodie (une note à la fois) et morceaux de démonstration |
| `src/audio/` | Micro, détection de hauteur (algorithme YIN) et reconnaissance des frappes (`NoteTracker`) |
| `src/game/` | Moteur du mode attente (`GameEngine`) et dessin des notes et du clavier (`Renderer`) |
| `src/ui/` | Écrans : accueil, choix des pistes, jeu, test du micro, réglages |
| `src/input/` | Clavier MIDI branché (Web MIDI) |
| `tests/` | Tests automatiques (Vitest) |

Pour reconnaître une note jouée, `NoteTracker` attend que la hauteur détectée soit stable pendant quelques dizaines de millisecondes.
Une même note rejouée est repérée grâce à la remontée brusque du volume, c'est-à-dire l'attaque.
Chaque frappe ne valide donc qu'une seule note, même quand la précédente résonne encore.
