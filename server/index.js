// ===== AutoGarage Pro — serveur de fichiers statiques =====
//
// Les données vivent désormais dans Supabase : le navigateur parle directement
// au projet PostgreSQL (voir `src/lib/remote.js`), et ce serveur n'a plus qu'un
// rôle — livrer l'application compilée depuis `dist/`.
//
//   GET  /api/health   sonde utilisée par le lanceur AutoGarage.bat
//   GET  /*            l'application (repli sur index.html pour les routes SPA)
//
// Rappel : le scanner de codes-barres exige une origine sécurisée. En local,
// `http://localhost` convient ; depuis un téléphone sur le réseau, il faut
// publier l'application en HTTPS (voir README).

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const DIST = join(ROOT, "dist");
const PORT = Number(process.env.PORT) || 5180;
const HOST = process.env.HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

const sendJSON = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
};

async function serveStatic(res, pathname) {
  if (!existsSync(DIST)) {
    res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(
      `<h1>Application non compilée</h1><p>Lancez <code>npm run build</code> puis rechargez cette page.</p>`
    );
  }

  // Resolve inside dist only — never let a crafted path escape the served folder
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  let file = join(DIST, rel);
  if (!file.startsWith(DIST)) file = join(DIST, "index.html");

  try {
    const info = await stat(file);
    if (info.isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(DIST, "index.html"); // SPA fallback
  }

  try {
    const data = await readFile(file);
    const ext = extname(file).toLowerCase();
    const immutable = file.includes(join(DIST, "assets"));
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Fichier introuvable");
  }
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname;
  try {
    if (pathname === "/api/health") return sendJSON(res, 200, { ok: true, storage: "supabase" });
    if (pathname.startsWith("/api/")) return sendJSON(res, 404, { error: "Route introuvable" });
    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendJSON(res, 405, { error: "Méthode non autorisée" });
    }
    await serveStatic(res, pathname);
  } catch (err) {
    console.error("[garage]", err);
    if (!res.headersSent) sendJSON(res, 500, { error: err.message || "Erreur serveur" });
    else res.end();
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  Le port ${PORT} est déjà utilisé — l'application est probablement déjà lancée.`);
    console.error(`  Ouvrez http://localhost:${PORT} dans votre navigateur.\n`);
    process.exit(2);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`\n  AutoGarage Pro`);
  console.log(`  Application : http://localhost:${PORT}`);
  console.log(`  Base de données : projet Supabase (voir src/lib/supabase.js)`);
  console.log(`\n  Ctrl+C pour arrêter.\n`);
});

const shutdown = () => { server.close(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
