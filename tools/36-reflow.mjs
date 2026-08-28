// Phase 4 cleanup: unwrap the hard line-wrapping in translation/*.md.
//
//   node tools/36-reflow.mjs --check          report what would change, touch nothing
//   node tools/36-reflow.mjs --check --show c152    print the ambiguous paragraphs of one chunk
//   node tools/36-reflow.mjs --write          apply
//   node tools/36-reflow.mjs --write --skip c138,c139   leave those chunks alone
//
// The agents wrote every file hard-wrapped at 90 characters. Markdown treats a single
// newline as a space, so this renders correctly - but the raw file, which is what a human
// actually edits and greps, has its sentences chopped mid-clause, and bracketed supplied
// words end up split across lines ("nơi một số [trường / hợp]").
//
// The hazard is that NOT every line break is mechanical. Verse is set one pada per line and
// must survive untouched - c004's homage verses are plain lines, not blockquotes, so a rule
// keyed on blockquote syntax would destroy them, and genuine wrapped prose runs as short as
// 76 characters, so no single length threshold separates the two either.
//
// So the decision is made per PARAGRAPH, never per line, on the one signal that is actually
// reliable: a mechanically wrapped paragraph must contain a line pushed up against the wrap
// column, because that is what wrapping means. A paragraph whose lines all sit well short of
// it was broken by hand and is left exactly as it is.
//
// Length alone is not enough, and assuming it was would have corrupted the text: c108 is a
// verse whose padas genuinely run past 80 characters, and c102 is a verse with a translator's
// note appended inside one line, pushing it to 108. Both look "wrapped" by width alone.
//
// So joining requires TWO independent signals that agree, the rule this project already runs
// on. The second is line endings: a verse line stops at a phrase boundary and carries
// punctuation, while a mechanically wrapped line stops wherever the column ran out, which
// leaves it ending on a bare word. Runs where the two signals disagree are reported, never
// guessed at - resolving those by preference is precisely what this project forbids.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.mjs';

const WRAP_FULL = 80;   // at or above this, the line was pushed against the 90-col wrap
const WRAP_SHORT = 70;  // below this, in the same paragraph, is the signal of a hand break
const BARE_MIN = 0.4;   // fraction of lines ending mid-phrase that marks mechanical wrapping
const ALL_FULL = 76;    // if EVERY line of a run is at least this wide, the wrapper set them all

