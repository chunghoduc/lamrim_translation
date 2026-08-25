// Phase 3, step 1: propose the terminology that the glossary has to fix.
//
//   node tools/34-terms.mjs             print the ranked candidates
//   node tools/34-terms.mjs --write     also write glossary/terms-candidates.json
//   node tools/34-terms.mjs --min 40    change the frequency floor (default 25)
//
// This proposes the Tibetan side ONLY. It never suggests a Vietnamese rendering:
// choosing those is a judgement call that gets made once, by a person, and recorded
// in glossary/decisions.md (PLAN.md 4, Phase 3).
//
// Tibetan writes syllables, not words, so "what is a term" has to be inferred. The
// test used here is BRANCHING VARIETY: a real term is preceded and followed by many
// different syllables, whereas a fragment of a longer fixed phrase is nearly always
// surrounded by the same one or two. So ཉོན་མོངས ("affliction") occurs in hundreds of
// contexts and scores high, while ཉོན་མོངས་པའི་ཉེས, a mere piece of a stock phrase,
// is almost always followed by དམིགས and scores low.
//
// Ranking is a reading aid, not an authority. The list is a place to start; every
// entry still has to be judged.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.mjs';

const WRITE = process.argv.includes('--write');
const minArg = process.argv.find(a => a.startsWith('--min='))?.split('=')[1]
  ?? (process.argv.includes('--min') ? process.argv[process.argv.indexOf('--min') + 1] : undefined);
const MIN = Number.isFinite(Number(minArg)) ? Number(minArg) : 25;
const MAX_N = 5;      // longest term, in syllables

// Tibetan grammatical particles. A candidate that BEGINS with one of these is a
// fragment caught mid-phrase, not a term; a candidate that ENDS with a case marker
// or conjunction is the same. Nominalisers (པ/བ/པོ) are deliberately NOT in the tail
// list, because they end perfectly good terms (རང་བཞིན་མེད་པ, བྱང་ཆུབ་སེམས་དཔའ).
const HEAD_STOP = new Set(`པ བ པོ བོ མོ པའི བའི པར བར པས བས པའོ བའོ ལ ལས ན ནས ནི ནོ དང དུ ཏུ རུ སུ ར
གི གིས ཀྱི ཀྱིས གྱི གྱིས ཡི ཡིས འི འང ཡང ཀྱང མི མ མེད ཡིན རེད ལགས དེ འདི དག རྣམས ཚོ ཅིང ཞིང ཤིང སྟེ ཏེ
ཞེས ཅེས གོ ངོ སོ ཏོ དོ འོ རོ ལོ ཀྱེ ཨོ ཅི ཇི གང སོགས ལྟར ཕྱིར ཙམ ཞིག ཅིག གཅིག ཀུན རེ`.split(/\s+/).filter(Boolean));
const TAIL_STOP = new Set(`དང ལ ལས ནས ན ནི དུ ཏུ རུ སུ ར གི གིས ཀྱི ཀྱིས གྱི གྱིས ཡི ཡིས འི འང ཡང ཀྱང
སྟེ ཏེ ཅིང ཞིང ཤིང ལྟར པར བར པས བས པའི བའི དེ འདི དག རྣམས ཚོ ཕྱིར ཙམ མི མ ཞེས ཅེས སོགས ལྟ གང ཅི ཇི
གོ ངོ སོ ཏོ དོ འོ རོ ལོ`.split(/\s+/).filter(Boolean));

const text = fs.readFileSync(path.join(ROOT, 'source', 'clean', 'lamrim.txt'), 'utf8');
const outlinePath = path.join(ROOT, 'source', 'outline.json');
const outline = fs.existsSync(outlinePath) ? JSON.parse(fs.readFileSync(outlinePath, 'utf8')) : { sections: [] };

// Split into syllable runs. A shad (།) or a line break ends a run: a term never
// straddles one, so n-grams must not be counted across them.
const runs = text
  .replace(/<!-- page \d+ -->/g, '\n')
  .split(/[།\n]+/)
  .map(r => r.split('་').map(s => s.trim()).filter(Boolean))
  .filter(r => r.length);

