// Resolve the secondary fonts' dropped stacks by tracing the exact CIDs behind
// text that fails a check (genitive agreement, or a word the lexicon rejects).
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { loadFont } from './pdffonts.mjs';
import { RAW, PDF_URL } from './config.mjs';

const FONTS = ['DTREBQ+Qomolangma-Uchen-Sarchen', 'DTREBQ+Qomolangma-Uchen-Sarchung'];
const lib = await PDFDocument.load(fs.readFileSync(PDF_URL), { updateMetadata: false });
const ctx = lib.context;
const cmapOf = new Map();
for (const [, obj] of ctx.enumerateIndirectObjects()) {
  if (!(obj instanceof PDFDict)) continue;
  if (obj.get(PDFName.of('Type'))?.toString() !== '/Font') continue;
  const f = loadFont(ctx, obj);
  if (!f || !f.toUniMap.size) continue;
  if (!cmapOf.has(f.base)) cmapOf.set(f.base, new Map());
  const m = cmapOf.get(f.base);
  for (const [c, u] of f.toUniMap) if (!m.has(c)) m.set(c, u);
}

const TARGETS = process.argv.slice(2);
if (!TARGETS.length) { console.log('usage: node tools/25-secondary-resolve.mjs <syllable> [...]'); process.exit(0); }

for (const font of FONTS) {
  const cm = cmapOf.get(font);
  if (!cm) continue;
  // decode font run with an index back to the producing glyph
  let s = '', owner = [];
  const glyphs = [];
  for (const f of fs.readdirSync(path.join(RAW, 'glyphs')).sort()) {
    for (const g of JSON.parse(fs.readFileSync(path.join(RAW, 'glyphs', f), 'utf8'))) {
      if (g.fb !== font || g.y < 55 || g.y > 535) continue;
      const d = cm.get(g.code) ?? '';
      for (const _ of d) owner.push(glyphs.length);
      glyphs.push({ ...g });
      s += d;
    }
  }
  console.log(`\n================ ${font} (${s.length.toLocaleString()} chars) ================`);
  for (const target of TARGETS) {
    const counts = new Map();
    let i = 0, hits = 0;
    while ((i = s.indexOf(target, i)) !== -1) {
      hits++;
      const gi = owner[i];
      const seq = glyphs.slice(Math.max(0, gi - 3), gi + 4);
      const key = glyphs[gi].code;
      if (!counts.has(key)) counts.set(key, { n: 0, ex: seq.map(g => cm.get(g.code) ?? '').join('') });
      counts.get(key).n++;
      i++;
    }
    console.log(`\n  "${target}" -> ${hits} occurrences`);
    for (const [cid, v] of [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6)) {
      console.log(`     CID ${String(cid).padStart(4)}  ${String(v.n).padStart(4)}x   shipped="${cm.get(cid)}"   e.g. ${JSON.stringify(v.ex)}`);
    }
  }
}
