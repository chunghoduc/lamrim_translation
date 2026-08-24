// Trace a decoded string back to the glyph CIDs that produced it.
// usage: node tools/17-trace.mjs "བ་མ" [maxHits]
import fs from 'node:fs';
import path from 'node:path';
import { REPAIR, BODY_FONT } from './repair-table.mjs';
import { RAW } from './config.mjs';

const target = process.argv[2];
const MAX = Number(process.argv[3] || 12);
const decode = g => (g.fb === BODY_FONT && REPAIR[g.code]) ? REPAIR[g.code].to : (g.u ?? '');

const files = fs.readdirSync(path.join(RAW, 'glyphs')).sort();
const patterns = new Map();   // cid-signature -> {count, sample}
let hits = 0;

for (const file of files) {
  const pageNo = Number(file.match(/\d+/)[0]);
  const glyphs = JSON.parse(fs.readFileSync(path.join(RAW, 'glyphs', file), 'utf8'))
    .filter(g => g.fb === BODY_FONT);

  // build decoded string with an index back to the glyph that produced each char
  let s = '';
  const owner = [];
  glyphs.forEach((g, gi) => { const d = decode(g); for (const _ of d) owner.push(gi); s += d; });

  let i = 0;
  while ((i = s.indexOf(target, i)) !== -1) {
    hits++;
    const gStart = owner[i], gEnd = owner[i + target.length - 1];
    const seq = glyphs.slice(Math.max(0, gStart - 2), gEnd + 3);
    const sig = seq.map(g => `${g.code}${REPAIR[g.code] ? '*' : ''}`).join(' ');
    const txt = seq.map(decode).join('');
    if (!patterns.has(sig)) patterns.set(sig, { n: 0, txt, page: pageNo });
    patterns.get(sig).n++;
    i++;
  }
}

console.log(`"${target}" -> ${hits} occurrences, ${patterns.size} distinct CID patterns\n`);
console.log('(* = already in repair table)\n');
for (const [sig, v] of [...patterns.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, MAX)) {
  console.log(`  ${String(v.n).padStart(5)}x  p.${String(v.page).padEnd(4)} "${v.txt}"`);
  console.log(`          CIDs: ${sig}`);
}
