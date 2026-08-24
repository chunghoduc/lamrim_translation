// Repair tables for the non-body fonts.
//
// Found because a page-30/690 comparison showed the sa-bcad SECTION HEADINGS
// reading ངེས་དོན་གི་ where the body text on the same page read ངེས་དོན་གྱི་.
// The headings use Qomolangma-Uchen-Sarchen, which has the same class of
// ToUnicode defect as the body font and was not covered by the original table.
//
// Evidence per entry: lexicon scoring (tools/23), Tibetan genitive agreement
// (tools/24), and CID tracing of failing text (tools/25).

// Qomolangma-Uchen-Sarchen and -Sarchung share one CID space (identical CMaps
// where they overlap), so one table serves both.
export const QOMOLANGMA_FONTS = [
  'DTREBQ+Qomolangma-Uchen-Sarchen',
  'DTREBQ+Qomolangma-Uchen-Sarchung',
];

export const QOMOLANGMA_REPAIR = {
  523: { to: 'གྱ', was: 'ག', n: 25, evidence: 'genitive rule: ལམ་གི after མ must be ལམ་གྱི; exactly the 25 failing particles' },
  544: { to: 'སྐྱ', was: 'སྐ', n: 42, evidence: 'སྐེ=42 / སྐྱེ=0 in this font; པར་སྐྱེ་བ' },
  518: { to: 'ཀྱ', was: 'ཀ', n: 31, evidence: 'ཆོས་ཀི -> ཆོས་ཀྱི (after ས the particle must be ཀྱི)' },
  499: { to: 'རྟ', was: 'ར', n: 26, evidence: 'དུ་རོགས -> དུ་རྟོགས; lexicon 48%->100%' },
  490: { to: 'སྒ', was: 'ས', n: 25, evidence: 'lexicon 50%->100%' },
  550: { to: 'སྤྱ', was: 'སྤ', n: 14, evidence: 'lexicon 75%->100%' },
  495: { to: 'རྗ', was: 'ར', n: 12, evidence: 'lexicon 33%->100%' },
  522: { to: 'ཁྲ', was: 'ཁ', n: 5, evidence: 'ཚུལ་ཁིམས -> ཚུལ་ཁྲིམས; lexicon 0%->100%' },
  552: { to: 'སྦྱ', was: 'སྦ', n: 9, evidence: 'p12 TOC: ཉིང་མཚམས་སྦྱོར་ཚུལ (pratisandhi); shipped སྦོར' },
  541: { to: 'སླ', was: 'ས', n: 33, evidence: 'བསབ་པ -> བསླབ་པ (training); found by word-probe sweep, NOT by lexicon (སབ is in the lexicon)' },
  531: { to: 'ཕྱ', was: 'ཕ', n: 24, evidence: 'འི་ཕིར -> འི་ཕྱིར; so 331 is plain ཕ' },
  498: { to: 'སྙ', was: 'ས', n: 5, evidence: 'ལ་སིང -> ལ་སྙིང' },
  548: { to: 'སྒྲ', was: 'སྒ', n: 2, evidence: 'forms སྒྲིག + སྒྲིབ (ཞུ་སྒྲིག editing); སྒྱིག/སྒྱིབ are not words' },
  538: { to: 'ཟླ', was: 'ཟ', n: 2, evidence: 'lexicon 0%->100%' },
  551: { to: 'སྤྲ', was: 'སྤ', n: 3, evidence: 'ཟད་སྤོས -> སྤྲོས (elaboration); n small' },
  497: { to: 'རྙ', was: 'ར', n: 4, evidence: 'forms བརྙེས + རྙེད (attainment); as རྗ it gives རྗེད which is not a word. Heading p25: ཡོན་ཏན་བརྙེས་པའི་ཚུལ' },
};

// Left alone - single occurrences where the evidence is not decisive.
export const QOMOLANGMA_UNRESOLVED = {
  519: { n: 1, was: 'ཀ', note: 'བཀྱི vs བཀྲི - neither is a standard word; left unrepaired' },
  506: { n: 1, was: 'ས', note: 'སོད; could be སྤྱ or སྤ' },
  516: { n: 1, was: 'ར', note: 'རོགས is itself a valid word ("companion")' },
};

// MonlamUniOuChan4 (title/display, 388 glyphs) shares the body font's CID space
// where their CMaps agree, so the body table applies to those CIDs only.
export const OUCHAN4 = 'DTREBQ+MonlamUniOuChan4';
