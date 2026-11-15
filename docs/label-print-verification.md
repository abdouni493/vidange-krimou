# Chrome label printing verification

Baseline: `752894ddd574d7cbefd863b2c8a60980772c775e`. Validation uses the actual popup document emitted by `printLabels`, with Chromium 156, print media, scale 1, CSS page size preferred, no headers/footers or margins. No printer driver is available on this Linux machine.

## Reproduction and diagnosis

Fixtures: Liqui Moly 10W40 A3/B4 5L / 4100410231707 / 6750 DA (A), and Filtre / 0123456789012 / 650 DA (B). Name, digits and price enabled; store disabled. Selected size `s40x20`. Browser path, rasterized at the 203 dpi thermal profile (8 dots/mm); the original browser renderer is vector SVG, with no DPI setting. Direct-mode default is 203 dpi. Fresh size/rotation preferences and explicit saved rotations are checked in localStorage (`krimou.labelSize`, `krimou.labelRotation`). The reproducible job is A, A, B.

| Case | Effective @page, mm | .pg, mm | .lbl, mm | .lbl transform | PDF box, mm |
| --- | --- | --- | --- | --- | --- |
| Original fresh, r90 | 20 × 40 | 20 × 40 | 40 × 20 | translateX(20mm) rotate(90deg) | 20.066 × 39.878 |
| Original explicit r0 | 40 × 20 | 40 × 20 | 40 × 20 | none | 39.878 × 20.066 |
| Patched fresh or explicit r0 | 40 × 20 | 40 × 20 | 40 × 20 | none | 39.878 × 20.066 |
| Patched saved r90 | 20 × 40 | 20 × 40 | 40 × 20 | translateX(20mm) rotate(90deg) | 20.066 × 39.878 |
| Patched saved r270 | 20 × 40 | 20 × 40 | 40 × 20 | translateY(40mm) rotate(-90deg) | 20.066 × 39.878 |

All jobs above have exactly three pages. CSS physical dimensions are exact requests; the measured PDF MediaBox shows Chromium's sub-millimetre page-size quantization. The artifacts retain the original Chrome output; they have not been resized or given corrected PDF boxes after printing. This is distinct from driver stock dimensions.

Thus the old fresh setup really sends a portrait 20 × 40 page while an operator may have selected landscape 40 × 20 stock in the driver. This is a software/driver size mismatch, but without that driver we cannot claim it alone explains the physical rightward shift. Explicit saved rotations remain honored; an existing saved r90 must be changed to 0° for the normal 40 × 20 setup.

The original popup also had its own flex layout and a fixed-aspect SVG. Giving that SVG the remaining row height constrained its width as well, shrinking the bars horizontally. The original name had a tight line-height and only a 0.3 mm flex gap. Screen previews were a separately tuned template, and library cards omitted the selected size. Direct printing used 7/7 quiet modules instead of the SVG's 11/7.

Ink bounds below are [left, top, right, bottom), in pixels from a PDF raster at 8 dots/mm, with a black threshold of 150. Page rasters are 320 × 161 for r0 and 161 × 320 for r90 due to the PDF box quantization. Repeated A pages have identical bounds.

| Case | A bounds | B bounds |
| --- | --- | --- |
| Original fresh r90 | [10, 52, 153, 263] | [10, 76, 153, 238] |
| Original r0 | [52, 7, 263, 150] | [76, 7, 238, 150] |
| Patched r0 | [51, 12, 270, 146] | [69, 13, 259, 146] |
| Patched r90 | [14, 51, 148, 270] | [14, 69, 147, 259] |

## Physical layout

One renderer now draws the label for Chrome, the preview and TSPL. The bitmap is embedded at the selected millimetre dimensions, with independent page rotation. Browser printing does not use direct-mode offsets or flip. No 62% scale or positional compensation was added.

203 dpi means the existing 8 dots/mm thermal profile: 320 × 160 dots. The barcode has 95 modules, two dots/module, 190 dots of bars, 22 dots left quiet space and 14 right: 226 total. This complete symbol block is centered at x=47..273; the bars begin at x=69. Asymmetric 11/7 quiet zones place the bar center four dots right of the block center. 300 dpi uses the 12 dots/mm thermal profile: 480 × 240, three-dot modules, 285 dots of bars, 339 including quiet zones.

For A at 203 dpi without store, name band y=6..32, bars y=36..90 (guards extend to 92), digits y=94..118, price y=122..154. Fonts are vertically positioned from measured glyph ascent/descent inside those bands. Name and store are bounded, single-line, ellipsized when necessary. All 13 digits occupy a separate LTR band. Disabled fields release their space to the bars. Optional cut lines remain at the outer edge, outside the symbol quiet zones.

## Checks run

