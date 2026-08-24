// Load PDF font dictionaries into {isType0, widthOf, toUni} objects usable by
// the content-stream interpreter.
import zlib from 'node:zlib';
import { PDFName, PDFDict, PDFStream, PDFArray, PDFNumber, PDFRef } from 'pdf-lib';

export function decodeStream(s) {
  let d = Buffer.from(s.getContents());
  const f = s.dict.get(PDFName.of('Filter'));
  if (String(f?.encodedName ?? f?.toString() ?? '').includes('FlateDecode')) {
    try { d = zlib.inflateSync(d); } catch { return Buffer.alloc(0); }
  }
  return d;
}

function parseToUnicode(ctx, dict) {
  const tu = ctx.lookup(dict.get(PDFName.of('ToUnicode')));
  const map = new Map();
  if (!(tu instanceof PDFStream)) return map;
  const txt = decodeStream(tu).toString('latin1');
  const toStr = h => (h.match(/.{4}/g) || []).map(x => String.fromCharCode(parseInt(x, 16))).join('');
  for (const m of txt.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const e of m[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g))
      map.set(parseInt(e[1], 16), toStr(e[2]));
  for (const m of txt.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = m[1];
    for (const e of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = parseInt(e[1], 16), hi = parseInt(e[2], 16);
      const base = e[3];
      for (let c = lo; c <= hi; c++) {
        const tail = (parseInt(base.slice(-4), 16) + (c - lo)).toString(16).padStart(4, '0');
        map.set(c, toStr(base.slice(0, -4) + tail));
      }
    }
    for (const e of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
      const lo = parseInt(e[1], 16);
      const items = [...e[3].matchAll(/<([0-9A-Fa-f]*)>/g)].map(x => toStr(x[1]));
      items.forEach((s, k) => map.set(lo + k, s));
    }
  }
  return map;
}

function type0Widths(ctx, descFont) {
  const dw = ctx.lookup(descFont.get(PDFName.of('DW')));
  const def = dw instanceof PDFNumber ? dw.asNumber() : 1000;
  const widths = new Map();
  const W = ctx.lookup(descFont.get(PDFName.of('W')));
  if (W instanceof PDFArray) {
    const a = W.asArray().map(x => ctx.lookup(x));
    let i = 0;
    while (i < a.length) {
      const first = a[i] instanceof PDFNumber ? a[i].asNumber() : null;
      if (first === null) { i++; continue; }
      const next = a[i + 1];
      if (next instanceof PDFArray) {
        next.asArray().forEach((w, k) => {
          const n = ctx.lookup(w);
          if (n instanceof PDFNumber) widths.set(first + k, n.asNumber());
        });
        i += 2;
      } else if (next instanceof PDFNumber) {
        const last = next.asNumber();
        const wv = ctx.lookup(a[i + 2]);
        const w = wv instanceof PDFNumber ? wv.asNumber() : def;
        for (let c = first; c <= last && c - first < 65536; c++) widths.set(c, w);
        i += 3;
      } else i++;
    }
  }
  return { widths, def };
}

function simpleWidths(ctx, dict) {
  const fc = ctx.lookup(dict.get(PDFName.of('FirstChar')));
  const first = fc instanceof PDFNumber ? fc.asNumber() : 0;
  const arr = ctx.lookup(dict.get(PDFName.of('Widths')));
  const widths = new Map();
  if (arr instanceof PDFArray) {
    arr.asArray().forEach((w, k) => {
      const n = ctx.lookup(w);
      if (n instanceof PDFNumber) widths.set(first + k, n.asNumber());
    });
  }
  const fd = ctx.lookup(dict.get(PDFName.of('FontDescriptor')));
  let def = 500;
  if (fd instanceof PDFDict) {
    const mw = ctx.lookup(fd.get(PDFName.of('MissingWidth')));
    if (mw instanceof PDFNumber) def = mw.asNumber();
  }
  return { widths, def };
}

/** Build a font object from a /Font dictionary. */
export function loadFont(ctx, dict) {
  if (!(dict instanceof PDFDict)) return null;
  const subtype = dict.get(PDFName.of('Subtype'))?.toString();
  const base = String(dict.get(PDFName.of('BaseFont'))?.toString() || '').replace(/^\//, '');
  const isType0 = subtype === '/Type0';
  const toUni = parseToUnicode(ctx, dict);

  let widths, def;
  if (isType0) {
    const df = ctx.lookup(dict.get(PDFName.of('DescendantFonts')));
    const d0 = df instanceof PDFArray ? ctx.lookup(df.asArray()[0]) : null;
    ({ widths, def } = d0 ? type0Widths(ctx, d0) : { widths: new Map(), def: 1000 });
  } else {
    ({ widths, def } = simpleWidths(ctx, dict));
  }

  return {
    base, isType0,
    widthOf: code => widths.get(code) ?? def,
    toUni: code => toUni.get(code) ?? '',
    toUniMap: toUni,
  };
}

/** resourceName -> font, for one page. */
export function pageFonts(ctx, pageNode) {
  const res = ctx.lookup(pageNode.get(PDFName.of('Resources')));
  const fonts = res instanceof PDFDict ? ctx.lookup(res.get(PDFName.of('Font'))) : null;
  const map = new Map();
  if (fonts instanceof PDFDict) {
    for (const [k, v] of fonts.entries()) {
      const d = ctx.lookup(v);
      const f = loadFont(ctx, d);
      if (f) map.set(k.encodedName.replace(/^\//, ''), f);
    }
  }
  return map;
}

/** Concatenated page content stream. */
export function pageContent(ctx, pageNode) {
  const c = ctx.lookup(pageNode.get(PDFName.of('Contents')));
  if (c instanceof PDFArray) {
    let b = Buffer.alloc(0);
    for (const x of c.asArray()) {
      const s = ctx.lookup(x);
      if (s instanceof PDFStream) b = Buffer.concat([b, decodeStream(s), Buffer.from('\n')]);
    }
    return b;
  }
  return c instanceof PDFStream ? decodeStream(c) : Buffer.alloc(0);
}

/** resourceName -> Form XObject {buf, matrix, getFont, getXObj}, for one page/form. */
export function xobjResolver(ctx, resourcesDict) {
  const xd = resourcesDict instanceof PDFDict ? ctx.lookup(resourcesDict.get(PDFName.of('XObject'))) : null;
  return name => {
    if (!(xd instanceof PDFDict)) return null;
    const s = ctx.lookup(xd.get(PDFName.of(name)));
    if (!(s instanceof PDFStream)) return null;
    if (s.dict.get(PDFName.of('Subtype'))?.toString() !== '/Form') return null;  // skip images
    const mArr = ctx.lookup(s.dict.get(PDFName.of('Matrix')));
    const matrix = mArr instanceof PDFArray
      ? mArr.asArray().map(x => { const n = ctx.lookup(x); return n instanceof PDFNumber ? n.asNumber() : 0; })
      : null;
    const res = ctx.lookup(s.dict.get(PDFName.of('Resources')));
    const fonts = new Map();
    if (res instanceof PDFDict) {
      const fd = ctx.lookup(res.get(PDFName.of('Font')));
      if (fd instanceof PDFDict) for (const [k, v] of fd.entries()) {
        const f = loadFont(ctx, ctx.lookup(v));
        if (f) fonts.set(k.encodedName.replace(/^\//, ''), f);
      }
    }
    return {
      buf: decodeStream(s),
      matrix: matrix && matrix.length === 6 ? matrix : null,
      getFont: n => fonts.get(n) || null,
      getXObj: res instanceof PDFDict ? xobjResolver(ctx, res) : (() => null),
    };
  };
}
