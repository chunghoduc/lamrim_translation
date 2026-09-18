// A human-readable before/after report for restyled chunks, for reviewing the prose rather than
// reading a git diff.
//
//   node tools/55-restyle-diff.mjs c003 c004 ...      these chunks
//   node tools/55-restyle-diff.mjs --restyled          every chunk in restyle-check.json
//   node tools/55-restyle-diff.mjs --restyled --out review.md
//
// WHY NOT `git diff`. A paragraph in this corpus is one very long line, so git's line diff shows
// the whole paragraph as removed and re-added, and `--word-diff` loses the sentence the words sit
// in. What a reviewer actually needs is: which paragraphs moved, what changed inside each, and
// whether the sentence still reads as one argument. So this pairs the paragraphs, marks the
// changed words inline, and prints nothing for the paragraphs that did not move.
//
// The BEFORE text comes from the last commit that touched translation/, not from HEAD - during a
// restyle HEAD may have moved on for other reasons (a plan edit, a tool fix), and reading HEAD
// would silently compare the text against itself once the batch is committed.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './config.mjs';

const args = process.argv.slice(2);
const outIx = args.indexOf('--out');
const OUT = outIx !== -1 ? args[outIx + 1] : null;

let ids = args.filter(a => /^c\d{3}$/.test(a));
if (args.includes('--restyled')) {
  const L = path.join(ROOT, 'restyle-check.json');
  if (!fs.existsSync(L)) { console.error('no restyle-check.json yet'); process.exit(1); }
  ids = Object.keys(JSON.parse(fs.readFileSync(L, 'utf8')).restyled).sort();
}
if (!ids.length) { console.error('usage: node tools/55-restyle-diff.mjs <c003 ...> | --restyled [--out file.md]'); process.exit(2); }

const git = a => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 128e6 });
// Default base: the last commit that changed anything under translation/, which is the state
// before an UNCOMMITTED batch. Reviewing work that is already committed needs --base <rev>, or the
// default resolves to the restyled state itself and the report says "no paragraph changed".
const baseIx = args.indexOf('--base');
const baseRev = baseIx !== -1
  ? git(['rev-parse', args[baseIx + 1]]).trim()
  : git(['log', '--format=%H', '-1', '--', 'translation/']).trim();
const baseShort = baseRev.slice(0, 7);
const baseSubject = git(['log', '--format=%s', '-1', baseRev]).trim();

const strip = t => t.replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '');
const paras = t => strip(t).split('\n').map(l => l.trimEnd()).filter(l => l.trim());

// --- word-level diff, LCS ---------------------------------------------------
// Tokenised on whitespace, keeping punctuation attached: "bỏ;" and "bỏ." are different tokens,
// which is the point - re-punctuation is most of what a restyle does and it must be visible.
function lcs(a, b) {
  const n = a.length, m = b.length;
  // Row-by-row is enough: these are single paragraphs, a few hundred tokens at most.
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push(['=', a[i]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(['-', a[i]]); i++; }
    else { out.push(['+', b[j]]); j++; }
  }
  while (i < n) out.push(['-', a[i++]]);
  while (j < m) out.push(['+', b[j++]]);
  return out;
}

function inlineDiff(before, after) {
  const ops = lcs(before.split(/\s+/), after.split(/\s+/));
  let s = '', mode = '';
  const close = () => { if (mode === '-') s += '~~'; else if (mode === '+') s += '**'; mode = ''; };
  for (const [op, w] of ops) {
    if (op === '=') { close(); s += w + ' '; continue; }
    if (op !== mode) { close(); s += op === '-' ? '~~' : '**'; mode = op; }
    s += w + ' ';
  }
  close();
  return s.replace(/\s+/g, ' ').trim();
}

// Pair paragraphs by position, but tolerate a restyle that split one paragraph in two: match on
// the first six words, which no edit in scope is allowed to change.
const key = p => p.split(/\s+/).slice(0, 6).join(' ').toLowerCase();

const lines = [];
const say = s => lines.push(s);

say(`# Restyle review\n`);
say(`Before: \`${baseShort}\` — ${baseSubject}`);
say(`After: the working tree as it stands now.\n`);
say(`Marking: ~~struck~~ is text that was removed, **bold** is text that was added. A paragraph`);
say(`with no change is not shown.\n`);

for (const id of ids) {
  let beforeText;
  try { beforeText = git(['show', `${baseRev}:translation/${id}.md`]); }
  catch { say(`\n## ${id}\n\n_not present in ${baseShort} — new file, nothing to compare._\n`); continue; }
  const afterText = fs.readFileSync(path.join(ROOT, 'translation', `${id}.md`), 'utf8');

  const A = paras(beforeText), B = paras(afterText);
  const bByKey = new Map();
  for (const p of B) { const k = key(p); if (!bByKey.has(k)) bByKey.set(k, []); bByKey.get(k).push(p); }

  const changed = [];
  for (const p of A) {
    const cand = bByKey.get(key(p));
    const match = cand && cand.length ? cand.shift() : null;
    if (match === null) { changed.push([p, '(no counterpart found — check by hand)']); continue; }
    if (match !== p) changed.push([p, match]);
  }

  say(`\n## ${id}\n`);
  if (!changed.length) { say(`_No paragraph changed._\n`); continue; }
  say(`${changed.length} paragraph(s) changed, of ${A.length}.\n`);
  changed.forEach(([b, a], i) => {
    say(`### ${id} · paragraph ${i + 1}\n`);
    say(inlineDiff(b, a) + '\n');
  });
}

const md = lines.join('\n') + '\n';
if (OUT) { fs.writeFileSync(path.join(ROOT, OUT), md, 'utf8'); console.log(`wrote ${OUT} (${(md.length / 1024).toFixed(0)} KB)`); }
else process.stdout.write(md);