- `npm test`: all 36 existing checks passed.
- `npm run build`: passed; existing large-bundle advisory remains.
- `node tools/test-label-print.cjs /workspace/label-print-evidence`: fresh r0, explicit r0/r90/r270, 300 dpi, 30 × 20, no name/price, all fields with store, accented/truncated French and Arabic, digits off. Page count, page dimensions, whole-dot geometry, nonoverlapping bands, quiet zones, and printed digits checked. ZXing's independent EAN13Reader decoded the packed/unpacked direct bitmap and the PDF rasters. EAN13Reader is intentional: the general reader may report a leading-zero EAN as its equivalent 12-digit UPC.
- `node tools/test-label-entry-points.cjs /workspace/label-print-evidence`: mounted the real French Codes-barres and Stock ProductForm components with an isolated fixture context, no production writes. Clicked selection A,A,B and each Stock print button; preview pixels and popup images match. No uncaught page errors. Simulated Windows transport preserved SIZE, GAP 2, bitmap dimensions, copies 2+1 and flip; direct ignores browser rotation. Unavailable direct agent falls back to the matching Chrome image.

The integration scripts require Vite on port 5173, Playwright, `/usr/bin/chromium` (or CHROMIUM_PATH), pdfinfo and pdftoppm; they use tools supplied by this development environment, without changing dependency declarations. The tests do not require database access. Captured HTML, PDFs, PNG renders and machine-readable measurements are in the evidence directory passed to the commands.

## Physical XP-300B result: pending

Software rendering and barcode decoding passed. No physical XP-300B, Windows driver, camera or scanner was available. A clean PDF does not establish correct driver placement or feed calibration.

Checklist opérateur :

1. Dans l'application : 40 × 20 mm, rotation **0°**, nom/chiffres/prix activés. Une rotation 90° déjà enregistrée reste sélectionnée jusqu'à modification.
2. Dans les préférences du pilote XP-300B : comparer les dimensions réelles du papier **largeur 40 mm, hauteur/avance 20 mm**. « USER » convient seulement si ces valeurs correspondent. Média : étiquettes avec espace (gap), espace réel mesuré (2 mm si c'est le rouleau utilisé), résolution 203 dpi pour cette tête. Comparer aussi orientation, rotation automatique, décalages horizontal/vertical et origine : commencer avec les décalages à zéro et aucune rotation supplémentaire pour le test 0°.
3. Chrome : **échelle 100 %**, marges **Aucune**, **une page par feuille**, en-têtes/pieds de page désactivés, aucun ajustement à la page. Choisir le format 40 × 20 et vérifier l'aperçu avant d'imprimer.
4. Imprimer une seule page de `alignment-40x20.pdf` : cadre à 1 mm de chaque bord, croix au centre, « HAUT » du bon côté. Mesurer les quatre distances. Si tout le motif est décalé alors que le PDF est centré, relever le nom/version du pilote, dimensions de USER, orientation, rotation auto et offsets avant de changer le logiciel.
5. Imprimer A puis B à 100 %, vérifier nom séparé, 13 chiffres, prix et marges blanches; scanner les deux codes. Ensuite imprimer dix étiquettes consécutives et vérifier la dérive. Utiliser le calibrage d'espace seulement si la position change au fil du rouleau. Un décalage constant se compare d'abord aux paramètres du pilote.

## Files changed

- `src/barcode.js`: default rotation, physical bitmap popup, copies and image readiness.
- `src/lib/labelLayout.js`: shared dot geometry and glyph-safe rendering.
- `src/lib/labelPrinter.js`: use/re-export shared renderer; preserve TSPL transport.
- `src/components/PhysicalLabelPreview.jsx`: shared canvas preview.
- `src/components/ui.jsx`: BarcodeLabel uses the physical preview.
- `src/components/LabelPrinter.jsx`: physical preview and Chrome hint.
- `src/pages/Barcodes.jsx`: pass size to library preview and DPI to Chrome.
- `src/pages/Stock.jsx`: pass DPI and show Chrome hint.
- `src/i18n.js`: Arabic translation for the French print hint.
- `tools/test-label-print.cjs`: geometry, packed bitmap/PDF decoding and pagination regression checks.
- `tools/test-label-entry-points.cjs`: actual UI print buttons and simulated agent/fallback checks.
- `docs/label-print-verification.md`: measurements, evidence and physical verification instructions.

## Saved proof artifacts

- [Two-product PDF](label-print-evidence/two-products-40x20.pdf) and [rendered labels](label-print-evidence/two-products-render.png).
- [Original r0 PDF](label-print-evidence/before-r0.pdf), [original fresh r90 PDF](label-print-evidence/before-fresh-r90.pdf), [patched r0 A,A,B PDF](label-print-evidence/after-r0.pdf), and [patched explicit r90 PDF](label-print-evidence/after-r90.pdf).
- [Same-scale before/after](label-print-evidence/before-after.png).
- [Single-label alignment PDF](label-print-evidence/alignment-40x20.pdf).
- [Original popup measurements](label-print-evidence/before-measurements.json), [patched popup and layout measurements](label-print-evidence/after-measurements.json), and [PDF ink bounds](label-print-evidence/pdf-bounds.json).

These artifacts record the verified run; regenerate new evidence outside the checkout by passing an output directory to the test commands.
