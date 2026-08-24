# Phase 1 Findings — Extraction Diagnosis

> **Resuming?** Start at [PROGRESS.md](PROGRESS.md). This file is the evidence record for Phase 1.

Status: **Phase 1 COMPLETE.** Extraction is repaired and validated against two
independent signals. See §7 for the outcome.
This supersedes the repair rule in [PLAN.md](PLAN.md) §2, which was wrong. See §4.

---

## 1. Font identification

| pdfjs id | Embedded font | Role | Share |
|---|---|---|---|
| `g_d0_f2` | `DTREBQ+MonlamUniOuChan2` | **body text** | 95.35% |
| `g_d0_f6` | `DTREBQ+Qomolangma-Uchen-Sarchung` | front matter (9pt) | 2.15% |
| `g_d0_f10` / `g_d0_f9` | `Qomolangma-Uchen-Sarchung` (8pt) | running heads, y≈539 | 1.5% |
| `g_d0_f8` | `CLHYNS+TCRCYoutso` (17pt) | page numbers, y=36 | — |
| `g_d0_f3` | `Qomolangma-Uchen-Sarchen` (12pt) | secondary text | 0.69% |
| `g_d0_f1` | `MonlamUniOuChan4` | display / titles | 0.03% |
| `g_d0_f5` | `TimesNewRomanPSMT` | Latin (ISBN, URL) | — |

**Geometry is clean**: body occupies y ∈ [59, 528]; running heads sit at y≈539–540;
page numbers at y=36. Headers and folios can be dropped by coordinate alone.

## 2. The defect is in the ToUnicode CMap, not the glyphs

The body font embeds **3,382 glyph outlines** but the PDF subset carries **no `cmap`
and no `post` table** — so glyph *names* are unavailable, but glyph *outlines* are intact
and renderable.

Raw content-stream decoding gives the ground truth:

- **241 distinct CIDs** used across **400,580 glyph occurrences** on 964 pages
- **0 CIDs are unmapped** — every glyph has a ToUnicode entry
- **23 Unicode outputs are produced by more than one CID** — 64 CIDs involved

That collision *is* the data loss: the CMap maps ligature glyphs to only their head
letter, silently discarding the subjoined consonant.

## 3. Confirmed instances

Ground truth from a rendered page (`qa/pages/p0300-crop300.png`) against extraction:

| Rendered (truth) | Extracted | Lost |
|---|---|---|
| `ཉོན་མོངས་སྤྱོང་བ་ལ` | `ཉོན་མོངས་སོ ང་བ་ལ` | `ྤ` **and** `ྱ` |
| `སྐྱེ་བའི` | `སྐྗེ་བའི` | `ྱ` |
| `གཉེན་པོ` | `གཉྗེན་པོ` | (spurious `ྗ`) |

Corpus-level proof, over 1.2M chars of body text:

| Word | Correct form found | Broken form found |
|---|---|---|
| `ཀྱི` | 3,691 | 3 |
| `གྱི` | **0** | 4,987 |
| `བློ` | **0** | 1,353 |
| `སྤྱོད` | **0** | 114 |
| `སྙིང` | **0** | 62 |

Zero occurrences of `གྱི` or `བློ` in a 1.2M-character Tibetan book is impossible.

## 4. Corrected repair strategy (supersedes PLAN.md §2)

**The original plan's rule — "delete `U+0F97` unless preceded by `ར`" — is wrong.**
It would have silently converted every genuine `རེ` into `རྗེ`.

The true situation:

- **`CID 214 → "ྗེ"`, used 35,466×** (the 2nd most frequent glyph in the book) is simply
  the **plain e-vowel `ེ`**, mis-mapped. Compare `CID 306 → "ེ"` (260×): the font carries
  positional vowel variants, exactly as it does for the i-vowel
  (`CID 206 → ི` 28,380× and `CID 299 → ི` 409×). So:

  > **`CID 214` → `ེ` unconditionally.** No context rule needed.

