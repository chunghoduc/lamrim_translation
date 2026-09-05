// Structural and coherence checks over the assembled lamrim-vi.md.
//
//   node tools/40-verify-text.mjs
//
// WHAT THIS CHECKS, and what it deliberately does not.
//
// This verifies the SHAPE of the finished text: that every page in scope is present, that
// the heading hierarchy is well formed, that no paragraph is left hanging mid-clause, that
// the chunk scaffolding is gone, and that a term is not rendered two ways in one book.
//
// It does NOT verify fidelity to the Tibetan. Nothing mechanical can. Every chunk passed a
// verify-then-repair cycle, but the repair agent self-certified its own fixes and no
// independent reader has re-checked them; that pass is a separate job and this tool must
// not be mistaken for it.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.mjs';

const BOOK = path.join(ROOT, 'lamrim-vi.md');
// Check the TRANSLATION only. The generated appendix quotes "sanh"/"phước" as examples of
// spellings the house style forbids, and its prose ends paragraphs the way prose does - so
// including it makes the tool report its own documentation as defects.
const whole = fs.readFileSync(BOOK, 'utf8').replace(/\r\n/g, '\n');
const cut = whole.indexOf('\n# Phụ lục\n');
const text = cut > 0 ? whole.slice(0, cut) : whole;
const lines = text.split('\n');
const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'progress.json'), 'utf8'));
const glossary = JSON.parse(fs.readFileSync(path.join(ROOT, 'glossary', 'glossary.json'), 'utf8'));

const problems = [];
const say = (label, v, detail) => console.log(`  ${label.padEnd(34)} ${v}${detail ? '   ' + detail : ''}`);

console.log('\n=== 1. coverage ===');
const seen = new Set();
for (const c of state.chunks) for (let p = c.pages[0]; p <= c.pages[1]; p++) seen.add(p);
const gaps = [];
for (let p = 1; p <= 978; p++) if (!seen.has(p) && !(p >= 8 && p <= 20)) gaps.push(p);
say('pdf pages in scope', `${seen.size} / 965`);
say('gaps outside the dkar chag', gaps.length ? gaps.join(' ') : 'none');
if (gaps.length) problems.push(`${gaps.length} page(s) not covered by any chunk`);
say('chunks translated', `${state.chunks.filter(c => c.status !== 'pending' && c.status !== 'draft').length} / ${state.chunks.length}`);

console.log('\n=== 2. scaffolding removed ===');
const scaffold = lines.filter(l => /tiếp sang|tiếp theo c\d|chunk sau|xem c\d{3}/.test(l));
const frontmatter = lines.filter(l => /^(chunk|sectionPath|printedPages):\s/.test(l));
say('boundary markers left', scaffold.length);
say('front-matter lines left', frontmatter.length);
if (scaffold.length) problems.push(`${scaffold.length} boundary marker(s) survived assembly`);
if (frontmatter.length) problems.push(`${frontmatter.length} front-matter line(s) survived assembly`);

