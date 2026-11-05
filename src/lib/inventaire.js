// ===== Inventaire physique — comparaison, correction et sauvegarde =====
//
// Un inventaire répond à une seule question : « ce que j'ai en rayon
// correspond-il à ce que l'application annonce ? ».
//
//   DÉCALAGE (`ecart`) = compté − application
//   négatif → il manque de la marchandise : une PERTE
//   positif → il y en a plus que prévu : un SURPLUS (gain)
//
// Tout est valorisé au PRIX D'ACHAT : une pièce manquante coûte ce qu'elle a
// coûté, pas ce qu'elle aurait rapporté.
//
// La CORRECTION aligne le stock sur le comptage, après avoir pris une
// SAUVEGARDE des quantités d'avant : « Annuler la correction » les remet.

export const round = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
export const fmtQty = (n) => {
  const v = round(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

export const STATUS_META = {
  draft: { label: "Brouillon", hint: "Comptage en cours — reprenez-le quand vous voulez", color: "orange" },
  completed: { label: "Terminé", hint: "Comptage figé — lancez la comparaison", color: "blue" },
  compared: { label: "Comparé", hint: "Écarts calculés — le stock n'est pas encore corrigé", color: "violet" },
  corrected: { label: "Stock corrigé", hint: "Le stock de l'application a été aligné sur le comptage", color: "green" },
};

/** Le nom se déduit de la date : `invnt-05-11-2026`. */
export function inventaireRefFor(date) {
  const d = new Date(date);
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  const p = (n) => String(n).padStart(2, "0");
  return `invnt-${p(safe.getDate())}-${p(safe.getMonth() + 1)}-${safe.getFullYear()}`;
}

export const countedQtyOf = (line) => round(line?.countedQty);
export const countedValueOf = (inv) =>
  round((inv?.lines || []).reduce((s, l) => s + countedQtyOf(l) * (Number(l.purchasePrice) || 0), 0));

/**
 * Confronte un comptage au stock ACTUEL (relu au moment de la comparaison :
 * des ventes ont pu passer depuis la saisie). Un produit supprimé du catalogue
 * compte pour zéro en stock.
 */
export function buildComparison(inv, products, by) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines = (inv.lines || []).map((l) => {
    const p = byId.get(l.productId);
    const counted = countedQtyOf(l);
    const systemQty = round(p ? p.qtyCurrent : 0);
    const ecart = round(counted - systemQty);
    const purchasePrice = Number(p?.purchasePrice ?? l.purchasePrice) || 0;
    return {
      productId: l.productId,
      productName: p?.name || l.productName,
      categoryName: l.categoryName || "",
      countedQty: counted,
      systemQty,
      ecart,
      purchasePrice,
      value: round(ecart * purchasePrice),
      kind: ecart < 0 ? "perte" : ecart > 0 ? "gain" : "exact",
    };
  });
  const losses = lines.filter((l) => l.kind === "perte");
  const gains = lines.filter((l) => l.kind === "gain");
  const lossValue = round(losses.reduce((s, l) => s - l.value, 0));
  const gainValue = round(gains.reduce((s, l) => s + l.value, 0));
  return {
    at: new Date().toISOString(),
    by: by || "",
    lines,
    lossQty: round(losses.reduce((s, l) => s - l.ecart, 0)),
    lossValue,
    gainQty: round(gains.reduce((s, l) => s + l.ecart, 0)),
    gainValue,
    netValue: round(gainValue - lossValue),
    productsCounted: lines.length,
    productsWithEcart: losses.length + gains.length,
  };
}

/** Ce qu'une correction va écrire, produit par produit — rien n'est écrit. */
export function correctionDeltas(comparison, products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const out = [];
  for (const l of comparison?.lines || []) {
    if (l.ecart === 0) continue;
    const product = byId.get(l.productId);
    if (!product) continue;
    out.push({
      product,
      before: round(product.qtyCurrent),
      after: round(l.countedQty),
      ecart: l.ecart,
      value: l.value,
      kind: l.ecart < 0 ? "perte" : "gain",
    });
  }
  return out;
}

/** Sauvegarde des quantités AVANT correction, sur les produits concernés. */
export function buildBackup(deltas) {
  return {
    at: new Date().toISOString(),
    lines: deltas.map((d) => ({
      productId: d.product.id,
      productName: d.product.name,
      qtyCurrent: round(d.product.qtyCurrent),
      qtyPrincipal: round(d.product.qtyPrincipal),
    })),
  };
}

/**
 * Aligne le stock sur le comptage (mutation du document `db`).
 * Le cumul reçu (`qtyPrincipal`) ne descend jamais sous le nouveau reste.
 */
export function applyCorrection(db, deltas) {
  for (const d of deltas) {
    const p = db.products.find((x) => x.id === d.product.id);
    if (!p) continue;
    const principal = Number(p.qtyPrincipal) || 0;
    p.qtyCurrent = d.after;
    p.qtyPrincipal = d.ecart > 0
      ? round(Math.max(principal, d.after))
      : round(Math.max(d.after, principal + d.ecart));
  }
}

/** Remet les quantités d'avant la correction. Renvoie le nombre de produits. */
export function restoreBackup(db, backup) {
  let n = 0;
  for (const b of backup?.lines || []) {
    const p = db.products.find((x) => x.id === b.productId);
    if (!p) continue;
    p.qtyCurrent = b.qtyCurrent;
    p.qtyPrincipal = b.qtyPrincipal;
    n++;
  }
  return n;
}
