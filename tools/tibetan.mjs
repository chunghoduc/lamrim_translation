// Tibetan orthography: the legal consonant stacks.
//
// Used as an INDEPENDENT check on the CID->Unicode repair table. Every repaired
// glyph must yield a stack that exists in written Tibetan; a wrong assignment
// produces stacks that do not exist, and those surface immediately.

export const C = {
  KA: 'ཀ', KHA: 'ཁ', GA: 'ག', NGA: 'ང',
  CA: 'ཅ', CHA: 'ཆ', JA: 'ཇ', NYA: 'ཉ',
  TA: 'ཏ', THA: 'ཐ', DA: 'ད', NA: 'ན',
  PA: 'པ', PHA: 'ཕ', BA: 'བ', MA: 'མ',
  TSA: 'ཙ', TSHA: 'ཚ', DZA: 'ཛ', WA: 'ཝ',
  ZHA: 'ཞ', ZA: 'ཟ', A_CHUNG: 'འ', YA: 'ཡ',
  RA: 'ར', LA: 'ལ', SHA: 'ཤ', SA: 'ས',
  HA: 'ཧ', A: 'ཨ',
};

// subjoined forms live at base + 0x50 for most consonants
export const sub = ch => String.fromCodePoint(ch.codePointAt(0) + 0x50);

export const YATAG = 'ྱ';   // ྱ
export const RATAG = 'ྲ';   // ྲ
export const LATAG = 'ླ';   // ླ
export const WAZUR = 'ྭ';   // ྭ
export const HATAG = 'ྷ';   // ྷ

export const VOWELS = new Set(['ི', 'ུ', 'ེ', 'ོ', 'ཱ', 'ཻ', 'ཽ', 'ཾ', 'ཿ', 'ྀ', 'ྂ', 'ྃ', '྄', '྆', '྇']);
export const TSHEG = '་';
export const SHAD = '།';

const S = (...xs) => new Set(xs);

// superscript + root
const RA_MGO = S('KA', 'GA', 'NGA', 'JA', 'NYA', 'TA', 'DA', 'NA', 'BA', 'MA', 'TSA', 'DZA');
const LA_MGO = S('KA', 'GA', 'NGA', 'CA', 'JA', 'TA', 'DA', 'PA', 'BA', 'HA');
const SA_MGO = S('KA', 'GA', 'NGA', 'NYA', 'TA', 'DA', 'NA', 'PA', 'BA', 'MA', 'TSA');

// root + subscript
const YA_BTAGS = S('KA', 'KHA', 'GA', 'PA', 'PHA', 'BA', 'MA');
const RA_BTAGS = S('KA', 'KHA', 'GA', 'TA', 'THA', 'DA', 'NA', 'PA', 'PHA', 'BA', 'MA', 'SHA', 'SA', 'HA');
const LA_BTAGS = S('KA', 'GA', 'BA', 'RA', 'SA', 'ZA');

// superscript + root + subscript (attested combinations)
const MGO_BTAGS = [
  ['RA', 'KA', YATAG], ['RA', 'GA', YATAG], ['RA', 'MA', YATAG],
  ['SA', 'KA', YATAG], ['SA', 'GA', YATAG], ['SA', 'PA', YATAG], ['SA', 'BA', YATAG], ['SA', 'MA', YATAG],
  ['SA', 'KA', RATAG], ['SA', 'GA', RATAG], ['SA', 'PA', RATAG], ['SA', 'BA', RATAG],
  ['SA', 'NA', RATAG], ['SA', 'MA', RATAG],
  ['RA', 'GA', WAZUR], ['RA', 'TSA', WAZUR],
];

// root + subscript + wa-zur (གྲྭ "monastic college", ཕྱྭ)
const BTAGS_WAZUR = [[C.GA, RATAG], [C.PHA, YATAG], [C.DA, RATAG], [C.TSA, WAZUR]];