- **The trap:** no CID maps to a `རྗ` stack, yet `རྗེ` extracted *correctly* before.
  Reason: `CID 411` (2,615×) is really **`རྗ`** but is mapped to bare `ར`; the spurious
  `ྗ` from CID 214 was accidentally completing it. Two errors cancelled.
  **Fix CID 214 without fixing CID 411 and every `རྗེ` silently becomes `རེ`.**

Repair therefore happens at **CID level, not character level**: decode content streams to
raw CIDs and apply a corrected CID→Unicode table. This is lossless — no guessing, no
regex over already-damaged text.

### Remaining work: identify ~40 CIDs

The non-plain members of the 23 colliding groups. Largest groups:

```
"ས"  200:19956  406:1326  508:937  427:717  506:615  441:457
"ར"  196:8019   411:2615  483:887  404:486  489:431  375:313  399:283  423:88
"ག"  165:12356  369:2659  373:143  166:1
"བ"  184:13148  455:1085  457:920
"ད"  179:21824  421:1457  689:2
```

In each group the plain letter is normally the highest-frequency member, but **not
always** — `ཕ` is `448:2775` vs `183:463`, and common ligatures (`སྐྱ`, `གྱ`) outrank
their plain forms. Frequency is a hint, not evidence.

**Identification method (two independent signals, must agree):**

1. **Visual** — render the glyph outline (`tools/07`, `tools/08`) and read it. Already
   confirmed `CID 369 = གྱ` and `CID 411 = རྗ` this way.
2. **Corpus validation** — substitute each candidate and measure what fraction of the
   resulting tsheg-delimited syllables are orthographically legal Tibetan. A wrong
   assignment produces mostly-illegal syllables; the correct one produces almost none.

Only assignments where both signals agree get committed. Anything unresolved is recorded
explicitly rather than guessed.

## 5. Tooling built (all working)

| Script | Purpose |
|---|---|
| `tools/01-analyze-fonts.mjs` | font inventory: sizes, y-bands, page coverage |
| `tools/02-check-subjoined.mjs` | corpus probe for dropped subjoined consonants |
| `tools/03-dump-font.mjs` | extract + parse ToUnicode CMaps, detect collisions |
| `tools/04-map-fonts.mjs` | resolve pdfjs ids → real embedded font names |
| `tools/05-extract-fontfile.mjs` | extract embedded TrueType programs |
| `tools/06-cid-census.mjs` | decode content streams → raw CID frequency census |
| `tools/07-render-glyphs.mjs` | labelled glyph contact sheets |
| `tools/08-render-big.mjs` | large renders of specified CIDs |
| `tools/09-render-page.mjs` | render PDF pages to PNG (ground truth) |

Note: `pdfjs` + `@napi-rs/canvas` needs `globalThis.Path2D` polyfilled before importing
pdfjs, or `ctx.fill(path)` throws.

## 6. Revised risk assessment

The original plan treated extraction as a mostly-solved problem with one regex fix.
It is instead the single hardest part of the project — but it is now **bounded and
tractable**: a one-time, 241-entry table, verifiable against rendered ground truth.

Once that table is correct, extraction is exact and the remaining phases proceed as
planned in [PLAN.md](PLAN.md).


---

## 7. Phase 1 outcome

### Method actually used

Repair happens at **CID level**: content streams are decoded to raw glyph IDs by our
own interpreter (`tools/pdfcontent.mjs`), then a corrected CID→Unicode table is applied.
The interpreter was verified against pdfjs on 16 sampled pages — **character-for-character
identical on all 16**, which proves the CID stream and its ordering are right.

Each of the 36 table entries was settled by **two independent signals that had to agree**:

1. **Visual, in word context** — the glyph rendered inside a real Tibetan word from an
   actual page (`tools/14-cid-context.mjs`), at least two occurrences from different pages.
