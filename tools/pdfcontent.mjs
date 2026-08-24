// Minimal but correct PDF content-stream tokenizer + text-state interpreter.
//
// Why this exists: pdfjs's getTextContent() inserts synthetic spaces for
// justification gaps and returns ToUnicode-decoded strings, so it can neither
// give exact CIDs nor be aligned against them reliably. This walks the content
// stream directly and yields one record per glyph with its true position.

// ---------- tokenizer ----------
const WS = new Set([0x20, 0x0a, 0x0d, 0x09, 0x0c, 0x00]);
const DELIM = new Set('()<>[]{}/%'.split('').map(c => c.charCodeAt(0)));

export function* tokenize(buf) {
  let i = 0;
  const n = buf.length;
  while (i < n) {
    const c = buf[i];
    if (WS.has(c)) { i++; continue; }
    if (c === 0x25) { while (i < n && buf[i] !== 0x0a && buf[i] !== 0x0d) i++; continue; } // %comment

    if (c === 0x2f) { // /Name
      let j = i + 1;
      while (j < n && !WS.has(buf[j]) && !DELIM.has(buf[j])) j++;
      yield { t: 'name', v: buf.toString('latin1', i + 1, j) };
      i = j; continue;
    }
    if (c === 0x3c) {
      if (buf[i + 1] === 0x3c) { yield { t: 'op', v: '<<' }; i += 2; continue; } // dict open
      let j = i + 1;
      while (j < n && buf[j] !== 0x3e) j++;
      yield { t: 'hex', v: buf.toString('latin1', i + 1, j) };
      i = j + 1; continue;
    }
    if (c === 0x3e && buf[i + 1] === 0x3e) { yield { t: 'op', v: '>>' }; i += 2; continue; }
    if (c === 0x28) { // (literal string)
      let j = i + 1, depth = 1;
      const out = [];
      while (j < n && depth > 0) {
        const d = buf[j];
        if (d === 0x5c) { // backslash escape
          const e = buf[j + 1];
          const simple = { 0x6e: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12 };
          if (e in simple) { out.push(simple[e]); j += 2; }
          else if (e >= 0x30 && e <= 0x37) { // octal
            let o = '', k = j + 1;
            while (k < n && o.length < 3 && buf[k] >= 0x30 && buf[k] <= 0x37) { o += String.fromCharCode(buf[k]); k++; }
            out.push(parseInt(o, 8) & 0xff); j = k;
          } else if (e === 0x0a) { j += 2; }
          else { out.push(e); j += 2; }
          continue;
        }
        if (d === 0x28) depth++;
        if (d === 0x29) { depth--; if (depth === 0) { j++; break; } }
        out.push(d); j++;
      }
      yield { t: 'str', v: Buffer.from(out).toString('latin1') };
      i = j; continue;
    }
    if (c === 0x5b) { yield { t: 'op', v: '[' }; i++; continue; }
    if (c === 0x5d) { yield { t: 'op', v: ']' }; i++; continue; }
    if (c === 0x7b) { yield { t: 'op', v: '{' }; i++; continue; }
    if (c === 0x7d) { yield { t: 'op', v: '}' }; i++; continue; }

    let j = i;
    while (j < n && !WS.has(buf[j]) && !DELIM.has(buf[j])) j++;
    const s = buf.toString('latin1', i, j);
    i = j === i ? i + 1 : j;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) yield { t: 'num', v: parseFloat(s) };
    else yield { t: 'op', v: s };
  }
}

// ---------- matrix helpers (a b c d e f) ----------
const mul = (m, n) => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];

/**
 * Walk a page content stream and emit one record per glyph.
 * @param buf       decoded content stream
 * @param getFont   (resourceName) => font | null
 * @param getXObj   (resourceName) => {buf, matrix, getFont, getXObj} | null  (Form XObjects)
 * @param ctm0      initial CTM (used when recursing into a Form XObject)
 * @param depth     recursion guard
 * @returns array of {code, font, x, y, size, w}
 */