console.log('\n=== 3. heading hierarchy ===');
const heads = [];
lines.forEach((l, i) => { const m = l.match(/^(#{1,6})\s+(.*)$/); if (m) heads.push({ lvl: m[1].length, txt: m[2].trim(), line: i + 1 }); });
say('headings', heads.length);
const jumps = [];
for (let i = 1; i < heads.length; i++) if (heads[i].lvl > heads[i - 1].lvl + 1) jumps.push(`line ${heads[i].line}: h${heads[i - 1].lvl} -> h${heads[i].lvl}  "${heads[i].txt.slice(0, 48)}"`);
say('level jumps (h1->h3 etc)', jumps.length);
for (const j of jumps.slice(0, 6)) console.log(`      ${j}`);
if (jumps.length) problems.push(`${jumps.length} heading level jump(s)`);
// A heading immediately repeated is the split-section bug: part 2 restating its own title.
const adjacent = [];
for (let i = 1; i < heads.length; i++) if (heads[i].txt === heads[i - 1].txt) adjacent.push(`line ${heads[i].line}: "${heads[i].txt.slice(0, 48)}"`);
say('immediately repeated headings', adjacent.length);
for (const a of adjacent) console.log(`      ${a}`);
if (adjacent.length) problems.push(`${adjacent.length} heading(s) repeated back to back`);
// Empty sections: a heading followed directly by another heading.
const empty = [];
for (let i = 0; i < heads.length - 1; i++) {
  const between = lines.slice(heads[i].line, heads[i + 1].line - 1).join('').trim();
  if (!between) empty.push(`line ${heads[i].line}: "${heads[i].txt.slice(0, 48)}"`);
}
say('headings with no body', empty.length, '(normal for a parent that only lists its parts)');

console.log('\n=== 4. sentences left hanging ===');
// A paragraph that ends without terminal punctuation is a clause cut off - the shape a
// broken seam would leave. Verse lines and headings are excluded.
const paras = text.split(/\n\s*\n/);
const hanging = [];
for (const p of paras) {
  const t = p.trim();
  if (!t || /^#{1,6}\s/.test(t) || /^\s*>/.test(t) || /^\s*[-*+\d]/.test(t)) continue;
  if (!/[.!?:;"'»)\]…]\s*$/.test(t) && !/\*$/.test(t)) hanging.push(t.slice(-70).replace(/\n/g, ' '));
}
say('prose paragraphs ending mid-clause', hanging.length);
for (const h of hanging.slice(0, 6)) console.log(`      ...${h}`);
if (hanging.length) problems.push(`${hanging.length} prose paragraph(s) end without terminal punctuation`);

console.log('\n=== 5. terminology consistency ===');
const head = t => String(t.bo || '').split(/\s*\(/)[0].trim();
const byHead = new Map();
for (const t of glossary.terms) { const h = head(t); if (!h) continue; if (!byHead.has(h)) byHead.set(h, new Set()); byHead.get(h).add(t.viVariants ? t.viVariants.join('|') : t.vi); }
const conflicting = [...byHead.entries()].filter(([, v]) => v.size > 1);
say('glossary headwords', byHead.size);
say('headwords rendered 2+ ways', conflicting.length);
for (const [h, v] of conflicting.sort((a, b) => b[1].size - a[1].size).slice(0, 6))
  console.log(`      ${h}  ->  ${[...v].slice(0, 4).join('  /  ')}`);
if (conflicting.length) problems.push(`${conflicting.length} headword(s) carry conflicting renderings`);
// House style is mechanical and must hold everywhere.
const southern = (text.match(/\b(sanh|phước)\b/gi) || []).length;
say('southern spellings (sanh/phước)', southern);
if (southern) problems.push(`${southern} southern spelling(s) against the northern house style`);

console.log('\n=== 6. unresolved uncertainty ===');
const flags = state.chunks.reduce((a, c) => a + (c.flags || []).length, 0);
const flagged = state.chunks.filter(c => (c.flags || []).length).length;
say('unsure flags recorded', flags, `across ${flagged} of ${state.chunks.length} chunks`);
say('inline (tồn nghi:) notes', (text.match(/tồn nghi:/g) || []).length);
const noVerify = state.chunks.filter(c => c.status === 'translated' && !c.verify).map(c => c.id);
say('chunks with no verify record', noVerify.length, noVerify.join(' '));
const provisional = glossary.terms.filter(t => t.status === 'provisional').length;
say('glossary terms provisional', `${provisional} / ${glossary.terms.length}`);

console.log('\n=== summary ===');
console.log(`words ${text.split(/\s+/).length}, ${(text.length / 1024 / 1024).toFixed(1)} MB, ${heads.length} headings`);
if (!problems.length) console.log('no structural problems found.');
else { console.log(`${problems.length} structural finding(s):`); for (const p of problems) console.log(`  - ${p}`); }
console.log('\nNOT CHECKED HERE: fidelity to the Tibetan. Every chunk went through');
console.log('verify-then-repair, but repair self-certified its fixes and nothing has');
console.log('re-read them against the source. That is a separate pass.');