const total = runs.reduce((a, r) => a + r.length, 0);
console.log(`corpus: ${runs.length.toLocaleString()} runs, ${total.toLocaleString()} syllables`);

// n-gram counts plus the neighbours each n-gram is seen with
const grams = new Map();      // gram -> {n, count, left:Set, right:Set}
for (const r of runs) {
  for (let n = 1; n <= MAX_N; n++) {
    for (let i = 0; i + n <= r.length; i++) {
      const g = r.slice(i, i + n).join('་');
      let e = grams.get(g);
      if (!e) { e = { n, count: 0, left: new Set(), right: new Set() }; grams.set(g, e); }
      e.count++;
      e.left.add(i === 0 ? '^' : r[i - 1]);
      e.right.add(i + n === r.length ? '$' : r[i + n]);
    }
  }
}
console.log(`distinct n-grams (n<=${MAX_N}): ${grams.size.toLocaleString()}`);

// Terms that appear in the sa-bcad titles matter most: they are the book's own
// vocabulary for its own structure, and every one becomes a chapter heading.
const titleText = outline.sections.map(s => s.title).join(' ');
const inTitles = g => titleText.includes(g);

const cands = [];
let droppedParticle = 0;
for (const [g, e] of grams) {
  if (e.count < MIN || e.n < 2) continue;
  const syl = g.split('་');
  if (HEAD_STOP.has(syl[0]) || TAIL_STOP.has(syl.at(-1))) { droppedParticle++; continue; }
  const lv = e.left.size, rv = e.right.size;
  // A fragment of a fixed phrase is pinned on at least one side. Require real
  // variety on BOTH, scaled to how often the gram occurs at all.
  const bound = Math.min(lv, rv);
  if (bound < 3) continue;
  cands.push({
    term: g,
    syllables: e.n,
    count: e.count,
    leftVariety: lv,
    rightVariety: rv,
    inSectionTitles: inTitles(g),
    score: +(Math.log(e.count) * Math.log(bound) * (1 + 0.35 * e.n)).toFixed(2),
  });
}

// Drop a shorter gram when a longer one containing it occurs almost as often —
// then the shorter is just the longer seen through a narrower window.
const byTerm = new Map(cands.map(c => [c.term, c]));
for (const c of cands) {
  for (const d of cands) {
    if (d.term === c.term || d.syllables <= c.syllables) continue;
    if (d.term.includes(c.term) && d.count >= c.count * 0.85) { c.subsumed = true; break; }
  }
}
const kept = cands.filter(c => !c.subsumed).sort((a, b) => b.score - a.score);

console.log(`\ncandidates with count >= ${MIN} and branching variety >= 3 on both sides: ${kept.length}`);
console.log(`  of which appear in a sa-bcad section title: ${kept.filter(c => c.inSectionTitles).length}`);

const show = (list, title, n) => {
  console.log(`\n--- ${title} ---`);
  console.log('  count  syl  L/R variety  in titles  term');
  for (const c of list.slice(0, n))
    console.log(`  ${String(c.count).padStart(5)}  ${c.syllables}    ${String(c.leftVariety).padStart(4)}/${String(c.rightVariety).padEnd(4)}  ${c.inSectionTitles ? '   yes  ' : '        '}   ${c.term}`);
};
show(kept.filter(c => c.inSectionTitles), 'top terms that also head a section (do these first)', 45);
show(kept.filter(c => !c.inSectionTitles), 'top terms elsewhere in the text', 35);

if (WRITE) {
  const dir = path.join(ROOT, 'glossary');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'terms-candidates.json'), JSON.stringify({
    generatedBy: 'tools/34-terms.mjs',
    note: 'Tibetan side only. Vietnamese renderings are decided by a person and recorded in glossary/decisions.md. Ranking is a reading aid, not an authority.',
    minCount: MIN, maxSyllables: MAX_N,
    corpus: { runs: runs.length, syllables: total },
    counts: { candidates: kept.length, inSectionTitles: kept.filter(c => c.inSectionTitles).length },
    candidates: kept,
  }, null, 1), 'utf8');
  console.log(`\nwrote glossary/terms-candidates.json (${kept.length} candidates)`);
} else {
  console.log('\n(dry run — pass --write to save glossary/terms-candidates.json)');
}
