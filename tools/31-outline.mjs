// Phase 2: build the sa-bcad outline — the book's structural spine.
//
//   node tools/31-outline.mjs            build, verify, write source/outline.json
//   node tools/31-outline.mjs --print    also print the tree
//
// The outline comes from TWO independent sources that are cross-checked against
// each other, because it decides the chapter structure of the whole translation:
//
//   1. the book's own contents (dkar chag, the Sarchung@9 pages) — gives the
//      TITLE, the NESTING DEPTH (via indentation) and the PRINTED page number;
//   2. the section headings printed in the body (Sarchen@12) — gives the PDF
//      page where the section actually starts.
//
// Neither alone is enough: the contents has depth but only printed page numbers,
// the headings have exact positions but no depth. Requiring them to agree is also
// what caught CIDs 524 and 502 (see tools/secondary-repair-table.mjs) — the same
// title typeset in two different fonts, disagreeing on a subjoined letter.
import fs from 'node:fs';
import path from 'node:path';
import { decode, keep, LINE_TOL, BODY_Y_MIN } from './decode.mjs';
import { RAW, ROOT, QA } from './config.mjs';

const PRINT = process.argv.includes('--print');
const HEADING_SIZE = 12;          // sa-bcad headings; body text is 14
const SARCHEN = 'DTREBQ+Qomolangma-Uchen-Sarchen';
const SARCHUNG = 'DTREBQ+Qomolangma-Uchen-Sarchung';
const NUMERAL_RE = /TCRCYoutso|TCRCBod-Yig/;
const ROMAN_RE = /TimesNewRoman/;
// Folios sit at y=36/40. The contents' own page numbers use the SAME font but sit
// at y~54 when they wrap below the last entry, so the band, not the font, separates
// them — the mirror image of the folio bug in FINDINGS 8.4.
const FOLIO_Y_MAX = 45;

const pageFile = p => path.join(RAW, 'glyphs', `p${String(p).padStart(4, '0')}.json`);
const readPage = p => JSON.parse(fs.readFileSync(pageFile(p), 'utf8'));
const PAGES = fs.readdirSync(path.join(RAW, 'glyphs')).filter(f => f.endsWith('.json')).length;

// Lines, exactly as tools/16 builds them: group by y, then order by CONTENT-STREAM
// position, never by x (see CLAUDE.md — sorting by x swaps vowels and shads).
function linesOf(glyphs) {
  glyphs.forEach((g, i) => { g.__i = i; });
  const lines = [];
  for (const g of glyphs) {
    let ln = lines.find(l => Math.abs(l.y - g.y) <= LINE_TOL);
    if (!ln) { ln = { y: g.y, gs: [] }; lines.push(ln); }
    ln.gs.push(g);
  }
  for (const l of lines) l.gs.sort((a, b) => a.__i - b.__i);
  lines.sort((a, b) => Math.min(...a.gs.map(g => g.__i)) - Math.min(...b.gs.map(g => g.__i)));
  for (const l of lines) {
    l.text = l.gs.map(decode).join('');
    l.x0 = l.gs[0].x;
    l.x1 = Math.max(...l.gs.map(g => g.x + (g.w || 0)));
  }
  return lines;
}
const tidy = s => s.replace(/[\s.]+$/, '').trim();
const key = s => s.replace(/[།\s་]+$/g, '').replace(/\s+/g, '').trim();
const lev = (a, b) => {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
};

const problems = [], notes = [];
const fail = m => { problems.push(m); console.error(`  !! ${m}`); };
const note = m => { notes.push(m); console.log(`  ~  ${m}`); };

// ---------------------------------------------------------------- 1. folio map
console.log('1. folio map');
const printedToPdf = new Map(), pdfToPrinted = new Map();
for (let p = 1; p <= PAGES; p++) {
  const t = readPage(p).filter(g => g.fb && NUMERAL_RE.test(g.fb) && g.y < FOLIO_Y_MAX).map(decode).join('').trim();
  if (!/^\d+$/.test(t)) continue;
  pdfToPrinted.set(p, +t);
  if (!printedToPdf.has(+t)) printedToPdf.set(+t, p);
}
const offsets = new Set([...printedToPdf].map(([pr, pdf]) => pdf - pr));
console.log(`   ${pdfToPrinted.size}/${PAGES} pages carry a numeric folio`);
if (offsets.size === 1) console.log(`   constant offset: printed + ${[...offsets][0]} = pdf`);
else fail(`folio offset is not constant: ${[...offsets].sort((a, b) => a - b).join(' ')}`);
const OFFSET = offsets.size === 1 ? [...offsets][0] : null;

