// Phase 1 final verification: render a page AND emit the reconstructed lines in
// the same order, so the extraction can be checked line-by-line against the
// rendered ground truth.
//
// usage: node tools/20-compare-page.mjs <page> [scale]
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, Path2D as NPath2D, DOMMatrix as NDOMMatrix } from '@napi-rs/canvas';
globalThis.Path2D = NPath2D;
if (NDOMMatrix) globalThis.DOMMatrix = NDOMMatrix;
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { decode, keep, LINE_TOL } from './decode.mjs';
import { PDF_URL, STD_FONTS, RAW, QA } from './config.mjs';

const pageNo = Number(process.argv[2]);
const SCALE = Number(process.argv[3] || 3);


// --- reconstructed lines -----------------------------------------------
const glyphs = JSON.parse(fs.readFileSync(
  path.join(RAW, 'glyphs', `p${String(pageNo).padStart(4, '0')}.json`), 'utf8')).filter(keep);
const lines = [];
glyphs.forEach((g, __i) => { g.__i = __i; });
for (const g of glyphs) {
  let ln = lines.find(l => Math.abs(l.y - g.y) <= LINE_TOL);
  if (!ln) { ln = { y: g.y, gs: [] }; lines.push(ln); }
  ln.gs.push(g);
}
for (const l of lines) l.gs.sort((a, b) => a.__i - b.__i);   // stream order = reading order
lines.sort((a, b) => Math.min(...a.gs.map(g => g.__i)) - Math.min(...b.gs.map(g => g.__i)));
const texts = lines.map(l => l.gs.map(decode).join('')).filter(t => t.trim());

// --- render ------------------------------------------------------------
const doc = await pdfjs.getDocument({ url: PDF_URL, useSystemFonts: true, standardFontDataUrl: STD_FONTS }).promise;
const page = await doc.getPage(pageNo);
const vp = page.getViewport({ scale: SCALE });
const cv = createCanvas(vp.width, vp.height);
const cx = cv.getContext('2d');
cx.fillStyle = '#fff'; cx.fillRect(0, 0, vp.width, vp.height);
await page.render({ canvasContext: cx, viewport: vp }).promise;

// number each reconstructed line in the left margin of the image
cx.fillStyle = '#c00';
cx.font = `bold ${11 * SCALE / 3 * 2}px sans-serif`;
lines.filter(l => l.gs.map(decode).join('').trim()).forEach((l, i) => {
  const y = vp.height - l.y * SCALE;
  cx.fillText(String(i + 1), 6, y);
});

const dir = path.join(QA, 'compare');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `p${String(pageNo).padStart(4, '0')}.png`);
fs.writeFileSync(file, cv.toBuffer('image/png'));

console.log(`page ${pageNo}  ->  ${path.relative(process.cwd(), file)}  (${vp.width}x${vp.height})`);
console.log(`${texts.length} reconstructed lines:\n`);
texts.forEach((t, i) => console.log(`${String(i + 1).padStart(2)}| ${t}`));
