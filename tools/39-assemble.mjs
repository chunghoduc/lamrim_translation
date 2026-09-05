// Assemble the 292 chunk files into one continuous reading text.
//
//   node tools/39-assemble.mjs --check    report seams and anomalies, write nothing
//   node tools/39-assemble.mjs --write    write lamrim-vi.md
//
// The chunk files carry scaffolding that exists only because the book was translated in
// 292 pieces: a YAML front-matter block per file, and a pair of markers at every cut where
// a sentence runs across the boundary -
//
//     ...sẽ sinh khởi;            <- end of c043
//     *(tiếp sang chunk sau.)*
//     *(…tiếp theo:)* …nỗi khổ    <- start of c044
//
// Those two fragments are ONE sentence. Stripping the markers is not enough: the halves
// must be joined into a single paragraph, or the reader gets a paragraph break in the
// middle of a clause. The leading "…" is part of the marker, not the text.
//
// The pairing is checked, not assumed. Every closing marker must be answered by an opening
// marker on the next chunk and vice versa; a mismatch means a sentence would be silently
// welded to the wrong neighbour or left broken, so it is reported and never guessed at.
// Measured over the corpus: 264 closing markers, 264 opening markers, 27 clean boundaries.
//
// What is deliberately KEPT:
//   - the sa-bcad headings. They are the book's own structure, not chunk scaffolding.
//   - the *(tồn nghi: ...)* notes. Those are the translator's honest uncertainty flags,
//     which this project treats as content: an honest flag is a good outcome, and silently
//     deleting them from the reading text would hide exactly what the reader should know.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.mjs';

const WRITE = process.argv.includes('--write');
if (!WRITE && !process.argv.includes('--check')) {
  console.error('usage: node tools/39-assemble.mjs --check | --write');
  process.exit(1);
}

const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'progress.json'), 'utf8'));
const chunks = state.chunks.slice().sort((a, b) => a.id.localeCompare(b.id));

// "*(tiếp sang chunk sau.)*" / "*(tiếp sang c044.)*" and the one file that words it as
// "*(Câu cuối tiếp tục sang trang sau — xem c005.)*". Missing that variant would have left
// the marker sitting in the finished text.
const CLOSE = /\n*\*\([^)]*(?:tiếp sang|tiếp tục sang)[^)]*\)\*\s*$/;
// "*(…tiếp theo:)* …" / "*(…tiếp theo c114, phần thân của mục "...":)* …". Three chunks
// carry it INSIDE a blockquote ("> *(…tiếp theo:)* …"), because the cut fell in the middle
// of a quoted passage, so the leading "> " has to be tolerated here.
const OPEN = /^(\s*>\s?)?\*\(\s*[….]*\s*tiếp theo[^)]*\)\*\s*[….]*\s*/;

// Join two fragments of one sentence. The join is at LINE level, not paragraph level: a
// newline between them would put a paragraph break inside a clause. When both sides are
// blockquote lines the incoming "> " must go, or the marker of the quote lands mid-sentence.
function weld(prev, next) {
  const p = prev.split('\n');
  const n = next.split('\n');
  let pLast = p[p.length - 1];
  let nFirst = n[0];
  const pQ = /^\s*>/.test(pLast), nQ = /^\s*>/.test(nFirst);
  // Different block kinds are NOT one clause running on. This is the cut falling between a
  // lead-in ("...cũng nói:") and the quotation it introduces; welding them onto one line
  // would drop a "> " into the middle of a sentence. Keep them as separate blocks.
  if (pQ !== nQ) return prev + '\n\n' + next;
  if (pQ && nQ) nFirst = nFirst.replace(/^\s*>\s?/, '');
  nFirst = nFirst.replace(/^\s+/, '');
  // Where the marker sat on its own line the continuation ellipsis survives on the text
  // line, and welding then yields "mong cầu… …thì không có". Drop one ONLY when both sides
  // carry it: a doubled ellipsis is certainly an artifact of the cut, while a single one may
  // be a real elision inside a quotation and is left alone.
  if (/…\s*$/.test(pLast) && /^…/.test(nFirst)) nFirst = nFirst.replace(/^…\s*/, '');
  p[p.length - 1] = pLast.replace(/\s*$/, '') + ' ' + nFirst;
  return p.concat(n.slice(1)).join('\n');
}

const parts = [];
const anomalies = [];
const overlaps = [];

// Longest suffix of `prev` that is also a prefix of `next`, ignoring whitespace and the
// quote markers. Only reported above a length where coincidence is implausible.
function overlap(prev, next) {
  const norm = s => s.replace(/^\s*>\s?/gm, '').replace(/\s+/g, ' ').trim();
  const a = norm(prev), b = norm(next);
  const max = Math.min(a.length, b.length, 300);
  for (let n = max; n >= 25; n--) if (a.slice(-n) === b.slice(0, n)) return b.slice(0, n);
  return null;
}
let joined = 0, clean = 0;
let prevOpen = false;   // did the previous chunk end with a closing marker?