// ------------------------------------------------------- 2. contents (dkar chag)
// Contents pages are detected, not hard-coded, so a different edition would not
// silently produce an empty outline.
console.log('\n2. contents (dkar chag)');
const contentsPages = [];
for (let p = 1; p <= Math.min(40, PAGES); p++) {
  const n = linesOf(readPage(p).filter(keep))
    .filter(l => l.gs.some(g => g.fb === SARCHUNG && Math.round(g.size) === 9) && /\.{6,}/.test(l.text)).length;
  if (n >= 5) contentsPages.push(p);
}
if (!contentsPages.length) fail('no contents pages found');
console.log(`   contents pages: ${contentsPages[0]}-${contentsPages.at(-1)} (${contentsPages.length})`);
const FRONT_MATTER_END = contentsPages.at(-1) ?? 0;

const entries = [];
for (const p of contentsPages) {
  const all = readPage(p);
  const ls = linesOf(all.filter(keep));
  let carry = null;                       // first half of a title that wrapped
  for (let i = 0; i < ls.length; i++) {
    const title = ls[i].gs.filter(g => g.fb === SARCHUNG);
    if (!title.length) continue;
    const raw = title.map(decode).join('');
    // Every real entry line carries a dotted leader. A Sarchung line WITHOUT one is
    // the first half of a title that wrapped onto the next line (e.g. p18 mu bzhi'i).
    if (!/\.{3,}/.test(ls[i].text) && !carry) {
      const numsHere = ls[i].gs.filter(g => !ls[i].gs.includes(g) === false && g.fb !== SARCHUNG);
      if (!numsHere.length) { carry = { x0: title[0].x, y: title[0].y, text: raw }; continue; }
    }
    let num = ls[i].gs.filter(g => g.fb !== SARCHUNG && NUMERAL_RE.test(g.fb || '')).map(decode).join('').trim();
    const roman = ls[i].gs.filter(g => g.fb && ROMAN_RE.test(g.fb)).map(decode).join('').trim();
    // Last entry on a page: its number wraps onto its own line, which lands either
    // just inside the body band or just below it depending on the page.
    if (!num && !roman && ls[i + 1] && !ls[i + 1].gs.some(g => g.fb === SARCHUNG))
      num = ls[i + 1].gs.filter(g => NUMERAL_RE.test(g.fb || '')).map(decode).join('').trim();
    if (!num && !roman) {
      const y = title[0].y;
      num = all.filter(g => g.fb && NUMERAL_RE.test(g.fb) && g.y >= FOLIO_Y_MAX && g.y < BODY_Y_MIN
        && g.y > y - 14 && g.x > 300).map(decode).join('').trim();
    }
    const text = tidy((carry ? carry.text : '') + raw);
    const x0 = carry ? carry.x0 : title[0].x;
    const y = carry ? carry.y : title[0].y;
    carry = null;
    if (!text) continue;
    entries.push({
      contentsPage: p, y, x0, title: text,
      printedPage: /^\d+$/.test(num) ? +num : null,
      romanPage: roman || null,
    });
  }
}
console.log(`   entries: ${entries.length}`);
const front = entries.filter(e => e.romanPage);
if (front.length) console.log(`   ${front.length} are editorial front matter (roman page): ${front.map(e => `${e.title} [${e.romanPage}]`).join(', ')}`);
const noNum = entries.filter(e => e.printedPage === null && !e.romanPage);
if (noNum.length) fail(`${noNum.length} contents entries have no page number: ${noNum.slice(0, 4).map(e => e.title).join(' | ')}`);

// ------------------------------------------------------------------- 3. depth
// The indent values are sharply quantised (20 distinct columns). Depth is the RANK
// of an entry's column, which assumes only that deeper sections are indented
// further — not that the indent is a perfect arithmetic grid (it is not: the
// columns drift by ~0.9pt in places, so rounding onto a fitted grid would be a
// judgement call dressed up as arithmetic).
console.log('\n3. nesting depth from indentation');
const cols = [];
for (const e of [...entries].sort((a, b) => a.x0 - b.x0)) {
  const c = cols.find(c => Math.abs(c.x - e.x0) < 1.2);
  if (c) { c.n++; c.x = (c.x * (c.n - 1) + e.x0) / c.n; } else cols.push({ x: e.x0, n: 1 });
}
cols.sort((a, b) => a.x - b.x);
const gaps = cols.slice(1).map((c, i) => c.x - cols[i].x);
console.log(`   ${cols.length} indent columns, ${cols[0].x.toFixed(1)}pt .. ${cols.at(-1).x.toFixed(1)}pt`);
console.log(`   column gaps: min ${Math.min(...gaps).toFixed(2)}pt — every column is separated, so depth is unambiguous`);
if (Math.min(...gaps) < 1.2) fail('two indent columns are closer than the within-column spread — depth would be a guess');
for (const e of entries) e.level = cols.findIndex(c => Math.abs(c.x - e.x0) < 1.2);

