// Phase 1: extract the embedded body font + its ToUnicode CMap, to find out
// whether distinct glyphs are being collapsed onto the same Unicode string.
// If glyph IDs are distinct, an exact remapping is possible.
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFArray, PDFRawStream } from 'pdf-lib';
import * as pako from 'zlib';
import { PDF_URL, QA } from './config.mjs';

const bytes = fs.readFileSync(PDF_URL);
const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
const ctx = pdf.context;

function decode(stream) {
  try {
    let d = stream.getContents();
    const f = stream.dict.get(PDFName.of('Filter'));
    const name = f?.encodedName ?? f?.toString?.();
    if (name && String(name).includes('FlateDecode')) d = pako.inflateSync(Buffer.from(d));
    return Buffer.from(d);
  } catch (e) { return null; }
}

const fonts = [];
for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
  if (!(obj instanceof PDFDict)) continue;
  if (obj.get(PDFName.of('Type'))?.toString() !== '/Font') continue;
  const sub = obj.get(PDFName.of('Subtype'))?.toString();
  const base = obj.get(PDFName.of('BaseFont'))?.toString();
  fonts.push({ ref: ref.toString(), sub, base, dict: obj });
}
console.log(`found ${fonts.length} font objects\n`);
for (const f of fonts) console.log(` ${f.ref.padEnd(10)} ${String(f.sub).padEnd(16)} ${f.base}`);

fs.mkdirSync(path.join(QA, 'font'), { recursive: true });

for (const f of fonts) {
  const tuRef = f.dict.get(PDFName.of('ToUnicode'));
  if (!tuRef) continue;
  const tu = ctx.lookup(tuRef);
  if (!(tu instanceof PDFStream)) continue;
  const raw = decode(tu);
  if (!raw) { console.log(`\n${f.base}: ToUnicode present but could not decode`); continue; }
  const txt = raw.toString('latin1');

  // parse bfchar / bfrange entries
  const map = new Map(); // code(hex) -> unicode string
  for (const m of txt.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const e of m[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      map.set(parseInt(e[1], 16), e[2]);
    }
  }
  for (const m of txt.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const e of m[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      const lo = parseInt(e[1], 16), hi = parseInt(e[2], 16);
      let u = parseInt(e[3].slice(0, 4), 16);
      for (let c = lo; c <= hi; c++) map.set(c, (u++).toString(16).padStart(4, '0'));
    }
  }
  const toStr = h => h.match(/.{4}/g)?.map(x => String.fromCharCode(parseInt(x, 16))).join('') ?? '';

  // find collisions: several glyph codes -> identical unicode output
  const inv = new Map();
  for (const [code, hex] of map) {
    const s = toStr(hex);
    if (!inv.has(s)) inv.set(s, []);
    inv.get(s).push(code);
  }
  const collisions = [...inv.entries()].filter(([, codes]) => codes.length > 1);
  console.log(`\n===== ${f.base} (${f.ref}) =====`);
  console.log(`  ToUnicode entries: ${map.size}   distinct outputs: ${inv.size}   COLLIDING outputs: ${collisions.length}`);
  if (collisions.length) {
    console.log('  top collisions (same Unicode from different glyphs):');
    for (const [s, codes] of collisions.sort((a, b) => b[1].length - a[1].length).slice(0, 12)) {
      const cps = [...s].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase()).join(' ');
      console.log(`    "${s}" [${cps}]  <- glyph codes: ${codes.slice(0, 10).join(',')}${codes.length > 10 ? ` (+${codes.length - 10})` : ''}`);
    }
  }
  const outFile = path.join(QA, 'font', `${f.base.replace(/[^\w]/g, '_')}.tounicode.txt`);
  fs.writeFileSync(outFile, txt);
  console.log(`  raw CMap -> ${path.relative(process.cwd(), outFile)}`);
}
