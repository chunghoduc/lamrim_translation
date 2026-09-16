#!/usr/bin/env node
// Measure prose style over one or more Markdown files, so a claim like "the
// reference book uses shorter sentences" is a number rather than an impression.
//
//   node tools/51-style-metrics.mjs sample/bo-de-tam.md lamrim-vi.md
//
// Everything here is counted on *body prose only*: headings, blockquotes and
// list items are excluded, because they are set by different conventions in the
// two books and mixing them would compare layout, not writing.

import fs from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node tools/51-style-metrics.mjs <file.md> [file.md ...]'); process.exit(2); }

// JS `\b` is ASCII-only, so `\bấy\b` does not mean what it looks like: it finds
// a boundary in the middle of "nấy" and none at all before a space-initial "ấy".
// Every Vietnamese word here is bounded with Unicode-aware lookarounds instead.
const W = alts => new RegExp('(?<!\\p{L})(?:' + alts + ')(?!\\p{L})', 'giu');

const FEATURES = [
  // Interpolation apparatus: square brackets are how the current translation
  // marks words supplied by the translator. The reference book uses none.
  ['[...] bracket insert', /\[[^\]\n]{1,60}\]/g],
  ['v.v.', /v\.v\./g],
  ['tức là / tức', W('tức\\s+là|tức')],
  ['ấy', W('ấy')],
  ['kia', W('kia')],
  ['đó', W('đó')],
  ['này', W('này')],
  ['chúng ta', W('chúng\\s+ta')],
  ['chúng tôi', W('chúng\\s+tôi')],
  ['ta (bare)', /(?<!chúng\s)(?<!\p{L})ta(?!\p{L})/giu],
  ['quý vị / các bạn', W('quý\\s+vị|các\\s+bạn')],
  ['tôi', W('tôi')],
  ['Ngài / Thầy', W('Ngài|Thầy|Rinpoche')],
  ['rhetorical question', /\?/g],
  ['em dash —', /—/g],
  ['colon :', /:/g],
  ['semicolon ;', /;/g],
  ['curly quotes " "', /[“”]/g],
  ['italic *...*', /(?<!\*)\*(?!\*)[^*\n]+\*(?!\*)/g],
  ['"có dạy/dạy rằng"', W('có\\s+dạy|dạy\\s+rằng|nói\\s+rằng|có\\s+nói')],
  ['Hãy (imperative)', /(?:^|[.;:!?]\s+|\n)Hãy(?!\p{L})/gu],
  ['Vì vậy / Do đó / Cho nên', W('Vì\\s+vậy|Do\\s+đó|Cho\\s+nên|Bởi\\s+vậy|Chính\\s+vì\\s+thế')],
];

const rows = [];
for (const f of files) {
  const md = fs.readFileSync(f, 'utf8');
  const body = md.split('\n')
    .filter(l => !/^\s*(#|>|-\s|\*\s|\d+\.\s|---)/.test(l))
    .join('\n')
    .replace(/【\*?\d+】/g, '');            // page markers are apparatus, not prose

  // Sentences: split on . ! ? ... but not on the "v.v." abbreviation, which is
  // frequent in the Lamrim translation and would halve every sentence length.
  const protectedBody = body.replace(/v\.v\./g, 'vXvX');
  const sents = protectedBody.split(/[.!?]+[\s\n]+/).map(s => s.trim()).filter(s => s.length > 1);
  const words = body.split(/\s+/).filter(Boolean);
  const paras = body.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 40);

  const sentWords = sents.map(s => s.split(/\s+/).filter(Boolean).length);
  sentWords.sort((a, b) => a - b);
  const pct = q => sentWords[Math.min(sentWords.length - 1, Math.floor(sentWords.length * q))] || 0;

  const per1k = re => (body.match(re) || []).length / (words.length / 1000);

  rows.push({
    file: f.replace(/^.*[\\/]/, ''),
    words: words.length,
    paras: paras.length,
    paraWords: +(words.length / paras.length).toFixed(1),
    sents: sents.length,
    sentMean: +(sentWords.reduce((a, b) => a + b, 0) / sents.length).toFixed(1),
    sentMed: pct(0.5),
    sentP90: pct(0.9),
    long40: +((sentWords.filter(n => n > 40).length / sents.length) * 100).toFixed(1),
    commaPerSent: +(((body.match(/,/g) || []).length) / sents.length).toFixed(2),
    feat: FEATURES.map(([, re]) => +per1k(re).toFixed(2)),
  });
}

const pad = (s, n) => String(s).padStart(n);
const w = 14;
const head = ['metric'.padEnd(26), ...rows.map(r => pad(r.file.slice(0, w - 1), w))].join('');
console.log(head);
console.log('-'.repeat(head.length));
const line = (name, key, dp = 1) =>
  console.log(name.padEnd(26) + rows.map(r => pad(typeof r[key] === 'number' ? r[key].toFixed(dp) : r[key], w)).join(''));

line('words (body prose)', 'words', 0);
line('paragraphs', 'paras', 0);
line('words / paragraph', 'paraWords');
line('sentences', 'sents', 0);
line('words / sentence (mean)', 'sentMean');
line('  median', 'sentMed', 0);
line('  90th percentile', 'sentP90', 0);
line('  % over 40 words', 'long40');
line('commas / sentence', 'commaPerSent', 2);
console.log('-'.repeat(head.length));
console.log('per 1000 words:');
FEATURES.forEach(([name], i) =>
  console.log(('  ' + name).padEnd(26) + rows.map(r => pad(r.feat[i].toFixed(2), w)).join('')));
