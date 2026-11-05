// ===== Impression directe des étiquettes =====
//
// Pourquoi passer par le serveur local plutôt que par la fenêtre d'impression
// de Chrome : une imprimante d'étiquettes (Xprinter XP-300B…) imprimée depuis
// le navigateur dépend du format de papier réglé dans le pilote Windows, des
// marges, de l'échelle et des en-têtes que Chrome mémorise d'une impression à
// l'autre. Si le format du pilote ne correspond pas à l'étiquette, l'impression
// déborde sur l'étiquette suivante et se décale à chaque fois.
//
// Ici, le navigateur fabrique le travail d'impression en langage TSPL (celui
// des imprimantes d'étiquettes) — `SIZE 40 mm,20 mm`, `GAP 2 mm`, l'image de
// l'étiquette point par point — et ce module le remet tel quel au spouleur
// Windows en mode RAW : le pilote ne retouche rien, c'est l'imprimante qui
// mesure ses étiquettes et se cale sur chaque espace entre deux étiquettes.
//
//   GET  /api/printers    liste des imprimantes installées sur ce PC
//   POST /api/print/raw   envoie les octets reçus à l'imprimante nommée par
//                         l'en-tête `X-AutoGarage-Printer`
//
// Aucun réglage Windows n'est nécessaire : seule l'imprimante installée est
// utilisée, via les fonctions standard du spouleur (winspool.drv).

import { spawn } from "node:child_process";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const IS_WIN = process.platform === "win32";
export const MAX_JOB_BYTES = 8 * 1024 * 1024;   // ~1000 étiquettes 40 × 20 mm

// ---------------------------------------------------------------- PowerShell

const tmpFile = (ext) => join(tmpdir(), `autogarage-${randomBytes(8).toString("hex")}${ext}`);

/**
 * Lance un script PowerShell écrit dans un fichier temporaire. Les paramètres
 * passent par des variables d'environnement : aucun nom d'imprimante ni chemin
 * n'est jamais recopié dans le texte du script, donc rien à échapper.
 */
async function runPowerShell(script, env = {}, timeoutMs = 45000) {
  const file = tmpFile(".ps1");
  // BOM : PowerShell 5.1 lit alors le fichier en UTF-8
  await writeFile(file, `﻿${script}`, "utf8");
  try {
    return await new Promise((resolve, reject) => {
      const ps = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file],
        { env: { ...process.env, ...env }, windowsHide: true }
      );
      const out = [];
      const err = [];
      const timer = setTimeout(() => ps.kill(), timeoutMs);
      ps.stdout.on("data", (d) => out.push(d));
      ps.stderr.on("data", (d) => err.push(d));
      ps.on("error", (e) => { clearTimeout(timer); reject(e); });
      ps.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          code,
          out: Buffer.concat(out).toString("utf8").trim(),
          err: Buffer.concat(err).toString("utf8").trim(),
        });
      });
    });
  } finally {
    unlink(file).catch(() => {});
  }
}

// La liste est écrite dans un fichier UTF-8 plutôt que sur la console : un nom
// d'imprimante accentué traverserait mal la page de code de la console, et ne
// correspondrait plus ensuite au nom exact attendu par le spouleur.
const LIST_PS = String.raw`
$ErrorActionPreference = 'Stop'
try { $items = Get-CimInstance -ClassName Win32_Printer }
catch { $items = Get-WmiObject -Class Win32_Printer }
$list = @($items | ForEach-Object {
  [pscustomobject]@{
    'name'    = [string]$_.Name
    'driver'  = [string]$_.DriverName
    'port'    = [string]$_.PortName
    'default' = [bool]$_.Default
    'offline' = [bool]$_.WorkOffline
  }
})
$json = ConvertTo-Json -InputObject $list -Compress -Depth 3
[System.IO.File]::WriteAllText($env:AUTOGARAGE_OUT_FILE, $json, (New-Object System.Text.UTF8Encoding($false)))
`;

