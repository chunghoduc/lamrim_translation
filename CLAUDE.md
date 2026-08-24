# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Translating Tsongkhapa's *Lamrim Chenmo* (བྱང་ཆུབ་ལམ་རིམ་ཆེན་མོ།, 978 pages, Sera Jey Rigzod
Chenmo edition) from Classical Tibetan into Vietnamese. Deliverable is Markdown,
translation-only (no bilingual layout).

**Read [PROGRESS.md](PROGRESS.md) first.** It is generated from the files on disk and states
the current phase and the next action. Do not trust any status claim that is not measured.

---

## Correctness is the only criterion that matters

This is a canonical Buddhist text. A fluent translation that misrepresents the source is
**worse than no translation**, because the error is invisible to the reader. Speed, volume,
and finishing a chunk are all subordinate to being right.

### The translation must never be hallucinated

The dominant failure mode here is **fluent invention**: producing plausible, well-formed
Buddhist prose that is not what the Tibetan says. It reads beautifully and is wrong. Guard
against it explicitly:

- **Every Vietnamese sentence must trace to specific Tibetan in the source.** If you cannot
  point to the words it came from, it does not go in.
- **Never fill gaps from knowledge of Buddhism.** Familiarity with Lamrim doctrine makes it
  easy to "complete" a passage from memory of what it *should* say. That is fabrication even
  when the doctrine is correct.
- **Never smooth over an unclear passage.** Flag it inline and record it on the chunk:
  `node tools/32-chunk.mjs done <id> "unsure: <what and why>"`. Flags surface in PROGRESS.md
  as blocking items for Phase 5. An honest flag is a good outcome; a confident guess is not.
- **Do not translate from the English or Vietnamese editions.** They may be consulted to
  *check* a terminology choice, never as the thing being rendered. Source is the Tibetan.
- **Do not silently normalise the source.** It contains genuine typos (see FINDINGS.md §8.6:
  `དག་ཏེར` for `དག་ཐེར`, `དེ་ཡོ` for `དེ་ཡང`). Translate what is there and note the oddity.

### The same standard applies to the tooling

The extraction work established a rule that must not be relaxed: **every repair-table entry
requires two independent signals that agree.** This was not caution for its own sake — during
Phase 1, reading glyphs by eye alone produced three wrong entries, and lexicon scoring alone
missed four more (`སབ`, `ཕིར` are themselves valid syllables, so a wrong reading can score
perfectly). Where no signal is decisive, the glyph is left **unrepaired rather than guessed**.

Carry that forward: when evidence is not decisive, record the uncertainty. Do not resolve it
by preference.

---

## Commands

There is no build or lint step. The "tests" are correctness checks over the corpus.

```bash
npm install

# Status + re-run every health check (this is the test suite)
node tools/30-progress.mjs --verify

# Regenerate PROGRESS.md only (fast, no checks)
node tools/30-progress.mjs
```

Run an individual check:

```bash
node tools/21-verify-lines.mjs      # line reconstruction, all 978 pages
node tools/24-genitive-check.mjs    # Tibetan genitive agreement (grammar check)
node tools/15-apply-repair.mjs      # illegal consonant stacks
node tools/19-lexicon-check.mjs     # repair table vs 367k-entry lexicon
node tools/26-final-sweep.mjs       # dropped-subjoined-letter sweep, per font
```

Expected results are tabulated in PROGRESS.md. If any check regresses, stop and find out why
before doing anything else.

Rebuild the text after changing a repair table:

```bash
node tools/16-build-text.mjs        # source/raw + repair tables -> source/clean
```

Inspect one page against its actual rendered image (the highest-value debugging tool):

```bash
node tools/20-compare-page.mjs 300 3    # numbered lines + qa/compare/p0300.png
node tools/09-render-page.mjs 300 6 2600 2730   # high-zoom crop: page, scale, yFrom, yTo
```

Chunk tracking during translation (Phase 4):

```bash
node tools/32-chunk.mjs next
node tools/32-chunk.mjs done c003 "unsure: term X"
node tools/32-chunk.mjs list
```

The source PDF is **not in the repo** (copyrighted edition). `tools/11-extract-glyphs.mjs`
and the render tools need it at the project root; everything else works without it.

---

## Architecture

### The extraction pipeline is the load-bearing part

The PDF is born-digital, but its embedded fonts' ToUnicode tables are **defective**: ligature
glyphs map to only their head letter, silently discarding subjoined consonants. `གྱི` occurred
zero times in 1.2M characters because it was being flattened to `གི`.

Consequences that shape the whole codebase:

```
PDF ──tools/11──> source/raw/glyphs/*.json ──tools/16 + decode.mjs──> source/clean/
     (own PDF                (immutable                (repair tables applied
      interpreter)            audit trail)              per font)
```

