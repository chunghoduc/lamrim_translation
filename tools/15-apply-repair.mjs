// Apply the CID repair table to the whole corpus and validate the result
// against Tibetan orthography. This is the independent cross-check: a wrong
// entry in the table produces consonant stacks that do not exist in Tibetan,
// and they show up here with their frequency.
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { loadFont } from './pdffonts.mjs';
import { REPAIR, BODY_FONT } from './repair-table.mjs';
import { syllables, illegalStacks, LEGAL } from './tibetan.mjs';
import { PDF_URL, RAW, QA } from './config.mjs';

const lib = await PDFDocument.load(fs.readFileSync(PDF_URL), { updateMetadata: false });
const ctx = lib.context;

// ToUnicode maps for every font, keyed by base name
const fontsByBase = new Map();
for (const [, obj] of ctx.enumerateIndirectObjects()) {
  if (!(obj instanceof PDFDict)) continue;
  if (obj.get(PDFName.of('Type'))?.toString() !== '/Font') continue;
  const f = loadFont(ctx, obj);
  if (f && f.toUniMap.size && !fontsByBase.has(f.base)) fontsByBase.set(f.base, f);
}

const decodeGlyph = g => {
  if (g.fb === BODY_FONT && REPAIR[g.code]) return REPAIR[g.code].to;
  return g.u ?? '';
};

const files = fs.readdirSync(path.join(RAW, 'glyphs')).sort();
const badStacks = new Map();     // illegal stack -> count
const badExamples = new Map();   // illegal stack -> sample syllables
let sylTotal = 0, sylBad = 0;
const beforeBad = new Map();

for (const file of files) {
  const glyphs = JSON.parse(fs.readFileSync(path.join(RAW, 'glyphs', file), 'utf8'));
  const body = glyphs.filter(g => g.fb === BODY_FONT);

  const after = body.map(decodeGlyph).join('');
  const before = body.map(g => g.u ?? '').join('');

  for (const s of syllables(after)) {
    sylTotal++;
    const bad = illegalStacks(s);
    if (bad.length) {
      sylBad++;
      for (const b of bad) {
        badStacks.set(b, (badStacks.get(b) || 0) + 1);
        if (!badExamples.has(b)) badExamples.set(b, new Set());
        const ex = badExamples.get(b);
        if (ex.size < 6) ex.add(s);
      }
    }
  }
  for (const s of syllables(before)) {
    for (const b of illegalStacks(s)) beforeBad.set(b, (beforeBad.get(b) || 0) + 1);
  }
}

const beforeTotal = [...beforeBad.values()].reduce((a, b) => a + b, 0);
const afterTotal = [...badStacks.values()].reduce((a, b) => a + b, 0);

console.log(`legal stacks known: ${LEGAL.size}`);
console.log(`syllables checked : ${sylTotal.toLocaleString()}`);
console.log('');
console.log(`illegal stack occurrences BEFORE repair: ${beforeTotal.toLocaleString()}  (${beforeBad.size} distinct)`);
console.log(`illegal stack occurrences AFTER  repair: ${afterTotal.toLocaleString()}  (${badStacks.size} distinct)`);
const red = beforeTotal ? (100 * (1 - afterTotal / beforeTotal)).toFixed(2) : '0';
console.log(`reduction: ${red}%`);
console.log(`syllables still containing an illegal stack: ${sylBad.toLocaleString()} (${(100 * sylBad / sylTotal).toFixed(3)}%)`);

console.log('\n--- remaining illegal stacks (most frequent first) ---');
for (const [s, n] of [...badStacks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  const cps = [...s].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase()).join(' ');
  console.log(`  ${String(n).padStart(6)}  "${s}" [${cps}]   e.g. ${[...(badExamples.get(s) || [])].slice(0, 4).join(' ')}`);
}

fs.writeFileSync(path.join(QA, 'validation.json'), JSON.stringify({
  syllables: sylTotal, illegalBefore: beforeTotal, illegalAfter: afterTotal,
  remaining: [...badStacks.entries()].sort((a, b) => b[1] - a[1])
    .map(([s, n]) => ({ stack: s, n, examples: [...(badExamples.get(s) || [])] })),
}, null, 1));
console.log('\n-> qa/validation.json');
