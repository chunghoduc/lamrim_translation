// Phase 2, final step: turn the sa-bcad outline into the translation chunk list.
//
//   node tools/33-make-chunks.mjs            dry run — print what would be created
//   node tools/33-make-chunks.mjs --write    write the chunks into progress.json
//
// Chunks break on SECTION boundaries rather than on a page count (PLAN.md 4), so a
// chunk normally begins exactly where a printed sa-bcad heading begins.
//
// One exception, and it is deliberate: some leaf sections run to 30 pages, which is
// far too much to translate as a unit. Those are divided into near-equal parts, each
// labelled `part: "2/8"` with `startsAtHeading: false`, so it is always visible when
// a chunk boundary is ours rather than the book's. Chunks never span a section start.
//
// Existing chunk state is never silently discarded: if progress.json already has
// chunks with recorded progress, --write refuses unless --force is given.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './config.mjs';

const WRITE = process.argv.includes('--write');
const FORCE = process.argv.includes('--force');
const TARGET = 4;        // pages per chunk, aimed at
const MAX = 5;           // hard ceiling on a chunk

const outlinePath = path.join(ROOT, 'source', 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error('source/outline.json is missing — run node tools/31-outline.mjs first');
  process.exit(1);
}
const outline = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));
if (outline.problems?.length) {
  console.error(`outline.json records ${outline.problems.length} unresolved problem(s); fix those before chunking`);
  process.exit(1);
}

const LAST_PAGE = outline.pages;
const body = outline.sections.filter(s => !s.frontMatter && s.pdfPage !== null).sort((a, b) => a.pdfPage - b.pdfPage);
if (!body.length) { console.error('no body sections in the outline'); process.exit(1); }
const frontSections = outline.sections.filter(s => s.frontMatter && s.pdfPage !== null).sort((a, b) => a.pdfPage - b.pdfPage);

// The whole book gets chunked. Three kinds of material, because they are not the
// same job, and one of them is easy to lose:
//
//   front    pdf 1..(first contents page - 1)  title pages, publisher data,
//            the brief introduction, the editor's explanation of the edition.
//   contents the dkar chag itself. NOT translated as prose — it is regenerated
//            from the translated section titles at assembly, or it would drift
//            from the very headings it indexes.
//   preamble the pages between the contents and the FIRST sa-bcad heading. This is
//            root text — Namo Guru Manjughosaya and the homage verses — and it has
//            no heading of its own, so chunking that began at the first heading
//            would silently drop it.
//   body     the 282 sa-bcad sections.
const CONTENTS_FROM = outline.contentsPages[0], CONTENTS_TO = outline.contentsPages[1];
const BODY_FROM = body[0].pdfPage;
const segments = [];
if (CONTENTS_FROM > 1) segments.push({ kind: 'front', from: 1, to: CONTENTS_FROM - 1 });
if (BODY_FROM > CONTENTS_TO + 1) segments.push({ kind: 'preamble', from: CONTENTS_TO + 1, to: BODY_FROM - 1 });
segments.push({ kind: 'body', from: BODY_FROM, to: LAST_PAGE });

console.log(`outline: ${outline.sections.length} sections; body starts at pdf p${BODY_FROM}`);
for (const s of segments) console.log(`   ${s.kind.padEnd(9)} pdf ${s.from}-${s.to}  (${s.to - s.from + 1} pages)`);
console.log(`   contents  pdf ${CONTENTS_FROM}-${CONTENTS_TO}  (${CONTENTS_TO - CONTENTS_FROM + 1} pages) — regenerated at assembly, not translated as prose\n`);

