# AlgoScratch — prototype

Prototype d'une future plateforme d'apprentissage de l'algorithmique basée sur le PDF fourni.

## Orientation retenue

- Parties I et II : notebooks avec cours, activités et cellules Scratch.
- Parties III et IV : exercices interactifs sans format notebook.
- Prototype actuel : une page d'accueil et trois pages d'activités pour la séquence `Premiers pas`.

## Ce que montre ce prototype

- Une structure générale en 4 parcours.
- Une page d'accueil avec arborescence latérale.
- Une séquence `Premiers pas` dans la partie I, avec les activités 1, 2 et 3 en sous-parties.
- Une activité par page avec fil d'Ariane et navigation 1 → 2 → 3.
- Une leçon de type notebook.
- Les activités 1, 2 et 3 branchées sur un éditeur Scratch local.
- Un prototype de sauvegarde/rechargement du projet Scratch pour chaque activité.
- Une page `scratch-spike.html` conservée comme page de test technique de l'éditeur Scratch local.
- Un identifiant élève simple pour le prototype.
- Une progression persistée dans `localStorage`, ou dans `server-data/state.json` quand le site est lancé avec `start-site.bat`.

## Lancer le prototype simple

Ouvrir `index.html` dans un navigateur.

Dans ce mode, les données restent dans le navigateur avec `localStorage`.

## Lancer avec sauvegarde serveur locale

Pour tester une sauvegarde plus proche d'une vraie plateforme :

1. Lancer Scratch local avec `start-scratch.bat`.
2. Lancer le site avec `start-site.bat`.
3. Ouvrir `http://localhost:3000/`.

Le site enregistre alors les progressions et les projets Scratch dans :

```text
server-data/state.json
```

Ce dossier est volontairement ignoré par Git : il contient les données élèves du poste.

## Commandes utiles

Si Node.js et npm sont disponibles :

```bash
npm run check
npm start
```

`npm run check` vérifie la syntaxe de `app.js` et `server.js`.

## Détail technique Scratch local

L'éditeur Scratch utilisé par `scratch-spike.html` et les activités est servi localement sur :

```text
http://localhost:8601/
```

Dans cette phase de test, il faut d'abord lancer le serveur Scratch local, puis ouvrir le site.

## Préparer le dépôt GitHub

Voir `DEPLOYMENT.md` pour les étapes de création du dépôt et les choix d'hébergement.

## Étapes suivantes possibles

1. Créer le dépôt GitHub et pousser cette première version.
2. Choisir une stratégie d'hébergement pour Scratch en ligne.
3. Remplacer le stockage fichier `server-data/state.json` par une vraie base de données.
4. Ajouter une authentification sécurisée.
5. Transformer les autres leçons du PDF en contenu structuré.
6. Créer les exercices interactifs des parties III et IV.