// A sa-bcad is a tree: depth may drop freely but should only rise one step at a time.
// Where it rises further the source itself omitted a heading level, or ran a parent
// and its first child onto one line. Recorded, not silently smoothed over.
const jumps = [];
for (let i = 1; i < entries.length; i++)
  if (entries[i].level > entries[i - 1].level + 1) jumps.push(entries[i]);
if (jumps.length) {
  note(`${jumps.length} place(s) where the printed indentation skips a level (the source's own structure, kept as printed):`);
  for (const j of jumps) console.log(`        L${entries[entries.indexOf(j) - 1].level}->L${j.level}  ${j.title}`);
} else console.log('   tree is well-formed: no skipped depths');

let back = 0;
for (let i = 1; i < entries.length; i++)
  if (entries[i].printedPage !== null && entries[i - 1].printedPage !== null && entries[i].printedPage < entries[i - 1].printedPage) {
    back++; if (back <= 5) fail(`page number goes backwards (${entries[i - 1].printedPage} -> ${entries[i].printedPage}) at "${entries[i].title}"`);
  }
if (!back) console.log('   printed page numbers are monotonic');

// -------------------------------------------------------- 4. headings in the body
// A heading is a standalone 12pt line. Nearly all are Sarchen, but at least one
// (p404 dngos gzhi'i cho ga) is set in the BODY font at 12pt, so keying on the font
// name alone would silently lose a section. Full-width 12pt lines are the front
// matter's biography block, not headings.
console.log('\n4. section headings in the body');
const headings = [];
for (let p = 1; p <= PAGES; p++) {
  if (contentsPages.includes(p)) continue;
  const ls = linesOf(readPage(p).filter(keep));
  const bodyRight = Math.max(...ls.map(l => l.x1), 0);
  const leftEdge = Math.min(...ls.map(l => l.x0), Infinity);
  const run = [];
  const flush = () => {
    if (!run.length) return;
    headings.push({ pdfPage: p, y: run[0].y, text: key(run.map(l => l.text).join('')), lines: run.length, front: p <= FRONT_MATTER_END });
    run.length = 0;
  };
  for (const l of ls) {
    // Headings are centred, so they start well right of the text block's left edge.
    // The front matter's biography is also body-font-at-12pt but sets flush left,
    // which is what separates it from the one body-font heading on p404 (x0 180 vs 57).
    const isHeading = l.gs.every(g => Math.round(g.size) === HEADING_SIZE)
      && (l.x1 - l.x0) < bodyRight * 0.92
      && (l.gs.every(g => g.fb === SARCHEN) || l.x0 - leftEdge > 40);
    if (!isHeading) { flush(); continue; }
    if (run.length && run.at(-1).y - l.y > 16) flush();   // ~14pt gap = wrapped; more = a new heading
    run.push(l);
  }
  flush();
}
console.log(`   heading lines found: ${headings.length} (${headings.filter(h => h.lines > 1).length} wrapped over two lines)`);

// ------------------------------------------------------------- 5. cross-check
console.log('\n5. cross-check: every contents entry must appear as a printed heading');
const used = new Set();
let exact = 0;
for (const e of entries) {
  const k = key(e.title);
  const want = e.printedPage !== null && OFFSET !== null ? e.printedPage + OFFSET : null;
  const cands = headings.map((h, i) => ({ h, i })).filter(({ h, i }) => h.text === k && !used.has(i));
  if (cands.length) {
    const pick = want === null ? cands[0]
      : cands.reduce((a, b) => Math.abs(b.h.pdfPage - want) < Math.abs(a.h.pdfPage - want) ? b : a);
    used.add(pick.i);
    e.pdfPage = pick.h.pdfPage;
    e.headingY = pick.h.y;
    exact++;
  } else {
    e.pdfPage = want;
    e.matched = false;
    let best = null, bd = 1e9;
    for (const h of headings) { const d = lev(k, h.text); if (d < bd) { bd = d; best = h; } }
    fail(`no printed heading for "${e.title}" (printed p${e.printedPage}); nearest is pdf p${best?.pdfPage} "${best?.text}" (distance ${bd})`);
  }
}
console.log(`   ${exact}/${entries.length} contents entries matched a printed heading exactly`);

