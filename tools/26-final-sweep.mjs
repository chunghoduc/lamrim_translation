// Final sweep: for EVERY font that reaches source/clean, probe a wide list of
// words that require a subjoined letter. A stack still being dropped shows up
// as "correct form absent, broken form present".
//
// This exists because སྦྱ slipped past both the lexicon check (སྦོར is itself a
// valid syllable) and the genitive check (not a particle) - it was only caught
// by a page comparison. This probes the whole class directly.
import fs from 'node:fs';
import path from 'node:path';
import { decode, keep } from './decode.mjs';
import { RAW } from './config.mjs';

// correct form, form it collapses to if the subjoined letter is dropped
const PROBE = [
  ['ཀྱི', 'ཀི'], ['ཀྱང', 'ཀང'], ['ཁྱད', 'ཁད'], ['ཁྲིམས', 'ཁིམས'],
  ['གྱི', 'གི'], ['གྱུར', 'གུར'], ['གྲུབ', 'གུབ'], ['གླིང', 'གིང'],
  ['ངྒ', 'ང'], ['ཅི', 'ཅི'],
  ['དྲན', 'དན'], ['དྲུག', 'དུག'],
  ['པྱ', 'པ'], ['ཕྱིར', 'ཕིར'], ['ཕྲག', 'ཕག'],
  ['བྱང', 'བང'], ['བྲལ', 'བལ'], ['བློ', 'བོ'],
  ['མྱོང', 'མོང'],
  ['རྐྱེན', 'རྐེན'], ['རྗེས', 'རེས'], ['རྙེད', 'རེད'], ['རྟོགས', 'རོགས'],
  ['རྡོ', 'རོ'], ['རྩ་བ', 'ར་བ'], ['རྫོགས', 'རོགས'],
  ['ལྕི', 'ལི'], ['ལྷག', 'ལག'],
  ['སྐྱེ', 'སྐེ'], ['སྒྲུབ', 'སྒུབ'], ['སྙིང', 'སིང'], ['སྤྱོད', 'སྤོད'],
  ['སྤྲོས', 'སྤོས'], ['སྦྱོར', 'སྦོར'], ['སྦྱངས', 'སྦངས'], ['སྨྲ', 'སྨ'],
  ['སྲིད', 'སིད'], ['སླབ', 'སབ'], ['ཟླ་བ', 'ཟ་བ'], ['ཧྲིལ', 'ཧིལ'],
];

const perFont = new Map();
for (const file of fs.readdirSync(path.join(RAW, 'glyphs')).sort()) {
  for (const g of JSON.parse(fs.readFileSync(path.join(RAW, 'glyphs', file), 'utf8'))) {
    if (!keep(g)) continue;
    perFont.set(g.fb, (perFont.get(g.fb) || '') + decode(g));
  }
}

const count = (h, n) => { let c = 0, i = 0; while ((i = h.indexOf(n, i)) !== -1) { c++; i++; } return c; };
let suspects = 0;

for (const [font, text] of [...perFont.entries()].sort((a, b) => b[1].length - a[1].length)) {
  if (text.length < 300) continue;
  const rows = [];
  for (const [good, bad] of PROBE) {
    if (good === bad) continue;
    const g = count(text, good), b = count(text, bad);
    if (g === 0 && b > 0) { rows.push([good, bad, g, b]); }
  }
  console.log(`\n===== ${font}  (${text.length.toLocaleString()} chars) =====`);
  if (!rows.length) { console.log('   no dropped-subjoined signature found'); continue; }
  for (const [good, bad, g, b] of rows) {
    console.log(`   SUSPECT  ${good.padEnd(9)} absent   ${bad.padEnd(9)} x${b}`);
    suspects++;
  }
}
console.log(`\ntotal suspect stacks across all fonts: ${suspects}`);
