// Phase 5c: the ledger and the worklist for the prose restyle (STYLE.md, RESTYLE-PLAN.md).
//
//   node tools/52-style-lint.mjs report            every chunk, worst first
//   node tools/52-style-lint.mjs show c123         one chunk: what is wrong and where
//   node tools/52-style-lint.mjs batch 10          the next N pending, as workflow args
//   node tools/52-style-lint.mjs done c123 [...]   record chunks a merge has restyled
//   node tools/52-style-lint.mjs doctor            reconcile the ledger against the files
//
// WHY A LEDGER AND NOT JUST A LINT. The restyle is a second full pass over 292 chunks. Like
// the verse pass and the page pass before it, it only holds together if partial progress is
// durable and the remainder is always countable - "how much is left" must be answerable after
// a machine change, not from a transcript. So each chunk carries the outputHash it was
// restyled at: edit the file afterwards and the chunk re-opens, exactly as tools/32 does for
// the Tibetan and tools/42 does for verse.
//
// WHAT IT MEASURES, AND WHAT IT DELIBERATELY DOES NOT. Sentence length, `ấy` density,
// semicolon load and straight quotes - the four traits STYLE.md §3 found adoptable. It does
// NOT measure the things §4 rules out of scope: it never counts `[...]` brackets against a
// chunk (they are the fidelity audit trail, not clutter) and it never looks at terminology.
// A linter that scored those would push agents toward exactly the edits that are forbidden.
//
// VERSE IS EXCLUDED FROM EVERY PROSE METRIC. Verse has its own pass with its own constraints
// (tools/42-verse.mjs, 842 units). A stanza is a run of short lines and would otherwise read
// as a cluster of tiny sentences, flattering every chunk that contains one.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './config.mjs';

const LEDGER = path.join(ROOT, 'restyle-check.json');
const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'progress.json'), 'utf8'));
const chunks = state.chunks.filter(c => c.status === 'translated' || c.status === 'reviewed');
const SHORT = 76;   // same threshold tools/36 and tools/42 use to tell a hand break from a wrap

const hash = s => crypto.createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 12);
const fileOf = id => path.join(ROOT, 'translation', `${id}.md`);
const raw = id => fs.readFileSync(fileOf(id), 'utf8').replace(/\r\n/g, '\n');

