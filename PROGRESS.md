# Translation Progress

> **Generated file — do not hand-edit.** Edit `progress.json`, then run `node tools/30-progress.mjs`.
> Every number below is measured from the files on disk, not remembered.

**Lamrim Chenmo -> Vietnamese** · target **Vietnamese** · full book, 978 pages · Markdown working files, translation-only

---

## Resume here

**Phase 2 — Structural segmentation (sa-bcad outline)**

Build the sa-bcad outline: detect section headings and produce the chapter/section structure that chunking will follow.

```
node tools/31-outline.mjs   (does not exist yet - Phase 2 starts by writing it)
```

Headings live in DTREBQ+Qomolangma-Uchen-Sarchen (12pt, ~9k chars) and are now correctly decoded. Detect by font + size, not by text matching.

Before starting, confirm nothing drifted:

```
node tools/30-progress.mjs --verify
```

## Phases

| | Phase | Status |
|---|---|---|
| [x] | **0. Project skeleton** | done |
| [x] | **1. Extraction & repair** | done · verified |
| [ ] | **2. Structural segmentation (sa-bcad outline)** | not started |
| [ ] | **3. Terminology spine (glossary)** | not started |
| [ ] | **4. Translation loop** | not started |
| [ ] | **5. Review (fidelity + consistency)** | not started |
| [ ] | **6. Assembly** | not started |

## Measured state

| Artifact | Value |
|---|---|
| Raw glyph pages (audit trail) | 978 |
| Clean text pages | 978 |
| `source/clean/lamrim.txt` | 3.32 MB |
| Repair entries (body font) | 35 |
| Repair entries (secondary fonts) | 16 |
| CIDs deliberately left unrepaired | 11 |
| sa-bcad outline built | no |
| Glossary terms | 0 |
| Translation files written | 0 |

## Translation progress

Translated: (not yet segmented)

Reviewed:   (not yet segmented)

_Chunks are created in Phase 2 from the sa-bcad outline; nothing to track yet._

## Health checks

_Last run: 2026-08-24T02:07:18.249Z_ (re-run with `--verify`)

| Check | Result | Expected |
|---|---|---|
| Line reconstruction (all 978 pages) | 978/978 | 978/978 |
| Genitive agreement | 99.92% | ~99.9% |
| Illegal Tibetan stacks | 59 | 59 (all Sanskrit) |
| Lexicon vs repair table | none - lexicon agrees with every entry in the repair table | no disagreement |
| Dropped-stack sweep | 13 | 13 (all probe false positives) |

## Decisions already locked in

_Do not relitigate these mid-project without recording why._

- Target language: Vietnamese. Deliverable: Markdown, translation-only (no bilingual layout).
- Repair happens at CID level via our own content-stream interpreter, NOT by regex over decoded text.
- source/raw/glyphs/ is the permanent audit trail and is never edited. Everything downstream is a reproducible transform.
- Every repair-table entry requires TWO independent signals that agree. Score alone is not sufficient - see FINDINGS.md 8.5.
- CIDs with no decisive evidence are left UNREPAIRED rather than guessed; each keeps a value that decodes to a valid Tibetan syllable.
- Reference (do not copy) the existing Vietnamese Bo De Dao Thu De Quang Luan and the Snow Lion English translation for terminology checking only.

## Open questions

- Phase 3: which Vietnamese rendering to fix for terms with competing conventions - decide once, record in glossary/decisions.md, never relitigate mid-book.
- Phase 4: whether to enable experimental Agent Teams for the translation-quality skill, or run single-session (current assumption: single-session).

## Where things live

| Path | What |
|---|---|
| `PLAN.md` | The plan. Section 2 has a **superseded** rule marked as such |
| `FINDINGS.md` | Extraction diagnosis + every repair decision and its evidence |
| `progress.json` | **Editable state.** Source of truth for this file |
| `source/raw/glyphs/` | Per-glyph audit trail. **Never edit** |
| `source/clean/` | Repaired Tibetan, per page + whole book |
| `tools/repair-table.mjs` | Body-font CID fixes, each with its evidence |
| `tools/secondary-repair-table.mjs` | Heading/front-matter font fixes |
| `tools/decode.mjs` | **Single decoder** used by every tool — keep it that way |
| `data/monlam-lexicon.txt` | 367k-entry Tibetan lexicon (Apache-2.0) |
| `glossary/` | bo→vi terminology + decisions log |
| `translation/` | The deliverable |
| `qa/` | Rendered pages, glyph sheets, check output |

## Rebuilding from scratch

If `source/clean/` is ever lost or a repair table changes:

```
node tools/11-extract-glyphs.mjs   # PDF -> source/raw/glyphs  (only if raw/ is gone)
node tools/16-build-text.mjs       # raw + repair tables -> source/clean
node tools/30-progress.mjs --verify
```

To inspect any single page against its render:

```
node tools/20-compare-page.mjs <page> 3     # prints numbered lines + writes qa/compare/pNNNN.png
```
