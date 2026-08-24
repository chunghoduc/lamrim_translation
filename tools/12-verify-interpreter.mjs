// Verify the content-stream interpreter against pdfjs.
// Both decode via the SAME (defective) ToUnicode, so they must agree
// character-for-character once pdfjs's synthetic spaces are removed.
// Agreement proves our CID stream + ordering is correct; it says nothing
// about the CMap being right - that is a separate problem.
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pageFonts } from './pdffonts.mjs';
import { PDF_URL, STD_FONTS, RAW } from './config.mjs';

const lib = await PDFDocument.load(fs.readFileSync(PDF_URL), { updateMetadata: false });
const ctx = lib.context;
const pages = lib.getPages();
const doc = await pdfjs.getDocument({ url: PDF_URL, useSystemFonts: true, standardFontDataUrl: STD_FONTS }).promise;

const SAMPLE = [1, 3, 5, 12, 40, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950, 978];
let ok = 0, bad = 0;

for (const p of SAMPLE) {
  const fonts = pageFonts(ctx, pages[p - 1].node);
  const glyphs = JSON.parse(fs.readFileSync(path.join(RAW, 'glyphs', `p${String(p).padStart(4, '0')}.json`), 'utf8'));

  // our text, in content-stream order
  const mine = glyphs.map(g => g.u || '').join('');

  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  const theirs = tc.items.map(i => i.str || '').join('');
  page.cleanup();

  const norm = s => s.replace(/[  ]/g, '');
  const a = norm(mine), b = norm(theirs);
  if (a === b) { ok++; console.log(`page ${String(p).padStart(3)}  MATCH   (${a.length} chars, ${glyphs.length} glyphs)`); }
  else {
    bad++;
    let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    console.log(`page ${String(p).padStart(3)}  DIFF at char ${i}  (ours ${a.length} / pdfjs ${b.length})`);
    console.log(`   ours : ${JSON.stringify(a.slice(Math.max(0, i - 15), i + 25))}`);
    console.log(`   pdfjs: ${JSON.stringify(b.slice(Math.max(0, i - 15), i + 25))}`);
  }
}
console.log(`\nmatched ${ok}/${SAMPLE.length} sampled pages, ${bad} differing`);
