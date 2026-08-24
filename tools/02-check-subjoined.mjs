// Phase 1 validation: does the BODY font (g_d0_f2) drop subjoined consonants?
// Strategy: count high-frequency Tibetan words that REQUIRE a subjoined letter.
// If the font dropped them, these words would be near-absent and their broken
// forms would appear instead.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDF_URL, STD_FONTS } from './config.mjs';

const doc = await pdfjs.getDocument({ url: PDF_URL, useSystemFonts: true, standardFontDataUrl: STD_FONTS }).promise;

// (correct form, broken form if subjoined letter were dropped, gloss)
const PROBES = [
  ['ཀྱི', 'ཀི', 'genitive "of" (ya-btags)'],
  ['གྱི', 'གི', 'genitive "of" (ya-btags)'],
  ['ཀྱང', 'ཀང', '"also" (ya-btags)'],
  ['བློ', 'བོ', '"mind" (la-btags)'],
  ['སྙིང', 'སིང', '"heart" (nya-btags)'],
  ['གྲུབ', 'གུབ', '"accomplish" (ra-btags)'],
  ['སྒྲུབ', 'སྒུབ', '"practice" (ra-btags)'],
  ['རྩོམ', 'རོམ', '"compose" (tsa-btags)'],
  ['སྤྱོད', 'སྤོད', '"conduct" (ya-btags)'],
  ['བྱང', 'བང', '"purify/north" (ya-btags)'],
  ['རྣམ', 'རམ', '"aspect" (na-btags)'],
  ['སྐྱེ', 'སྐེ', '"arise" (ya-btags)'],
];

const byFont = new Map(); // fontId -> concatenated text
const FRONT_MATTER = 20; // skip title/front pages

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  for (const it of tc.items) {
    if (!it.str) continue;
    const y = it.transform[5];
    // body band only; excludes running heads (y~539) and page numbers (y=36)
    const band = (y > 55 && y < 535) ? 'BODY-BAND' : 'MARGIN';
    const key = `${it.fontName}|${p <= FRONT_MATTER ? 'front' : 'main'}|${band}`;
    byFont.set(key, (byFont.get(key) || '') + it.str);
  }
  page.cleanup();
}

const count = (h, n) => { let c = 0, i = 0; while ((i = h.indexOf(n, i)) !== -1) { c++; i++; } return c; };

const keys = [...byFont.keys()].filter(k => byFont.get(k).length > 2000).sort(
  (a, b) => byFont.get(b).length - byFont.get(a).length);

for (const k of keys) {
  const t = byFont.get(k);
  console.log(`\n===== ${k}  (${t.length.toLocaleString()} chars) =====`);
  console.log('correct'.padEnd(10) + 'broken'.padEnd(10) + 'ok'.padStart(7) + 'bad'.padStart(7) + '   verdict');
  for (const [good, bad, gloss] of PROBES) {
    const g = count(t, good), b = count(t, bad);
    // the broken form is often a real word too, so judge by ratio not absence
    const verdict = g === 0 && b > 0 ? '*** DROPPED ***' : g > b ? 'ok' : g > 0 ? 'ok(check)' : 'absent';
    console.log(good.padEnd(10) + bad.padEnd(10) + String(g).padStart(7) + String(b).padStart(7) + `   ${verdict}  ${gloss}`);
  }
  // subjoined-letter codepoint census
  const sub = {};
  for (const c of t) { const cp = c.codePointAt(0); if (cp >= 0x0F90 && cp <= 0x0FBC) sub[c] = (sub[c] || 0) + 1; }
  const top = Object.entries(sub).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([c, n]) => `${c}U+${c.codePointAt(0).toString(16).toUpperCase()}=${n}`).join(' ');
  console.log('subjoined census:', top || '(none)');
}