2. **Lexicon scoring over the whole corpus** — every syllable the CID occurs in, decoded
   under each candidate value and scored against the Monlam lexicon
   (367k entries → 16,252 distinct syllables, Apache-2.0, `data/`).

### Results

| Check | Result |
|---|---|
| Interpreter vs pdfjs | **16/16 pages identical** |
| Illegal Tibetan stacks | 26,246 → **59** (**99.78%** reduction) |
| Syllables with an illegal stack | **0.020%** (59 of 297,547) — all Sanskrit conjuncts |
| Lexicon agreement | **no disagreement with any table entry** |
| Repaired glyph occurrences | ~48,000 of 1,031,930 |

### Where the two signals disagreed — and why that mattered

Reading glyphs by eye was **not** sufficient on its own. Three entries were wrong after
the visual pass and were caught by the other signals:

| CID | first read | actually | caught by |
|---|---|---|---|
| 445 (188×) | `སྤྱ` | **`སྤྲ`** | page-700 comparison: rendered `སྤྲོས་པ`, text said `སྤྱོས་པ` |
| 506 (615×) | `སྐྱ` | **`སྲ`** | lexicon: `སྲིད/སྲོག/སྲས/བསྲེགས` valid, `བསྐྱེགས` not |
| 401 (23×) | `ལྷ` | **plain `ལ`** | lexicon preferred `ལ`; high-zoom render confirmed |

The failure mode was consistent: **`ྲ` and `ྱ` are not reliably distinguishable at low
zoom.** Anything resting on a single visual pass would have shipped these errors silently
into the translation.

One cross-check was **built and then discarded**: comparing which words two CIDs occur in.
It fails because positional variants are used in *complementary* distribution by design —
CID 299 (`ི` on tall stacks) shares zero contexts with CID 206 (`ི` elsewhere) despite being
the same character. It scored `443`/`445` the same as known-identical pairs, so it was not
used.

### Left unrepaired, deliberately

Eight CIDs totalling ~156 occurrences (0.015%) are not repaired, because neither signal was
decisive. They keep their shipped value, which in each case decodes to a valid Tibetan
syllable — the safe failure mode. `355` (17×) is the notable one: `ལོག` vs `ལྷོག`, where the
lexicon ties exactly. Recorded in `UNRESOLVED` in `tools/repair-table.mjs` rather than guessed.

### Output

`source/clean/lamrim.txt` — 3.32 MB, 978 page files alongside it. Running heads (16,802
glyphs) and folio numbers (7,394) removed by font + y-band. Lines reconstructed from glyph
coordinates; paragraphs from indentation and short final lines.

Key-term frequencies are coherent for this text: ཞི་གནས 354, ལྷག་མཐོང 245, བྱང་ཆུབ 461,
ཚུལ་ཁྲིམས 230, སྐྱེ་བ 688, རྟེན་འབྲེལ 79.

## 8. Page comparisons — completed (20 pages)

Pages compared line-by-line against their renders:
**12, 30, 90, 150, 210, 270, 300, 330, 390, 450, 510, 570, 630, 690, 700, 750, 810, 870, 930, 960**
— spanning front matter, contents, all three scopes, śamatha, and vipaśyanā.

They found **five real defects that every corpus-wide check had missed**, which is
the case for doing them rather than trusting the automated passes alone.

### 8.1 Glyph ordering (p90)
Render: `འགྲོའོ།`  Extracted: `འགྲོའ།ོ` — the o-vowel and shad swapped.
Cause: lines were sorted by x-position, but combining marks do not sit where logical
order implies. **Fix:** order glyphs by content-stream order, which the interpreter had
already proven is the correct reading order. `tools/21` now verifies this across
**978/978 pages** — no reordering, loss, or duplication. Zero vowel-after-shad artifacts remain.

### 8.2 The secondary fonts were never repaired (p690) — the big one
Page 690 showed the sa-bcad **section headings** reading `ངེས་དོན་གི་` while the body text
on the same page read `ངེས་དོན་གྱི་`. The headings use *Qomolangma-Uchen-Sarchen*, which has
the same class of ToUnicode defect and was outside the original table.

