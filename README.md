# ATUM Online — AI Consulting Platform

Version web de PAI Desktop, sans données personnelles, déployable sur Vercel + Railway.

## Stack

- **Frontend** : React (Vite, bundle statique)
- **Backend** : Node.js / Express (streaming NDJSON)
- **Modèles** : Claude Sonnet 4.6 (défaut) · Claude Haiku 4.5 (rapide)
- **Clé API** : fournie par l'utilisateur (jamais stockée côté serveur)

---

## Déploiement en production

### Prérequis
- Compte [Railway](https://railway.app) (backend)
- Compte [Vercel](https://vercel.com) (frontend, optionnel)
- Compte [GitHub](https://github.com)

---

### Étape 1 — Pousser le code sur GitHub

```bash
cd atum-online
git init
git add .
git commit -m "initial: ATUM Online web platform"
git remote add origin https://github.com/VOTRE_COMPTE/atum-online.git
git push -u origin main
```

### Étape 2 — Déployer le backend sur Railway

1. Aller sur [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Sélectionner le repo `atum-online`
3. Dans les variables d'environnement, ajouter :
   ```
   NODE_ENV=production
   PORT=3001
   FRONTEND_URL=https://atum.vercel.app
   ```
4. Railway détecte automatiquement `package.json` et lance `node server.js`
5. Récupérer l'URL Railway : `https://atum-online.up.railway.app`

### Étape 3 — Déployer le frontend sur Vercel

1. Aller sur [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. **Nom du projet** : `atum` → URL : `https://atum.vercel.app`
3. **Build settings** :
   - Framework : Other
   - Root directory : `dist/`
   - Build command : (laisser vide)
   - Output directory : `.`
4. Ajouter une variable d'environnement :
   ```
   ATUM_API_URL=https://atum-online.up.railway.app
   ```
   > Note : modifier `dist/index.html` pour injecter cette URL si nécessaire

5. Deploy → en ligne en ~30 secondes

### Étape 4 — Configurer la clé API

1. Ouvrir `https://atum.vercel.app`
2. Le modal de configuration s'affiche automatiquement
3. Entrer votre clé Anthropic : `sk-ant-api03-...`
   - Obtenir sur [console.anthropic.com](https://console.anthropic.com) → Settings → API Keys
4. Choisir le modèle (Sonnet 4.6 recommandé)
5. Cliquer Enregistrer → la clé est stockée dans votre navigateur

---

## Développement local

```bash
npm install
npm run dev
# Serveur : http://localhost:3001
```

---

## Structure du projet

```
atum-online/
├── server.js              ← Backend Express (API + streaming)
├── package.json
├── vercel.json            ← Config Vercel (nom: atum)
├── .env.example           ← Variables d'environnement
├── dist/                  ← Frontend React (statique)
│   ├── index.html         ← Injecte web-compat.js
│   ├── web-compat.js      ← window.electronAPI → fetch
│   └── assets/            ← Bundle React + CSS
├── data/
│   ├── custom-agents/     ← Configs agents .md
│   └── databases/         ← KB JSON (vide par défaut)
```

---

## Modèles disponibles

| Modèle | Usage | Coût estimé/message |
|--------|-------|---------------------|
| `claude-sonnet-4-6` | Recommandé — équilibré | ~$0.03 |
| `claude-haiku-4-5-20251001` | Rapide & économique | ~$0.008 |

---

## Sécurité

- La clé API n'est **jamais** stockée côté serveur
- Elle est stockée dans `localStorage` du navigateur de l'utilisateur
- Elle est envoyée via le header `X-Api-Key` à chaque requête (HTTPS)
- Chaque utilisateur utilise **sa propre clé** → facturation séparée

---

*ATUM Online — version web de PAI Desktop, sans données personnelles*
