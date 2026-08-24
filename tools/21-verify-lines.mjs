// Structural verification of line/paragraph reconstruction, across ALL pages.
//
// Claim being tested: grouping glyphs into lines and paragraphs neither reorders
// nor loses nor duplicates any glyph. Tested by decoding both the raw stream and
// the reconstructed output with the SAME (unrepaired) ToUnicode and requiring
// them to be identical. Any reordering - like the o-vowel/shad swap found on
// page 90 - shows up as a mismatch.
import fs from 'node:fs';
import path from 'node:path';
import { BODY_FONT } from './repair-table.mjs';
import { RAW, QA } from './config.mjs';

const RUNNING_HEAD_FONTS = new Set(['VHPITG+Qomolangma-Uchen-Sarchung']);
const FOLIO_FONTS = new Set(['CLHYNS+TCRCYoutso', 'CLHYNS+TCRCBod-Yig']);
const BODY_Y_MIN = 55, BODY_Y_MAX = 535, LINE_TOL = 4;

const keep = g => g.fb && !RUNNING_HEAD_FONTS.has(g.fb) && !FOLIO_FONTS.has(g.fb)
  && g.y >= BODY_Y_MIN && g.y <= BODY_Y_MAX;

const files = fs.readdirSync(path.join(RAW, 'glyphs')).sort();
let ok = 0; const bad = [];

for (const file of files) {
  const pageNo = Number(file.match(/\d+/)[0]);
  const body = JSON.parse(fs.readFileSync(path.join(RAW, 'glyphs', file), 'utf8')).filter(keep);

  // reference: raw stream order, raw ToUnicode
  const reference = body.map(g => g.u ?? '').join('');

  // reconstructed exactly as tools/16 does it
  body.forEach((g, i) => { g.__i = i; });
  const lines = [];
  for (const g of body) {
    let ln = lines.find(l => Math.abs(l.y - g.y) <= LINE_TOL);
    if (!ln) { ln = { y: g.y, gs: [] }; lines.push(ln); }
    ln.gs.push(g);
  }
  for (const l of lines) l.gs.sort((a, b) => a.__i - b.__i);
  lines.sort((a, b) => Math.min(...a.gs.map(g => g.__i)) - Math.min(...b.gs.map(g => g.__i)));
  const rebuilt = lines.map(l => l.gs.map(g => g.u ?? '').join('')).join('');

  if (rebuilt === reference) ok++;
  else {
    let i = 0; while (i < rebuilt.length && i < reference.length && rebuilt[i] === reference[i]) i++;
    bad.push({ page: pageNo, at: i, ref: reference.slice(Math.max(0, i - 12), i + 18), got: rebuilt.slice(Math.max(0, i - 12), i + 18) });
  }
}

console.log(`pages checked: ${files.length}`);
console.log(`line reconstruction preserves stream order and content: ${ok}/${files.length}`);
if (bad.length) {
  console.log(`\nMISMATCHES (${bad.length}):`);
  for (const b of bad.slice(0, 20)) {
    console.log(`  p${b.page} at char ${b.at}`);
    console.log(`     stream: ${JSON.stringify(b.ref)}`);
    console.log(`     lines : ${JSON.stringify(b.got)}`);
  }
  fs.writeFileSync(path.join(QA, 'line-mismatches.json'), JSON.stringify(bad, null, 1));
} else {
  console.log('\nno reordering, no loss, no duplication on any page.');
}
