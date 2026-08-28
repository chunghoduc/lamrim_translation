// Phase 4: cut a per-chunk view of the glossary, so a translating agent reads the rulings
// that bear on ITS pages instead of all 2867 of them.
//
//   node tools/37-chunk-glossary.mjs --batch .wf-b8.json    # the ids in a batch file
//   node tools/37-chunk-glossary.mjs c163 c164              # named chunks
//   node tools/37-chunk-glossary.mjs --todo                 # everything pending or draft
//
// Writes glossary/by-chunk/<id>.json. These are derived artifacts, regenerated from
// glossary.json whenever it grows, and gitignored - never edit one by hand.
//
// WHY. glossary.json passed 1.3 MB at batch 7, roughly 300k tokens, and every agent in a
// batch reads it - 75 of them. It has grown 53 -> 2867 terms in seven batches, so the cost
// rises every round while the fraction any one chunk needs falls. A chunk's own view is
// ~60 KB and, unlike the whole file, it grows only with the terms its own pages contain.
//
// WHAT IS KEPT, and why it is safe to drop the rest:
//
//   - Every `fixed` and `fixed-set` entry, matched or not. These are house style and carry
//     prohibitions that bind everywhere ("chanh phap is NOT licensed" for `chos`), so they
//     must be in front of the agent whether or not the word occurs in its pages.
//   - Every term whose Tibetan headword OCCURS in the chunk's own source pages.
//
// Matching is plain substring over the Tibetan, which is deliberately generous: it will
// pull in a term that merely appears inside a longer word, and that is the direction to err
// in. A ruling the agent did not need costs a few hundred bytes; a ruling it needed and did
// not see is a glossary violation, which is the failure this whole file exists to avoid.
//
// FORMAT. Emitted as compact text, not JSON. Measured on c167 (225 terms): JSON 92 KB,
// compact text 37 KB. The difference is almost entirely the key names - "bo"/"vi"/"status"/
// "kind"/"note" repeated for every term - which carry no information the layout does not.
//
// NOTES. Kept in full for `fixed` and `fixed-set` (3 KB of the 51 KB - they carry the
// prohibitions), and for any note stating a constraint (NOT, never, deliberately, distinct
// from, reserved). Provisional notes otherwise reduce to their first sentence, which is
// where the ruling lives; the rest is provenance ("p0248, in Toelungpa's saying...") that
// matters to a human auditing the glossary later and not to an agent applying it now.
//
// Together with the per-chunk cut: ~355k tokens -> ~12k per agent, 30x.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, CLEAN } from './config.mjs';

const G = path.join(ROOT, 'glossary', 'glossary.json');
const OUT = path.join(ROOT, 'glossary', 'by-chunk');
const glossary = JSON.parse(fs.readFileSync(G, 'utf8'));
const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'progress.json'), 'utf8'));

