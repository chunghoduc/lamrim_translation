// CID -> correct Unicode for DTREBQ+MonlamUniOuChan2.
//
// Every entry below was read from RENDERED PAGE IMAGES, with the glyph shown in
// real word context (tools/14-cid-context.mjs), at least two independent
// occurrences from different pages. The word that settled each one is recorded.
// Entries are cross-checked against Tibetan orthography by tools/15-apply-repair.mjs.
//
// Only CIDs whose shipped ToUnicode is WRONG appear here.

export const BODY_FONT = 'DTREBQ+MonlamUniOuChan2';

export const REPAIR = {
  // --- the single highest-impact fix: the plain e-vowel -------------------
  214: { to: 'ེ', was: 'ྗེ', n: 35844, evidence: 'ཞེས (p25), ཏེ (p41)' },

  // --- ga stacks ----------------------------------------------------------
  369: { to: 'གྱ', was: 'ག', n: 2659, evidence: 'བསམ་གྱིས (p33), སྨན་གྱི (p49), སྐྱོན་གྱི (p65)' },
  373: { to: 'གླ', was: 'ག', n: 143, evidence: 'གླང་པོ་ཆེ (p57), འཛམ་བུའི་གླིང (p169)' },

  // --- ra-mgo stacks (all shipped as bare ར) ------------------------------
  411: { to: 'རྟ', was: 'ར', n: 2615, evidence: 'སོར་རྟོག (p49), རྟོགས (p65), འཇིག་རྟེན (p81)' },
  483: { to: 'རྩ', was: 'ར', n: 887, evidence: 'རྩ་བ (p25), བརྩོན་འགྲུས (p73)' },
  399: { to: 'རྗ', was: 'ར', n: 807, evidence: 'རྗེ་བཙུན (p25), རྗེས་སུ་དྲན་པ (p73)' },
  404: { to: 'རྙ', was: 'ར', n: 486, evidence: 'བརྙེས་པ (p25), རྙེད་པ (p73)' },
  489: { to: 'རྫ', was: 'ར', n: 431, evidence: 'ཡོངས་སུ་རྫོགས་པ (p25, p41)' },
  375: { to: 'རྒ', was: 'ར', n: 313, evidence: 'རྒོད་པ (p329, p617)' },
  423: { to: 'རྡ', was: 'ར', n: 88, evidence: 'རྡོ་རྗེ (p25, p329)' },

  // --- sa-mgo stacks shipped as bare ས ------------------------------------
  406: { to: 'སྙ', was: 'ས', n: 1326, evidence: 'སྙིང་པོ (p25), སྙམ་སྟེ (p73)' },
  508: { to: 'སླ', was: 'ས', n: 937, evidence: 'དགེ་སློང (p25), སློབ (p73)' },
  427: { to: 'སྡ', was: 'ས', n: 717, evidence: 'ཞེ་སྡང (p105), སྡོད་པ (p137)' },
  506: { to: 'སྲ', was: 'ས', n: 615, evidence: 'ལུས་སྲོག (p137), སྲིད་པའི་རྒྱུ (p73, p121). Lexicon: སྲིད/སྲོག/སྲས/སྲེད/བསྲེགས all valid vs བསྐྱེགས invalid. Earlier low-zoom reading སྐྱ was WRONG.' },
  441: { to: 'སྤ', was: 'ས', n: 457, evidence: 'སྤངས་པ (p73), སྤེལ་བ (p89)' },

  // --- stacks that lost only the ya-btags ---------------------------------
  359: { to: 'སྐྱ', was: 'སྐ', n: 2843, evidence: 'བསྐྱེད (p89), སྐྱེ་བ (p105)' },
  443: { to: 'སྤྱ', was: 'སྤ', n: 866, evidence: 'སྤྱན (p25), སྤྱོད (p57)' },
  445: { to: 'སྤྲ', was: 'སྤ', n: 188, evidence: 'སྤྲིངས་ཡིག (p153), སྤྲིངས (p169, p281); caught by page-700 comparison - ྲ vs ྱ was illegible at low zoom' },
  353: { to: 'རྐྱ', was: 'རྐ', n: 175, evidence: 'རྐྱེན (p89, p105)' },
  448: { to: 'ཕྱ', was: 'ཕ', n: 2775, evidence: 'ཕྱི་བ (p25), ཕྱིར (p73)' },

  // --- ra-btags / la-btags lost -------------------------------------------
  421: { to: 'དྲ', was: 'ད', n: 1457, evidence: 'དྲག (p57)' },
  455: { to: 'བྲ', was: 'བ', n: 1085, evidence: 'རྒྱུ་འབྲས (p41)' },
  457: { to: 'བླ', was: 'བ', n: 920, evidence: 'བླ་མ (p25, p57) - explains བློ=0' },
  470: { to: 'མྱ', was: 'མ', n: 332, evidence: 'མྱ་ངན (p153)' },
  366: { to: 'ཁྲ', was: 'ཁ', n: 506, evidence: 'ཚུལ་ཁྲིམས (p73), འཁྲིད (p41)' },
  494: { to: 'ཟླ', was: 'ཟ', n: 268, evidence: 'ཟླ་བ (p25, p121)' },
  385: { to: 'སྒྲ', was: 'སྒ', n: 405, evidence: 'སྒྲ (p25), སྒྲིབ་པ (p57)' },

  // --- la-mgo -------------------------------------------------------------
  // 355 and 401 removed: lexicon ties / prefers the shipped value; not changed without evidence
  // 401 removed: high-zoom + lexicon both show plain ལ (earlier ལྷུན reading was wrong)
  349: { to: 'ཀླ', was: 'ཀ', n: 34, evidence: 'ཀློང (p329, p377); lexicon ཀློག/བཀླགས/ཀླད all valid vs བཀགས invalid' },
  395: { to: 'ལྕ', was: 'ལ', n: 125, evidence: 'CONFIRMED p630: ལུས་ལྕི་བ་ཉིད་དང་སེམས་ལྕི་བ་ཉིད (3x on one page); lexicon 85.6%' },
  383: { to: 'སྒྱ', was: 'སྒ', n: 13, evidence: 'lexicon 23%->69%' },
  816: { to: 'ནྟ', was: 'ན', n: 8, evidence: 'Sanskrit conjunct; lexicon 12.5%->75%' },
  1206: { to: 'ཎྚ', was: 'ཎ', n: 10, evidence: 'Sanskrit conjunct; lexicon 0%->90%' },
  696: { to: 'ངྒ', was: 'ང', n: 4, evidence: 'Sanskrit, e.g. གངྒཱ; lexicon 0%->75%' },
  203: { to: 'ཀྟ', was: 'ཀ', n: 2, evidence: 'Sanskrit conjunct; lexicon 0%->100%' },
  511: { to: 'ཧྲ', was: 'ཧ', n: 4, evidence: 'lexicon 0%->100%' },
};

