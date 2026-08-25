# Lamrim Chenmo → Vietnamese

Translating Tsongkhapa's *Lamrim Chenmo* (བྱང་ཆུབ་ལམ་རིམ་ཆེན་མོ།, Sera Jey Rigzod Chenmo
edition, 978 pages) into Vietnamese.

**→ Start at [PROGRESS.md](PROGRESS.md).** It is generated from the files on disk and
says exactly what state the project is in and what to do next.

---

## Status

Phases 1–3 are **complete and verified**: extraction and repair, the sa-bcad outline, and
the terminology spine. Phase 4 (translation) is running.

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

## The structure came from the book itself

The *sa bcad* outline is the book's spine, and it is built from **two independent sources
that have to agree**: the book's own contents (*dkar chag*, pp. 8–20), which supplies the
title, the nesting depth via indentation, and the printed page; and the section headings
printed in the body, which supply the exact PDF page. **284 of 284 contents entries match a
printed heading exactly**, and no printed heading in the body is missing from the contents.

Requiring the two to agree also turned the book into a parallel corpus of the same titles in
two different fonts — which caught three more defective glyphs the whole Phase 1 apparatus
had missed (FINDINGS §9). The lexicon was blind to all three, because `འགོ`, `གོ` and `རོ`
are themselves valid syllables.

## How the translation runs

The book is cut into **292 chunks on section boundaries**, covering 965 of 978 pages. The
13 contents pages are the only exclusion: they are regenerated from the translated section
titles at assembly, since translating an index by hand guarantees it drifts from the
headings it indexes.

Each chunk goes through three agents:

```
translate  ──▶  verify  ──▶  repair
   │              │             │
   │              │             └─ fixes only what was named; a wrong
   │              │                criticism is refused, with the reason
   │              └─ an independent skeptic hunting fabrication,
   │                 omission and glossary drift. It can hold work back.
   └─ writes translation/<id>.md only — never shared state
```

A chunk is marked translated **only if the fidelity check passes**. Agents write their own
file and nothing else; the glossary and progress state are merged afterwards in one process
by `tools/35-merge-batch.mjs`, because concurrent writers lose entries.

```bash
node tools/32-chunk.mjs batch 10      # emit the next 10 pending chunks as workflow args
# run the lamrim-translate workflow with them
node tools/35-merge-batch.mjs <results.json> --write
```

**Every translated chunk records a hash of the exact Tibetan it was made from.**
`source/clean/` is a reproducible transform of the raw glyphs, so it changes whenever a
repair-table entry is added — it has changed three times. A chunk translated before such a
fix was made from text that no longer exists. `node tools/32-chunk.mjs stale` finds them;
`reset --stale` sends them back to be redone. Without that, a repair silently leaves wrong
translations behind and nothing reports it.

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
| `source/outline.json` | The sa-bcad outline: 284 sections, depth, page ranges |
| `tools/repair-table.mjs` | Body-font glyph fixes, each with the word that settled it |
| `tools/secondary-repair-table.mjs` | Heading and front-matter font fixes |
| `tools/decode.mjs` | The single decoder every tool shares |
| `glossary/glossary.json` | bo→vi terminology; `status` says how settled each entry is |
| `glossary/decisions.md` | Why each contested term was decided that way |
| `.claude/workflows/lamrim-translate.js` | The translate → verify → repair batch workflow |
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
