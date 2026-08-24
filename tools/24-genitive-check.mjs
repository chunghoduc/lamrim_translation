// Tibetan genitive/instrumental particle agreement - an independent grammatical
// check the lexicon cannot make, because གི and གྱི are BOTH valid syllables.
//
// The particle form is fixed by the previous syllable's final letter:
//    ག ང      -> གི  / གིས
//    ད བ ས    -> ཀྱི / ཀྱིས
//    ན མ ར ལ  -> གྱི / གྱིས
//    (no suffix / vowel) -> འི / ཡི
//
// If a font drops the ya-btags, གྱི collapses to གི and agreement breaks in a
// very visible way. This both validates the body-font repair and resolves the
// secondary fonts, where the lexicon ties.
import fs from 'node:fs';
import path from 'node:path';
import { REPAIR as BODY_REPAIR, BODY_FONT } from './repair-table.mjs';
import { RAW } from './config.mjs';

const EXPECT = new Map([
  ['ག', 'གི'], ['ང', 'གི'],
  ['ད', 'ཀྱི'], ['བ', 'ཀྱི'], ['ས', 'ཀྱི'],
  ['ན', 'གྱི'], ['མ', 'གྱི'], ['ར', 'གྱི'], ['ལ', 'གྱི'],
]);
const PARTICLES = new Set(['གི', 'གྱི', 'ཀྱི', 'གིས', 'གྱིས', 'ཀྱིས', 'ཡི', 'ཡིས', 'འི']);

// final consonant of a syllable: last base letter that is a legal suffix
const SUFFIX = new Set(['ག', 'ང', 'ད', 'ན', 'བ', 'མ', 'འ', 'ར', 'ల', 'ལ', 'ས']);
function finalOf(syl) {
  const bases = [...syl].filter(c => { const cp = c.codePointAt(0); return cp >= 0x0F40 && cp <= 0x0F6C; });
  if (bases.length < 2) return null;                 // single letter = no suffix
  // particle selection uses the ACTUAL final letter, including a second suffix:
  // རྣམས -> ས -> ཀྱི,  སོགས -> ས -> ཀྱི
  const last = bases[bases.length - 1];
  return SUFFIX.has(last) ? last : null;
}

function analyse(text, label) {
  const syls = text.split(/[་།༎༑༔\s]+/).filter(Boolean);
  let checked = 0, agree = 0;
  const bad = new Map();
  for (let i = 1; i < syls.length; i++) {
    const p = syls[i];
    if (!PARTICLES.has(p)) continue;
    const base = p.replace(/ས$/, '');
    if (!['གི', 'གྱི', 'ཀྱི'].includes(base)) continue;
    const fin = finalOf(syls[i - 1]);
    if (!fin || !EXPECT.has(fin)) continue;
    checked++;
    const want = EXPECT.get(fin);
    if (want === base) agree++;
    else {
      const k = `after ${fin}: got ${base}, expected ${want}`;
      bad.set(k, (bad.get(k) || 0) + 1);
    }
  }
  console.log(`\n${label}`);
  console.log(`  particles checked: ${checked.toLocaleString()}   agreement: ${checked ? (100 * agree / checked).toFixed(2) : '-'}%`);
  for (const [k, n] of [...bad.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`     ${String(n).padStart(5)}x  ${k}`);
  }
  return { checked, agree };
}

// body text, repaired
const clean = fs.readFileSync(path.join('source', 'clean', 'lamrim.txt'), 'utf8');
analyse(clean, 'REPAIRED body text (source/clean/lamrim.txt)');

// body text, unrepaired - for contrast
let raw = '';
for (const f of fs.readdirSync(path.join(RAW, 'glyphs')).sort()) {
  for (const g of JSON.parse(fs.readFileSync(path.join(RAW, 'glyphs', f), 'utf8'))) {
    if (g.fb === BODY_FONT && g.y >= 55 && g.y <= 535) raw += g.u ?? '';
  }
}
analyse(raw, 'UNREPAIRED body font (raw ToUnicode)');

// each secondary font, unrepaired
for (const font of ['DTREBQ+Qomolangma-Uchen-Sarchen', 'DTREBQ+Qomolangma-Uchen-Sarchung']) {
  let t = '';
  for (const f of fs.readdirSync(path.join(RAW, 'glyphs')).sort()) {
    for (const g of JSON.parse(fs.readFileSync(path.join(RAW, 'glyphs', f), 'utf8'))) {
      if (g.fb === font && g.y >= 55 && g.y <= 535) t += g.u ?? '';
    }
  }
  analyse(t, `UNREPAIRED ${font}`);
}