Built `tools/secondary-repair-table.mjs` (18 entries) covering the heading font, the front
matter, and the display font. Since **MonlamUniOuChan4 shares the body font's CID space**,
it is decoded through the body CMap — and its CMap independently confirms
`CID 214 = ེ`, the single highest-impact body fix, from the PDF's own data.

### 8.3 A new grammatical check
`གི` and `གྱི` are both valid syllables, so the lexicon cannot separate them. Tibetan
genitive agreement can: the particle is fixed by the previous syllable's final letter
(`ག ང`→`གི`, `ད བ ས`→`ཀྱི`, `ན མ ར ལ`→`གྱི`). `tools/24` measures it:

| | agreement |
|---|---|
| unrepaired body font | **71.04%** |
| repaired (body only) | 99.32% |
| repaired (+ secondary fonts) | **99.92%** (8,679 particles) |

That also pinned `CID 523 = གྱ` exactly: 25 uses, matching the 25 failing particles.

### 8.4 Contents-page numerals were being deleted (p12)
Folio fonts were dropped **by name**, but on pages 8–20 that same font carries the
contents page-number column — 769 glyphs of real content. All 6,625 actual folio numbers
sit outside the body band, so the y-band alone suffices. Fixed; numerals restored.

### 8.5 Errors the lexicon could not catch
Three secondary-font stacks produce **valid-but-wrong** words, so lexicon scoring passed them:

| CID | scored as | actually | decided by |
|---|---|---|---|
| 541 | `ས` (`སབ` is in the lexicon) | **`སླ`** | `བསླབ་པ` ×32 (training) |
| 531 | `ཕ` (`ཕིར` is in the lexicon) | **`ཕྱ`** | `ཕྱིན`/`ཕྱིར`/`ཕྱོགས` |
| 497 | `རྗ` (both are words) | **`རྙ`** | forms `བརྙེས`+`རྙེད`; `རྗེད` is not a word |
| 548 | `སྒྱ` | **`སྒྲ`** | `ཞུ་སྒྲིག`; `སྒྱིག` is not a word |

Caught by a **word-probe sweep** (`tools/26`) plus listing the actual syllables each CID
forms under each candidate (`tools/27`). Every one of the 18 secondary entries is now
backed by that word evidence, not by score alone.

### 8.6 Two apparent errors that are the source's own
- **p30** `དག་ཏེར` where orthography wants `དག་ཐེར`. Traced to CID 177, verified `ཏ` across
  3,584 uses (`ཐ` is separately mapped, 4,508 uses). The book has a typo; extraction is faithful.
- **p330** `དེ་ཡོ` alongside `དེ་ཡང` twice on the same line, confirmed at high zoom.

### 8.7 Final state

| Check | Result |
|---|---|
| Line reconstruction | **978/978 pages** exact |
| Genitive agreement | **99.92%** (from 71.04%) |
| Illegal Tibetan stacks | 26,246 → **59** (99.78%), all Sanskrit |
| Lexicon | no disagreement with any entry |
| Pages compared to render | **20**, all matching |
| Repair entries | **35 body + 16 secondary** |

The title page, which originally extracted as `རོམ་སྒིག` / `ཀི་སིང་པོའི`, now reads
`རྩོམ་སྒྲིག་ཁང་` / `ཀྱི་སྙིང་པོའི`. **Defect D from §2 is fully resolved.**

### Residual, stated plainly
Three CIDs in the secondary fonts and eight in the body font (~152 occurrences combined)
are left unrepaired where no signal was decisive; each keeps a shipped value that decodes to a
valid Tibetan syllable. The word-probe sweep still lists 13 "suspects", all verified as
probe false positives (`ང`, `པ`, `མོང` from `ཉོན་མོངས`, `རོ`, `རོགས` are themselves
common words).
