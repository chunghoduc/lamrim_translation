// Phase 1 step 2: inventory every font in the PDF with its real name, size and
// y-position distribution, so body text can be separated from running heads,
// page numbers and display/front-matter fonts.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDF_URL, STD_FONTS } from './config.mjs';

const doc = await pdfjs.getDocument({
  url: PDF_URL, useSystemFonts: true, standardFontDataUrl: STD_FONTS,
}).promise;

const stats = new Map(); // realName -> {chars, items, pages:Set, sizes:Map, ys:[], sample}

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  for (const it of tc.items) {
    if (!it.str) continue;
    let real = it.fontName;
    try { real = page.commonObjs.get(it.fontName)?.name ?? it.fontName; } catch { /* not loaded */ }
    const key = real;
    let s = stats.get(key);
    if (!s) { s = { chars: 0, items: 0, pages: new Set(), sizes: new Map(), ys: [], sample: '' }; stats.set(key, s); }
    s.chars += it.str.length;
    s.items++;
    s.pages.add(p);
    const size = Math.round(Math.abs(it.transform[3]) * 10) / 10;
    s.sizes.set(size, (s.sizes.get(size) || 0) + it.str.length);
    s.ys.push(Math.round(it.transform[5]));
    if (s.sample.length < 40) s.sample += it.str;
  }
  page.cleanup();
}

const pct = n => ((100 * n) / [...stats.values()].reduce((a, b) => a + b.chars, 0)).toFixed(2);
const q = (arr, f) => arr.length ? arr[Math.floor(f * (arr.length - 1))] : 0;

console.log(`pages=${doc.numPages}\n`);
const rows = [...stats.entries()].sort((a, b) => b[1].chars - a[1].chars);
for (const [name, s] of rows) {
  const ys = s.ys.sort((a, b) => a - b);
  const topSizes = [...s.sizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([sz, n]) => `${sz}pt(${((100 * n) / s.chars).toFixed(0)}%)`).join(' ');
  console.log(
    `${name}\n  chars=${s.chars.toLocaleString()} (${pct(s.chars)}%)  items=${s.items.toLocaleString()}  pages=${s.pages.size}\n` +
    `  sizes: ${topSizes}\n` +
    `  y: min=${ys[0]} p05=${q(ys, 0.05)} med=${q(ys, 0.5)} p95=${q(ys, 0.95)} max=${ys[ys.length - 1]}\n` +
    `  sample: ${JSON.stringify(s.sample.slice(0, 36))}\n`
  );
}

// page geometry
const pg1 = await doc.getPage(500);
console.log('page 500 viewport:', JSON.stringify(pg1.getViewport({ scale: 1 }).viewBox));