export function extractGlyphs(buf, getFont, getXObj = () => null, ctm0 = [1, 0, 0, 1, 0, 0], depth = 0) {
  const out = [];
  let ctm = [...ctm0];
  const stack = [];
  let Tm = null, Tlm = null;
  let font = null, fontName = null, size = 0;
  let Tc = 0, Tw = 0, Th = 1, Tl = 0, Ts = 0;
  let operands = [];
  let inArray = false, arr = [];
  let dictDepth = 0;

  const showString = (raw) => {
    if (!font || !Tm) return;
    const codes = font.isType0
      ? Array.from({ length: raw.length >> 1 }, (_, k) => (raw.charCodeAt(k * 2) << 8) | raw.charCodeAt(k * 2 + 1))
      : Array.from(raw, ch => ch.charCodeAt(0));
    for (const code of codes) {
      const w0 = font.widthOf(code) / 1000;
      const trm = mul([size * Th, 0, 0, size, 0, Ts], mul(Tm, ctm));
      out.push({
        code, font: fontName,
        fb: font.base,                 // real embedded font name (resource ids differ per XObject)
        u: font.toUni(code),           // raw ToUnicode as the PDF states it - defects included
        x: +trm[4].toFixed(2), y: +trm[5].toFixed(2),
        size: +Math.hypot(trm[2], trm[3]).toFixed(2),
        w: +(w0 * size).toFixed(2),
      });
      const isSpace = !font.isType0 && code === 32;
      const tx = (w0 * size + Tc + (isSpace ? Tw : 0)) * Th;
      Tm = mul([1, 0, 0, 1, tx, 0], Tm);
    }
  };

  for (const tok of tokenize(buf)) {
    if (tok.t === 'op' && tok.v === '<<') { dictDepth++; continue; }
    if (tok.t === 'op' && tok.v === '>>') { dictDepth = Math.max(0, dictDepth - 1); continue; }
    if (dictDepth > 0) continue;                       // ignore dictionary innards (ActualText etc.)
    if (tok.t === 'op' && tok.v === '[') { inArray = true; arr = []; continue; }
    if (tok.t === 'op' && tok.v === ']') { inArray = false; operands.push({ t: 'arr', v: arr }); continue; }
    if (inArray) { arr.push(tok); continue; }
    if (tok.t !== 'op') { operands.push(tok); continue; }

    const o = tok.v;
    const num = k => { const t = operands[operands.length - k]; return t && t.t === 'num' ? t.v : 0; };

    switch (o) {
      case 'q': stack.push({ ctm: [...ctm] }); break;
      case 'Q': { const s = stack.pop(); if (s) ctm = s.ctm; break; }
      case 'cm': ctm = mul([num(6), num(5), num(4), num(3), num(2), num(1)], ctm); break;
      case 'BT': Tm = [1, 0, 0, 1, 0, 0]; Tlm = [...Tm]; break;
      case 'ET': Tm = Tlm = null; break;
      case 'Tf': {
        size = num(1);
        const nameTok = operands.filter(t => t.t === 'name').pop();
        fontName = nameTok ? nameTok.v : null;
        font = fontName ? getFont(fontName) : null;
        break;
      }
      case 'Td': Tlm = mul([1, 0, 0, 1, num(2), num(1)], Tlm || [1, 0, 0, 1, 0, 0]); Tm = [...Tlm]; break;
      case 'TD': Tl = -num(1); Tlm = mul([1, 0, 0, 1, num(2), num(1)], Tlm || [1, 0, 0, 1, 0, 0]); Tm = [...Tlm]; break;
      case 'Tm': Tlm = [num(6), num(5), num(4), num(3), num(2), num(1)]; Tm = [...Tlm]; break;
      case 'T*': Tlm = mul([1, 0, 0, 1, 0, -Tl], Tlm || [1, 0, 0, 1, 0, 0]); Tm = [...Tlm]; break;
      case 'TL': Tl = num(1); break;
      case 'Tc': Tc = num(1); break;
      case 'Tw': Tw = num(1); break;
      case 'Tz': Th = num(1) / 100; break;
      case 'Ts': Ts = num(1); break;
      case 'Tj': { const s = operands[operands.length - 1]; if (s && (s.t === 'str' || s.t === 'hex')) showString(s.t === 'hex' ? hexToRaw(s.v) : s.v); break; }
      case "'": Tlm = mul([1, 0, 0, 1, 0, -Tl], Tlm || [1, 0, 0, 1, 0, 0]); Tm = [...Tlm];
        { const s = operands[operands.length - 1]; if (s && (s.t === 'str' || s.t === 'hex')) showString(s.t === 'hex' ? hexToRaw(s.v) : s.v); } break;
      case '"': Tw = num(3); Tc = num(2);
        Tlm = mul([1, 0, 0, 1, 0, -Tl], Tlm || [1, 0, 0, 1, 0, 0]); Tm = [...Tlm];
        { const s = operands[operands.length - 1]; if (s && (s.t === 'str' || s.t === 'hex')) showString(s.t === 'hex' ? hexToRaw(s.v) : s.v); } break;
      case 'Do': {
        if (depth >= 8) break;                       // recursion guard
        const nameTok = operands.filter(t => t.t === 'name').pop();
        const xo = nameTok ? getXObj(nameTok.v) : null;
        if (xo && xo.buf && xo.buf.length) {
          // Form XObject space: /Matrix then the CTM in force at the Do
          const base = xo.matrix ? mul(xo.matrix, ctm) : ctm;
          out.push(...extractGlyphs(xo.buf, xo.getFont || getFont, xo.getXObj || getXObj, base, depth + 1));
        }
        break;
      }
      case 'TJ': {
        const a = operands[operands.length - 1];
        if (a && a.t === 'arr') {
          for (const el of a.v) {
            if (el.t === 'num') { Tm = mul([1, 0, 0, 1, (-el.v / 1000) * size * Th, 0], Tm || [1, 0, 0, 1, 0, 0]); }
            else if (el.t === 'str' || el.t === 'hex') showString(el.t === 'hex' ? hexToRaw(el.v) : el.v);
          }
        }
        break;
      }
    }
    operands = [];
  }
  return out;
}

function hexToRaw(h) {
  let s = h.replace(/[^0-9A-Fa-f]/g, '');
  if (s.length % 2) s += '0';
  let r = '';
  for (let i = 0; i < s.length; i += 2) r += String.fromCharCode(parseInt(s.slice(i, i + 2), 16));
  return r;
}
