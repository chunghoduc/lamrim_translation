// Independent, mapping-free cross-check on the repair table.
//
// For every CID, collect the syllables it occurs in - expressed purely as
// sequences of OTHER CIDs, so the check does not depend on any Unicode
// assignment. Two CIDs that are width variants of the SAME stack appear in the
// same words (high overlap). Two CIDs that are DIFFERENT stacks appear in
// different words (low overlap).
//
// Then compare that against what the repair table claims:
//   - same 'to' but low overlap  -> suspicious, likely two different stacks
//   - different 'to' but high overlap -> suspicious, likely the same stack
import fs from 'node:fs';
import path from 'node:path';
import { REPAIR, BODY_FONT, VERIFIED_OK } from './repair-table.mjs';
import { RAW, QA } from './config.mjs';

const TSHEG_CID = 110;
const files = fs.readdirSync(path.join(RAW, 'glyphs')).sort();

// cid -> Map(syllableSignature -> count); signature = syllable CIDs with the
// target position marked as '#'
const ctxOf = new Map();

for (const file of files) {
  const glyphs = JSON.parse(fs.readFileSync(path.join(RAW, 'glyphs', file), 'utf8'))
    .filter(g => g.fb === BODY_FONT);
  // split into syllables on tsheg
  let syl = [];
  const flush = () => {
    if (syl.length) {
      syl.forEach((_, i) => {
        const cid = syl[i];
        const sig = syl.map((c, j) => (j === i ? '#' : c)).join(',');
        if (!ctxOf.has(cid)) ctxOf.set(cid, new Map());
        const m = ctxOf.get(cid);
        m.set(sig, (m.get(sig) || 0) + 1);
      });
    }
    syl = [];
  };
  for (const g of glyphs) {
    if (g.code === TSHEG_CID) flush();
    else syl.push(g.code);
  }
  flush();
}

const overlap = (a, b) => {
  const A = ctxOf.get(a), B = ctxOf.get(b);
  if (!A || !B) return null;
  let inter = 0;
  for (const k of A.keys()) if (B.has(k)) inter++;
  const uni = new Set([...A.keys(), ...B.keys()]).size;
  return { jaccard: uni ? inter / uni : 0, shared: inter, aOnly: A.size - inter, bOnly: B.size - inter };
};

// rebuild collision groups from the shipped ToUnicode via collisions.json
const collisions = JSON.parse(fs.readFileSync(path.join(QA, 'collisions.json'), 'utf8'));
const claim = cid => REPAIR[cid]?.to ?? (collisions.all.find(x => x.cid === cid)?.out ?? '?');

console.log('Within each shipped-ToUnicode collision group, pairwise word-context overlap.\n');
const flags = [];

for (const g of collisions.groups) {
  const cids = g.cids.map(c => c.cid).filter(c => ctxOf.has(c));
  if (cids.length < 2) continue;
  const rows = [];
  for (let i = 0; i < cids.length; i++) for (let j = i + 1; j < cids.length; j++) {
    const o = overlap(cids[i], cids[j]);
    if (!o) continue;
    const ci = claim(cids[i]), cj = claim(cids[j]);
    const same = ci === cj;
    // thresholds: variants of one stack normally share a good fraction of words
    let flag = '';
    if (same && o.jaccard < 0.02 && o.shared < 5) flag = 'SAME-VALUE / LOW OVERLAP';
    if (!same && o.jaccard > 0.25) flag = 'DIFF-VALUE / HIGH OVERLAP';
    rows.push({ a: cids[i], b: cids[j], ci, cj, ...o, flag });
    if (flag) flags.push({ group: g.out, ...rows[rows.length - 1] });
  }
  if (!rows.length) continue;
  console.log(`group "${g.out}"`);
  for (const r of rows.sort((x, y) => y.jaccard - x.jaccard).slice(0, 8)) {
    console.log(`   ${String(r.a).padStart(4)}(${r.ci}) vs ${String(r.b).padStart(4)}(${r.cj})  ` +
      `jaccard=${r.jaccard.toFixed(3)} shared=${String(r.shared).padStart(4)}  ${r.flag}`);
  }
  console.log('');
}

console.log('\n================ FLAGS ================');
if (!flags.length) console.log('none - every pair is consistent with the repair table');
for (const f of flags) {
  console.log(`  [${f.flag}] group "${f.group}": CID ${f.a}->"${f.ci}"  CID ${f.b}->"${f.cj}"  jaccard=${f.jaccard.toFixed(3)} shared=${f.shared}`);
}
