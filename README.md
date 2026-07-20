# AutoGarage Pro — Gestion de garage automobile

Application web complète de gestion de garage (réparations, rendez-vous, stock, codes-barres, achats, clients, fournisseurs, employés, dépenses, caisse, rapports), en **français** avec bascule **arabe (RTL)**, mode clair avec dégradés et animations Framer Motion.

## Codes-barres

L'interface **Codes-barres** génère des codes **EAN-13 valides** (préfixe GS1 `613`, chiffre de contrôle calculé) et imprime des planches d'étiquettes.

- Génération aléatoire en un clic, ou saisie manuelle avec correction automatique du chiffre de contrôle
- Pré-remplissage depuis un produit du stock (nom + prix), avec enregistrement du code sur la fiche produit
- Étiquettes en 3 formats (38×24, 50×30, 70×40 mm), contenu configurable (nom, prix, chiffres, nom du magasin, bordures de découpe)
- Impression par lot avec nombre de copies par code

Le rendu des codes-barres est fait maison (`src/barcode.js`, SVG, sans dépendance) et sert à la fois à l'aperçu écran et à l'impression.

## Démarrage

```bash
npm install
npm run dev
```

Ouvrir http://localhost:5180

## Comptes de démonstration

| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Admin démo | `demo` | `demo123` |
| Employé (permissions limitées) | `mohamed` | `worker123` |

Les données de test sont constantes (seed) et stockées dans `localStorage`.
Réinitialisables depuis **Paramètres → Base de données** (sauvegarde / restauration JSON incluses).

## Stack

- React 18 + Vite
- Tailwind CSS (mode clair, dégradés)
- Framer Motion + Emotion (animations, transitions de pages, modales)
- Lucide React (icônes)
- Persistance localStorage — aucune API requise