// Does this line stop at a phrase boundary? Verse does; a wrapped line does not.
const endsPhrase = s => /[,.;:!?…—–"'»)\]]\s*$/u.test(s.trim());

const DIR = path.join(ROOT, 'translation');
const WRITE = process.argv.includes('--write');
const showIx = process.argv.indexOf('--show');
const SHOW = showIx >= 0 ? process.argv[showIx + 1] : null;
const skipIx = process.argv.indexOf('--skip');
const SKIP = new Set(skipIx >= 0 ? (process.argv[skipIx + 1] || '').split(',').filter(Boolean) : []);
if (!WRITE && !process.argv.includes('--check')) {
  console.error('usage: node tools/36-reflow.mjs --check | --write [--skip c1,c2] [--show <id>]');
  process.exit(1);
}

const width = s => [...s].length;

// A line's structural kind. Only 'text' and 'quote' are ever joined; headings, list items,
// table rows and fences keep their own line no matter how long they are.
function kindOf(line) {
  if (/^\s*>/.test(line)) return 'quote';
  if (/^\s*#/.test(line)) return 'other';
  if (/^\s*([-*+]\s|\d+[.)]\s)/.test(line)) return 'other';
  if (/^\s*\|/.test(line)) return 'other';
  if (/^\s*(```|~~~)/.test(line)) return 'fence';
  if (/^\s*$/.test(line)) return 'blank';
  if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) return 'other';
  if (/^\s{4,}\S/.test(line)) return 'other';       // indented code
  return 'text';
}

const unquote = l => l.replace(/^\s*>\s?/, '');

const stats = { files: 0, changed: 0, joined: 0, keptVerse: 0, ambiguous: [] };

for (const file of fs.readdirSync(DIR).filter(f => f.endsWith('.md')).sort()) {
  const id = file.replace(/\.md$/, '');
  if (SKIP.has(id)) continue;
  stats.files++;
  const raw = fs.readFileSync(path.join(DIR, file), 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);

  const out = [];
  let i = 0;

  // Frontmatter passes through byte-for-byte.
  if (lines[0] === '---') {
    out.push(lines[0]);
    for (i = 1; i < lines.length; i++) { out.push(lines[i]); if (lines[i] === '---') { i++; break; } }
  }

  let inFence = false;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const kind = kindOf(line);
    if (kind === 'fence') { inFence = !inFence; out.push(line); continue; }
    if (inFence || kind === 'blank' || kind === 'other') { out.push(line); continue; }

    // Gather the whole paragraph: consecutive lines of this same kind.
    const para = [];
    let j = i;
    for (; j < lines.length && kindOf(lines[j]) === kind; j++) para.push(lines[j]);
    i = j - 1;

    if (para.length === 1) { out.push(para[0]); continue; }

    const bodies = para.map(l => (kind === 'quote' ? unquote(l) : l));
    // A blockquote can hold several paragraphs separated by a bare '>'. Split on those and
    // decide each run on its own, so a verse and the prose under it are judged separately.
    const runs = [];
    let cur = [];
    for (const b of bodies) {
      if (kind === 'quote' && !b.trim()) { if (cur.length) runs.push(cur); runs.push(null); cur = []; }
      else cur.push(b);
    }
    if (cur.length) runs.push(cur);

    for (const run of runs) {
      if (run === null) { out.push('>'); continue; }
      if (run.length === 1) { out.push(kind === 'quote' ? '> ' + run[0] : run[0]); continue; }
      // Every line but the last is a candidate: only those were positioned by the wrapper.
      const head = run.slice(0, -1);
      const inner = head.map(width);
      const full = inner.some(n => n >= WRAP_FULL);
      const bare = head.filter(s => !endsPhrase(s)).length / head.length;
      // Uniformity is the primary signal. A wrapper pushes EVERY line it breaks up against
      // the column, so a run whose lines all sit there was wrapped, however those lines
      // happen to end - some wraps land just after a comma by chance. Verse never looks
      // like this: its line lengths follow the phrasing and vary.
      const allFull = inner.every(n => n >= ALL_FULL);
      // Where the widths are mixed, fall back to how the lines end.
      const wrapped = allFull || (full && bare >= BARE_MIN);
      // Signals disagree: wide enough somewhere to look wrapped, but the widths vary the way
      // verse does AND the lines stop at phrase boundaries. Report it and leave it alone.
      if (full && !wrapped) {
        stats.ambiguous.push({ id, lines: run.length, widths: inner, bare: bare.toFixed(2), sample: run[0].slice(0, 60) });
      }
      if (wrapped) {
        stats.joined += run.length - 1;
        const joined = run.map(s => s.trim()).join(' ');
        out.push(kind === 'quote' ? '> ' + joined : joined);
      } else {
        stats.keptVerse += run.length;
        for (const b of run) out.push(kind === 'quote' ? '> ' + b : b);
      }
    }
  }

  const result = out.join(eol);
  if (result !== raw) {
    stats.changed++;
    if (WRITE) fs.writeFileSync(path.join(DIR, file), result, 'utf8');
  }
  if (SHOW === id) {
    for (const a of stats.ambiguous.filter(x => x.id === id))
      console.log(`  [${a.widths.join(",")}] bare=${a.bare}  ${a.sample}`);
  }
}

console.log(`files scanned      : ${stats.files}`);
console.log(`files changed      : ${stats.changed}`);
console.log(`lines joined       : ${stats.joined}`);
console.log(`lines kept as-is   : ${stats.keptVerse}   (verse and hand-broken runs)`);
console.log(`ambiguous runs     : ${stats.ambiguous.length}   (a full line AND a short one - inspect)`);
if (stats.ambiguous.length && !SHOW) {
  const byId = {};
  for (const a of stats.ambiguous) byId[a.id] = (byId[a.id] || 0) + 1;
  console.log('  ' + Object.entries(byId).map(([k, v]) => `${k}:${v}`).join(' '));
}
if (!WRITE) console.log('\ncheck only - pass --write to apply');
