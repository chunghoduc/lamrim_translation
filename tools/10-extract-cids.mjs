// Foundation for exact extraction: per-page, ordered CID sequences WITH positions.
//
// Method: decode the content stream to get the true CID order, and take positions
// from pdfjs text items. The two are aligned by matching each item's `str` against
// the concatenated ToUnicode of the next CIDs. Alignment is exact because `str`
// IS that concatenation - so any mismatch is a real bug and is reported, not skipped.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFArray, PDFRef } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDF_URL, STD_FONTS, RAW, QA } from './config.mjs';

const decode = s => {
  let d = Buffer.from(s.getContents());
  const f = s.dict.get(PDFName.of('Filter'));
  if (String(f?.encodedName ?? f?.toString() ?? '').includes('FlateDecode')) {
    try { d = zlib.inflateSync(d); } catch { return Buffer.alloc(0); }
  }
  return d;
};

const lib = await PDFDocument.load(fs.readFileSync(PDF_URL), { updateMetadata: false });
const ctx = lib.context;

// ---- collect every Type0 font's ToUnicode, keyed by object ref ----
const fontByRef = new Map();
for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
  if (!(obj instanceof PDFDict)) continue;
  if (obj.get(PDFName.of('Type'))?.toString() !== '/Font') continue;
  const base = String(obj.get(PDFName.of('BaseFont'))?.toString() || '').replace(/^\//, '');
  const isType0 = obj.get(PDFName.of('Subtype'))?.toString() === '/Type0';
  const tu = ctx.lookup(obj.get(PDFName.of('ToUnicode')));
  const map = new Map();
  if (tu instanceof PDFStream) {
    const txt = decode(tu).toString('latin1');
    for (const m of txt.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
      for (const e of m[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g))
        map.set(parseInt(e[1], 16), (e[2].match(/.{4}/g) || []).map(h => String.fromCharCode(parseInt(h, 16))).join(''));
  }
  fontByRef.set(ref.toString(), { base, isType0, toUni: map });
}

const doc = await pdfjs.getDocument({ url: PDF_URL, useSystemFonts: true, standardFontDataUrl: STD_FONTS }).promise;
const pages = lib.getPages();
const outDir = path.join(RAW, 'cids');
fs.mkdirSync(outDir, { recursive: true });

const problems = [];
let totalGlyphs = 0, alignedItems = 0, failedItems = 0;

for (let i = 0; i < pages.length; i++) {
  const pageNo = i + 1;
  const node = pages[i].node;

  // resource-name -> font info for this page
  const res = ctx.lookup(node.get(PDFName.of('Resources')));
  const fontsDict = res instanceof PDFDict ? ctx.lookup(res.get(PDFName.of('Font'))) : null;
  const nameToFont = new Map();
  if (fontsDict instanceof PDFDict) {
    for (const [k, v] of fontsDict.entries()) {
      const ref = v instanceof PDFRef ? v.toString() : null;
      if (ref && fontByRef.has(ref)) nameToFont.set(k.encodedName.replace(/^\//, ''), fontByRef.get(ref));
    }
  }

  // content stream -> ordered (fontResourceName, cid) list
  let contents = ctx.lookup(node.get(PDFName.of('Contents')));
  let buf = Buffer.alloc(0);
  if (contents instanceof PDFArray) {
    for (const c of contents.asArray()) buf = Buffer.concat([buf, decode(ctx.lookup(c)), Buffer.from('\n')]);
  } else if (contents instanceof PDFStream) buf = decode(contents);
  const cs = buf.toString('latin1');

  const seq = [];
  const re = /\/([A-Za-z0-9#._-]+)\s+[\d.eE+-]+\s+Tf|<([0-9A-Fa-f\s]*)>/g;
  let cur = null, m;
  while ((m = re.exec(cs))) {
    if (m[1] !== undefined) { cur = m[1]; continue; }
    const info = nameToFont.get(cur);
    if (!info) continue;
    const hex = m[2].replace(/\s+/g, '');
    if (info.isType0) {
      for (let k = 0; k + 1 < hex.length; k += 4) seq.push({ f: cur, cid: parseInt(hex.slice(k, k + 4), 16) });
    } else {
      for (let k = 0; k + 1 < hex.length; k += 2) seq.push({ f: cur, cid: parseInt(hex.slice(k, k + 2), 16) });
    }
  }

  // pdfjs items (positions), aligned against the CID sequence
  const page = await doc.getPage(pageNo);
  const tc = await page.getTextContent();
  const glyphs = [];
  let p = 0;
  for (const it of tc.items) {
    if (it.str === undefined || it.str === '') continue;
    const want = it.str;
    // greedily consume CIDs until their ToUnicode concatenation matches `want`
    let acc = '', taken = [];
    while (p < seq.length && acc.length < want.length) {
      const g = seq[p];
      const info = nameToFont.get(g.f);
      const u = info?.toUni.get(g.cid) ?? '';
      acc += u; taken.push(g); p++;
    }
    if (acc === want) {
      alignedItems++;
      const x = it.transform[4], y = it.transform[5], size = Math.abs(it.transform[3]);
      // distribute along the item's width; exact per-glyph x needs the text matrix,
      // this is sufficient for locating a syllable on the page
      const w = it.width || 0;
      taken.forEach((g, gi) => glyphs.push({
        cid: g.cid, f: g.f, page: pageNo,
        x: +(x + (w * gi) / Math.max(taken.length, 1)).toFixed(2),
        y: +y.toFixed(2), s: +size.toFixed(1),
      }));
      totalGlyphs += taken.length;
    } else {
      failedItems++;
      if (problems.length < 40) problems.push({ page: pageNo, want, got: acc });
      p -= taken.length;               // rewind; do not corrupt the stream
      // advance one to avoid an infinite stall on this item
      if (p < seq.length) p++;
    }
  }
  page.cleanup();

  fs.writeFileSync(path.join(outDir, `p${String(pageNo).padStart(4, '0')}.json`), JSON.stringify(glyphs));
  if (pageNo % 100 === 0) process.stdout.write(`  ...page ${pageNo}\n`);
}

console.log(`\naligned items: ${alignedItems.toLocaleString()}   failed: ${failedItems.toLocaleString()}`);
console.log(`positioned glyphs written: ${totalGlyphs.toLocaleString()}`);
console.log(`-> ${path.relative(process.cwd(), outDir)}/pNNNN.json`);
if (problems.length) {
  fs.writeFileSync(path.join(QA, 'alignment-problems.json'), JSON.stringify(problems, null, 1));
  console.log(`\nfirst alignment mismatches -> qa/alignment-problems.json`);
  for (const q of problems.slice(0, 5)) console.log(`  p${q.page}: want ${JSON.stringify(q.want.slice(0, 24))} got ${JSON.stringify(q.got.slice(0, 24))}`);
}