// A headword may carry a disambiguating tail the agents add - "rigs (in rgyal ba'i rigs...)"
// or "mkhas pa (contrastive with byis pa)". Match on the Tibetan before that.
const head = t => String(t.bo || '').split(/\s*\(/)[0].trim();
const ALWAYS = new Set(['fixed', 'fixed-set']);

// Six entries carry no Tibetan headword at all: agents filed house-style observations
// ("(houseStyle) chinh vs chanh", "(house style) capitalisation of deity names") as glossary
// terms because there was nowhere else to put them. They are real rulings in the wrong shape.
// They were reaching every chunk only because ''.includes('') is true - keep them in every
// view, but deliberately, and never let an empty headword match by accident.
const isHouseNote = t => !head(t) && /house\s*style/i.test(String(t.bo || ''));

const args = process.argv.slice(2);

// --report answers the question the per-chunk cut cannot: is the glossary self-consistent?
// It is the piece of a "knowledge graph" that actually pays here - one headword, several
// Vietnamese renderings, which is how the same Tibetan word ends up rendered four ways in
// four neighbouring chunks. Nothing is auto-merged: a headword with two renderings may be a
// genuine sense split (mkhas pa as scholar vs as wise-in-contrast-to-foolish) or plain
// drift, and only a reader of the passages can tell which.
if (args.includes('--report')) {
  const byHead = new Map();
  for (const t of glossary.terms) {
    const h = head(t);
    if (!byHead.has(h)) byHead.set(h, []);
    byHead.get(h).push(t);
  }
  const dupes = [], conflicts = [];
  for (const [h, ts] of byHead) {
    const vis = [...new Set(ts.map(t => t.viVariants ? t.viVariants.join('|') : t.vi))];
    if (vis.length > 1) conflicts.push({ h, vis, ts });
    else if (ts.length > 1) dupes.push({ h, n: ts.length, vi: vis[0] });
  }
  console.log(`glossary: ${glossary.terms.length} terms, ${byHead.size} distinct headwords\n`);
  console.log(`REDUNDANT - same headword, same rendering, recorded more than once (${dupes.length}):`);
  for (const d of dupes.slice(0, 15)) console.log(`  ${d.n}x  ${d.h}  ->  ${d.vi}`);
  if (dupes.length > 15) console.log(`  ... and ${dupes.length - 15} more`);
  console.log(`\nCONFLICTING - one headword, several renderings (${conflicts.length}).`);
  console.log(`Each is either a real sense split that should be recorded as one entry with`);
  console.log(`both senses, or drift that should be normalised. Not decidable mechanically:\n`);
  const rank = conflicts.sort((a, b) => b.vis.length - a.vis.length);
  for (const c of rank.slice(0, 20)) {
    console.log(`  ${c.h}`);
    for (const v of c.vis) console.log(`      ${v}`);
  }
  if (rank.length > 20) console.log(`\n  ... and ${rank.length - 20} more headwords`);
  process.exit(0);
}

let ids = args.filter(a => /^c\d+$/.test(a));
const batchIx = args.indexOf('--batch');
if (batchIx >= 0) {
  const b = JSON.parse(fs.readFileSync(args[batchIx + 1], 'utf8'));
  ids = b.chunks.map(c => c.id);
}
if (args.includes('--todo')) {
  ids = state.chunks.filter(c => c.status === 'pending' || c.status === 'draft').map(c => c.id);
}
if (!ids.length) {
  console.error('usage: node tools/37-chunk-glossary.mjs [--batch <file> | --todo | c163 c164 ...]');
  process.exit(1);
}

const sourceOf = c => {
  let s = '';
  for (let p = c.pages[0]; p <= c.pages[1]; p++) {
    const f = path.join(CLEAN, `p${String(p).padStart(4, '0')}.txt`);
    if (fs.existsSync(f)) s += fs.readFileSync(f, 'utf8');
  }
  return s;
};

// A note that states a constraint is load-bearing wherever the term occurs, so it survives
// whole even on a provisional entry. Everything else reduces to its first sentence.
const CONSTRAINT = /\b(NOT|never|Never|do not|Do not|Deliberately|deliberately|distinct|Distinct|reserved|must not|only)\b/;
const firstSentence = s => { const m = String(s).match(/^.*?[.;](\s|$)/); return (m ? m[0] : String(s)).trim(); };

function fmt(t) {
  const binding = ALWAYS.has(t.status);
  const tag = t.status === 'fixed' ? 'FIXED' : t.status === 'fixed-set' ? 'SET  ' : 'prov ';
  const vi = t.viVariants ? t.viVariants.join(' | ') : t.vi;
  let n = t.note || '';
  if (n && !binding && !CONSTRAINT.test(n)) n = firstSentence(n).slice(0, 140);
  return `${tag} ${t.bo} -> ${vi}${t.skt ? `  [${t.skt}]` : ''}${n ? `\n      ${n}` : ''}`;
}

fs.mkdirSync(OUT, { recursive: true });
const always = glossary.terms.filter(t => ALWAYS.has(t.status) || isHouseNote(t));
let total = 0;
for (const id of ids) {
  const c = state.chunks.find(x => x.id === id);
  if (!c) { console.error(`unknown chunk ${id}`); continue; }
  const text = sourceOf(c);
  const seen = new Set(always);
  for (const t of glossary.terms) {
    const h = head(t);
    if (h && text.includes(h)) seen.add(t);   // h must be non-empty: ''.includes('') is true
  }
  const terms = glossary.terms.filter(t => seen.has(t));   // keep glossary order
  const hs = glossary.houseStyle || {};
  const out = [
    `# glossary view for ${id}  (pdf pages ${c.pages[0]}-${c.pages[1]})`,
    `# ${terms.length} of ${glossary.terms.length} terms: every FIXED/SET ruling, plus every term whose`,
    `# Tibetan occurs in these pages. This is cut from glossary.json - do NOT read that file.`,
    `# A term you need that is absent here is a GAP: return it in newTerms, do not assume the`,
    `# wording is free.`,
    `#`,
    `# FIXED = use exactly this Vietnamese, every time.`,
    `# SET   = use ONLY one of the listed variants.`,
    `# prov  = provisional: settled unless you have specific reason, and say so if you depart.`,
    `# house style: ${Object.entries(hs).map(([k, v]) => `${k}=${v}`).join(', ') || 'northern'}`,
    '',
    ...terms.map(fmt),
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(OUT, `${id}.md`), out, 'utf8');
  total += out.length;
  console.log(`${id}  ${String(terms.length).padStart(4)} terms  ${(out.length / 1024).toFixed(0).padStart(4)} KB`);
}
const whole = JSON.stringify(glossary, null, 2).length;
console.log(`\n${ids.length} file(s), avg ${(total / ids.length / 1024).toFixed(0)} KB `
          + `vs ${(whole / 1024).toFixed(0)} KB for the whole glossary `
          + `(${(whole / (total / ids.length)).toFixed(0)}x smaller per agent)`);
