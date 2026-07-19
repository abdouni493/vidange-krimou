# AutoGarage Pro — Gestion de garage automobile

Application web complète de gestion de garage (réparations, rendez-vous, stock, achats, clients, fournisseurs, employés, dépenses, caisse, rapports), en **français** avec bascule **arabe (RTL)**, mode clair avec dégradés et animations Framer Motion.

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
