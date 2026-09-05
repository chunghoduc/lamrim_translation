// Phase 5a: the ledger for re-checking every verse block against the Tibetan.
//
//   node tools/42-verse.mjs extract          build/refresh verse-check.json from translation/
//   node tools/42-verse.mjs list             what is checked, what is not, what went stale
//   node tools/42-verse.mjs batch 40         the next N unchecked, as workflow args
//   node tools/42-verse.mjs show v0123       one unit with its Tibetan pages
//   node tools/42-verse.mjs doctor           reconcile the ledger against the files
//
// WHY A LEDGER AT ALL. The instruction is "check it gradually, but it MUST be checked".
// Those two only hold together if partial progress is durable and the remainder is always
// countable. A pass done by reading transcripts cannot say what is left; this can, and it
// survives a machine change the way progress.json does.
//
// WHAT COUNTS AS A UNIT. A verse block: a run of two or more consecutive short lines, in a
// blockquote or not. Not-in-a-blockquote matters - c004's homage stanzas are plain lines,
// and a rule keyed on '>' would have missed the first verse in the book.
//
// TEXT HASH. Each unit stores a hash of its own lines. If the verse is later edited - by the
// prosody pass, or by hand - the unit goes STALE and must be re-checked. Without that, a
// polish pass could silently undo a fidelity check that had already passed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, CLEAN } from './config.mjs';

const LEDGER = path.join(ROOT, 'verse-check.json');
const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'progress.json'), 'utf8'));
const SHORT = 76;   // same threshold tools/36 uses to tell a hand break from a machine wrap

const hash = s => crypto.createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 12);

// Pull every verse block out of one chunk file, with the line number it starts at.
function unitsOf(c) {
  const raw = fs.readFileSync(path.join(ROOT, 'translation', `${c.id}.md`), 'utf8')
    .replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '');
  const lines = raw.split('\n');
  const out = [];
  let run = [], quoted = false, start = 0;
  const flush = () => {
    if (run.length > 1 && run.every(x => [...x].length < SHORT)) {
      out.push({ chunk: c.id, pages: c.pages, quoted, startLine: start, lines: run.slice() });
    }
    run = [];
  };
  lines.forEach((l, i) => {
    const q = /^\s*>/.test(l);
    const body = q ? l.replace(/^\s*>\s?/, '') : l;
    if (!body.trim() || /^\s*[#|]|^\s*[-*+]\s|^\s*\d+[.)]\s/.test(body)) { flush(); return; }
    if (!run.length) { quoted = q; start = i + 1; }
    else if (q !== quoted) { flush(); quoted = q; start = i + 1; }
    run.push(body);
  });
  flush();
  return out;
}

// Order the work by risk, not by id. A pass done gradually will be interrupted, so whatever
// gets done first should be what matters most: the Madhyamaka section, where a plausible
// paraphrase of a root verse is both easiest to produce and worst to leave in; verse in a
// chunk that already carries an uncertainty flag; and long blocks, which hide more.
function risk(u, c) {
  let r = u.lines.length;
  if ((c.sectionPath || '').startsWith('6.2.3.1.11.2.6.2')) r += 40;   // vipaśyanā / Madhyamaka
  if ((c.flags || []).length) r += 10 * Math.min(3, (c.flags || []).length);
  if (c.verify && c.verify.verdict === 'needs-fix') r += 15;
  if (!c.verify) r += 25;                                             // never independently checked
  return r;
}

const cmd = process.argv[2];
const rest = process.argv.slice(3);
const load = () => JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const save = l => fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2) + '\n', 'utf8');

if (cmd === 'extract') {
  const prev = fs.existsSync(LEDGER) ? load() : { units: [] };
  const byKey = new Map(prev.units.map(u => [u.chunk + ':' + u.textHash, u]));
  const units = [];
  let n = 0;
  for (const c of state.chunks) {
    for (const u of unitsOf(c)) {
      const textHash = hash(u.lines.join('\n'));
      const keep = byKey.get(c.id + ':' + textHash);
      units.push({
        id: 'v' + String(++n).padStart(4, '0'),
        chunk: u.chunk, pages: u.pages, quoted: u.quoted, startLine: u.startLine,
        nLines: u.lines.length, textHash,
        risk: risk(u, c),
        // A unit whose text is unchanged keeps whatever verdict it had; anything else is new.
        status: keep ? keep.status : 'pending',
        ...(keep && keep.verify ? { verify: keep.verify } : {}),
      });
    }
  }
  const carried = units.filter(u => u.status !== 'pending').length;
  save({ builtFrom: 'translation/*.md', total: units.length, units });
  console.log(`extracted ${units.length} verse units from ${new Set(units.map(u => u.chunk)).size} chunks`);
  console.log(`carried over ${carried} previous verdict(s); ${units.length - carried} pending`);
} else if (cmd === 'list' || cmd === 'doctor') {
  const l = load();
  const by = s => l.units.filter(u => u.status === s).length;
  console.log(`verse units : ${l.units.length}  (${l.units.reduce((a, u) => a + u.nLines, 0)} lines)`);
  console.log(`  pending   : ${by('pending')}`);
  console.log(`  verified  : ${by('verified')}`);
  console.log(`  flagged   : ${by('flagged')}   (checked, and something is wrong)`);
  // Stale = the verse on disk no longer matches what was checked.
  const stale = [];
  for (const c of state.chunks) {
    const now = new Set(unitsOf(c).map(u => hash(u.lines.join('\n'))));
    for (const u of l.units.filter(x => x.chunk === c.id && x.status !== 'pending'))
      if (!now.has(u.textHash)) stale.push(u.id);
  }
  console.log(`  STALE     : ${stale.length}${stale.length ? '   ' + stale.slice(0, 12).join(' ') : ''}`);
  if (stale.length) console.log('  -> the verse was edited after it was checked; re-run those');
  const pct = (by('verified') / l.units.length * 100).toFixed(1);
  console.log(`\n${pct}% of verse has been re-checked against the Tibetan.`);
} else if (cmd === 'batch') {
  const n = Number(rest[0] || 40);
  const l = load();
  const pick = l.units.filter(u => u.status === 'pending').sort((a, b) => b.risk - a.risk).slice(0, n);
  const byChunk = new Map();
  for (const u of pick) {
    if (!byChunk.has(u.chunk)) byChunk.set(u.chunk, { chunk: u.chunk, pages: u.pages, units: [] });
    byChunk.get(u.chunk).units.push({ id: u.id, startLine: u.startLine, nLines: u.nLines });
  }
  process.stdout.write(JSON.stringify({ verse: [...byChunk.values()] }) + '\n');
} else if (cmd === 'show') {
  const l = load();
  const u = l.units.find(x => x.id === rest[0]);
  if (!u) { console.error('no such unit'); process.exit(1); }
  console.log(JSON.stringify(u, null, 2));
  console.log('\nTibetan pages: ' + Array.from({ length: u.pages[1] - u.pages[0] + 1 },
    (_, i) => `source/clean/p${String(u.pages[0] + i).padStart(4, '0')}.txt`).join(', '));
} else {
  console.error('usage: extract | list | doctor | batch <n> | show <id>');
  process.exit(1);
}
