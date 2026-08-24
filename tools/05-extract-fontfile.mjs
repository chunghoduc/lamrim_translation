// Extract the embedded TrueType program for the body font and inspect glyph names.
// If the `post` table carries meaningful names we can rebuild an exact CMap.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PDFDocument, PDFName, PDFDict, PDFStream } from 'pdf-lib';
import * as fontkit from 'fontkit';
import { PDF_URL, QA } from './config.mjs';

const pdf = await PDFDocument.load(fs.readFileSync(PDF_URL), { updateMetadata: false });
const ctx = pdf.context;
const outDir = path.join(QA, 'font');
fs.mkdirSync(outDir, { recursive: true });

function decode(stream) {
  let d = Buffer.from(stream.getContents());
  const f = stream.dict.get(PDFName.of('Filter'));
  if (f && String(f.encodedName ?? f.toString()).includes('FlateDecode')) d = zlib.inflateSync(d);
  return d;
}

for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
  if (!(obj instanceof PDFDict)) continue;
  const sub = obj.get(PDFName.of('Subtype'))?.toString();
  if (sub !== '/CIDFontType2' && sub !== '/TrueType') continue;
  const base = String(obj.get(PDFName.of('BaseFont'))?.toString() || '').replace(/^\//, '');
  const fd = ctx.lookup(obj.get(PDFName.of('FontDescriptor')));
  if (!(fd instanceof PDFDict)) continue;
  let ff = null;
  for (const k of ['FontFile2', 'FontFile3', 'FontFile']) {
    const s = ctx.lookup(fd.get(PDFName.of(k)));
    if (s instanceof PDFStream) { ff = s; break; }
  }
  if (!ff) { console.log(`${base}: no embedded font program`); continue; }

  const data = decode(ff);
  const file = path.join(outDir, `${base.replace(/[^\w]/g, '_')}.ttf`);
  fs.writeFileSync(file, data);
  console.log(`\n===== ${base} (${ref}) =====`);
  console.log(`  wrote ${data.length.toLocaleString()} bytes -> ${path.relative(process.cwd(), file)}`);

  try {
    const f = fontkit.openSync(file);
    console.log(`  numGlyphs=${f.numGlyphs}  postscriptName=${f.postscriptName}`);
    console.log(`  tables: ${Object.keys(f.directory.tables).join(' ')}`);
    // sample glyph names
    const names = [];
    for (let g = 0; g < Math.min(f.numGlyphs, 40); g++) {
      let n = null;
      try { n = f.getGlyph(g).name; } catch { /* no name */ }
      names.push(`${g}:${n ?? '-'}`);
    }
    console.log(`  glyph names [0..39]: ${names.join(' ')}`);
    // does the font have its own cmap we could invert?
    try {
      const cm = f.characterSet;
      console.log(`  font cmap covers ${cm.length} codepoints; sample: ` +
        cm.slice(0, 16).map(c => 'U+' + c.toString(16).toUpperCase()).join(' '));
    } catch (e) { console.log('  no usable cmap:', e.message); }
  } catch (e) {
    console.log('  fontkit failed:', e.message);
  }
}