// Envoi RAW par l'API du spouleur (OpenPrinter / StartDocPrinter « RAW » /
// WritePrinter). « XPS_PASS » est essayé ensuite pour les pilotes v4, qui
// refusent parfois le type RAW.
const RAW_PS = String.raw`
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$source = @'
using System;
using System.Runtime.InteropServices;

public static class AutoGarageRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern int StartDocPrinter(IntPtr handle, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO info);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool WritePrinter(IntPtr handle, byte[] data, int count, out int written);

  public static string Send(string printer, byte[] data, string docName) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero))
      return "ERR OpenPrinter " + Marshal.GetLastWin32Error();
    try {
      int lastError = 0;
      foreach (string type in new string[] { "RAW", "XPS_PASS" }) {
        DOCINFO info = new DOCINFO();
        info.pDocName = docName;
        info.pDataType = type;
        if (StartDocPrinter(h, 1, info) == 0) { lastError = Marshal.GetLastWin32Error(); continue; }
        try {
          if (!StartPagePrinter(h)) return "ERR StartPagePrinter " + Marshal.GetLastWin32Error();
          int written;
          bool ok = WritePrinter(h, data, data.Length, out written);
          int writeError = Marshal.GetLastWin32Error();
          EndPagePrinter(h);
          if (!ok || written != data.Length) return "ERR WritePrinter " + writeError;
          return "OK " + type;
        } finally {
          EndDocPrinter(h);
        }
      }
      return "ERR StartDocPrinter " + lastError;
    } finally {
      ClosePrinter(h);
    }
  }
}
'@
if (-not ('AutoGarageRawPrint' -as [type])) { Add-Type -TypeDefinition $source -Language CSharp }
$bytes = [System.IO.File]::ReadAllBytes($env:AUTOGARAGE_PRINT_FILE)
Write-Output ([AutoGarageRawPrint]::Send($env:AUTOGARAGE_PRINTER, $bytes, 'AutoGarage - Etiquettes'))
`;

const WIN_ERRORS = {
  2: "imprimante introuvable",
  5: "accès refusé par Windows",
  1801: "nom d'imprimante invalide",
  1722: "le service d'impression (spouleur) ne répond pas",
};

// ---------------------------------------------------------------- CUPS (Linux / macOS)

function run(cmd, args, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    const out = [];
    const err = [];
    const timer = setTimeout(() => p.kill(), timeoutMs);
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => err.push(d));
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out: Buffer.concat(out).toString("utf8"), err: Buffer.concat(err).toString("utf8") });
    });
  });
}

// ---------------------------------------------------------------- API

let cache = { at: 0, list: null };

/** Imprimantes installées : [{ name, driver, port, default, offline }]. */
export async function listPrinters({ fresh = false } = {}) {
  if (!fresh && cache.list && Date.now() - cache.at < 20000) return cache.list;
  let list = [];
  if (IS_WIN) {
    const out = tmpFile(".json");
    try {
      const r = await runPowerShell(LIST_PS, { AUTOGARAGE_OUT_FILE: out });
      const text = await readFile(out, "utf8").catch(() => "");
      if (r.code !== 0 || !text) throw new Error(r.err || "Liste des imprimantes indisponible");
      const parsed = JSON.parse(text.replace(/^\uFEFF/, "") || "[]");
      list = (Array.isArray(parsed) ? parsed : [parsed]).filter((p) => p && p.name);
    } finally {
      unlink(out).catch(() => {});
    }
  } else {
    const r = await run("lpstat", ["-e"]).catch(() => null);
    if (!r || r.code !== 0) throw new Error("Aucun système d'impression (CUPS) détecté sur ce poste");
    list = r.out.split("\n").map((s) => s.trim()).filter(Boolean)
      .map((name) => ({ name, driver: "", port: "", default: false, offline: false }));
  }
  cache = { at: Date.now(), list };
  return list;
}

// Un seul travail à la fois : deux impressions lancées coup sur coup ne se
// mélangent jamais dans le spouleur.
let queue = Promise.resolve();

/** Envoie `data` (octets TSPL) tel quel à l'imprimante `printer`. */
export function printRaw(printer, data) {
  const job = queue.then(() => sendRaw(printer, data));
  queue = job.catch(() => {});
  return job;
}