// Letters that only occur in Sanskrit transliteration. Buddhist texts are full
// of it (names, mantras, titles), and it does not follow Tibetan stack rules,
// so any stack containing one of these is exempted rather than flagged.
export const SANSKRIT_ONLY = new Set([
  'ཊ', 'ཋ', 'ཌ', 'ཌྷ', 'ཎ', 'ཥ', 'ཀྵ', 'ྚ', 'ྛ', 'ྜ', 'ྞ', 'ྵ',
  'ྷ', 'ྑ', 'ྒྷ', 'ྖ', 'ྜྷ', 'ྡྷ', 'ྦྷ', 'ྫྷ',
]);
const SANSKRIT_MARKS = new Set(['ཱ', 'ཻ', 'ཽ', 'ཾ', 'ཿ', 'ྂ', 'ྃ', '྄', 'ྀ']);

/** true if this stack should be judged as Sanskrit transliteration, not Tibetan */
export function isSanskritish(stack) {
  for (const ch of stack) if (SANSKRIT_ONLY.has(ch) || SANSKRIT_MARKS.has(ch)) return true;
  // a stack of 2+ subjoined consonants is a Sanskrit conjunct, not a Tibetan stack
  let subs = 0;
  for (const ch of stack) { const cp = ch.codePointAt(0); if (cp >= 0x0F90 && cp <= 0x0FBC) subs++; }
  return subs >= 2 && !LEGAL.has(stack);
}

/** Every stack (consonant cluster without vowel) that legally occurs. */
export function legalStacks() {
  const out = new Set();
  for (const k of Object.keys(C)) out.add(C[k]);                     // bare consonants
  for (const r of RA_MGO) out.add(C.RA + sub(C[r]));
  for (const r of LA_MGO) out.add(C.LA + sub(C[r]));
  for (const r of SA_MGO) out.add(C.SA + sub(C[r]));
  for (const r of YA_BTAGS) out.add(C[r] + YATAG);
  for (const r of RA_BTAGS) out.add(C[r] + RATAG);
  for (const r of LA_BTAGS) out.add(C[r] + LATAG);
  for (const [m, r, b] of MGO_BTAGS) out.add(C[m] + sub(C[r]) + b);
  for (const [root, b] of BTAGS_WAZUR) out.add(root + b + WAZUR);
  for (const s of ['ཊ','ཋ','ཌ','ཎ','ཥ','ཀྵ']) out.add(s);
  // wa-zur attaches broadly
  for (const k of Object.keys(C)) out.add(C[k] + WAZUR);
  // ha-tag (Sanskrit aspirates) and common Sanskrit stacks
  for (const k of ['GA', 'JA', 'DA', 'BA', 'DZA']) out.add(C[k] + HATAG);
  return out;
}

export const LEGAL = legalStacks();

/** Split a Tibetan run into tsheg-delimited syllables. */
export function syllables(text) {
  return text.split(/[་།༎༑༔\s]+/).filter(Boolean);
}

/**
 * Extract the consonant stacks in a syllable (a syllable may contain a prefix,
 * a root stack, suffixes - each is a stack in its own right).
 * Returns the stacks found, splitting on vowel signs and on stack boundaries.
 */
export function stacksOf(syl) {
  const out = [];
  let cur = '';
  for (const ch of syl) {
    const cp = ch.codePointAt(0);
    if (VOWELS.has(ch) || cp === 0x0F7E || cp === 0x0F7F) { if (cur) { out.push(cur); cur = ''; } continue; }
    const isBase = cp >= 0x0F40 && cp <= 0x0F6C;
    const isSub = cp >= 0x0F90 && cp <= 0x0FBC;
    if (isBase) { if (cur) out.push(cur); cur = ch; }
    else if (isSub) { cur += ch; }
    else { if (cur) { out.push(cur); cur = ''; } }
  }
  if (cur) out.push(cur);
  return out;
}

/** true if every consonant stack in the syllable is orthographically legal */
export function isLegalSyllable(syl) {
  return illegalStacks(syl).length === 0;
}

/** the illegal stacks in a syllable, if any */
export function illegalStacks(syl) {
  return stacksOf(syl).filter(s => !LEGAL.has(s) && !isSanskritish(s));
}
