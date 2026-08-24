// Resolve pdfjs loadedName (g_d0_fN) -> real embedded font name, by forcing the
// operator list so commonObjs is populated. Also reports per-font glyph repertoire.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDF_URL, STD_FONTS } from './config.mjs';

const doc = await pdfjs.getDocument({ url: PDF_URL, useSystemFonts: true, standardFontDataUrl: STD_FONTS }).promise;
const seen = new Map(); // loadedName -> {name, chars, pages:Set}

const SAMPLE = [1, 2, 5, 12, 18, 25, 100, 300, 500, 700, 900, 970, 978];
for (const p of SAMPLE) {
  const page = await doc.getPage(p);
  await page.getOperatorList();               // forces font objects to resolve
  const tc = await page.getTextContent();
  for (const it of tc.items) {
    if (!it.str) continue;
    let real = '(unresolved)';
    try {
      const f = page.commonObjs.has(it.fontName) ? page.commonObjs.get(it.fontName) : null;
      real = f?.name ?? f?.loadedName ?? '(unresolved)';
    } catch { /* ignore */ }
    let s = seen.get(it.fontName);
    if (!s) { s = { name: real, chars: 0, pages: new Set(), size: new Set() }; seen.set(it.fontName, s); }
    if (real !== '(unresolved)') s.name = real;
    s.chars += it.str.length;
    s.pages.add(p);
    s.size.add(Math.round(Math.abs(it.transform[3])));
  }
  page.cleanup();
}

console.log('pdfjs id   real font name                              chars   sizes      sample pages');
for (const [id, s] of [...seen.entries()].sort((a, b) => b[1].chars - a[1].chars)) {
  console.log(
    id.padEnd(11) + String(s.name).padEnd(44) +
    String(s.chars).padStart(6) + '   ' + [...s.size].join(',').padEnd(10) + ' ' +
    [...s.pages].slice(0, 6).join(',')
  );
}
