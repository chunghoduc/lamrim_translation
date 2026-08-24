// Render every CID the body font actually uses into labelled contact sheets,
// so each ambiguous glyph can be identified by eye and the CID->Unicode table
// rebuilt exactly.
import fs from 'node:fs';
import path from 'node:path';
import * as fontkit from 'fontkit';
import { Resvg } from '@resvg/resvg-js';
import { QA } from './config.mjs';

const census = JSON.parse(fs.readFileSync(path.join(QA, 'cid-census.json'), 'utf8'));
const font = fontkit.openSync(path.join(QA, 'font', 'DTREBQ_MonlamUniOuChan2.ttf'));
const upem = font.unitsPerEm;

const outDir = path.join(QA, 'glyphs');
fs.mkdirSync(outDir, { recursive: true });

// which CIDs to render: default = all used, or a filtered subset via argv
const arg = process.argv[2];
let cids = census.cids.map(c => c.cid);
let tag = 'all';
if (arg === 'ambiguous') {
  // members of colliding ToUnicode outputs, plus the two vowel variants
  const byOut = new Map();
  for (const c of census.cids) {
    if (!byOut.has(c.toUnicode)) byOut.set(c.toUnicode, []);
    byOut.get(c.toUnicode).push(c.cid);
  }
  cids = census.cids.filter(c => byOut.get(c.toUnicode).length > 1).map(c => c.cid);
  tag = 'ambiguous';
}
const info = new Map(census.cids.map(c => [c.cid, c]));

const COLS = 8, CELL = 190, LABEL = 46, PAD = 10;
const perSheet = COLS * 6;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let sheet = 0;
for (let start = 0; start < cids.length; start += perSheet) {
  const batch = cids.slice(start, start + perSheet);
  const rows = Math.ceil(batch.length / COLS);
  const W = COLS * CELL + PAD * 2, H = rows * (CELL + LABEL) + PAD * 2;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;

  batch.forEach((cid, i) => {
    const cx = PAD + (i % COLS) * CELL, cy = PAD + Math.floor(i / COLS) * (CELL + LABEL);
    svg += `<rect x="${cx}" y="${cy}" width="${CELL - 4}" height="${CELL + LABEL - 4}" fill="#fafafa" stroke="#cccccc"/>`;
    let d = '';
    try { d = font.getGlyph(cid).path.toSVG() || ''; } catch { /* missing outline */ }
    if (d) {
      // font units -> cell, y-flip; leave headroom for vowel marks above the line
      const s = (CELL - 40) / upem;
      const tx = cx + CELL / 2, ty = cy + CELL - 46;
      svg += `<g transform="translate(${tx} ${ty}) scale(${s} ${-s})"><path d="${d}" fill="#111111"/></g>`;
    } else {
      svg += `<text x="${cx + CELL / 2}" y="${cy + CELL / 2}" font-size="16" fill="#cc0000" text-anchor="middle">no outline</text>`;
    }
    const rec = info.get(cid) || {};
    svg += `<text x="${cx + CELL / 2 - 2}" y="${cy + CELL + 6}" font-size="19" font-family="monospace" fill="#0044cc" text-anchor="middle">CID ${cid}</text>`;
    svg += `<text x="${cx + CELL / 2 - 2}" y="${cy + CELL + 26}" font-size="15" font-family="monospace" fill="#555555" text-anchor="middle">${esc(rec.count ?? '')}x  [${esc((rec.toUnicode ?? '').split('').map(c => c.codePointAt(0).toString(16).toUpperCase()).join(','))}]</text>`;
  });
  svg += '</svg>';

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
  const file = path.join(outDir, `${tag}-sheet${String(++sheet).padStart(2, '0')}.png`);
  fs.writeFileSync(file, png);
  console.log(`${path.relative(process.cwd(), file)}  (${batch.length} glyphs, ${W}x${H})`);
}
console.log(`\nrendered ${cids.length} glyphs across ${sheet} sheet(s); upem=${upem}, numGlyphs=${font.numGlyphs}`);
