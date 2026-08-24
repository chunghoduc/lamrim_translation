// Render PDF pages to PNG. Used for (a) Phase 1 visual validation of extraction,
// and (b) reading ambiguous glyphs in word context.
// usage: node tools/09-render-page.mjs <page> [scale] [cropTop cropBottom]
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, Path2D as NPath2D, DOMMatrix as NDOMMatrix } from '@napi-rs/canvas';
globalThis.Path2D = NPath2D;
if (NDOMMatrix) globalThis.DOMMatrix = NDOMMatrix;
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDF_URL, STD_FONTS, QA } from './config.mjs';

const pageNo = Number(process.argv[2] || 300);
const scale = Number(process.argv[3] || 3);
const cropTop = process.argv[4] !== undefined ? Number(process.argv[4]) : null;
const cropBot = process.argv[5] !== undefined ? Number(process.argv[5]) : null;

const doc = await pdfjs.getDocument({ url: PDF_URL, useSystemFonts: true, standardFontDataUrl: STD_FONTS }).promise;
const page = await doc.getPage(pageNo);
const vp = page.getViewport({ scale });
const canvas = createCanvas(vp.width, vp.height);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#fff';
ctx.fillRect(0, 0, vp.width, vp.height);
await page.render({ canvasContext: ctx, viewport: vp }).promise;

let out = canvas;
if (cropTop !== null && cropBot !== null) {
  const h = cropBot - cropTop;
  const c2 = createCanvas(vp.width, h);
  c2.getContext('2d').drawImage(canvas, 0, -cropTop);
  out = c2;
}

const dir = path.join(QA, 'pages');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `p${String(pageNo).padStart(4, '0')}${cropTop !== null ? `-crop${cropTop}` : ''}.png`);
fs.writeFileSync(file, out.toBuffer('image/png'));
console.log(`${path.relative(process.cwd(), file)}  ${out.width}x${out.height}  (page ${pageNo}, scale ${scale})`);
