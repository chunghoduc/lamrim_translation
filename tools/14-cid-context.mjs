// Show a CID in real word context: render the page and crop tightly around
// actual occurrences, with a marker under the target glyph. Reading a glyph
// inside a real Tibetan word is far more reliable than reading it in isolation.
//
// usage: node tools/14-cid-context.mjs 369,411,483 [occurrencesPerCid]
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, Path2D as NPath2D, DOMMatrix as NDOMMatrix } from '@napi-rs/canvas';
globalThis.Path2D = NPath2D;
if (NDOMMatrix) globalThis.DOMMatrix = NDOMMatrix;
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDF_URL, STD_FONTS, RAW, QA } from './config.mjs';

const BODY = 'DTREBQ+MonlamUniOuChan2';
const targets = process.argv[2].split(',').map(Number);
const PER = Number(process.argv[3] || 3);
const SCALE = Number(process.argv[4] || 4);
const ZOOM = Number(process.argv[5] || 2);   // upscale crops when compositing
const CROP_W = 440, CROP_H = 130;

// locate occurrences, preferring pages spread through the book
const wanted = new Map(targets.map(c => [c, []]));
const pageFiles = fs.readdirSync(path.join(RAW, 'glyphs')).sort();
const step = Math.max(1, Math.floor(pageFiles.length / 60));
const FIRST_BODY = 24;
for (let i = FIRST_BODY; i < pageFiles.length && [...wanted.values()].some(v => v.length < PER); i += step) {
  const pageNo = Number(pageFiles[i].match(/\d+/)[0]);
  const glyphs = JSON.parse(fs.readFileSync(path.join(RAW, 'glyphs', pageFiles[i]), 'utf8'));
  glyphs.forEach((g, idx) => {
    if (g.fb !== BODY) return;
    const list = wanted.get(g.code);
    if (!list || list.length >= PER) return;
    if (list.some(o => o.page === pageNo)) return;      // spread across pages
    list.push({ page: pageNo, x: g.x, y: g.y, idx });
  });
}

// group crops by page so each page renders once
const byPage = new Map();
for (const [cid, occs] of wanted) for (const o of occs) {
  if (!byPage.has(o.page)) byPage.set(o.page, []);
  byPage.get(o.page).push({ cid, ...o });
}

const doc = await pdfjs.getDocument({ url: PDF_URL, useSystemFonts: true, standardFontDataUrl: STD_FONTS }).promise;
const crops = [];
for (const [pageNo, list] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
  process.stderr.write(`  rendering page ${pageNo}...
`);
  const page = await doc.getPage(pageNo);
  const vp = page.getViewport({ scale: SCALE });
  const cv = createCanvas(vp.width, vp.height);
  const cx = cv.getContext('2d');
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, vp.width, vp.height);
  try { await page.render({ canvasContext: cx, viewport: vp }).promise; }
  catch (e) { process.stderr.write(`  SKIP page ${pageNo}: ${e.message}
`); page.cleanup(); continue; }
  for (const o of list) {
    const px = o.x * SCALE, py = vp.height - o.y * SCALE;
    const sx = Math.max(0, Math.min(vp.width - CROP_W, px - CROP_W / 2));
    const sy = Math.max(0, Math.min(vp.height - CROP_H, py - CROP_H * 0.66));
    const c2 = createCanvas(CROP_W, CROP_H);
    const g2 = c2.getContext('2d');
    g2.fillStyle = '#fff'; g2.fillRect(0, 0, CROP_W, CROP_H);
    g2.drawImage(cv, -sx, -sy);
    // marker under the target glyph
    g2.strokeStyle = '#e00'; g2.lineWidth = 3;
    g2.beginPath(); g2.moveTo(px - sx - 14, py - sy + 16); g2.lineTo(px - sx + 26, py - sy + 16); g2.stroke();
    crops.push({ cid: o.cid, page: pageNo, img: c2 });
  }
  page.cleanup();
}

// assemble one sheet per run, grouped by CID
crops.sort((a, b) => targets.indexOf(a.cid) - targets.indexOf(b.cid) || a.page - b.page);
const LAB = 34, PADD = 8;
const cols = PER;
const rows = Math.ceil(crops.length / cols);
const DW = CROP_W * ZOOM, DH = CROP_H * ZOOM;
const W = cols * (DW + PADD) + PADD, H = rows * (DH + LAB + PADD) + PADD;
const sheet = createCanvas(W, H);
const s = sheet.getContext('2d');
s.fillStyle = '#fff'; s.fillRect(0, 0, W, H);
crops.forEach((c, i) => {
  const col = i % cols, row = Math.floor(i / cols);
  const x = PADD + col * (DW + PADD), y = PADD + row * (DH + LAB + PADD);
  s.drawImage(c.img, 0, 0, CROP_W, CROP_H, x, y, DW, DH);
  s.strokeStyle = '#bbb'; s.lineWidth = 1; s.strokeRect(x, y, DW, DH);
  s.fillStyle = '#04c'; s.font = 'bold 24px monospace';
  s.fillText(`CID ${c.cid}   p.${c.page}`, x + 4, y + DH + 26);
});
const out = path.join(QA, 'glyphs', `context-${targets.join('_')}.png`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, sheet.toBuffer('image/png'));
console.log(`${path.relative(process.cwd(), out)}  ${W}x${H}  (${crops.length} crops)`);
for (const [cid, occs] of wanted) if (occs.length === 0) console.log(`  WARNING: no occurrence found for CID ${cid}`);
