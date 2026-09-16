#!/usr/bin/env node
// docx -> Markdown, for the reference translation in sample/.
//
// This is a style-study tool, not part of the translation pipeline. It exists
// because there is no pandoc on this machine and because the file carries its
// structure in *direct formatting* (bold + size + centring) rather than in
// Heading styles, so a generic converter would flatten every heading into a
// plain paragraph and the thing we want to study - how the book is shaped -
// would be the first thing lost.
//
//   node tools/50-docx2md.mjs <file.docx> [--out out.md] [--dump]
//
// --dump prints one line per paragraph with its measured formatting instead of
// Markdown, which is how the heading thresholds below were chosen.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const args = process.argv.slice(2);
const src = args.find(a => !a.startsWith('--'));
if (!src) { console.error('usage: node tools/50-docx2md.mjs <file.docx> [--out out.md] [--dump]'); process.exit(2); }
const outArg = args.indexOf('--out');
const outPath = outArg !== -1 ? args[outArg + 1] : src.replace(/\.docx$/i, '.md');
const DUMP = args.includes('--dump');

// --- unzip ------------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-'));
execFileSync('unzip', ['-o', '-q', src, '-d', tmp]);
const xml = fs.readFileSync(path.join(tmp, 'word', 'document.xml'), 'utf8');

// --- tiny XML helpers -------------------------------------------------------
const ents = s => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&');

const attr = (tag, name) => {
  const m = tag.match(new RegExp('w:' + name + '="([^"]*)"'));
  return m ? m[1] : null;
};
// <w:b/> and <w:b w:val="1"/> are on; <w:b w:val="0"/> is off.
const flag = (props, name) => {
  const m = props.match(new RegExp('<w:' + name + '(?:\\s+[^>]*)?/?>'));
  if (!m) return false;
  const v = attr(m[0], 'val');
  return v === null || v === '1' || v === 'true' || v === 'on';
};

// --- paragraphs -------------------------------------------------------------
const body = xml.slice(xml.indexOf('<w:body>'));
const paras = [];
const pRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>|<w:p\b[^>]*\/>/g;
let m;
while ((m = pRe.exec(body)) !== null) {
  const inner = m[1] || '';
  const pPrM = inner.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/);
  const pPr = pPrM ? pPrM[1] : '';
  const jc = (pPr.match(/<w:jc w:val="([^"]*)"/) || [])[1] || 'left';
  const indL = +((pPr.match(/<w:ind[^>]*w:left="(\d+)"/) || [])[1] || 0);
  const indF = +((pPr.match(/<w:ind[^>]*w:firstLine="(\d+)"/) || [])[1] || 0);
  const numbered = /<w:numPr>/.test(pPr);
  const pStyle = (pPr.match(/<w:pStyle w:val="([^"]*)"/) || [])[1] || '';

  // runs
  const runs = [];
  const rRe = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
  let r;
  while ((r = rRe.exec(inner.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, ''))) !== null) {
    const ri = r[1];
    const rPrM = ri.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
    const rPr = rPrM ? rPrM[1] : '';
    let text = '';
    const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g;
    let t;
    while ((t = tRe.exec(ri)) !== null) {
      if (t[0] === '<w:tab/>') text += '\t';
      else if (t[0] === '<w:br/>') text += '\n';
      else text += ents(t[1]);
    }
    if (!text) continue;
    runs.push({
      text,
      b: flag(rPr, 'b'),
      i: flag(rPr, 'i'),
      sz: +((rPr.match(/<w:sz w:val="(\d+)"/) || [])[1] || 0) / 2, // half-points
      caps: flag(rPr, 'caps'),
    });
  }
  const text = runs.map(x => x.text).join('');
  if (!text.trim() && !runs.length) { paras.push(null); continue; } // blank
  const sz = Math.max(0, ...runs.map(x => x.sz));
  const allBold = runs.length > 0 && runs.every(x => x.b || !x.text.trim());
  paras.push({ text, runs, jc, indL, indF, numbered, pStyle, sz, allBold });
}

const real = paras.filter(Boolean);

if (DUMP) {
  for (const p of real) {
    console.log([
      p.jc.padEnd(7),
      String(p.sz).padStart(4),
      p.allBold ? 'B' : '-',
      String(p.indL).padStart(5),
      String(p.indF).padStart(4),
      p.numbered ? 'N' : '-',
      JSON.stringify(p.text.slice(0, 90)),
    ].join(' '));
  }
  process.exit(0);
}