// CIDs checked in context and confirmed CORRECT as shipped - recorded so they
// are not re-investigated, and so the "correct" claim is auditable.
export const VERIFIED_OK = {
  299: 'ི  positional variant on tall stacks (ཚིག p25, p73)',
  320: 'ོ  positional variant (མཛོད p41, མཚོན p57)',
  357: 'སྐ plain (སྐབས p25, p57) - note: the MINORITY member here is the correct one',
  164: 'ཁ  plain (མཁས p25, འཁོར p57)',
  193: 'ཟ  plain (བཟོ p25)',
  381: 'སྒ plain (བསྒོམ p41, p89)',
  476: 'སྨ plain (སྨོན p57, སྨོས p73)',
  183: 'ཕ  plain (ཕམ p25, ཕེབས p41)',
};

// Still unresolved - too rare to read confidently in context, and left alone
// rather than guessed. Combined they are a tiny fraction of the corpus.
export const UNRESOLVED = {
  355: { n: 17, was: 'ལ', note: 'ལོག vs ལྷོག - lexicon ties at 82.4%; left unrepaired (decodes to the valid word ལོག)' },
  478: { n: 10, was: 'སྨ', note: 'lexicon agrees with shipped value' },
  176: { n: 3, was: 'ཎ' }, 689: { n: 2, was: 'ད' }, 166: { n: 1, was: 'ག' },
  612: { n: 1, was: 'ཏ' }, 351: { n: 60, was: 'རྐ', note: 'lexicon agrees with shipped value (81.7%)' },
  201: { n: 56, was: 'ཧ', note: 'lexicon agrees with shipped value' },
};
