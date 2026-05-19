# Mise en ligne du prototype AlgoScratch

Ce document distingue deux étapes : mettre le code sur GitHub, puis choisir une solution d'hébergement.

## 1. Créer le dépôt GitHub

Git n'est pas encore disponible dans le terminal actuel. Après installation de Git pour Windows, lancer ces commandes depuis le dossier du projet :

```powershell
cd "C:\Users\brune\OneDrive\Documents\New project"
git init
git add .
git commit -m "Initial prototype AlgoScratch"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/algoscratch.git
git push -u origin main
```

Remplacer `VOTRE-COMPTE` par le nom du compte GitHub.

## 2. Ce qui est versionné

Le dépôt doit contenir :

- les pages HTML ;
- `styles.css` ;
- `app.js` ;
- `server.js` ;
- les scripts `.bat` de lancement local ;
- la documentation.

Les dossiers suivants ne doivent pas être envoyés sur GitHub :

- `.tools/` : runtime local ;
- `scratch-local/` : essais locaux Scratch ;
- `server-data/` : données élèves locales ;
- `node_modules/` : dépendances éventuelles ;
- fichiers `.log`.

Ils sont ignorés par `.gitignore`.

## 3. Tester localement avant publication

```powershell
npm run check
npm start
```

Puis ouvrir :

```text
http://localhost:3000/
```

Pour les activités Scratch, lancer aussi le serveur Scratch local avec `start-scratch.bat`.

## 4. Attention pour la mise en ligne

Actuellement, les activités chargent Scratch depuis :

```text
http://localhost:8601/
```

Cela fonctionne sur l'ordinateur de développement, mais pas encore pour des élèves à distance.

Avant une vraie mise en ligne publique, il faudra choisir une stratégie :

1. héberger une version construite de Scratch avec le site ;
2. héberger Scratch séparément et modifier l'adresse de l'iframe ;
3. garder une version de test locale pour valider le contenu pédagogique.

## 5. GitHub Pages ou serveur complet ?

GitHub Pages peut servir les fichiers statiques, mais ne peut pas exécuter `server.js`.

Pour conserver la sauvegarde serveur des progressions et projets Scratch, il faudra plutôt un hébergement Node.js, par exemple Render, Railway, Fly.io, VPS, ou équivalent.