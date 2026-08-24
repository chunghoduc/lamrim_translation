// Single source of truth for glyph -> Unicode decoding, so every tool agrees.
import fs from 'node:fs';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { loadFont } from './pdffonts.mjs';
import { REPAIR, BODY_FONT } from './repair-table.mjs';
import { QOMOLANGMA_FONTS, QOMOLANGMA_REPAIR, OUCHAN4 } from './secondary-repair-table.mjs';
import { PDF_URL } from './config.mjs';

const QOMO = new Set(QOMOLANGMA_FONTS);
const bodyCMap = new Map();
{
  const lib = await PDFDocument.load(fs.readFileSync(PDF_URL), { updateMetadata: false });
  const ctx = lib.context;
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    if (obj.get(PDFName.of('Type'))?.toString() !== '/Font') continue;
    const f = loadFont(ctx, obj);
    if (f?.base === BODY_FONT) for (const [c, u] of f.toUniMap) if (!bodyCMap.has(c)) bodyCMap.set(c, u);
  }
}

export const RUNNING_HEAD_FONTS = new Set(['VHPITG+Qomolangma-Uchen-Sarchung']);
export const FOLIO_FONTS = new Set(['CLHYNS+TCRCYoutso', 'CLHYNS+TCRCBod-Yig']);
export const BODY_Y_MIN = 55, BODY_Y_MAX = 535, LINE_TOL = 4;

// Folio fonts are NOT dropped by name: on the contents pages (8-20) that same
// font carries the page-number column, which is real content. The y-band alone
// removes all 6,625 actual folio numbers.
export const keep = g => g.fb && !RUNNING_HEAD_FONTS.has(g.fb)
  && g.y >= BODY_Y_MIN && g.y <= BODY_Y_MAX;

export function decode(g) {
  if (g.fb === BODY_FONT) return REPAIR[g.code] ? REPAIR[g.code].to : (g.u ?? '');
  if (g.fb === OUCHAN4) return REPAIR[g.code] ? REPAIR[g.code].to : (bodyCMap.get(g.code) ?? g.u ?? '');
  if (QOMO.has(g.fb)) return QOMOLANGMA_REPAIR[g.code] ? QOMOLANGMA_REPAIR[g.code].to : (g.u ?? '');
  return g.u ?? '';
}