for (let i = 0; i < chunks.length; i++) {
  const c = chunks[i];
  const file = path.join(ROOT, 'translation', `${c.id}.md`);
  if (!fs.existsSync(file)) { anomalies.push(`${c.id}: file missing`); continue; }
  let t = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

  // front matter
  t = t.replace(/^---\n[\s\S]*?\n---\n/, '');
  t = t.trim();

  const hasOpen = OPEN.test(t);
  if (hasOpen) t = t.replace(OPEN, '');
  const hasClose = CLOSE.test(t);
  if (hasClose) t = t.replace(CLOSE, '');
  t = t.trim();

  // Pairing check: a fragment must be answered on both sides, or the join is a guess.
  if (hasOpen && !prevOpen) anomalies.push(`${c.id}: opens as a continuation but ${chunks[i - 1]?.id || '(none)'} did not close as one`);
  if (!hasOpen && prevOpen) anomalies.push(`${c.id}: does not open as a continuation but ${chunks[i - 1]?.id} closed as one`);

  if (hasOpen && prevOpen && parts.length) {
    // A weld can expose a real defect in the translation: where the cut fell, the second
    // chunk sometimes RESTATES the clause instead of continuing it, so joining stutters.
    // Detect the overlap and report it - do not silently drop either copy. Choosing which
    // half to delete is editing the translation, which is not this tool's job.
    const ov = overlap(parts[parts.length - 1], t);
    if (ov) overlaps.push(`${chunks[i - 1].id} -> ${c.id}: repeats ${ov.length} chars — "${ov.slice(0, 70)}"`);
    parts[parts.length - 1] = weld(parts[parts.length - 1], t);
    joined++;
  } else {
    if (parts.length) clean++;
    parts.push(t);
  }
  prevOpen = hasClose;
}
if (prevOpen) anomalies.push('the last chunk closes as a continuation with nothing to follow');

const body = parts.join('\n\n') + '\n';

console.log(`chunks assembled : ${chunks.length}`);
console.log(`seams welded     : ${joined}   (a sentence ran across the cut)`);
console.log(`clean boundaries : ${clean}`);
console.log(`anomalies        : ${anomalies.length}`);
for (const a of anomalies) console.log(`  !! ${a}`);
console.log(`welds that stutter: ${overlaps.length}   (the second chunk restates instead of continuing)`);
for (const o of overlaps) console.log(`  !! ${o}`);
console.log(`output size      : ${(body.length / 1024).toFixed(0)} KB, ${body.split('\n').length} lines`);

// Independent sweep for leftovers. Deliberately keyed on the WORDS, not on the regexes that
// did the stripping - checking a strip with the strip's own pattern proves nothing, and that
// is exactly how the "Câu cuối tiếp tục sang trang sau" variant slipped through the first
// run of this tool.
const leftovers = (body.match(/^.*(tiếp sang|tiếp theo c\d|chunk sau|xem c\d{3}).*$/gm) || []);
console.log(`leftover markers : ${leftovers.length}`);
for (const l of leftovers.slice(0, 5)) console.log(`  !! ${l.trim().slice(0, 110)}`);

// Nothing but scaffolding may be lost. Compare word content before and after.
const raw = chunks.map(c => {
  const f = path.join(ROOT, 'translation', `${c.id}.md`);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '') : '';
}).join('\n');
// Words only. Quote markers and the continuation ellipses are formatting that the assembly
// deliberately changes, so they are normalised away here; anything else that differs means
// text was actually lost or duplicated.
const strip = s => s.replace(OPEN_G, '').replace(CLOSE_G, '')
  .replace(/^\s*>\s?/gm, '').replace(/…/g, '').replace(/\s+/g, ' ').trim();
const OPEN_G = /\*\(\s*[….]*\s*tiếp theo[^)]*\)\*\s*[….]*\s*/g;
const CLOSE_G = /\*\([^)]*(?:tiếp sang|tiếp tục sang)[^)]*\)\*/g;
const before = strip(raw), after = strip(body);
if (before === after) console.log('content check    : OK - identical once markers and whitespace are normalised');
else {
  console.log('content check    : MISMATCH');
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    if (before[i] !== after[i]) { console.log('  first diff at', i, JSON.stringify(before.slice(i - 70, i + 70)), '->', JSON.stringify(after.slice(i - 70, i + 70))); break; }
  }
}

if (WRITE) {
  const out = path.join(ROOT, 'lamrim-vi.md');
  fs.writeFileSync(out, body, 'utf8');
  console.log(`\nwrote ${out}`);
} else {
  console.log('\ncheck only - pass --write to produce lamrim-vi.md');
}
