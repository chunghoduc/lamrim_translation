// Decisive check on the repair table: for every candidate value of a CID,
// decode EVERY syllable that CID occurs in and score against the Monlam
// lexicon (367k entries -> 16k distinct syllables).
//
// The correct assignment makes almost all of the CID's syllables real Tibetan
// syllables; a wrong one does not. Unlike reading glyphs by eye, this is
// evidence over the whole corpus, and it is independent of the visual pass.
import fs from 'node:fs';
import path from 'node:path';
import { REPAIR, BODY_FONT, VERIFIED_OK, UNRESOLVED } from './repair-table.mjs';
import { RAW, QA } from './config.mjs';

const TSHEG = 110;
const KNOWN = new Set(JSON.parse(fs.readFileSync(path.join('data', 'syllables.json'), 'utf8')));

// shipped ToUnicode per CID
const collisions = JSON.parse(fs.readFileSync(path.join(QA, 'collisions.json'), 'utf8'));
const shipped = new Map(collisions.all.map(x => [x.cid, x.out]));

// gather each CID's syllables as CID sequences
const sylsOf = new Map();   // cid -> Map(sequence -> count)
for (const file of fs.readdirSync(path.join(RAW, 'glyphs')).sort()) {
  const glyphs = JSON.parse(fs.readFileSync(path.join(RAW, 'glyphs', file), 'utf8'))
    .filter(g => g.fb === BODY_FONT);
  let syl = [];
  const flush = () => {
    if (syl.length && syl.length <= 12) {
      const uniq = new Set(syl);
      for (const cid of uniq) {
        if (!sylsOf.has(cid)) sylsOf.set(cid, new Map());
        const m = sylsOf.get(cid);
        const key = syl.join(',');
        m.set(key, (m.get(key) || 0) + 1);
      }
    }
    syl = [];
  };
  for (const g of glyphs) { if (g.code === TSHEG) flush(); else syl.push(g.code); }
  flush();
}

const SUBJOINED = [];
for (let cp = 0x0F90; cp <= 0x0FBC; cp++) SUBJOINED.push(String.fromCodePoint(cp));

const candidatesFor = cid => {
  const base = shipped.get(cid) ?? '';
  const out = new Set([base]);
  for (const s of SUBJOINED) out.add(base + s);
  if (REPAIR[cid]) out.add(REPAIR[cid].to);
  return [...out].filter(Boolean);
};

// decode a syllable (array of cids) with `cid` replaced by `val`
const decodeSyl = (seq, cid, val) => seq.map(c => {
  if (c === cid) return val;
  if (REPAIR[c]) return REPAIR[c].to;
  return shipped.get(c) ?? '';
}).join('');

function score(cid, val) {
  const m = sylsOf.get(cid);
  if (!m) return null;
  let ok = 0, tot = 0;
  for (const [key, n] of m) {
    const seq = key.split(',').map(Number);
    const s = decodeSyl(seq, cid, val);
    tot += n;
    if (KNOWN.has(s)) ok += n;
  }
  return { ok, tot, pct: tot ? ok / tot : 0 };
}

const targets = [
  ...Object.keys(REPAIR).map(Number),
  ...Object.keys(VERIFIED_OK).map(Number),
  ...Object.keys(UNRESOLVED).map(Number),
].filter(c => sylsOf.has(c));

console.log('CID   current    best-by-lexicon   current%   best%   verdict');
console.log('-'.repeat(78));
const problems = [];

for (const cid of targets.sort((a, b) => (sylsOf.get(b)?.size ?? 0) - (sylsOf.get(a)?.size ?? 0))) {
  const current = REPAIR[cid]?.to ?? shipped.get(cid);
  const results = candidatesFor(cid)
    .map(v => ({ v, ...score(cid, v) }))
    .filter(r => r && r.tot)
    .sort((a, b) => b.pct - a.pct);
  if (!results.length) continue;
  const best = results[0];
  const cur = results.find(r => r.v === current) ?? { pct: 0 };
  const agree = best.v === current;
  // only a clear margin counts as disagreement
  const verdict = agree ? 'ok'
    : (best.pct - cur.pct > 0.15 ? '*** DISAGREES ***' : 'ambiguous');
  if (!agree && best.pct - cur.pct > 0.15) problems.push({ cid, current, suggest: best.v, curPct: cur.pct, bestPct: best.pct, n: best.tot });
  console.log(
    String(cid).padEnd(6) + String(current).padEnd(10) + String(best.v).padEnd(18) +
    (cur.pct * 100).toFixed(1).padStart(7) + '%' + (best.pct * 100).toFixed(1).padStart(8) + '%   ' + verdict
  );
}

console.log('\n================= DISAGREEMENTS =================');
if (!problems.length) console.log('none - lexicon agrees with every entry in the repair table');
for (const p of problems) {
  console.log(`  CID ${p.cid}: table says "${p.current}" (${(p.curPct * 100).toFixed(1)}% known) ` +
    `but lexicon prefers "${p.suggest}" (${(p.bestPct * 100).toFixed(1)}% known) over ${p.n} occurrences`);
}