const chunks = [];
for (const seg of segments) {
  // Start pages a chunk may begin on. For the body these are the sa-bcad headings;
  // for front matter, the two headed pieces; for the preamble there is nothing to
  // go on, so the segment starts where it starts.
  const secs = seg.kind === 'body' ? body : seg.kind === 'front' ? frontSections : [];
  const starts = [seg.from];
  for (const s of secs) if (s.pdfPage > starts.at(-1) && s.pdfPage >= seg.from && s.pdfPage <= seg.to) starts.push(s.pdfPage);

  const spans = starts.map((from, k) => ({ from, to: (k + 1 < starts.length ? starts[k + 1] - 1 : seg.to) }));

  // Merge consecutive short spans, so a run of one-page sections becomes one chunk.
  // Only in the body: the front matter's three pieces (title/publisher data, the
  // introduction, the editor's explanation) are unrelated to each other, and merging
  // them would file the title pages under the introduction's heading.
  const merged = [];
  for (const s of spans) {
    const last = merged.at(-1);
    if (seg.kind === 'body' && last && (s.to - last.from + 1) <= MAX) last.to = s.to;
    else merged.push({ ...s });
  }

  // a single section longer than MAX has to be divided somewhere: split it into
  // near-equal parts and label them, so it is visible that the break is ours and
  // not a section boundary. Everything else still starts exactly on a heading.
  for (const m of merged) {
    const len = m.to - m.from + 1;
    const parts = Math.max(1, Math.ceil(len / TARGET));
    const size = Math.ceil(len / parts);
    for (let k = 0; k < parts; k++) {
      const from = m.from + k * size;
      if (from > m.to) break;
      const to = Math.min(m.to, from + size - 1);
      const covered = secs.filter(s => s.pdfPage >= from && s.pdfPage <= to);
      const owner = covered.length ? covered.reduce((a, b) => (b.level < a.level ? b : a), covered[0])
        : secs.filter(s => s.pdfPage <= from).at(-1);
      // Where the book prints no heading, the label is editorial, not a title from
      // the source — marked with [] so it is never mistaken for one.
      const editorial = !owner;
      chunks.push({
        id: `c${String(chunks.length + 1).padStart(3, '0')}`,
        kind: seg.kind,
        section: owner ? owner.title : `[${seg.kind === 'preamble'
          ? 'root text: opening homage and pledge to compose, before the first sa-bcad heading'
          : 'front matter: title pages and publisher data'}]`,
        editorialLabel: editorial,
        sectionPath: owner ? owner.path : null,
        sectionIds: covered.map(s => s.id),
        part: parts > 1 ? `${k + 1}/${parts}` : null,
        startsAtHeading: k === 0 && !editorial,
        pages: [from, to],
        // Front matter is foliated in roman numerals, so the arabic folio offset
        // does not apply to it — better no number than a negative one.
        printedPages: seg.kind === 'front' ? null : [from - outline.folioOffset, to - outline.folioOffset],
        status: 'pending',
        flags: [],
      });
    }
  }
}

const span = c => c.pages[1] - c.pages[0] + 1;
const hist = new Map();
for (const c of chunks) hist.set(span(c), (hist.get(span(c)) || 0) + 1);
console.log(`${chunks.length} chunks covering pdf p${chunks[0].pages[0]}-${chunks.at(-1).pages[1]}`);
console.log(`pages per chunk: ${[...hist].sort((a, b) => a[0] - b[0]).map(([p, n]) => `${p}p x${n}`).join('  ')}`);
const big = chunks.filter(c => span(c) > MAX);
if (big.length) {
  console.log(`\n${big.length} chunk(s) exceed ${MAX} pages because a single section is that long:`);
  for (const c of big) console.log(`   ${c.id}  ${span(c)}p  ${c.section}`);
}

// Continuity: every page of the book must be in exactly one chunk, except the
// contents pages, which are deliberately excluded. Anything else is a dropped page.
const seen = new Map();
for (const c of chunks)
  for (let p = c.pages[0]; p <= c.pages[1]; p++) seen.set(p, (seen.get(p) || 0) + 1);
const dup = [...seen].filter(([, n]) => n > 1).map(([p]) => p);
const missing = [];
for (let p = 1; p <= LAST_PAGE; p++)
  if (!seen.has(p) && !(p >= CONTENTS_FROM && p <= CONTENTS_TO)) missing.push(p);

console.log(`\ncoverage: ${seen.size} of ${LAST_PAGE} pages chunked; ${CONTENTS_TO - CONTENTS_FROM + 1} contents pages excluded by design`);
if (dup.length) console.error(`  !! ${dup.length} page(s) appear in more than one chunk: ${dup.slice(0, 10).join(',')}`);
if (missing.length) console.error(`  !! ${missing.length} page(s) are in NO chunk: ${missing.slice(0, 20).join(',')}`);
if (!dup.length && !missing.length) console.log('every page outside the contents is in exactly one chunk');
const allCovered = body.every(s => chunks.some(c => s.pdfPage >= c.pages[0] && s.pdfPage <= c.pages[1]));
console.log(`every sa-bcad section falls inside a chunk: ${allCovered ? 'yes' : 'NO'}`);
if (dup.length || missing.length || !allCovered) process.exit(1);

console.log('\nfirst 8:');
for (const c of chunks.slice(0, 8))
  console.log(`  ${c.id}  ${c.kind.padEnd(8)} pdf ${String(c.pages[0]).padStart(3)}-${String(c.pages[1]).padStart(3)}${c.printedPages ? ` (printed ${c.printedPages[0]}-${c.printedPages[1]})` : ""}  ${c.section}`);

if (!WRITE) { console.log('\ndry run — pass --write to record these in progress.json'); process.exit(0); }

const statePath = path.join(ROOT, 'progress.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const done = (state.chunks || []).filter(c => c.status && c.status !== 'pending');
if (done.length && !FORCE) {
  console.error(`\nprogress.json already has ${done.length} chunk(s) with recorded progress — refusing to overwrite. Re-run with --force if that is really what you want.`);
  process.exit(1);
}
state.chunks = chunks;
fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
execFileSync(process.execPath, [path.join(ROOT, 'tools', '30-progress.mjs')], { cwd: ROOT, stdio: 'inherit' });
console.log(`\nwrote ${chunks.length} chunks into progress.json`);
