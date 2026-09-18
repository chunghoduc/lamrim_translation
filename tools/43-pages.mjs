// Phase 5b: mark, in the assembled translation, where every page of the original begins.
//
//   node tools/43-pages.mjs init            build/refresh page-anchors.json
//   node tools/43-pages.mjs list            how many boundaries are placed, how many are not
//   node tools/43-pages.mjs check           re-validate every placed anchor against the files
//   node tools/43-pages.mjs batch 20        the next N unplaced, as workflow args
//   node tools/43-pages.mjs show 42         one page: its Tibetan head, its chunk, its locator
//   node tools/43-pages.mjs place <json>    record locators returned by an alignment agent
//
// WHY THIS IS NOT ONE JOB BUT TWO.
//
// The 292 chunks are page-disjoint: chunk n covers pdf pages [a,b] and chunk n+1 starts at
// b+1, and each chunk's Tibetan source is the byte-exact concatenation of whole page files
// (that is what tools/32 hashes into sourceHash). So a chunk's first word IS the first word
// of its first page. Those 292 boundaries are therefore EXACT, derivable, and free - no
// reading and no judgement is involved, which is why this tool places them itself.
//
// The other 673 boundaries fall INSIDE a chunk, and nothing recorded where. Page 42 begins
// in the middle of a sentence that the Vietnamese renders in a different word order. There
// is no mechanical way to find that point: proportional interpolation would put the marker
// in roughly the right region and quietly claim precision it does not have, and the whole
// project's rule is that where evidence is not decisive we record the uncertainty instead of
// resolving it by preference. So those are located by reading, one chunk at a time, and this
// file is the ledger that makes "gradually, but it must be finished" a countable statement.
//
// WHERE THE MARKER GOES WHEN THE TURN FALLS INSIDE A CLAUSE, which is the usual case. The
// page break is a fact about the Tibetan, and Tibetan and Vietnamese do not order a clause
// the same way, so the break often lands where Vietnamese has no seam - p25 begins in the
// middle of the name Dhanashri, p30 begins at the verb of a sentence whose object closed
// p29. The rule is: put the marker at the nearer of the two available boundaries - the one
// that misattributes LESS text - and record in `note` what crossed. That is the honest
// statement. Splitting a Vietnamese word to make the marker look exact would be precision
// theatre; silently shifting it a sentence without saying so would be worse.
//
// ONE PAGE IS SPECIAL. On pdf p21 the content stream is not visual order (the title block is
// drawn last but printed at the top - FINDINGS 9.5), so `boTail` for p21 is the title, not
// the page's last visual line. Only p22's anchor is affected, and only through boTail, which
// is context; boHead is taken from p22's own file and is unaffected.
//
// THE MARKER IS NEVER STORED IN THE TRANSLATION. What is stored is a LOCATOR: an exact,
// unique substring of the chunk file, meaning "page N begins immediately before this text".
// tools/39 inserts the markers at assembly time. Two things follow, and both matter:
//   - translation/*.md is untouched, so no outputHash drifts and no verse unit goes stale;
//   - if the translation is ever edited, the locator stops matching and `check` says so.
//     A marker can therefore be wrong-and-reported, but it cannot be silently misplaced.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, CLEAN } from './config.mjs';

const LEDGER = path.join(ROOT, 'page-anchors.json');
const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'progress.json'), 'utf8'));
const chunks = state.chunks.slice().sort((a, b) => a.id.localeCompare(b.id));

const pageFile = p => path.join(CLEAN, `p${String(p).padStart(4, '0')}.txt`);
const bo = p => fs.readFileSync(pageFile(p), 'utf8').replace(/\r\n/g, '\n');
// The Tibetan a page opens and closes with, normalised to one line. These are the anchors an
// alignment agent must quote back, and `check` verifies the quote against the page file - so
// an agent cannot claim a boundary it never looked at.
const head = p => bo(p).replace(/\s+/g, ' ').trim().slice(0, 90);
const tail = p => bo(p).replace(/\s+/g, ' ').trim().slice(-90);

// The chunk body as tools/39 will see it: front matter gone, continuation markers gone.
// Locators must match THIS, not the raw file, or a locator that happens to sit inside the
// scaffolding would be unfindable at assembly time.
const OPEN = /^(\s*>\s?)?\*\(\s*[….]*\s*tiếp theo[^)]*\)\*\s*[….]*\s*/;
const CLOSE = /\n*\*\([^)]*(?:tiếp sang|tiếp tục sang)[^)]*\)\*\s*$/;
export function chunkBody(id) {
  let t = fs.readFileSync(path.join(ROOT, 'translation', `${id}.md`), 'utf8')
    .replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  return t.replace(OPEN, '').replace(CLOSE, '').trim();
}

const load = () => JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const save = l => fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2) + '\n', 'utf8');

