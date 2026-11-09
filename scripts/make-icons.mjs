// Draws the app icons (gift box on green) as PNGs during the Netlify build.
// No dependencies: uses Node's built-in zlib to write PNG files.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const GREEN = [18, 61, 47], RED = [196, 35, 58], LID = [214, 52, 74], GOLD = [214, 176, 86], CREAM = [251, 246, 238];

function inRound(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
const ring = (x, y, cx, cy, rx, ry, w) => { const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; const di = ((x - cx) / (rx - w)) ** 2 + ((y - cy) / (ry - w)) ** 2; return d <= 1 && di >= 1; };
const dot = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

// colour at a point in a 0..1 square; returns [r,g,b,a]
function paint(x, y, { rounded, pad }) {
  const bg = rounded ? inRound(x, y, 0, 0, 1, 1, 0.22) : true;
  if (!bg) return [0, 0, 0, 0];
  const s = 1 - 2 * pad, X = (x - pad) / s, Y = (y - pad) / s; // content scaled inside padding
  const bw = 0.5, bx0 = 0.25, by0 = 0.47, by1 = 0.87, lid = 0.11, rw = 0.08;
  if (X > 0.5 - rw / 2 && X < 0.5 + rw / 2 && Y > by0 - lid && Y < by1) return [...GOLD, 255];
  if (inRound(X, Y, bx0 - 0.03, by0 - lid, bx0 + bw + 0.03, by0 + 0.02, 0.02)) return [...LID, 255];
  if (inRound(X, Y, bx0, by0, bx0 + bw, by1, 0.02)) return [...RED, 255];
  if (ring(X, Y, 0.39, by0 - lid - 0.06, 0.11, 0.075, 0.035) || ring(X, Y, 0.61, by0 - lid - 0.06, 0.11, 0.075, 0.035)) return [...GOLD, 255];
  if (dot(X, Y, 0.5, by0 - lid, 0.045)) return [...GOLD, 255];
  for (const [cx, cy, r] of [[0.2, 0.2, 0.018], [0.8, 0.18, 0.014], [0.15, 0.75, 0.012], [0.85, 0.7, 0.016], [0.5, 0.12, 0.01], [0.72, 0.36, 0.01]])
    if (dot(x, y, cx, cy, r) && (!pad || (cx > 0.18 && cx < 0.82 && cy > 0.18 && cy < 0.82))) return [...CREAM, 255];
  return [...GREEN, 255];
}

function png(size, opts) {
  const SS = 4, raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = paint((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, opts);
        acc[0] += c[0] * c[3]; acc[1] += c[1] * c[3]; acc[2] += c[2] * c[3]; acc[3] += c[3];
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = acc[3] ? acc[0] / acc[3] : 0; raw[o + 1] = acc[3] ? acc[1] / acc[3] : 0; raw[o + 2] = acc[3] ? acc[2] / acc[3] : 0; raw[o + 3] = acc[3] / (SS * SS);
    }
  }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", png(192, { rounded: true, pad: 0 }));
writeFileSync("public/icons/icon-512.png", png(512, { rounded: true, pad: 0 }));
writeFileSync("public/icons/icon-maskable-512.png", png(512, { rounded: false, pad: 0.1 }));
writeFileSync("public/icons/apple-touch-icon.png", png(180, { rounded: false, pad: 0 }));
console.log("Icons ready");