async function sendRaw(printer, data) {
  const known = await listPrinters();
  if (!known.some((p) => p.name === printer)) {
    const fresh = await listPrinters({ fresh: true });
    if (!fresh.some((p) => p.name === printer)) {
      throw Object.assign(new Error(`Imprimante « ${printer} » introuvable sur ce PC`), { status: 404 });
    }
  }

  const file = tmpFile(".prn");
  await writeFile(file, data);
  try {
    if (IS_WIN) {
      const r = await runPowerShell(RAW_PS, {
        AUTOGARAGE_PRINTER: printer,
        AUTOGARAGE_PRINT_FILE: file,
      });
      const line = r.out.split(/\r?\n/).pop() || "";
      if (line.startsWith("OK")) return { datatype: line.slice(3) || "RAW" };
      const code = Number((line.match(/(\d+)\s*$/) || [])[1]);
      const reason = WIN_ERRORS[code] || line || r.err || "réponse inattendue du spouleur";
      throw new Error(`Impression refusée par Windows : ${reason}`);
    }
    const r = await run("lp", ["-d", printer, "-o", "raw", file]);
    if (r.code !== 0) throw new Error(`Impression refusée : ${r.err.trim() || r.out.trim()}`);
    return { datatype: "raw" };
  } finally {
    unlink(file).catch(() => {});
  }
}

// ---------------------------------------------------------------- HTTP

// Origines autorisées à piloter l'imprimante : l'application elle-même
// (localhost) et, pour une version publiée en ligne, les adresses listées dans
// AUTOGARAGE_ORIGINS (séparées par des virgules). Une page web quelconque
// ouverte sur ce PC ne peut donc pas envoyer de travaux à l'imprimante.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const EXTRA_ORIGINS = (process.env.AUTOGARAGE_ORIGINS || "")
  .split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
const originAllowed = (origin) => !origin || LOCAL_ORIGIN.test(origin) || EXTRA_ORIGINS.includes(origin);

const corsHeaders = (req) => {
  const origin = req.headers.origin;
  if (!origin || !originAllowed(origin)) return {};
  return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
};

const json = (req, res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...corsHeaders(req),
  });
  res.end(body);
};

const readBody = (req, limit) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on("data", (c) => {
    size += c.length;
    if (size > limit) {
      reject(Object.assign(new Error("Travail d'impression trop volumineux"), { status: 413 }));
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", () => resolve(Buffer.concat(chunks)));
  req.on("error", reject);
});

/**
 * Traite les routes d'impression. Renvoie `true` si la requête a été prise en
 * charge, `false` pour la laisser au reste du serveur.
 */
export async function handlePrintRoute(req, res, pathname) {
  if (pathname !== "/api/printers" && pathname !== "/api/print/raw") return false;

  const origin = req.headers.origin;
  if (origin && !originAllowed(origin)) {
    json(req, res, 403, { ok: false, error: `Origine non autorisée : ${origin}` });
    return true;
  }

  // Pré-vérification CORS (application publiée en ligne qui parle au PC local)
  if (req.method === "OPTIONS") {
    const headers = {
      ...corsHeaders(req),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-AutoGarage-Agent, X-AutoGarage-Printer",
      "Access-Control-Max-Age": "600",
    };
    if (req.headers["access-control-request-private-network"]) {
      headers["Access-Control-Allow-Private-Network"] = "true";
    }
    res.writeHead(204, headers);
    res.end();
    return true;
  }

  // En-tête obligatoire : un formulaire ou une requête « simple » venue d'un
  // autre site ne peut pas le fabriquer sans passer par la vérification CORS.
  if (req.headers["x-autogarage-agent"] !== "1") {
    json(req, res, 400, { ok: false, error: "En-tête X-AutoGarage-Agent manquant" });
    return true;
  }

  try {
    if (pathname === "/api/printers") {
      if (req.method !== "GET") {
        json(req, res, 405, { ok: false, error: "Méthode non autorisée" });
      } else {
        const printers = await listPrinters({ fresh: true });
        json(req, res, 200, { ok: true, platform: process.platform, printers });
      }
      return true;
    }

    if (req.method !== "POST") {
      json(req, res, 405, { ok: false, error: "Méthode non autorisée" });
      return true;
    }
    let printer = "";
    try { printer = decodeURIComponent(String(req.headers["x-autogarage-printer"] || "")).trim(); }
    catch { printer = ""; }
    if (!printer) {
      json(req, res, 400, { ok: false, error: "Aucune imprimante choisie" });
      return true;
    }

    const data = await readBody(req, MAX_JOB_BYTES);
    if (!data.length) {
      json(req, res, 400, { ok: false, error: "Travail d'impression vide" });
      return true;
    }

    const result = await printRaw(printer, data);
    json(req, res, 200, { ok: true, printer, bytes: data.length, ...result });
  } catch (err) {
    console.error("[impression]", err.message);
    if (!res.headersSent) json(req, res, err.status || 500, { ok: false, error: err.message || "Erreur d'impression" });
  }
  return true;
}
