// Generates the application icon (assets/autogarage.ico + assets/icon-256.png).
//
// Drawn procedurally and encoded by hand so the build needs no image library:
// a purple gradient rounded square with a white cog, matching the app's palette.
//
//   node tools/make-icon.mjs

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(new URL(import.meta.url))), "..", "assets");

// ---------- drawing ----------

const SAMPLES = 4; // per axis -> 16 samples/pixel for anti-aliasing
const TEETH = 8;

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const TOP = [139, 92, 246];    // violet-500
const BOTTOM = [76, 29, 149];  // violet-900
const WHITE = [255, 255, 255];

/** Coverage of the rounded-square plate at normalised coords (-1..1). */
function inPlate(x, y, r = 0.42) {
  const ax = Math.abs(x), ay = Math.abs(y);
  const lim = 1 - r;
  if (ax <= lim || ay <= lim) return ax <= 1 && ay <= 1;
  const dx = ax - lim, dy = ay - lim;
  return Math.hypot(dx, dy) <= r;
}

/** Coverage of the cog at normalised coords. */
function inCog(x, y) {
  const r = Math.hypot(x, y);
  if (r > 0.78 || r < 0.001) return false;
  if (r < 0.26) return false; // centre hole

  const theta = Math.atan2(y, x);
  // Square wave in the angular domain: wide arc = tooth, gap = body radius.
  const phase = ((theta * TEETH) / (2 * Math.PI) + 1000) % 1;
  const onTooth = phase < 0.5;
  const limit = onTooth ? 0.78 : 0.6;
  return r <= limit;
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const step = 1 / (SAMPLES + 1);

  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let plate = 0, cog = 0;
      for (let sy = 1; sy <= SAMPLES; sy++) {
        for (let sx = 1; sx <= SAMPLES; sx++) {
          // normalised device coords, -1..1 across the icon
          const nx = ((pxi + sx * step) / size) * 2 - 1;
          const ny = ((py + sy * step) / size) * 2 - 1;
          // 6% padding so the plate doesn't touch the very edge
          const s = 1 / 0.94;
          if (inPlate(nx * s, ny * s)) plate++;
          // cog occupies the middle ~62% of the plate
          if (inCog((nx * s) / 0.62, (ny * s) / 0.62)) cog++;
        }
      }
      const total = SAMPLES * SAMPLES;
      const alpha = plate / total;
      const cogA = cog / total;

      const grad = mix(TOP, BOTTOM, py / (size - 1));
      const rgb = cogA > 0 ? mix(grad, WHITE, Math.min(1, cogA / Math.max(alpha, 0.0001))) : grad;

      const o = (py * size + pxi) * 4;
      px[o] = rgb[0];
      px[o + 1] = rgb[1];
      px[o + 2] = rgb[2];
      px[o + 3] = Math.round(alpha * 255);
    }
  }
  return px;
}

// ---------- PNG encoding ----------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // one filter byte (0 = none) per scanline
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- ICO container ----------

function encodeICO(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);            // reserved
  header.writeUInt16LE(1, 2);            // type: icon
  header.writeUInt16LE(images.length, 4);

  const dir = Buffer.alloc(16 * images.length);
  let offset = header.length + dir.length;

  images.forEach(({ size, png }, i) => {
    const e = i * 16;
    dir[e] = size >= 256 ? 0 : size;     // 0 means 256
    dir[e + 1] = size >= 256 ? 0 : size;
    dir[e + 2] = 0;                      // palette
    dir[e + 3] = 0;                      // reserved
    dir.writeUInt16LE(1, e + 4);         // colour planes
    dir.writeUInt16LE(32, e + 6);        // bits per pixel
    dir.writeUInt32LE(png.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });

  return Buffer.concat([header, dir, ...images.map((i) => i.png)]);
}

// ---------- build ----------

mkdirSync(OUT, { recursive: true });

const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = sizes.map((size) => ({ size, png: encodePNG(size, render(size)) }));

writeFileSync(join(OUT, "autogarage.ico"), encodeICO(images));
writeFileSync(join(OUT, "icon-256.png"), images.at(-1).png);

console.log(`Icône générée : ${join(OUT, "autogarage.ico")} (${sizes.join(", ")} px)`);
console.log(`PNG           : ${join(OUT, "icon-256.png")}`);
