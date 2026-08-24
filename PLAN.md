# Lamrim Chenmo → Vietnamese: Translation Plan

> **Resuming?** Start at [PROGRESS.md](PROGRESS.md) — it is generated from the actual files and says exactly what to do next.

**Source:** `བྱང་ཆུབ་ལམ་རིམ་ཆེན་མོ།_Lamrim.pdf` — Tsongkhapa, *Lamrim Chenmo*
(Serje Rigzod Chenmo edition). **Target:** Vietnamese. **Scope:** full text, 978 pages.
**Deliverable:** Markdown working files, translation-only.

---

## 1. What the source actually is (measured, not assumed)

| Property | Value |
|---|---|
| Pages | 978 |
| Tibetan characters | 1,258,843 |
| Syllables (tsheg count) | ~286,000 |
| Clause marks (shad) | 31,438 |
| Median chars/page | 1,296 (max 2,501) |
| Pages with no text layer | **0** |
| Producer | Adobe InDesign CC 2014 → macOS Quartz |
| Embedded fonts / images | 7 fonts, 9 images |

**The PDF is born-digital, not a scan.** Every page has a real Unicode text layer with
ToUnicode CMaps. **No OCR is needed** — this removes the single largest risk and cost
from a project of this size.

Expect roughly **400,000–500,000 Vietnamese words** of output.

---

## 2. The blocking problem: the text layer is systematically corrupted

Extraction works, but the body font's ToUnicode table is defective. This must be fixed
**before** any translation, or every downstream step inherits garbage.

### Defect A — spurious subjoined JA on the e-vowel (critical)

Across a 26-page sample (33,891 chars):

- `U+0F7A` (vowel ེ) appears **913** times
- `U+0F97` (subjoined ja ྗ) appears **860** times
- **100% of `U+0F97` occurrences are immediately followed by `U+0F7A`** — it never
  appears in any other context

Subjoined ja is rare in real Tibetan. What is happening: the body font's e-vowel glyph
maps to the two-codepoint sequence `U+0F97 U+0F7A` instead of just `U+0F7A`.

Observed damage:

| Extracted | Should be | Meaning |
|---|---|---|
| `དྗེ` (×64) | `དེ` | "that" — the most common word in Tibetan |
| `བདྗེ` (×14) | `བདེ` | bliss |
| `ཤྗེས` | `ཤེས` | wisdom / to know |
| `བྱྗེ` | `བྱེ` | — |

**But the same sequence is sometimes correct.** In native Tibetan orthography subjoined
ja occurs *only* under `ར`, and those extractions are genuine words:

`རྗེ` (×20, "lord"), `བརྗེ` (×7, "exchange"), `རྗེས` (×5, "after/trace"), `བརྗེད` ("forget")

> **SUPERSEDED — the repair rule originally written here was wrong.**
> It said: *delete U+0F97 unless preceded by ར*. That would have silently turned every
> genuine `རེ` into `རྗེ`. Phase 1 investigation found the real defect lives in the
> font ToUnicode CMap at **CID level**, and the correct fix is unconditional
> (`CID 214 → ེ`) combined with repairing `CID 411 → རྗ` in the same pass.
>
> **See [FINDINGS.md](FINDINGS.md) §4 for the corrected strategy.** Repair is done by
> decoding raw CIDs from the content streams, not by regex over already-damaged text.

### Defect B — stray spaces inside syllables

InDesign justification tracking surfaces as literal `U+0020` inside words:
`གངས་ཅན་གི ་ལོ ངས་སུ་སྔོ ན་བྱོ ན` (should be `གངས་ཅན་གྱི་ལོངས་སུ་སྔོན་བྱོན`).
1,712 spaces in the 33,891-char sample. Tibetan delimits with tsheg `་`, not spaces, so
**within a Tibetan run, spaces are always artifacts** and can be stripped wholesale.

### Defect C — running heads welded into the body text

