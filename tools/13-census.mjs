// Accurate collision census for the body font, from verified glyph data.
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { loadFont } from './pdffonts.mjs';
import { PDF_URL, QA } from './config.mjs';

const BODY = 'DTREBQ+MonlamUniOuChan2';

const lib = await PDFDocument.load(fs.readFileSync(PDF_URL), { updateMetadata: false });
const ctx = lib.context;

let bodyFont = null;
for (const [, obj] of ctx.enumerateIndirectObjects()) {
  if (!(obj instanceof PDFDict)) continue;
  if (obj.get(PDFName.of('Type'))?.toString() !== '/Font') continue;
  if (obj.get(PDFName.of('Subtype'))?.toString() !== '/Type0') continue;
  const f = loadFont(ctx, obj);
  if (f && f.base === BODY) { bodyFont = f; break; }
}

const usage = JSON.parse(fs.readFileSync(path.join(QA, 'glyph-usage.json'), 'utf8'))
  .filter(u => u.base === BODY);

const total = usage.reduce((s, u) => s + u.n, 0);
console.log(`${BODY}: ${usage.length} distinct CIDs, ${total.toLocaleString()} occurrences\n`);

const byOut = new Map();
for (const u of usage) {
  const s = bodyFont.toUni(u.code);
  if (!byOut.has(s)) byOut.set(s, []);
  byOut.get(s).push(u);
}

const unmapped = usage.filter(u => !bodyFont.toUni(u.code));
console.log(`CIDs with empty ToUnicode: ${unmapped.length}`);

const groups = [...byOut.entries()]
  .filter(([s, l]) => s && l.length > 1)
  .map(([s, l]) => ({ out: s, cids: l.sort((a, b) => b.n - a.n) }))
  .sort((a, b) => b.cids.reduce((s, c) => s + c.n, 0) - a.cids.reduce((s, c) => s + c.n, 0));

const ambCids = groups.reduce((s, g) => s + g.cids.length, 0);
const minorityOcc = groups.reduce((s, g) => s + g.cids.slice(1).reduce((t, c) => t + c.n, 0), 0);

console.log(`colliding outputs: ${groups.length}   CIDs involved: ${ambCids}`);
console.log(`occurrences in non-majority members: ${minorityOcc.toLocaleString()} (${(100 * minorityOcc / total).toFixed(2)}%)\n`);

for (const g of groups) {
  const cps = [...g.out].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase()).join(' ');
  console.log(`"${g.out}" [${cps}]`);
  console.log('   ' + g.cids.map(c => `${c.code}:${c.n.toLocaleString()}`).join('  '));
}

fs.writeFileSync(path.join(QA, 'collisions.json'), JSON.stringify({
  font: BODY, totalOccurrences: total, distinctCids: usage.length,
  groups: groups.map(g => ({ out: g.out, cids: g.cids.map(c => ({ cid: c.code, n: c.n })) })),
  all: usage.map(u => ({ cid: u.code, n: u.n, out: bodyFont.toUni(u.code) })).sort((a, b) => b.n - a.n),
}, null, 1));
console.log('\n-> qa/collisions.json');
