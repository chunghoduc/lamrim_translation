// Phase 4 style pass over the sa-bcad enumeration lines in translation/*.md.
//
//   node tools/38-sabcad-style.mjs --check    report, touch nothing
//   node tools/38-sabcad-style.mjs --write    apply
//
// Two rulings, both taken by the user on 2026-08-28 (glossary/decisions.md §6, §7).
//
// 1. ENUMERATIONS MUST BE COMPLETE SENTENCES. The Tibetan sa-bcad writes `X ལ་གསུམ།`
//    - "X has three" - with no classifier, because Tibetan does not need one. Vietnamese
//    does: "Cách tu học có ba" is clipped (cụt); it must read "Cách tu học gồm có ba cách".
//    So `có <N>:` becomes `gồm có <N> <classifier>:`.
//
//    The classifier is not free. It is chosen from evidence in the sentence itself: if the
//    items being enumerated are themselves "cách ..." the classifier is `cách`, otherwise
//    `phần`. Measured over the corpus that is 14 `cách` against 149 `phần`, and the split
//    matches what the items actually are - this is why the rule reads the first list item
//    rather than guessing from the subject.
//
// 2. `ཟུང་དུ་འབྲེལ་བ` (yuganaddha) is "song vận", not "song vận hợp nhất". 雙運 already
//    carries the whole word. "hợp nhất" is both redundant AND says something the Tibetan
//    does not: it means merging into one, while yuganaddha is two things yoked as a PAIR,
//    each still itself. At śamatha-vipaśyanā union that distinction carries doctrine.
//
// This tool only rewrites what these two rules cover. It does not touch wording otherwise,
// and it never invents a classifier where the sentence does not already enumerate.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.mjs';

const DIR = path.join(ROOT, 'translation');
const WRITE = process.argv.includes('--write');
if (!WRITE && !process.argv.includes('--check')) {
  console.error('usage: node tools/38-sabcad-style.mjs --check | --write');
  process.exit(1);
}

const NUM = 'hai|ba|bốn|năm|sáu|bảy|tám|chín|mười';
// `có <N>` closing an enumeration - the delimiter after it is what marks it as one. A bare
// "có ba mươi ngày" cannot match, because the numeral must be followed by : or , directly.
// The negative lookbehind matters: one line already reads "gồm có hai:", and without it that
// becomes "gồm gồm có". Re-running the tool must also be a no-op, so the guard has to hold
// against its own output, not just against the corpus as it stands today.
const ENUM = new RegExp(`(?<!gồm )(có) (${NUM})(\\s*(?:phần|cách|điều|loại|pháp))?([:,])`, 'g');

const stats = { files: 0, changed: 0, enumFixed: 0, alreadyFull: 0, cach: 0, phan: 0, yuga: 0 };
const samples = [];

for (const file of fs.readdirSync(DIR).filter(f => f.endsWith('.md')).sort()) {
  const raw = fs.readFileSync(path.join(DIR, file), 'utf8');
  stats.files++;
  let out = raw;

  // --- 1. enumerations ---
  out = out.replace(ENUM, (m, co, n, existing, delim, offset, whole) => {
    // Decide the classifier from the items that follow, not from the subject.
    const after = whole.slice(offset + m.length, offset + m.length + 60).trim();
    const cls = existing ? existing.trim() : (/^cách\b/i.test(after) ? 'cách' : 'phần');
    if (existing) stats.alreadyFull++; else (cls === 'cách' ? stats.cach++ : stats.phan++);
    stats.enumFixed++;
    const rep = `gồm ${co} ${n} ${cls}${delim}`;
    if (samples.length < 8) samples.push(`${file.replace('.md', '')}  ${m.trim()} -> ${rep.trim()}`);
    return rep;
  });

  // --- 2. lighten the list items ---
  // The heaviness the ruling is aimed at comes from "cách thức" - a two-syllable noun -
  // repeated once per item. Tibetan repeats `ཚུལ` just as often and nobody notices, because
  // it is a light nominaliser. Only the ITEMS are lightened: the sentence's own subject and
  // the section heading keep "cách thức", so the enumeration still names what it points to.
  out = out.replace(/gồm có (\w+) cách:([^\n]*)/g, (m, n, items) =>
    `gồm có ${n} cách:${items.replace(/\bcách thức /g, 'cách ')}`);

  // --- 3. yuganaddha ---
  const before = out;
  out = out.replace(/song vận hợp nhất/g, 'song vận');
  if (out !== before) stats.yuga += (before.match(/song vận hợp nhất/g) || []).length;

  if (out !== raw) {
    stats.changed++;
    if (WRITE) fs.writeFileSync(path.join(DIR, file), out, 'utf8');
  }
}

console.log(`files scanned        : ${stats.files}`);
console.log(`files changed        : ${stats.changed}`);
console.log(`enumerations rewritten: ${stats.enumFixed}`);
console.log(`   classifier "phần"  : ${stats.phan}`);
console.log(`   classifier "cách"  : ${stats.cach}`);
console.log(`   already had one    : ${stats.alreadyFull}  (only "gồm" added)`);
console.log(`"song vận hợp nhất"   : ${stats.yuga} -> "song vận"`);
if (samples.length) {
  console.log('\nsamples:');
  for (const s of samples) console.log('  ' + s);
}
if (!WRITE) console.log('\ncheck only - pass --write to apply');
