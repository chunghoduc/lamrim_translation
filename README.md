# Lamrim Chenmo → Vietnamese

Translating Tsongkhapa's *Lamrim Chenmo* (བྱང་ཆུབ་ལམ་རིམ་ཆེན་མོ།, Sera Jey Rigzod Chenmo
edition, 978 pages) into Vietnamese.

**→ Start at [PROGRESS.md](PROGRESS.md).** It is generated from the files on disk and
says exactly what state the project is in and what to do next.

---

## Status

Phase 1 (extraction and repair) is **complete and verified**. Phases 2–6 are ahead.

The hard part turned out to be getting the Tibetan out of the PDF at all. The source is
born-digital, but the embedded fonts' ToUnicode tables are defective: ligature glyphs map
to only their head letter, silently discarding subjoined consonants. `གྱི` appeared **zero**
times in 1.2M characters of Tibetan — impossible — because it was being flattened to `གི`.

Repair happens at glyph-ID level through a purpose-built PDF content-stream interpreter,
not by patching already-damaged text. Full diagnosis and the evidence for every decision
is in [FINDINGS.md](FINDINGS.md).

| Check | Result |
|---|---|
| Interpreter vs pdfjs | 16/16 sampled pages character-identical |
| Line reconstruction | 978/978 pages, no reordering or loss |
| Tibetan genitive agreement | 99.92% (from 71.04% unrepaired) |
| Illegal consonant stacks | 26,246 → 59 (all legitimate Sanskrit) |
| Pages compared against render | 20, all matching |

## What is *not* in this repo

**The source PDF.** It is a copyrighted published edition, and this repo does not
redistribute it. Everything derived from it is here. To re-run extraction, put the PDF
back at the project root and run `node tools/11-extract-glyphs.mjs`.

Also excluded for size, all regenerable: `source/raw/` (116 MB glyph audit trail),
`qa/` image output (16 MB), and the 25 MB Monlam lexicon (see `data/README.md` — the
derived `data/syllables.json` that the tools actually read *is* committed).

## Layout

| Path | What |
|---|---|
| [PROGRESS.md](PROGRESS.md) | Generated status — **the entry point** |
| [PLAN.md](PLAN.md) | The plan. §2 carries a rule marked **superseded**, deliberately |
| [FINDINGS.md](FINDINGS.md) | Extraction diagnosis; evidence for every repair |
| `progress.json` | Editable state that PROGRESS.md is generated from |
| `source/clean/` | Repaired Tibetan — per page and whole-book |
| `tools/repair-table.mjs` | Body-font glyph fixes, each with the word that settled it |
| `tools/secondary-repair-table.mjs` | Heading and front-matter font fixes |
| `tools/decode.mjs` | The single decoder every tool shares |
| `glossary/` | Tibetan→Vietnamese terminology (Phase 3) |
| `translation/` | The deliverable (Phase 4) |

## Setup

```bash
npm install
node tools/30-progress.mjs --verify    # re-run every health check
```

## Method note

Every entry in the repair tables required **two independent signals that agreed**. That
was not academic caution: reading glyphs by eye alone produced three wrong entries, and
lexicon scoring alone missed four more (`སབ`, `ཕིར` and friends are themselves valid
syllables, so a wrong reading can still score perfectly). Where no signal was decisive,
the glyph is left **unrepaired** rather than guessed — 11 CIDs, ~153 occurrences, each
keeping a value that still decodes to a valid Tibetan syllable.

## Licence

Tooling and analysis in this repo: choose a licence before making the repo public.
`data/syllables.json` is derived from the [Monlam Tibetan Lexicon](https://github.com/MonlamIT/Tibetan-Lexicon)
(Apache-2.0). The source text itself is not included; its rights rest with its publisher.