// A locator is a literal substring of the chunk; the marker goes at its start. Formulaic
// passages repeat - the Kaniska sutra says "flee, or turn it back by strength, by wealth..."
// three times over - so a locator may carry the insertion point explicitly as CUT, and then
// only the WHOLE locator has to be unique, not the fragment after the cut.
const CUT = '⟪⟫';
const litOf = l => l.split(CUT).join('');
const offsetIn = l => { const i = l.indexOf(CUT); return i === -1 ? 0 : i; };

// Validate one placed anchor. Returns null if sound, else why not.
function validate(a, body) {
  if (a.kind === 'chunk-start') return null;          // position 0, nothing to match
  if (!a.locator) return 'no locator';
  const lit = litOf(a.locator);
  if (!lit) return 'empty locator';
  const n = body.split(lit).length - 1;
  if (n === 0) return 'locator not found in the chunk (translation edited?)';
  if (n > 1) return `locator occurs ${n} times - not unique`;
  return null;
}
// Where the marker goes for a validated locator.
export function insertionPoint(body, locator) {
  return body.indexOf(litOf(locator)) + offsetIn(locator);
}

const cmd = process.argv[2];
const rest = process.argv.slice(3);

if (cmd === 'init') {
  const prev = fs.existsSync(LEDGER) ? load() : { anchors: [] };
  const byPage = new Map(prev.anchors.map(a => [a.pdf, a]));
  const anchors = [];
  for (const c of chunks) {
    for (let p = c.pages[0]; p <= c.pages[1]; p++) {
      const first = p === c.pages[0];
      const old = byPage.get(p);
      const a = {
        pdf: p,
        printed: c.printedPages ? c.printedPages[0] + (p - c.pages[0]) : null,
        chunk: c.id,
        kind: first ? 'chunk-start' : 'internal',
        // chunk-start needs no evidence beyond the disjointness proved above; internal ones
        // carry the Tibetan on both sides of the turn, for the agent and for `check`.
        ...(first ? {} : { boTail: tail(p - 1), boHead: head(p) }),
        status: first ? 'exact' : 'pending',
        locator: null,
      };
      // Carry a placed locator across a rebuild, but only if it is still valid. An anchor
      // whose locator no longer matches falls back to `pending`, which is what makes `init`
      // the re-anchoring step after a prose edit: it demotes exactly the boundaries the edit
      // broke and leaves the rest alone. Keys are assigned in the same order `place` uses, or
      // a no-op rebuild shows up as a 1338-line diff and hides the real changes.
      if (!first && old && old.locator) {
        const why = validate({ ...a, locator: old.locator }, chunkBody(c.id));
        if (!why) { a.locator = old.locator; a.status = old.status; a.placedBy = old.placedBy; a.note = old.note; }
      }
      anchors.push(a);
    }
  }
  anchors.sort((a, b) => a.pdf - b.pdf);
  save({
    generatedBy: 'tools/43-pages.mjs init',
    folioOffset: 20,
    note: 'printed = pdf - 20 from pdf p21 on; pdf p1-7 are unnumbered front matter; pdf p8-20 are the dkar chag and are not translated',
    total: anchors.length,
    anchors,
  });
  const exact = anchors.filter(a => a.status === 'exact').length;
  console.log(`${anchors.length} page boundaries over ${chunks.length} chunks`);
  console.log(`  exact (chunk starts, derived) : ${exact}`);
  console.log(`  placed by alignment           : ${anchors.filter(a => a.status === 'placed').length}`);
  console.log(`  pending (inside a chunk)      : ${anchors.filter(a => a.status === 'pending').length}`);
} else if (cmd === 'list' || cmd === 'check') {
  const l = load();
  const bad = [];
  const bodies = new Map();
  for (const a of l.anchors) {
    if (a.status === 'pending') continue;
    if (!bodies.has(a.chunk)) bodies.set(a.chunk, chunkBody(a.chunk));
    const why = validate(a, bodies.get(a.chunk));
    if (why) bad.push(`  !! p${a.pdf} (${a.chunk}): ${why}`);
  }
  // Order within a chunk must be monotonic, or two markers claim overlapping text.
  for (const c of chunks) {
    const inC = l.anchors.filter(a => a.chunk === c.id && a.status === 'placed' && a.locator);
    if (!bodies.has(c.id)) continue;
    const body = bodies.get(c.id);
    let last = 0;
    for (const a of inC) {
      const at = insertionPoint(body, a.locator);
      if (at < last) bad.push(`  !! p${a.pdf} (${c.id}): sits before p${a.pdf - 1} in the text`);
      last = at;
    }
  }
  const n = s => l.anchors.filter(a => a.status === s).length;
  console.log(`page boundaries : ${l.anchors.length}`);
  console.log(`  exact         : ${n('exact')}   (chunk starts - derived, not judged)`);
  console.log(`  placed        : ${n('placed')}   (located inside a chunk by reading)`);
  console.log(`  pending       : ${n('pending')}`);
  console.log(`validation      : ${bad.length ? bad.length + ' PROBLEM(S)' : 'all placed anchors still match their text'}`);
  for (const b of bad.slice(0, 20)) console.log(b);
  const done = n('exact') + n('placed');
  console.log(`\n${(done / l.anchors.length * 100).toFixed(1)}% of the original's pages are marked (${done}/${l.anchors.length}).`);
  const left = [...new Set(l.anchors.filter(a => a.status === 'pending').map(a => a.chunk))];
  if (left.length) console.log(`${left.length} chunk(s) still to align; next: ${left.slice(0, 8).join(' ')}`);
} else if (cmd === 'batch') {
  const n = Number(rest[0] || 20);
  const l = load();
  const byChunk = new Map();
  for (const a of l.anchors) {
    if (a.status !== 'pending') continue;
    if (!byChunk.has(a.chunk) && byChunk.size >= n) continue;
    if (!byChunk.has(a.chunk)) {
      const c = chunks.find(x => x.id === a.chunk);
      byChunk.set(a.chunk, { chunk: a.chunk, pages: c.pages, boundaries: [] });
    }
    byChunk.get(a.chunk).boundaries.push({ pdf: a.pdf, printed: a.printed, boTail: a.boTail, boHead: a.boHead });
  }
  process.stdout.write(JSON.stringify({ align: [...byChunk.values()] }) + '\n');
} else if (cmd === 'work') {
  // Everything needed to align ONE chunk, and nothing else. Deliberately does not print the
  // Tibetan pages in full: the only question is where a page BEGINS, so the last clause of
  // the page before and the first clause of the page after are the whole evidence. Printing
  // 14 KB of Tibetan per chunk instead would cost 20x and answer the same question.
  const l = load();
  for (const id of rest) {
    const todo = l.anchors.filter(a => a.chunk === id && a.status === 'pending');
    if (!todo.length) { console.log(`${id}: nothing pending`); continue; }
    console.log(`\n########## ${id}  (${todo.length} boundary/ies to place) ##########`);
    for (const a of todo) {
      console.log(`\n--- pdf p${a.pdf} = printed ${a.printed} ---`);
      console.log(`END OF p${a.pdf - 1} : ${a.boTail}`);
      console.log(`START OF p${a.pdf}  : ${a.boHead}`);
    }
    console.log(`\n--- VIETNAMESE (${id}) ---\n` + chunkBody(id));
  }
} else if (cmd === 'show') {
  const l = load();
  const a = l.anchors.find(x => x.pdf === Number(rest[0]));
  if (!a) { console.error('no such page'); process.exit(1); }
  console.log(JSON.stringify(a, null, 2));
  if (a.locator) {
    const body = chunkBody(a.chunk);
    const at = insertionPoint(body, a.locator);
    console.log('\n--- context ---\n' + body.slice(Math.max(0, at - 160), at) + '  <<<PAGE ' + a.pdf + '>>>  ' + body.slice(at, at + 160));
  }
} else if (cmd === 'place') {
  // Input: {"placed":[{"pdf":42,"locator":"...","boHeadQuote":"...","note":"..."}]}
  const src = rest[0];
  if (!src) { console.error('usage: place <file.json>'); process.exit(1); }
  const input = JSON.parse(fs.readFileSync(src, 'utf8'));
  const l = load();
  let ok = 0; const rejected = [];
  for (const p of input.placed || []) {
    const a = l.anchors.find(x => x.pdf === p.pdf);
    if (!a) { rejected.push(`p${p.pdf}: no such page`); continue; }
    if (a.kind === 'chunk-start') { rejected.push(`p${p.pdf}: is a chunk start, already exact`); continue; }
    // SIGNAL 1 - the agent must quote the Tibetan that opens the page, and the quote has to
    // be really there. This is what stops a plausible-looking placement made without opening
    // the source file; it is the same two-agreeing-signals rule the repair tables use.
    const q = String(p.boHeadQuote || '').replace(/\s+/g, ' ').trim();
    if (!q || !bo(p.pdf).replace(/\s+/g, ' ').trim().startsWith(q.slice(0, 24))) {
      rejected.push(`p${p.pdf}: quoted Tibetan is not how that page opens`); continue;
    }
    // SIGNAL 2 - the locator must exist, exactly once, in the chunk as the assembler sees it.
    const why = validate({ ...a, locator: p.locator }, chunkBody(a.chunk));
    if (why) { rejected.push(`p${p.pdf}: ${why}`); continue; }
    a.locator = p.locator; a.status = 'placed'; a.placedBy = 'align';
    if (p.note) a.note = p.note;
    ok++;
  }
  save(l);
  console.log(`accepted ${ok}, rejected ${rejected.length}`);
  for (const r of rejected) console.log('  !! ' + r);
} else {
  console.error('usage: init | list | check | batch <n> | show <pdfPage> | place <file.json>');
  process.exit(1);
}