Page 300 extracts as `280རྗེ་བློ་བཟང་གྲགས་པ།བྱྗེ...` — the printed page number and the
running head (the author's name) are glued to the first body word. They arrive as
*separate text items in distinct fonts*, so they are cleanly removable by font ID +
y-coordinate before the text is joined.

### Defect D — front matter uses display fonts that drop subjoined letters ⚠ unverified

On the title pages (pp. 1–2, decorative fonts) subjoined consonants vanish entirely:
`ཀྱི`→`ཀི`, `སྙིང`→`སིང`, `རྩོམ་སྒྲིག`→`རོམ་སྒིག`. The **body** font appears healthy here
(subjoined ya and ra both present in body samples at expected rates), so this may be
confined to front matter. **This is an assumption, and Phase 1 must confirm it** — if the
body font also drops letters anywhere, the whole extraction approach needs rethinking.

---

## 3. Tooling

Already verified working on this machine:

- **Node.js** + `pdfjs-dist` — handles the ToUnicode CMaps correctly. This is the
  extraction engine.
- **git** — for versioning the translation (strongly recommended; see Phase 4).

Skills installed to `~/.claude/skills/`:

| Skill | Source | Role here |
|---|---|---|
| `pdf` | anthropics/skills | PDF extraction reference (JS path — see below) |
| `docx` | anthropics/skills | Optional formatted export later |
| `skill-creator` | anthropics/skills | To build the project-specific translation skill |
| `translation-quality` | senshinji (MIT) | Glossary schema, anti-fabrication checklist, review rubric |

**Two caveats on those skills, so they don't mislead later:**

1. The `pdf` skill is Python-first. **There is no real Python on this machine** — only the
   Microsoft Store stub. Its JavaScript path (`reference.md`, pdfjs-dist / pdf-lib) is what
   applies; its Python snippets will not run as written.
2. `translation-quality` orchestrates via **experimental Agent Teams**, which is not
   enabled, and its Phase 0 assumes macOS `textutil`. Its *reference documents* —
   `glossary-schema.md`, `anti-fabrication-checklist.md`, `review-feedback-schema.md` — are
   the genuinely valuable part and are platform-independent. This plan assumes
   single-session execution unless you opt into agent teams.

**Recommended addition: install real Python** — not for the `pdf` skill, but for
[`botok`](https://github.com/OpenPecha/Botok), the standard Tibetan word segmenter.
Tibetan writes syllables, not words; `botok` gives real word boundaries, which materially
improves both chunking and glossary extraction. Not a blocker — Phase 1 can proceed on
syllable and shad boundaries without it.

---

## 4. Phases

### Phase 0 — Project skeleton

```
c:\Workplace\Translator\
  PLAN.md
  tools/          # Node extraction + repair scripts
  source/raw/     # per-page extraction, UNREPAIRED — permanent audit trail
  source/clean/   # repaired Tibetan, per chapter
  glossary/       # glossary.json (bo → vi), decisions log
  translation/    # Vietnamese markdown — THE DELIVERABLE
  qa/             # review notes, flagged passages
  progress.json   # resumable state
```

The `raw/` tree is never edited. Every repair is a reproducible transform from `raw/` to
`clean/`, so when a repair rule turns out to be wrong at page 700, we re-run rather than
re-extract.

### Phase 1 — Extraction & repair *(the critical phase)*

1. Extract all 978 pages with `pdfjs-dist`, preserving per-item `fontName`, `x`, `y`.
2. Classify fonts: body vs running-head vs page-number vs display. Drop non-body runs.
3. Reconstruct lines from y-coordinates, paragraphs from line gaps and shad `།`.
4. Apply repairs A (context-sensitive `U+0F97`) and B (strip intra-Tibetan spaces).
5. **Validate — this phase does not end until these pass:**
   - Zero `U+0F97` remaining except after `ར`.
   - Every syllable checked against valid Tibetan stack rules; dump a frequency-ranked
     list of unrecognized syllables and inspect the top 200 by hand.
   - **Render 20 pages spread across the book to PNG and compare against the extracted
     text visually.** This is the only check that catches Defect D and any silent glyph
     dropping. Non-negotiable.
   - Quantify the `རྗེ`/`རེ` ambiguity (§4.2) and record the count.
6. Freeze `source/clean/`. Downstream work depends on it being stable.

**Do not start Phase 4 until Phase 1 validation passes.** Translating corrupt text is the
one failure mode in this project that wastes the entire budget.

### 4.2 Resolving the `རྗེ` / `རེ` ambiguity

Enumerate every `ར+ྗ+ེ` site with surrounding context. Native `རྗེ`-family words form a
short, closed list (`རྗེ`, `རྗེས`, `བརྗེ`, `བརྗེད`, `རྗེན`, and compounds). `རེ` likewise
appears in a bounded set of collocations (`རེ་རེ`, `རེ་བ`, `རེ་ཞིག`). A lookup table over
the following syllable resolves the large majority mechanically; the remainder gets flagged
inline for human review rather than silently guessed.

### Phase 2 — Structural segmentation

Lamrim Chenmo is organized by *sa bcad* (nested outline topics) — this structure is the
book's spine and must survive into the translation. Detect chapter and section headings
(distinct fonts and sizes, already captured in Phase 1), build a machine-readable outline,
and map it to the standard three-capacities division (small / middle / great scope, then
śamatha and vipaśyanā). Chunk on section boundaries, not arbitrary page counts.

### Phase 3 — Terminology spine *(do this before bulk translation)*

Build `glossary/glossary.json` (schema from `translation-quality`) covering:

- Core doctrinal vocabulary — the few hundred terms that carry the book.
- Proper nouns: Indian and Tibetan masters, text titles, place names.
- Quotation sources: the text cites sūtras and śāstras *constantly* (31,438 shad give a
  sense of the density). Each cited work needs one fixed Vietnamese title.

Vietnamese Buddhist terminology is largely Sino-Vietnamese and already standardized —
anchor to existing convention rather than inventing (e.g. ཤེས་རབ་ → *trí tuệ / bát-nhã*,
བྱང་ཆུབ་སེམས་ → *bồ-đề tâm*). Where a term has competing renderings, decide once, record
the decision and the reason in the glossary, and never re-litigate it mid-book.

**Reference, do not copy:** established Vietnamese renderings of the Lamrim exist
(*Bồ Đề Đạo Thứ Đệ Quảng Luận*), as does the authoritative English Snow Lion translation
by the Lamrim Chenmo Translation Committee. Use them to *check* terminology choices.
Producing an independent translation, with these as reference points, keeps the work yours
and avoids reproducing copyrighted text at scale.

### Phase 4 — Translation loop

~250–300 chunks of 3–5 pages each, on section boundaries. Per chunk:

1. Load the chunk's repaired Tibetan + glossary + a summary of the preceding section.
2. Translate to Vietnamese.
3. Self-check against `anti-fabrication-checklist.md` — the failure mode that matters most
   here is *fluent invention*: producing plausible Buddhist prose that isn't what the
   Tibetan says. Every sentence must trace to source.
4. Append new terms to the glossary; flag uncertain passages inline rather than smoothing
   over them.
5. Commit to git, update `progress.json`.

Resumable by design — this is a multi-session project measured in weeks, not one sitting.

**Budget honestly:** at roughly 15–25k tokens per chunk round-trip, the full book is on the
order of **5–7 million tokens**. Worth knowing before starting, not at page 400.

### Phase 5 — Review

Two passes, both after a chunk has gone cold:

- **Fidelity** — Vietnamese against Tibetan, sentence by sentence, on a sample plus every
  flagged passage.
- **Consistency** — automated sweep for glossary drift across the whole book. The same
  Tibetan term rendered differently in chapter 3 and chapter 19 is the characteristic
  failure of long translation projects.

### Phase 6 — Assembly

Concatenate `translation/` into the final Markdown deliverable with the sa bcad outline as
navigation. `.docx` export available via the `docx` skill if you later want it.

---

## 5. Sequencing note

Phases 1–3 determine whether this project succeeds. They are also the ones easiest to
shortcut under enthusiasm to start translating. The extraction is corrupt in a way that
*looks* fine — `དྗེ` renders as something, and only someone reading Tibetan notices it is
not a word. Validate first.