const orphans = headings.map((h, i) => ({ h, i })).filter(({ i }) => !used.has(i)).map(({ h }) => h);
const orphanBody = orphans.filter(o => !o.front), orphanFront = orphans.filter(o => o.front);
console.log(`   ${orphanFront.length} unmatched headings in front matter (expected — publisher/colophon lines)`);
for (const o of orphanFront) console.log(`      p${o.pdfPage}  ${o.text}`);
if (orphanBody.length) {
  fail(`${orphanBody.length} printed heading(s) in the body are missing from the contents:`);
  for (const o of orphanBody) console.log(`      p${o.pdfPage}  ${o.text}`);
} else console.log('   0 unmatched headings in the body — contents and body agree exactly');

const drift = entries.filter(e => e.matched !== false && e.printedPage !== null && OFFSET !== null && e.pdfPage !== e.printedPage + OFFSET);
if (drift.length) {
  note(`${drift.length} section(s) whose heading is not on the page the contents gives (contents rounds to the page the section is discussed on):`);
  for (const d of drift.slice(0, 10)) console.log(`        "${d.title}" contents -> pdf p${d.printedPage + OFFSET}, heading on p${d.pdfPage}`);
}

// ------------------------------------------------------------------ 6. output
const sections = [];
entries.forEach((e, i) => {
  // parent = nearest preceding section shallower than me (handles skipped levels)
  let parent = null;
  for (let j = sections.length - 1; j >= 0; j--) if (sections[j].level < e.level) { parent = sections[j]; break; }
  const sibIdx = sections.filter(s => s.parent === (parent ? parent.id : null) && s.level === e.level).length + 1;
  const id = `s${String(i + 1).padStart(3, '0')}`;
  sections.push({
    id,
    path: parent ? `${parent.path}.${sibIdx}` : `${sibIdx}`,
    level: e.level,
    title: e.title,
    printedPage: e.printedPage,
    pdfPage: e.pdfPage ?? null,
    parent: parent ? parent.id : null,
    frontMatter: !!e.romanPage,
    matchedHeading: e.matched !== false,
  });
});
// A section runs until the next section that starts on a later page.
sections.forEach((s, i) => {
  const next = sections.slice(i + 1).find(x => x.pdfPage !== null && x.pdfPage > (s.pdfPage ?? 0));
  s.endPdfPage = next ? next.pdfPage - 1 : PAGES;
});

const outline = {
  generatedBy: 'tools/31-outline.mjs',
  source: 'book contents (dkar chag) cross-checked against the printed sa-bcad headings',
  pages: PAGES,
  folioOffset: OFFSET,
  contentsPages: [contentsPages[0], contentsPages.at(-1)],
  indentColumns: cols.map(c => +c.x.toFixed(2)),
  counts: {
    sections: sections.length,
    levels: cols.length,
    headingsPrinted: headings.length,
    matchedExactly: exact,
    unmatchedInBody: orphanBody.length,
  },
  problems, notes,
  sections,
};
fs.writeFileSync(path.join(ROOT, 'source', 'outline.json'), JSON.stringify(outline, null, 1), 'utf8');
fs.mkdirSync(QA, { recursive: true });
fs.writeFileSync(path.join(QA, 'outline-check.json'), JSON.stringify({
  ranAt: new Date().toISOString(), matched: exact, entries: entries.length,
  unmatchedInBody: orphanBody.map(o => ({ pdfPage: o.pdfPage, text: o.text })), problems, notes,
}, null, 1), 'utf8');

if (PRINT) {
  console.log('\n--- outline ---');
  for (const s of sections)
    console.log(`${'  '.repeat(s.level)}${s.path}  ${s.title}   [printed ${s.printedPage ?? s.romanPage ?? '?'} / pdf ${s.pdfPage ?? '?'}-${s.endPdfPage}]`);
}

console.log(`\nwrote source/outline.json — ${sections.length} sections, ${cols.length} levels`);
console.log(problems.length ? `\n${problems.length} PROBLEM(S) — resolve before chunking.`
  : `\nno problems.${notes.length ? ` ${notes.length} note(s) recorded about the source's own structure.` : ''}`);
process.exit(problems.length ? 1 : 0);
