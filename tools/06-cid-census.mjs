// Decode page content streams to raw CIDs for the body font, and census which
// CIDs the book actually uses. This bypasses the defective ToUnicode: with a
// corrected CID -> Unicode table, extraction becomes lossless.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFArray, PDFRef } from 'pdf-lib';
import { PDF_URL, QA } from './config.mjs';

const pdf = await PDFDocument.load(fs.readFileSync(PDF_URL), { updateMetadata: false });
const ctx = pdf.context;

function decodeStream(s) {
  let d = Buffer.from(s.getContents());
  const f = s.dict.get(PDFName.of('Filter'));
  const n = String(f?.encodedName ?? f?.toString() ?? '');
  if (n.includes('FlateDecode')) { try { d = zlib.inflateSync(d); } catch { return Buffer.alloc(0); } }
  return d;
}

// --- body font's ToUnicode, as shipped -------------------------------------
function loadToUnicode(fontDict) {
  const tu = ctx.lookup(fontDict.get(PDFName.of('ToUnicode')));
  if (!(tu instanceof PDFStream)) return new Map();
  const txt = decodeStream(tu).toString('latin1');
  const map = new Map();
  for (const m of txt.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const e of m[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g))
      map.set(parseInt(e[1], 16), (e[2].match(/.{4}/g) || []).map(h => String.fromCharCode(parseInt(h, 16))).join(''));
  return map;
}

// find the body font (Type0 MonlamUniOuChan2)
let bodyFontDict = null, bodyRef = null;
for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
  if (!(obj instanceof PDFDict)) continue;
  if (obj.get(PDFName.of('Type'))?.toString() !== '/Font') continue;
  if (obj.get(PDFName.of('Subtype'))?.toString() !== '/Type0') continue;
  if (String(obj.get(PDFName.of('BaseFont'))?.toString()).includes('MonlamUniOuChan2')) {
    bodyFontDict = obj; bodyRef = ref;
  }
}
console.log('body font object:', bodyRef?.toString());
const toUni = loadToUnicode(bodyFontDict);
console.log('ToUnicode entries:', toUni.size);

// --- walk pages, find the resource name bound to the body font -------------
const pages = pdf.getPages();
const cidCount = new Map();
let pagesWithBody = 0;

for (let i = 0; i < pages.length; i++) {
  const page = pages[i];
  const res = ctx.lookup(page.node.get(PDFName.of('Resources')));
  const fonts = res instanceof PDFDict ? ctx.lookup(res.get(PDFName.of('Font'))) : null;
  if (!(fonts instanceof PDFDict)) continue;
  const names = [];
  for (const [k, v] of fonts.entries()) {
    const r = v instanceof PDFRef ? v : null;
    if (r && bodyRef && r.tag === bodyRef.tag) names.push(k.encodedName.replace(/^\//, ''));
  }
  if (!names.length) continue;
  pagesWithBody++;

  // concatenate content streams
  let content = page.node.get(PDFName.of('Contents'));
  content = ctx.lookup(content);
  let buf = Buffer.alloc(0);
  if (content instanceof PDFArray) {
    for (const c of content.asArray()) buf = Buffer.concat([buf, decodeStream(ctx.lookup(c)), Buffer.from('\n')]);
  } else if (content instanceof PDFStream) buf = decodeStream(content);
  const txt = buf.toString('latin1');

  // track current font via Tf, collect hex strings shown with Tj / TJ
  const tokenRe = /\/([A-Za-z0-9#._-]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f\s]*)>\s*(?=Tj|TJ|\]|\s)/g;
  let cur = null, m;
  while ((m = tokenRe.exec(txt))) {
    if (m[1] !== undefined) { cur = m[1]; continue; }
    if (m[2] === undefined || !names.includes(cur)) continue;
    const hex = m[2].replace(/\s+/g, '');
    for (let k = 0; k + 3 < hex.length + 1; k += 4) {
      const cid = parseInt(hex.slice(k, k + 4), 16);
      if (!Number.isNaN(cid)) cidCount.set(cid, (cidCount.get(cid) || 0) + 1);
    }
  }
}

const total = [...cidCount.values()].reduce((a, b) => a + b, 0);
console.log(`pages using body font: ${pagesWithBody}`);
console.log(`distinct CIDs used: ${cidCount.size}   total glyph occurrences: ${total.toLocaleString()}`);

// which used CIDs have no ToUnicode entry, and which collide?
const byOut = new Map();
for (const [cid] of cidCount) {
  const u = toUni.get(cid);
  const key = u === undefined ? '(UNMAPPED)' : u;
  if (!byOut.has(key)) byOut.set(key, []);
  byOut.get(key).push(cid);
}
const collide = [...byOut.entries()].filter(([k, v]) => k !== '(UNMAPPED)' && v.length > 1);
console.log(`\nused CIDs with NO ToUnicode entry: ${(byOut.get('(UNMAPPED)') || []).length}`);
console.log(`Unicode outputs produced by MORE THAN ONE used CID: ${collide.length}`);

const rows = [];
for (const [out, cids] of collide.sort((a, b) =>
  b[1].reduce((s, c) => s + cidCount.get(c), 0) - a[1].reduce((s, c) => s + cidCount.get(c), 0))) {
  const cps = [...out].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase()).join(' ');
  const detail = cids.map(c => `${c}(${cidCount.get(c).toLocaleString()}x)`).join(' ');
  rows.push(`  "${out}" [${cps}]\n      ${detail}`);
}
console.log(rows.slice(0, 25).join('\n'));

fs.mkdirSync(QA, { recursive: true });
fs.writeFileSync(path.join(QA, 'cid-census.json'), JSON.stringify({
  bodyFont: 'DTREBQ+MonlamUniOuChan2',
  totalGlyphOccurrences: total,
  cids: [...cidCount.entries()].sort((a, b) => b[1] - a[1])
    .map(([cid, n]) => ({ cid, count: n, toUnicode: toUni.get(cid) ?? null })),
}, null, 1));
console.log('\nwrote qa/cid-census.json');
