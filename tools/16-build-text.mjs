// Phase 1 output: repaired, reading-ordered Tibetan text.
//   source/clean/pNNNN.txt   per page
//   source/clean/lamrim.txt  whole book
//
// Repairs are per-font:
//   MonlamUniOuChan2 (body)      -> REPAIR
//   MonlamUniOuChan4 (titles)    -> shares the body CID space; decoded through the
//                                   body CMap (which is correct where OuChan4's is
//                                   not, e.g. ཀྱ and སྨ) then REPAIR applied
//   Qomolangma-Uchen-Sarchen/-ung -> QOMOLANGMA_REPAIR (section headings, front matter)
// Running heads are dropped by font; folio numbers by y-band only, so the
// contents-page number column (same font) survives.
import fs from 'node:fs';
import path from 'node:path';
import { decode, keep, RUNNING_HEAD_FONTS, FOLIO_FONTS, BODY_Y_MIN, BODY_Y_MAX, LINE_TOL } from './decode.mjs';
import { RAW, CLEAN } from './config.mjs';


fs.mkdirSync(CLEAN, { recursive: true });
const files = fs.readdirSync(path.join(RAW, 'glyphs')).sort();
const all = [];
const repaired = new Map();
let kept = 0, droppedHead = 0, droppedFolio = 0, droppedBand = 0;

for (const file of files) {
  const pageNo = Number(file.match(/\d+/)[0]);
  const glyphs = JSON.parse(fs.readFileSync(path.join(RAW, 'glyphs', file), 'utf8'));
  for (const g of glyphs) {
    if (!g.fb) continue;
    if (RUNNING_HEAD_FONTS.has(g.fb)) droppedHead++;
    else if (FOLIO_FONTS.has(g.fb)) droppedFolio++;
    else if (g.y < BODY_Y_MIN || g.y > BODY_Y_MAX) droppedBand++;
  }

  const body = glyphs.filter(keep);
  kept += body.length;
  for (const g of body) {
    if (decode(g) !== (g.u ?? '')) repaired.set(g.fb, (repaired.get(g.fb) || 0) + 1);
  }

  body.forEach((g, i) => { g.__i = i; });
  const lines = [];
  for (const g of body) {
    let ln = lines.find(l => Math.abs(l.y - g.y) <= LINE_TOL);
    if (!ln) { ln = { y: g.y, gs: [] }; lines.push(ln); }
    ln.gs.push(g);
  }
  for (const l of lines) l.gs.sort((a, b) => a.__i - b.__i);          // stream order = reading order
  lines.sort((a, b) => Math.min(...a.gs.map(g => g.__i)) - Math.min(...b.gs.map(g => g.__i)));

  const rendered = lines.map(l => ({
    x0: l.gs[0].x,
    x1: l.gs[l.gs.length - 1].x + (l.gs[l.gs.length - 1].w || 0),
    text: l.gs.map(decode).join(''),
  })).filter(l => l.text.trim());

  const rights = rendered.map(l => l.x1).sort((a, b) => a - b);
  const margin = rights.length ? rights[Math.floor(rights.length * 0.8)] : 0;
  const lefts = rendered.map(l => l.x0).sort((a, b) => a - b);
  const leftEdge = lefts.length ? lefts[Math.floor(lefts.length * 0.2)] : 0;

  const paras = [];
  let cur = '';
  rendered.forEach((l, i) => {
    const prev = rendered[i - 1];
    if (i > 0 && (l.x0 > leftEdge + 6 || (prev && prev.x1 < margin - 18))) { if (cur) paras.push(cur); cur = ''; }
    cur += l.text;
  });
  if (cur) paras.push(cur);

  const pageText = paras.join('\n\n');
  fs.writeFileSync(path.join(CLEAN, `p${String(pageNo).padStart(4, '0')}.txt`), pageText, 'utf8');
  all.push(`\n\n<!-- page ${pageNo} -->\n\n${pageText}`);
}

fs.writeFileSync(path.join(CLEAN, 'lamrim.txt'), all.join(''), 'utf8');

console.log(`kept as body text    : ${kept.toLocaleString()}`);
console.log(`dropped running heads: ${droppedHead.toLocaleString()}`);
console.log(`dropped folio numbers: ${droppedFolio.toLocaleString()}`);
console.log(`dropped out-of-band  : ${droppedBand.toLocaleString()}`);
console.log('\nglyphs whose decoding was corrected, by font:');
for (const [f, n] of [...repaired.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(7)}  ${f}`);
const size = fs.statSync(path.join(CLEAN, 'lamrim.txt')).size;
console.log(`\nwrote source/clean/lamrim.txt (${(size / 1024 / 1024).toFixed(2)} MB) + ${files.length} page files`);
