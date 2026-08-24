// Exact per-glyph extraction using our own content-stream interpreter.
// Writes source/raw/glyphs/pNNNN.json  -> [{code, font, x, y, size, w}]
// This is the permanent, unrepaired audit trail. Nothing downstream edits it.
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { extractGlyphs } from './pdfcontent.mjs';
import { pageFonts, pageContent, xobjResolver } from './pdffonts.mjs';
import { PDFName } from 'pdf-lib';
import { PDF_URL, RAW, QA } from './config.mjs';

const lib = await PDFDocument.load(fs.readFileSync(PDF_URL), { updateMetadata: false });
const ctx = lib.context;
const pages = lib.getPages();

const outDir = path.join(RAW, 'glyphs');
fs.mkdirSync(outDir, { recursive: true });

const fontUse = new Map();     // baseFont -> glyph count
const cidUse = new Map();      // "base|code" -> count
let total = 0;

for (let i = 0; i < pages.length; i++) {
  const pageNo = i + 1;
  const node = pages[i].node;
  const fonts = pageFonts(ctx, node);
  const buf = pageContent(ctx, node);
  const res = ctx.lookup(node.get(PDFName.of('Resources')));
  const getX = xobjResolver(ctx, res);
  const glyphs = extractGlyphs(buf, name => fonts.get(name) || null, getX);

  for (const g of glyphs) {
    if (!g.fb) continue;
    fontUse.set(g.fb, (fontUse.get(g.fb) || 0) + 1);
    const k = g.fb + '|' + g.code;
    cidUse.set(k, (cidUse.get(k) || 0) + 1);
  }
  total += glyphs.length;
  fs.writeFileSync(path.join(outDir, `p${String(pageNo).padStart(4, '0')}.json`), JSON.stringify(glyphs));
  if (pageNo % 200 === 0) process.stdout.write(`  ...page ${pageNo}\n`);
}

console.log(`\ntotal glyphs extracted: ${total.toLocaleString()}`);
console.log('\nglyphs per font:');
for (const [b, n] of [...fontUse.entries()].sort((a, b2) => b2[1] - a[1]))
  console.log(`  ${String(n).padStart(8)}  ${b}`);

fs.mkdirSync(QA, { recursive: true });
fs.writeFileSync(path.join(QA, 'glyph-usage.json'), JSON.stringify(
  [...cidUse.entries()].map(([k, n]) => { const [base, code] = k.split('|'); return { base, code: +code, n }; })
    .sort((a, b) => b.n - a.n), null, 1));
console.log('\nper-glyph usage -> qa/glyph-usage.json');
