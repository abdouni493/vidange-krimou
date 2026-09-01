// Renders sample printed documents (facture, bon de réparation, facture
// d'achat) to HTML using the real helpers from src/store.js, so the print
// layout can be checked without clicking through the app.
//
//   node tools/preview-print.mjs [dossier-de-sortie]

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PRINT_CSS, docHead, docStamp, fmtMoney, fmtDate, esc } from "../src/store.js";

const OUT = resolve(process.argv[2] || join(process.cwd(), "preview-print"));
mkdirSync(OUT, { recursive: true });

const t = (x) => x; // français
const settings = {
  logo: "",
  name: "Garage Central Auto",
  description: "Mécanique générale, diagnostic et entretien",
  email: "contact@garagecentral.dz",
  phone: "021 44 55 66",
  address: "12 Rue des Ateliers, Bab Ezzouar, Alger",
  nif: "000016001234567",
  nis: "000016009876543",
  article: "16014123456",
  rc: "16/00-1234567A25",
};

const page = (title, body, dir = "ltr") =>
  `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>${PRINT_CSS}</style></head><body>${body}</body></html>`;

const row = (name, sub, type, qty, unit) => `<tr>
  <td><b>${esc(name)}</b>${sub ? `<div class="dim">${esc(sub)}</div>` : ""}</td>
  <td>${esc(type)}</td>
  <td class="num">${qty}</td>
  <td class="num">${fmtMoney(unit)}</td>
  <td class="num">${fmtMoney(unit * qty)}</td>
</tr>`;

// ---------- facture / bon de réparation ----------
function repairDoc({ title, ref, subtotal, tvaEnabled, tvaRate, tva, total, paid }) {
  const rest = Math.max(0, total - paid);
  const rows = [
    row("Vidange complète", "Huile moteur + filtre à huile", "Service", 1, 2500),
    row("Freins — plaquettes", "Remplacement plaquettes avant", "Service", 1, 4500),
    row("Plaquettes de frein avant", "Valeo", "Pièce", 1, 4000),
    row("Huile moteur 5W40 (5L)", "Total", "Pièce", 2, 4200),
  ].join("");

  return page(`${title} ${ref}`, `
    ${docHead(settings, title, ref, t)}

    <div class="doc-meta">
      <div><span>Référence:</span> <b>${ref}</b></div>
      <div><span>Date:</span> <b>${fmtDate("2026-07-20")}</b></div>
      <div><span>Type:</span> <b>Réparation</b></div>
      <div><span>Statut:</span> <b>Finalisée</b></div>
    </div>

    <div class="grid2">
      <div class="box">
        <h3>Client</h3>
        <div class="kv"><span>Nom</span><b>Karim Benali</b></div>
        <div class="kv"><span>Téléphone</span><b>0550 12 34 56</b></div>
        <div class="kv"><span>Client depuis</span><b>${fmtDate("2026-02-11")}</b></div>
      </div>
      <div class="box">
        <h3>Véhicule</h3>
        <div class="kv"><span>Véhicule</span><b>Volkswagen Golf 7</b></div>
        <div class="kv"><span>Immatriculation</span><b>00123-118-16</b></div>
        <div class="kv"><span>Couleur / Année</span><b>Gris · 2018</b></div>
      </div>
    </div>

    <div class="grid2">
      <div class="box">
        <h3>Arrivée / Sortie</h3>
        <div class="kv"><span>Arrivée</span><b>${fmtDate("2026-07-19")} · 09:00</b></div>
        <div class="kv"><span>Sortie</span><b>${fmtDate("2026-07-20")} · 16:30</b></div>
        <div class="kv"><span>Employés assignés</span><b>Mohamed Larbi, Riad Bousmaha</b></div>
      </div>
      <div class="box">
        <h3>Problème</h3>
        <p class="note">Bruit au freinage à froid et voyant moteur allumé par intermittence. Diagnostic OBD effectué.</p>
      </div>
    </div>

    <h2>Services &amp; produits</h2>
    <table class="doc-table">
      <thead>
        <tr>
          <th>Désignation</th><th>Type</th>
          <th class="num">Qté</th><th class="num">Prix unitaire</th><th class="num">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals-wrap">
      <div>${docStamp(total, paid, t)}</div>
      <div class="totals">
        ${tvaEnabled ? `
          <div class="row"><span>Total HT</span><b>${fmtMoney(subtotal)}</b></div>
          <div class="row"><span>TVA (${tvaRate}%)</span><b>${fmtMoney(tva)}</b></div>` : ""}
        <div class="row grand"><span>${tvaEnabled ? "Total TTC" : "Total à payer"}</span><b>${fmtMoney(total)}</b></div>
        <div class="row"><span>Payé</span><b>${fmtMoney(paid)}</b></div>
        <div class="row due"><span>Reste</span><b>${fmtMoney(rest)}</b></div>
      </div>
    </div>

    <h2>Historique des paiements</h2>
    <table class="doc-table">
      <thead><tr><th>Date</th><th class="num">Montant</th></tr></thead>
      <tbody>
        <tr><td>${fmtDate("2026-07-19")}</td><td class="num">${fmtMoney(Math.round(paid * 0.6))}</td></tr>
        <tr><td>${fmtDate("2026-07-20")}</td><td class="num">${fmtMoney(paid - Math.round(paid * 0.6))}</td></tr>
      </tbody>
    </table>

    <div class="sig">
      <div>Signature du magasin</div>
      <div>Signature du client</div>
    </div>

    <div class="foot">
      ${esc(settings.name)} · ${esc(settings.phone)} · ${esc(settings.email)}
    </div>
  `);
}