- **`tools/pdfcontent.mjs`** is a purpose-built PDF content-stream tokenizer and text-state
  interpreter. It exists because `pdfjs.getTextContent()` inserts synthetic spaces and returns
  already-decoded (i.e. already-corrupted) strings, so it can neither give raw glyph IDs nor be
  aligned against them. Verified character-identical to pdfjs on 16 sampled pages.
- **`source/raw/glyphs/`** stores one record per glyph with its code, font, position and the raw
  ToUnicode. **Never edit it.** Every downstream artifact is a reproducible transform from it.
  It is gitignored (116 MB) and regenerated by `tools/11`.
- **Repair happens at glyph-ID (CID) level, never by regex over decoded text.** A character-level
  fix cannot work here: the same wrong output comes from several different glyphs.

### One decoder, shared by everything

**`tools/decode.mjs` is the single source of truth for glyph → Unicode.** It owns the repair
tables, the per-font routing, and the `keep()` filter for what counts as body text.

**Any tool that produces or displays text must import it.** This is not stylistic:
`tools/20-compare-page.mjs` once had its own copy of the decode logic, drifted from the real
one, and displayed stale text that made an already-fixed bug look unfixed.

The exception is deliberate: analysis tools that *evaluate candidate mappings* (`15`, `17`,
`19`, `23`, `27`) import the repair tables directly, because they must substitute alternative
values that a fixed decoder cannot express. If your tool only ever emits the current best
decoding, use `decode.mjs`; if it compares "what if this CID were X instead", import the table.

Repair tables, each entry carrying the evidence that settled it:

| File | Covers |
|---|---|
| `tools/repair-table.mjs` | `MonlamUniOuChan2` — body text, 95% of the book |
| `tools/secondary-repair-table.mjs` | Qomolangma fonts — **sa-bcad section headings** and front matter |

The heading font matters out of proportion to its size: it carries the outline structure that
Phase 2 segmentation and all chunking depend on.

`MonlamUniOuChan4` (titles) shares the body font's CID space and is decoded through the body
CMap plus the body table — its own CMap is wrong in places where the body one is right.

### Progress is generated, not maintained

`progress.json` holds editable state (phase, decisions, chunk list). `tools/30-progress.mjs`
reads it **plus the actual files on disk** and writes PROGRESS.md. Numbers are measured, so the
doc cannot drift. Edit `progress.json`, then regenerate — never hand-edit PROGRESS.md.

### Tool numbering

`tools/NN-*.mjs` are numbered in the order they were built, roughly the order of the pipeline.
Low numbers (01–08) are one-off diagnostics kept for the audit trail; they are not part of the
running pipeline. Non-numbered files (`decode.mjs`, `pdfcontent.mjs`, `pdffonts.mjs`,
`tibetan.mjs`, `config.mjs`, `*-repair-table.mjs`) are shared modules.

`tools/18-crosscheck.mjs` was **built and then discarded** — it compared which words two CIDs
occur in, which fails because positional font variants are used in *complementary* distribution
by design. It scored two genuinely different glyphs identically to known-identical pairs. It is
kept as a record; do not resurrect the approach (FINDINGS.md §7).

---

## Gotchas that cost real time

- **Never sort glyphs by x-position to reconstruct lines.** Combining marks do not sit where
  logical order implies; sorting by x swapped a vowel and a shad (`འགྲོའོ།` → `འགྲོའ།ོ`).
  Content-stream order *is* reading order — verified on 978/978 pages.
- **`globalThis.Path2D` must be polyfilled from `@napi-rs/canvas` *before* importing pdfjs**, or
  `ctx.fill(path)` throws. See the top of `tools/09-render-page.mjs`.
- **Page rendering segfaults at scale ≥ 5**, and on front-matter pages below ~24. Render at
  scale 4 and upscale the crop when compositing.
- **Folio fonts are dropped by y-band, not by font name.** On the contents pages (8–20) that same
  font carries the page-number column, which is real content.
- **Bash heredocs mangle `${...}` inside JS template literals** — the shell expands them. Use the
  Write tool for any file containing template literals or Tibetan text.
- **`ྲ` and `ྱ` are indistinguishable at low zoom.** Reading a glyph in isolation is unreliable;
  read it inside a real word at scale 6 (`tools/14-cid-context.mjs`, `tools/09-render-page.mjs`).

---

## Reference

- [FINDINGS.md](FINDINGS.md) — full extraction diagnosis and the evidence for every repair
  decision, including the ones that were initially wrong and how they were caught.
- [PLAN.md](PLAN.md) — the phase plan. §2 contains a rule marked **SUPERSEDED**; it is kept
  deliberately, as a record of an approach that would have silently corrupted the text.
