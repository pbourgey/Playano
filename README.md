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
- **Musique d'accompagnement** : l'appli joue tout ce que tu ne joues pas (main gauche, accords, autres instruments).
  Elle s'arrête exactement en même temps que la partition quand celle-ci t'attend, et repart avec ta note.
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

### Jouer avec le téléphone posé sur le piano

- Pose le téléphone sur le pupitre, **micro vers les cordes**, c'est-à-dire en général le bas du téléphone.
  Sur un piano droit, le pupitre est juste au-dessus des cordes : c'est idéal.
- Le mode **paysage** affiche des touches plus larges.
- **L'écran reste allumé** pendant le morceau et le test du micro, même si tu ne le touches pas.
  Sur un iPhone trop ancien (avant iOS 16.4), désactive plutôt le verrouillage automatique pendant que tu joues.
- Avec l'accompagnement, que la musique sorte des écouteurs ou du haut-parleur, l'appli ignore les notes de sa propre musique.
- Joue **la mélodie seule**, une note à la fois. Si tu joues aussi la main gauche, le micro risque de s'y perdre.
  La pédale de sustain ne gêne pas.
- Pour avoir l'appli en plein écran comme une vraie application, ajoute-la à l'écran d'accueil :
  - sur iPhone : Safari → Partager → « Sur l'écran d'accueil » ;
  - sur Android : Chrome → ⋮ → « Ajouter à l'écran d'accueil ».

### Musique d'accompagnement

L'appli joue elle-même le fichier MIDI, avec un petit synthétiseur au son de piano :

- elle joue toutes les notes **sauf la mélodie**, que tu joues au piano ;
- un accord qui tombe en même temps que ta note attend que tu l'aies jouée, comme un accompagnateur qui t'écoute ;
- quand la partition t'attend, la musique se met **en pause au même instant** ;
- une introduction avant la première note est jouée normalement.

Les réglages associés :

- 🎵 dans la barre du haut coupe ou remet la musique ;
- le volume se règle dans les réglages ;
- la batterie n'est pas jouée.

Avec des **écouteurs Bluetooth** sur Android :

- Dès qu'une page utilise le micro, Chrome passe en mode « appel ». Il prendrait alors le micro des écouteurs, en qualité téléphone et loin du piano.
  L'appli impose donc automatiquement **le micro du téléphone**. Tu peux changer ce choix dans « Tester le micro ».
- Conséquence possible : la musique sort du **haut-parleur du téléphone** au lieu des écouteurs.
  « 🔊 Tester le son » montre par où elle sort.
- Si la musique sort du haut-parleur, ce n'est pas grave : l'appli ignore les notes de sa propre musique. Garde simplement un volume modéré.
- Si la musique paraît en retard, augmente « Retard du son » dans les réglages (de 100 à 250 ms, selon les écouteurs).

Spotify n'est pas utilisable ici :

- un enregistrement n'a ni le même tempo ni la même introduction que le fichier MIDI, et il faudrait un compte Premium ;
- chaque pause passerait par Internet, avec du retard.

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

## Mettre l'appli en ligne (GitHub Pages, gratuit)

Le workflow `.github/workflows/ci.yml` lance les tests à chaque push.
Sur la branche `main`, il publie aussi l'appli sur GitHub Pages.

Avec un compte GitHub gratuit, GitHub Pages ne fonctionne qu'avec un **dépôt public**. La mise en route se fait une seule fois :

1. **Settings → General → Danger Zone → Change repository visibility → Make public**.
   Le workflow démarre aussitôt et attend l'étape 2.
2. **Settings → Pages → Build and deployment → Source : GitHub Actions**.

Une minute plus tard, l'appli est en ligne sur **https://pbourgey.github.io/Playano/**.
Ensuite, chaque mise à jour de `main` la republie automatiquement.

## Organisation du code

| Dossier | Rôle |
| --- | --- |
| `src/midi/` | Lecture des fichiers MIDI (tempo, pistes, canaux) et petit générateur utilisé pour les démos et les tests |
| `src/song/` | Extraction de la mélodie (une note à la fois) et morceaux de démonstration |
| `src/audio/` | Micro, détection de hauteur (algorithme YIN), reconnaissance des frappes (`NoteTracker`), synthétiseur et accompagnement synchronisé |
| `src/game/` | Moteur du mode attente (`GameEngine`) et dessin des notes et du clavier (`Renderer`) |
| `src/ui/` | Écrans : accueil, choix des pistes, jeu, test du micro, réglages |
| `src/input/` | Clavier MIDI branché (Web MIDI) |
| `tests/` | Tests automatiques (Vitest) |

Pour reconnaître une note jouée, `NoteTracker` attend que la hauteur détectée soit stable pendant quelques dizaines de millisecondes.
Une même note rejouée est repérée grâce à la remontée brusque du volume, c'est-à-dire l'attaque.
Chaque frappe ne valide donc qu'une seule note, même quand la précédente résonne encore.