// ---------- facture d'achat ----------
function purchaseDoc() {
  const total = 98000, paid = 98000;
  const rows = [
    ["Plaquettes de frein avant", "Valeo", "6130001003", 20, 2800],
    ["Disque de frein ventilé 280mm", "Valeo", "6130001004", 12, 3500],
  ].map(([n, b, code, qty, price]) => `<tr>
      <td><b>${esc(n)}</b><div class="dim">${esc(b)}</div></td>
      <td>${code}</td>
      <td class="num">${qty}</td>
      <td class="num">${fmtMoney(price)}</td>
      <td class="num">${fmtMoney(price * qty)}</td>
    </tr>`).join("");

  return page("FACTURE D'ACHAT ACH-0001", `
    ${docHead(settings, "FACTURE D'ACHAT", "ACH-0001", t)}

    <div class="doc-meta">
      <div><span>Référence:</span> <b>ACH-0001</b></div>
      <div><span>Date:</span> <b>${fmtDate("2026-07-15")}</b></div>
      <div><span>Articles:</span> <b>2</b></div>
    </div>

    <div class="grid2">
      <div class="box">
        <h3>Fournisseur</h3>
        <div class="kv"><span>Nom</span><b>SARL Pièces Auto Alger</b></div>
        <div class="kv"><span>Téléphone</span><b>021 55 44 33</b></div>
        <div class="kv"><span>Adresse</span><b>Zone industrielle, Rouiba</b></div>
      </div>
      <div class="box">
        <h3>Détails de l'achat</h3>
        <div class="kv"><span>Références</span><b>2</b></div>
        <div class="kv"><span>Quantité totale</span><b>32</b></div>
        <div class="kv"><span>Paiements</span><b>1</b></div>
      </div>
    </div>

    <h2>Produits de l'achat</h2>
    <table class="doc-table">
      <thead>
        <tr>
          <th>Nom du produit</th><th>Code-barres</th>
          <th class="num">Qté</th><th class="num">Prix d'achat</th><th class="num">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals-wrap">
      <div>${docStamp(total, paid, t)}</div>
      <div class="totals">
        <div class="row grand"><span>Total</span><b>${fmtMoney(total)}</b></div>
        <div class="row"><span>Payé</span><b>${fmtMoney(paid)}</b></div>
        <div class="row due"><span>Reste</span><b>${fmtMoney(0)}</b></div>
      </div>
    </div>

    <div class="sig">
      <div>Signature du magasin</div>
      <div>Signature du fournisseur</div>
    </div>

    <div class="foot">
      ${esc(settings.name)} · ${esc(settings.phone)} · ${esc(settings.email)}
    </div>
  `);
}

const files = {
  "facture.html": repairDoc({
    title: "FACTURE", ref: "FAC-A1B2C3",
    subtotal: 19400, tvaEnabled: true, tvaRate: 19, tva: 3686, total: 23086, paid: 14000,
  }),
  "bon-de-reparation.html": repairDoc({
    title: "BON DE RÉPARATION", ref: "BR-A1B2C3",
    subtotal: 19400, tvaEnabled: false, tvaRate: 19, tva: 0, total: 19400, paid: 19400,
  }),
  "facture-achat.html": purchaseDoc(),
};

for (const [name, html] of Object.entries(files)) {
  writeFileSync(join(OUT, name), html, "utf8");
  console.log("écrit :", join(OUT, name));
}