// --- what counts as prose ---------------------------------------------------
// Drop front matter, headings, list items, rules, and every verse block. Returns one string
// per PARAGRAPH, and the paragraphs are never joined: this corpus does not hard-wrap, so one
// line is one paragraph, and a sentence can no more run across two of them than across a
// heading. Joining them first made "Bởi vì trong *X* có nói:" merge with the passage it
// introduces and reported a 296-word sentence where the longest was 172.
function proseOf(id) {
  const lines = raw(id).replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
  const keep = [];
  let run = [];
  const flushRun = () => {
    // 2+ consecutive short lines = verse, drop it. A single short line is a short paragraph.
    if (run.length === 1) keep.push(run[0]);
    run = [];
  };
  for (const l of lines) {
    const t = l.replace(/^\s*>\s?/, '');
    if (/^\s*(#|-\s|\*\s|\d+\.\s|---\s*$|\|)/.test(t) || !t.trim()) { flushRun(); continue; }
    if ([...t.trimEnd()].length < SHORT) { run.push(t); continue; }
    flushRun();
    keep.push(t);
  }
  flushRun();
  return keep;
}

// --- the metrics ------------------------------------------------------------
const AY = /(?<!\p{L})ấy(?!\p{L})/gu;
const count = (s, re) => (s.match(re) || []).length;

// `v.v.` is a real abbreviation in this corpus (3.81 per 1000 words) and splitting on its dots
// would halve every sentence it appears in. The placeholder is put back before anything is
// measured or printed, so it never reaches the reader or the word count.
// ...EXCEPT when it ends the sentence, which "khuôn mặt v.v. Vì thế, ..." does. Protecting every
// `v.v.` made the linter fuse two sentences of ~20 and ~66 words into one 86-word unit and report
// it as needing a split - found by a restyle agent in the Step 3 pilot, which flagged the unit as
// a measurement artifact rather than trying to split a sentence that was not there. The lookahead
// leaves a `v.v.` followed by whitespace and a capital as the boundary it is.
const SAFE = 'v․v․';                       // U+2024 ONE DOT LEADER, not a full stop
function sentencesOf(paras) {
  // A closing quote may sit BETWEEN the full stop and the space - `...cả.” Vì thế` - because
  // tools/54 moves the period inside the quotation, which is the reference edition's convention.
  // Splitting on /[.!?]+\s+/ alone misses all 176 of those, fusing the sentences on either side:
  // it made the corpus look as though restyling three chunks had pushed the longest sentence from
  // 237 words to 290. The optional closer is not cosmetic - it is the difference between measuring
  // the prose and measuring the punctuation.
  return paras.flatMap(p => p.replace(/v\.v\.(?!\s+\p{Lu})/gu, SAFE).split(/[.!?]+[”’"']?\s+/))
    .map(s => s.replace(new RegExp(SAFE, 'g'), 'v.v.').trim())
    .filter(s => s.length > 1);
}

function metricsOf(id) {
  const paras = proseOf(id);
  const prose = paras.join('\n');
  const words = prose.split(/\s+/).filter(Boolean).length;
  const sents = sentencesOf(paras);
  const lens = sents.map(s => s.split(/\s+/).filter(Boolean).length).sort((a, b) => a - b);
  const per1k = n => words ? +(n / (words / 1000)).toFixed(1) : 0;

  // Verse lines inside a blockquote need a hard break or a stanza collapses into one
  // paragraph in any renderer but ours. Counted on the whole file, not on `prose`.
  const body = raw(id).split('\n');
  let noBreak = 0, qrun = [];
  const flushQ = () => {
    if (qrun.length > 1 && qrun.every(x => [...x.replace(/^\s*>\s?/, '').trimEnd()].length < SHORT)) {
      noBreak += qrun.filter((x, i) => i < qrun.length - 1 && !/ {2}$/.test(x)).length;
    }
    qrun = [];
  };
  for (const l of body) { if (/^\s*>/.test(l) && l.replace(/^\s*>\s?/, '').trim()) qrun.push(l); else flushQ(); }
  flushQ();

  return {
    words,
    sents: sents.length,
    med: lens.length ? lens[Math.floor(lens.length / 2)] : 0,
    p90: lens.length ? lens[Math.floor(lens.length * 0.9)] : 0,
    max: lens.length ? lens[lens.length - 1] : 0,
    long: lens.filter(n => n > 80).length,
    vlong: lens.filter(n => n > 120).length,
    ay: count(prose, AY),
    ayPer1k: per1k(count(prose, AY)),
    semiPer1k: per1k(count(prose, /;/g)),
    // On the PROSE, not the raw file: the YAML front matter double-quotes `section` and
    // `sectionPath`, so counting the raw file scored 1160 front-matter quotes as a style defect
    // corpus-wide while the body held 2.
    straightQuotes: count(prose, /"/g),
    verseNoBreak: noBreak,
  };
}

// Rank by the work a chunk actually needs, not by how bad it reads per word: a long chunk
// with twelve 100-word sentences needs twelve splits and must come before a short one with
// two, even if the short one's rates are worse. Rates only break ties.
const burden = m => m.long * 10 + m.vlong * 20 + m.ay + m.verseNoBreak;

// --- the ledger -------------------------------------------------------------
const load = () => fs.existsSync(LEDGER)
  ? JSON.parse(fs.readFileSync(LEDGER, 'utf8'))
  : { generatedBy: 'tools/52-style-lint.mjs', note: 'see RESTYLE-PLAN.md; a chunk re-opens if its file changes after being restyled', restyled: {} };
const save = l => fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2) + '\n', 'utf8');

// A chunk is done only while the file is still the one that was restyled.
function statusOf(id, ledger) {
  const rec = ledger.restyled[id];
  if (!rec) return 'pending';
  return rec.outputHash === hash(raw(id)) ? 'done' : 'STALE';
}

const rows = () => {
  const ledger = load();
  return chunks.map(c => {
    const m = metricsOf(c.id);
    return { id: c.id, pages: c.pages, status: statusOf(c.id, ledger), m, burden: burden(m) };
  });
};

// --- commands ---------------------------------------------------------------
const cmd = process.argv[2] || 'report';
const rest = process.argv.slice(3);

if (cmd === 'report') {
  const all = rows().sort((a, b) => b.burden - a.burden || b.m.ayPer1k - a.m.ayPer1k);
  const n = s => all.filter(r => r.status === s).length;
  console.log(`chunks          : ${all.length}`);
  console.log(`  pending       : ${n('pending')}`);
  console.log(`  restyled      : ${n('done')}`);
  console.log(`  STALE         : ${n('STALE')}   (restyled, then edited - re-check)`);
  const t = all.reduce((a, r) => ({
    long: a.long + r.m.long, vlong: a.vlong + r.m.vlong, ay: a.ay + r.m.ay,
    sq: a.sq + r.m.straightQuotes, nb: a.nb + r.m.verseNoBreak,
  }), { long: 0, vlong: 0, ay: 0, sq: 0, nb: 0 });
  console.log(`\ncorpus totals   : ${t.long} sentences over 80 words (${t.vlong} over 120)`);
  console.log(`                  ${t.ay} x "ấy", ${t.sq} straight quotes, ${t.nb} verse lines missing a hard break`);
  console.log(`\n${'chunk'.padEnd(6)}${'st'.padEnd(4)}${'>80'.padStart(5)}${'>120'.padStart(6)}${'med'.padStart(5)}${'p90'.padStart(5)}${'max'.padStart(6)}${'ấy/1k'.padStart(7)}${';/1k'.padStart(6)}${'"'.padStart(5)}${'vb'.padStart(4)}`);
  const show = rest.includes('--all') ? all : all.slice(0, 30);
  for (const r of show) {
    console.log(r.id.padEnd(6) + (r.status === 'pending' ? '·' : r.status === 'done' ? '✓' : '!').padEnd(4) +
      String(r.m.long).padStart(5) + String(r.m.vlong).padStart(6) + String(r.m.med).padStart(5) +
      String(r.m.p90).padStart(5) + String(r.m.max).padStart(6) + String(r.m.ayPer1k).padStart(7) +
      String(r.m.semiPer1k).padStart(6) + String(r.m.straightQuotes).padStart(5) + String(r.m.verseNoBreak).padStart(4));
  }
  if (!rest.includes('--all')) console.log(`... ${all.length - show.length} more (--all to list every chunk)`);
} else if (cmd === 'show') {
  const id = rest[0];
  if (!id) { console.error('usage: show <chunkId>'); process.exit(1); }
  const m = metricsOf(id);
  console.log(`${id}  status ${statusOf(id, load())}`);
  console.log(JSON.stringify(m, null, 2));
  const sents = sentencesOf(proseOf(id))
    .map(s => ({ s, n: s.split(/\s+/).filter(Boolean).length }))
    .filter(x => x.n > 80).sort((a, b) => b.n - a.n);
  console.log(`\n${sents.length} sentence(s) over 80 words:`);
  for (const x of sents) console.log(`\n--- ${x.n} words ---\n${x.s}`);
} else if (cmd === 'batch') {
  // Emitted under `chunks`, with the same fields tools/32 emits, so
  // `37-chunk-glossary.mjs --batch` works on this file unchanged - it reads `b.chunks`.
  // `lint` is the extra: it tells each agent what its own chunk was flagged for.
  const n = Number(rest[0] || 10);
  const picked = rows()
    .filter(r => r.status !== 'done')
    .sort((a, b) => b.burden - a.burden || b.m.ayPer1k - a.m.ayPer1k)
    .slice(0, n)
    .map(r => {
      const c = chunks.find(x => x.id === r.id);
      return {
        id: r.id, kind: c.kind, pages: c.pages, section: c.section,
        sectionPath: c.sectionPath, part: c.part, lint: r.m,
      };
    });
  process.stdout.write(JSON.stringify({ chunks: picked }) + '\n');
} else if (cmd === 'done') {
  // Called by the merge, never by a restyling agent: the same rule as tools/32-chunk.mjs done.
  if (!rest.length) { console.error('usage: done <chunkId ...>'); process.exit(1); }
  const l = load();
  for (const id of rest) {
    if (!fs.existsSync(fileOf(id))) { console.log(`  !! ${id}: no translation file`); continue; }
    l.restyled[id] = { at: new Date().toISOString().slice(0, 10), outputHash: hash(raw(id)), metrics: metricsOf(id) };
    console.log(`  restyled ${id}`);
  }
  save(l);
} else if (cmd === 'doctor') {
  const all = rows();
  const stale = all.filter(r => r.status === 'STALE');
  const ghosts = Object.keys(load().restyled).filter(id => !chunks.some(c => c.id === id));
  console.log(`ledger entries : ${Object.keys(load().restyled).length}`);
  console.log(`STALE          : ${stale.length}${stale.length ? '   ' + stale.map(r => r.id).join(' ') : ''}`);
  console.log(`not a chunk    : ${ghosts.length}${ghosts.length ? '   ' + ghosts.join(' ') : ''}`);
  if (!stale.length && !ghosts.length) console.log('\nconsistent: every restyled chunk is still the file that was restyled.');
} else {
  console.error('usage: report [--all] | show <chunkId> | batch <n> | done <chunkId ...> | doctor');
  process.exit(1);
}
