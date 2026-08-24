// The repair table covers only the body font. These other fonts also carry text
// that lands in source/clean (front matter, and - critically - the sa-bcad
// section headings). Check whether their ToUnicode is defective too.
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { loadFont } from './pdffonts.mjs';
import { PDF_URL, RAW, QA } from './config.mjs';

const DROPPED = new Set(['VHPITG+Qomolangma-Uchen-Sarchung', 'CLHYNS+TCRCYoutso', 'CLHYNS+TCRCBod-Yig']);

const lib = await PDFDocument.load(fs.readFileSync(PDF_URL), { updateMetadata: false });
const ctx = lib.context;

// one font object per base name (they share a CMap per base name here)
const byBase = new Map();
for (const [, obj] of ctx.enumerateIndirectObjects()) {
  if (!(obj instanceof PDFDict)) continue;
  if (obj.get(PDFName.of('Type'))?.toString() !== '/Font') continue;
  const f = loadFont(ctx, obj);
  if (!f || !f.toUniMap.size) continue;
  if (!byBase.has(f.base)) byBase.set(f.base, []);
  byBase.get(f.base).push(f);
}

// usage from the extracted glyphs, restricted to what actually reaches clean text
const usage = new Map();  // base -> Map(code -> n)
for (const file of fs.readdirSync(path.join(RAW, 'glyphs')).sort()) {
  for (const g of JSON.parse(fs.readFileSync(path.join(RAW, 'glyphs', file), 'utf8'))) {
    if (!g.fb || DROPPED.has(g.fb)) continue;
    if (g.y < 55 || g.y > 535) continue;
    if (!usage.has(g.fb)) usage.set(g.fb, new Map());
    const m = usage.get(g.fb);
    m.set(g.code, (m.get(g.code) || 0) + 1);
  }
}

const PROBE = [['ཀྱི', 'ཀི'], ['གྱི', 'གི'], ['ཀྱང', 'ཀང'], ['བློ', 'བོ'], ['སྤྱོད', 'སྤོད'], ['སྐྱེ', 'སྐེ'], ['རྟོགས', 'རོགས']];

for (const [base, m] of [...usage.entries()].sort((a, b) =>
  [...b[1].values()].reduce((x, y) => x + y, 0) - [...a[1].values()].reduce((x, y) => x + y, 0))) {
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  console.log(`\n===== ${base} =====`);
  console.log(`  glyphs reaching clean text: ${total.toLocaleString()}   distinct CIDs: ${m.size}`);

  // merge all CMaps for this base (they agree where they overlap)
  const merged = new Map();
  for (const f of byBase.get(base) || []) for (const [c, u] of f.toUniMap) if (!merged.has(c)) merged.set(c, u);

  // collisions among USED cids
  const inv = new Map();
  let unmapped = 0;
  for (const [code, n] of m) {
    const u = merged.get(code);
    if (u === undefined) { unmapped++; continue; }
    if (!inv.has(u)) inv.set(u, []);
    inv.get(u).push({ code, n });
  }
  const coll = [...inv.entries()].filter(([u, l]) => u && l.length > 1)
    .sort((a, b) => b[1].reduce((s, c) => s + c.n, 0) - a[1].reduce((s, c) => s + c.n, 0));
  console.log(`  unmapped CIDs: ${unmapped}   colliding outputs: ${coll.length}`);
  for (const [u, l] of coll.slice(0, 10))
    console.log(`     "${u}"  ${l.sort((a, b) => b.n - a.n).map(c => `${c.code}:${c.n}`).join('  ')}`);

  // does its decoded text show the dropped-subjoined signature?
  let txt = '';
  for (const [code, n] of m) txt += (merged.get(code) ?? '').repeat(0);   // placeholder
  console.log('  probe (decoded text for this font):');
}

// decode per-font text to run the word probes
const perFontText = new Map();
for (const file of fs.readdirSync(path.join(RAW, 'glyphs')).sort()) {
  for (const g of JSON.parse(fs.readFileSync(path.join(RAW, 'glyphs', file), 'utf8'))) {
    if (!g.fb || DROPPED.has(g.fb)) continue;
    if (g.y < 55 || g.y > 535) continue;
    perFontText.set(g.fb, (perFontText.get(g.fb) || '') + (g.u ?? ''));
  }
}
const count = (h, n) => { let c = 0, i = 0; while ((i = h.indexOf(n, i)) !== -1) { c++; i++; } return c; };
console.log('\n\n================ word probes per font ================');
for (const [base, t] of perFontText) {
  if (t.length < 500) continue;
  console.log(`\n${base}  (${t.length.toLocaleString()} chars)`);
  for (const [good, bad] of PROBE) {
    const g = count(t, good), b = count(t, bad);
    const verdict = g === 0 && b > 0 ? '*** DROPPED ***' : (g > 0 ? 'ok' : '-');
    console.log(`   ${good.padEnd(8)} ${String(g).padStart(5)}   ${bad.padEnd(8)} ${String(b).padStart(5)}   ${verdict}`);
  }
}
