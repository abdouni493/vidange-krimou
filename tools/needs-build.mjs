// Le lanceur AutoGarage.bat demande : faut-il recompiler l'application ?
//
//   code de sortie 0  -> dist/ est à jour, rien à faire
//   code de sortie 1  -> une source est plus récente que la dernière compilation
//                        (mise à jour récupérée, fichier modifié…) : recompiler
//
// Sans ce contrôle, une mise à jour du code n'arrivait jamais à l'écran : le
// lanceur ne compilait que si dist/ n'existait pas encore.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const built = join(root, "dist", "index.html");
if (!existsSync(built)) process.exit(1);
const builtAt = statSync(built).mtimeMs;

const SOURCES = [
  "src", "index.html", "package.json", "package-lock.json",
  "vite.config.js", "tailwind.config.js", "postcss.config.js",
];

function newer(path) {
  if (!existsSync(path)) return false;
  const info = statSync(path);
  if (info.isDirectory()) return readdirSync(path).some((name) => newer(join(path, name)));
  return info.mtimeMs > builtAt;
}

process.exit(SOURCES.some((p) => newer(join(root, p))) ? 1 : 0);