// --- inline markup ----------------------------------------------------------
// Merge adjacent runs sharing bold/italic, then emit ** / *. Word splits a run
// at every spell-check and revision boundary, so un-merged runs produce
// "**tâm**** bồ đề**" - visible garbage in the Markdown.
function inline(runs) {
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && last.b === r.b && last.i === r.i) last.text += r.text;
    else merged.push({ ...r });
  }
  let out = '';
  for (const r of merged) {
    let t = r.text.replace(/\s+/g, ' ');
    if (!t.trim()) { out += t; continue; }
    // don't wrap the surrounding spaces in the emphasis span
    const lead = t.match(/^\s*/)[0], trail = t.match(/\s*$/)[0];
    let core = t.slice(lead.length, t.length - trail.length);
    core = core.replace(/([*_`])/g, '\\$1');
    if (r.b && r.i) core = '***' + core + '***';
    else if (r.b) core = '**' + core + '**';
    else if (r.i) core = '*' + core + '*';
    out += lead + core + trail;
  }
  return out.replace(/\*\*\s*\*\*/g, ' ').trim();
}

// --- classification ---------------------------------------------------------
// The file carries no Heading styles, so the shape has to be read off the
// formatting. Measured over all 668 paragraphs, only six combinations exist:
//
//   centre 18pt bold            chapter banner ("CHƯƠNG 3") and chapter title
//   bold 14pt, no first-line    section heading
//   bold 14pt, first-line 360+  sub-heading
//   centre 14pt, not bold       VERSE - 253 paragraphs, a quarter of the book
//   justified 14pt, first-line  body prose
//   left-indent 720/1080, "–"/"•"  bullet list, one nesting level
//
// The centred-verse convention is the one that matters most: this book never
// sets a stanza as an indented prose quote, it centres it line by line.
const sizeCount = new Map();
for (const p of real) for (const r of p.runs) if (r.text.trim()) sizeCount.set(r.sz, (sizeCount.get(r.sz) || 0) + r.text.length);
const bodySz = [...sizeCount.entries()].sort((a, b) => b[1] - a[1])[0][0];

// A bullet is a bullet even when it is bold: the Seven Limbs are set as bold
// dashed items, and reading bold alone turns each of them into a heading.
const BULLET = /^\s*[–—•*-]\s+/;

function kind(p) {
  const t = p.text.trim();
  if (p.sz > bodySz) return 'h1';
  if (BULLET.test(t) && p.indL >= 360) return 'bullet';
  // The source has exactly two heading tiers: 18pt centred (chapter) and 14pt
  // bold (section). The first-line indent on bold paragraphs is 0/360/720 with
  // no relation to depth - "Bước Thứ Ba" is 720 and "Bước Thứ Tư" is 0 - so it
  // is decorative noise, and reading depth out of it would invent a hierarchy
  // the author did not set. Everything bold is one tier.
  if (p.allBold && t.length < 200) return 'h2';
  if (p.jc === 'center') return 'verse';
  if (p.jc === 'right') return 'signature';
  if (p.indL >= 360 || p.numbered) return 'bullet';
  return 'body';
}

// --- emit -------------------------------------------------------------------
const out = [];
let verse = [];
const flushVerse = () => {
  if (!verse.length) return;
  // Markdown has no "centred stanza"; a blockquote with hard line breaks is the
  // closest thing that survives a round-trip and still reads as a unit.
  out.push(verse.map(l => '> ' + l).join('  \n'));
  verse = [];
};

for (let i = 0; i < paras.length; i++) {
  const p = paras[i];
  if (!p || !p.text.trim()) { flushVerse(); continue; }
  const k = kind(p);
  if (k !== 'verse') flushVerse();
  const txt = inline(p.runs);
  const plain = p.text.trim().replace(/\s+/g, ' ');

  switch (k) {
    case 'h1': {
      // "CHƯƠNG 3" is set as its own paragraph above the chapter's title.
      // Joining them keeps one heading per chapter instead of two empty ones.
      const next = paras[i + 1];
      if (/^CHƯƠNG\s+\d+$/i.test(plain) && next && next.sz > bodySz) {
        out.push('# ' + plain + ' — ' + next.text.trim().replace(/\s+/g, ' '));
        i++;
      } else out.push('# ' + plain);
      break;
    }
    case 'h2': out.push('## ' + plain); break;
    case 'h3': out.push('### ' + plain); break; // unused: the source has no third tier
    case 'verse': verse.push(txt); break;
    // The colophon lines are already italic in the source; wrapping them again
    // nests the emphasis and Markdown renders the stray asterisks literally.
    case 'signature': out.push(txt); break;
    case 'bullet': {
      const depth = p.indL >= 1000 ? 1 : 0;
      // The dash may sit inside the run's emphasis ("**– Đảnh lễ**"), so strip
      // it after any opening ** / * rather than only at the start of the line.
      out.push('  '.repeat(depth) + '- ' + txt.replace(/^(\**)\s*[–—•-]\s*/, '$1'));
      break;
    }
    default: out.push(txt);
  }
}
flushVerse();

const md = out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
fs.writeFileSync(outPath, md, 'utf8');
fs.rmSync(tmp, { recursive: true, force: true });

console.error(`body size ${bodySz}pt`);
console.error(`${real.length} paragraphs -> ${outPath} (${(md.length / 1024).toFixed(0)} KB, ` +
  `${md.split('\n').filter(l => l.startsWith('#')).length} headings, ` +
  `${md.split('\n').filter(l => l.startsWith('>')).length} quote lines)`);
