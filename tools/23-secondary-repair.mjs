// Build repair tables for the secondary fonts using the same lexicon-scoring
// method proven on the body font. Volumes are small (front matter + the sa-bcad
// section headings) but the headings define the book's structure, so they matter.
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { loadFont } from './pdffonts.mjs';
import { REPAIR as BODY_REPAIR, BODY_FONT } from './repair-table.mjs';
import { QOMOLANGMA_REPAIR } from './secondary-repair-table.mjs';
import { RAW, PDF_URL, QA } from './config.mjs';

const TARGETS = ['DTREBQ+Qomolangma-Uchen-Sarchung', 'DTREBQ+Qomolangma-Uchen-Sarchen'];
const DROPPED = new Set(['VHPITG+Qomolangma-Uchen-Sarchung', 'CLHYNS+TCRCYoutso', 'CLHYNS+TCRCBod-Yig']);
const KNOWN = new Set(JSON.parse(fs.readFileSync(path.join('data', 'syllables.json'), 'utf8')));

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

// --- does MonlamUniOuChan4 share the body font's CID space? ---------------
{
  const a = cmapOf.get(BODY_FONT), b = cmapOf.get('DTREBQ+MonlamUniOuChan4');
  let same = 0, diff = 0;
  if (a && b) for (const [c, u] of b) if (a.has(c)) (a.get(c) === u ? same++ : diff++);
  console.log(`MonlamUniOuChan4 vs body font: ${same} shared CIDs agree, ${diff} disagree`);
  console.log(same > 0 && diff === 0
    ? '  -> same CID space; the body repair table applies to it unchanged.\n'
    : '  -> CID spaces differ; do NOT reuse the body table.\n');
}

// --- gather syllables per font, as CID sequences ---------------------------
const TSHEG_U = '་';
const sylsOf = new Map();   // font -> cid -> Map(seq -> n)
const usage = new Map();    // font -> cid -> n
for (const file of fs.readdirSync(path.join(RAW, 'glyphs')).sort()) {
  const gs = JSON.parse(fs.readFileSync(path.join(RAW, 'glyphs', file), 'utf8'));
  for (const font of TARGETS) {
    const cm = cmapOf.get(font);
    if (!cm) continue;
    const run = gs.filter(g => g.fb === font && g.y >= 55 && g.y <= 535);
    if (!run.length) continue;
    if (!sylsOf.has(font)) { sylsOf.set(font, new Map()); usage.set(font, new Map()); }
    const S = sylsOf.get(font), U = usage.get(font);
    let syl = [];
    const flush = () => {
      if (syl.length && syl.length <= 12) for (const cid of new Set(syl)) {
        if (!S.has(cid)) S.set(cid, new Map());
        const m = S.get(cid); const k = syl.join(',');
        m.set(k, (m.get(k) || 0) + 1);
      }
      syl = [];
    };
    for (const g of run) {
      U.set(g.code, (U.get(g.code) || 0) + 1);
      if ((cm.get(g.code) ?? '') === TSHEG_U) flush(); else syl.push(g.code);
    }
    flush();
  }
}

const SUB = [];
for (let cp = 0x0F90; cp <= 0x0FBC; cp++) SUB.push(String.fromCodePoint(cp));

const tables = {};
for (const font of TARGETS) {
  const cm = cmapOf.get(font), S = sylsOf.get(font), U = usage.get(font);
  if (!S) continue;
  console.log(`\n================ ${font} ================`);
  const decode = (seq, cid, val) => seq.map(c => c === cid ? val : (QOMOLANGMA_REPAIR[c]?.to ?? cm.get(c) ?? '')).join('');
  const score = (cid, val) => {
    const m = S.get(cid); if (!m) return null;
    let ok = 0, tot = 0;
    for (const [k, n] of m) { tot += n; if (KNOWN.has(decode(k.split(',').map(Number), cid, val))) ok += n; }
    return { ok, tot, pct: tot ? ok / tot : 0 };
  };

  // only CIDs that collide with another used CID on the same output are suspect
  const suspects = [...U.keys()].filter(cid => cm.get(cid));

  const table = {};
  console.log('CID    shipped  best        cur%    best%   n     verdict');
  for (const cid of suspects.sort((a, b) => (U.get(b) || 0) - (U.get(a) || 0))) {
    const shipped = cm.get(cid) ?? '';
    const cands = new Set([shipped, ...SUB.map(s => shipped + s)]);
    const res = [...cands].filter(Boolean).map(v => ({ v, ...score(cid, v) }))
      .filter(r => r && r.tot).sort((a, b) => b.pct - a.pct);
    if (!res.length) continue;
    const best = res[0], cur = res.find(r => r.v === shipped) ?? { pct: 0 };
    const margin = best.pct - cur.pct;
    const cmp = QOMOLANGMA_REPAIR[cid]?.to ?? shipped;
    const verdict = best.v === cmp ? 'ok' : (margin > 0.10 ? '*** CHECK ***' : 'minor');
    if (best.v !== (QOMOLANGMA_REPAIR[cid]?.to ?? shipped) && margin > 0.10) table[cid] = { to: best.v, was: shipped, n: U.get(cid), pct: best.pct, curPct: cur.pct };
    console.log(
      String(cid).padEnd(7) + (QOMOLANGMA_REPAIR[cid]?.to ?? shipped).padEnd(9) + best.v.padEnd(12) +
      (cur.pct * 100).toFixed(0).padStart(5) + '%' + (best.pct * 100).toFixed(0).padStart(7) + '%' +
      String(U.get(cid)).padStart(6) + '   ' + verdict);
  }
  tables[font] = table;
  console.log(`  -> ${Object.keys(table).length} repairs proposed`);
}

fs.writeFileSync(path.join(QA, 'secondary-repairs.json'), JSON.stringify(tables, null, 1));
console.log('\n-> qa/secondary-repairs.json');
