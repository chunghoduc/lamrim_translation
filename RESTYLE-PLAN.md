# Restyle plan — bringing the Vietnamese prose to the reference book's standard

Read [STYLE.md](STYLE.md) first: it says what was measured, which traits are adoptable and
which are genre, and where the line is. This file is only the *how*.

The work is 292 chunks / 269k words. It is a second full pass over the whole book, and it is
the most dangerous pass the project will make (STYLE.md §5). The plan below is built so that
it is resumable, countable, and impossible to finish without every changed sentence having
been re-checked against the Tibetan.

---

## The invariants

Every step must leave all of these true. Check them after every batch, not at the end.

| | command | expected |
|---|---|---|
| chunk records match files | `node tools/32-chunk.mjs doctor` | consistent, 292 translated |
| nothing drifted from the Tibetan | `node tools/32-chunk.mjs stale` | 0 |
| every page marker still lands | `node tools/43-pages.mjs check` | 965 placed, all match |
| assembly is faithful | `node tools/39-assemble.mjs` | content check OK, 965 markers |
| corpus checks | `node tools/40-verify-text.mjs` | no **new** findings |

`sourceHash` is unaffected throughout — the Tibetan does not move. Only `outputHash` changes,
which is exactly what `doctor` is for.

---

## Two things that will break, and what to do about them

**1. Page-marker locators.** `page-anchors.json` holds 673 locators, each a ~10-word
Vietnamese phrase that must occur **exactly once** in its chunk. Rewriting the prose will
invalidate a large share of them, and `43-pages.mjs check` catches every one — it cannot
silently mis-place a marker.

> **`43-pages.mjs init` is the re-anchoring step.** No new subcommand was needed: `init`
> already re-validates every carried-over locator and drops the ones that no longer match back
> to `pending`, leaving the rest untouched — so broken anchors flow through the existing
> `batch` → agent → `place` machinery unchanged. It is now verified byte-idempotent on an
> unchanged tree (it used to reorder two keys and produce a 1,338-line diff on every run,
> which would have buried the real changes during this pass).

**2. The verse ledger.** `verse-check.json` hashes each verse unit's own lines; editing a
verse makes the unit STALE and it must be re-checked. Today **all 842 units are unchecked**,
so staleness costs nothing.

> **Therefore the restyle goes before the verse fidelity pass, not after.** Doing the verse
> pass first would mean verifying 842 units and then invalidating an unknown fraction of them.

---

## Step 0 — decisions only the project owner can make

Three questions. Each changes the size of the job, and none should be answered by drift.
Nothing else in this plan is blocked on them except where noted.

**(a) Terminology — adopt the reference's, or keep ours?** The reference writes `tính không`,
`bồ đề tâm`, `Đại Thừa`, `tâm buông bỏ`; we write `tánh không` (×207), `bồ-đề tâm` (×113),
`Đại thừa` (×126), `yểm ly` / `viễn ly`. **Recommendation: keep ours.** They are recorded
decisions with reasons, and CLAUDE.md permits the Vietnamese editions to *check* a term, never
to supply one. If any are to change, each becomes its own entry in `glossary/decisions.md`
with its own corpus sweep — a separate job from this one.

**(b) Hyphenation.** `bồ-tát` ×279, `niết-bàn` ×69, `ba-la-mật` ×173. The reference uses none.
This is orthographic house style, genuinely the owner's call, and it is a clean mechanical
sweep either way. *Blocks nothing; if it is to change, do it in Step 2 where it is free.*

**(c) Bracket policy.** 6,463 `[...]` inserts, 19.16 per 1,000 words. Proposed policy, to be
confirmed or replaced:

> Mark with brackets only what a reader could otherwise take for something the Tibetan says:
> a supplied **noun** that resolves an ambiguous referent, an **interpolated clause**, a
> **gloss**. Do not mark a pronoun or subject that Vietnamese grammar obliges and the Tibetan
> leaves unambiguous (`[nó]` ×322, `[chúng]` ×196, `[họ]` ×119, `[ta]` ×90).

That would remove roughly a third of them. **Until this is answered, brackets are left
untouched** — the default is the safe one.

---

## Step 1 — tooling · **DONE**

1. `tools/51-style-metrics.mjs` — the cross-book measurement harness (STYLE.md §2).
2. `tools/52-style-lint.mjs` — the per-chunk worklist **and the restyle ledger**
   (`restyle-check.json`), on the same pattern as the verse and page ledgers: each restyled
   chunk stores the `outputHash` it was restyled at, so a later edit re-opens it and "how much
   is left" stays answerable after a machine change.
   `report [--all] | show <id> | batch <n> | done <id…> | doctor`
3. `43-pages.mjs init` — the re-anchoring step, now byte-idempotent (see above). No new
   subcommand.
4. `tools/53-invariants.mjs` — the whole invariants table in one command, against a frozen
   `invariants-baseline.json`, so "no new findings" is a comparison and not an impression.

### What the linter measures, and the two numbers that differ from STYLE.md §2

`52-style-lint.mjs` reports **610 sentences over 80 words (128 over 120), 4,362 × `ấy`, 4,940
straight quotes, 3,489 verse lines missing a hard break.** Two of those disagree with STYLE.md
§2 on purpose:

- **`51` excludes blockquotes, `52` includes quoted prose.** For comparing two books, dropping
  blockquotes is the fair cut — every blockquote in the reference is verse. For deciding what a
  restyle must fix, quoted *prose* is prose and in scope. Hence `ấy` 3,718 there and 4,362 here.
- **`52` never joins paragraphs.** This corpus does not hard-wrap, so one line is one
  paragraph. Joining them made `Bởi vì trong *X* có nói:` merge with the passage it introduces
  and reported a 296-word sentence where the real longest is 193.

The linter deliberately does **not** score `[...]` brackets or terminology. Those are STYLE.md
§4.2–4.3, out of scope, and a linter that counted them would push agents toward the forbidden
edits.

Acceptance — met: `node tools/52-style-lint.mjs report` ranks all 292 chunks, and
`node tools/53-invariants.mjs` passes all 15 checks on the untouched text.

---

## Step 2 — the free sweep: typography only (one commit, corpus-wide)

Zero fidelity risk, so it does not need agents or verification — only a diff review.

- `"` → `“ ”` across all 292 chunk files (3,778 occurrences), matching pairs only; report
  any unbalanced quote instead of guessing.
- Two trailing spaces on blockquote verse lines so stanzas survive a generic Markdown viewer.
- Item (b) from Step 0, if the owner chose to change hyphenation.

Then: `43-pages.mjs check` (a curly quote inside a locator will break it — expect a handful),
`43-pages.mjs init`, re-place those, `39-assemble.mjs --write`, invariants.

Acceptance: the diff contains **only** quote characters, trailing whitespace and (if chosen)
hyphens. Any other change in that diff is a bug in the sweep.

---

## Step 3 — pilot on three chunks, then stop and look

Pick the three worst chunks from `52-style-lint.mjs` — the ones carrying the 100+ word
sentences. Restyle them through the Step 4 machinery, then **measure before continuing**:

```bash
node tools/51-style-metrics.mjs translation/cNNN.md          # before/after, per chunk
```

Read all three side by side against the Tibetan yourself. The questions to answer before
committing to 292 chunks:

- Did the median sentence drop toward 30 words without any sentence gaining a claim?
- How many locators broke per chunk? (This sets the real cost of Step 4.)
- Did the verifier catch anything the restyle introduced? **If it caught nothing across three
  heavily rewritten chunks, distrust the verifier, not the restyle** — tighten its prompt
  before proceeding.

This step exists to be allowed to fail. If the restyle cannot clear verification cleanly, the
right answer is to narrow the scope — §3.2 (`ấy`) and §3.4 (typography) alone still recover
most of the readability — not to relax the check.

---

## Step 4 — the batch loop, one pass per chunk

The loop mirrors Phase 4 exactly, and for the same reasons. **Each chunk is touched once and
all style changes are made together**, because every touch costs a re-anchor.

```bash
node tools/52-style-lint.mjs batch 10 > .wf.json      # worst-first, pending only
node tools/37-chunk-glossary.mjs --batch .wf.json      # the agents still need the rulings
# run the `lamrim-restyle` workflow with that object as args; note the Run ID
node tools/35-merge-batch.mjs --run wf_XXXX --write
node tools/43-pages.mjs init                           # demotes the locators the edits broke
node tools/43-pages.mjs batch 20 > .wf.json            # re-place exactly those
# run the page-alignment workflow; then
node tools/43-pages.mjs place results.json
node tools/39-assemble.mjs --write
node tools/52-style-lint.mjs done <the merged ids>
node tools/53-invariants.mjs                           # must pass before the next batch
```

### The workflow: `.claude/workflows/lamrim-restyle.js`

Modelled on `lamrim-translate.js`, three phases, same contract — **agents write only
`translation/<id>.md`; only the merge may mark a chunk done.**

| phase | agent | given | must return |
|---|---|---|---|
| Restyle | one per chunk | the chunk's Tibetan pages, its current Vietnamese, its glossary view, STYLE.md §3 | the rewritten file + a list of every sentence it split, with the Tibetan clause boundary it split at |
| Verify | one per chunk, **different agent** | the Tibetan, the **before** and **after** Vietnamese | per changed sentence: does it assert exactly what it asserted before, and does that trace to the Tibetan? Any addition, omission or glossary change is a flag |
| Repair | only for flagged chunks | the flags | fix or revert; a sentence that cannot be both faithful and fluent **reverts to the faithful version** |

Prompt rules the workflow must state explicitly — each one exists because of a failure this
project has already had:

- **Never run `32-chunk.mjs done`.** Agents did this twice in Phase 4 and marked their own
  unverified work as finished.
- **A glossary term is never changed.** If a restyle wants a different word for a term, it
  reports it in `newTerms` and leaves the text alone.
- **Never delete a `[...]` bracket or a `tồn nghi:` flag** unless Step 0(c) authorised it.
  There are 2,276 `unsure:` flags and 7 inline notes in the corpus; they are findings, not
  untidiness.
- **Do not touch a verse block.** Verse has its own pass with its own prosody constraints
  (`tools/42-verse.mjs`, 842 units). Restyle prose only.
- **Preserve every existing sentence's content exactly.** Permitted operations are: split at a
  Tibetan clause boundary, re-point a demonstrative, re-punctuate, drop a redundant `ấy`.
  Nothing else.

Batch size: 10 chunks ≈ 20–30 agents, as in Phase 4. Smaller here is better than in Phase 4,
because the re-anchoring after each batch is serial work that does not parallelise.

### The verifier is the whole point

Phase 4's first batch came back 0/10 clean — 13 fabrications and 27 glossary violations. That
was the check working. Expect the restyle verifier to hold work back too, and treat a run of
clean verdicts as a reason to inspect the verifier rather than to celebrate.

---

## Step 5 — close out

1. `node tools/51-style-metrics.mjs sample/bo-de-tam.md lamrim-vi.md` — the same table as
   STYLE.md §2, now as the record of what changed. Target: median sentence ≤ 30, 90th
   percentile ≤ 60, `ấy` under 4 per 1,000, zero straight quotes.
2. Full invariants table, plus `node tools/40-verify-text.mjs` showing no new findings.
3. `node tools/42-verse.mjs extract` to rebuild the verse ledger against the restyled files,
   then begin the verse fidelity pass — 842 units, still at 0%.
4. Rebuild the deliverables: `node tools/41-pdf.mjs`.
5. Record the outcome in `glossary/decisions.md` (the bracket policy, and any orthographic
   change from Step 0(b)) so the next session inherits the rules rather than the diff.

---

## What this plan deliberately does not do

- It does not make the *Lamrim Chenmo* sound like a Dharma talk. STYLE.md §4.1.
- It does not adopt the reference's terminology. STYLE.md §4.2, Step 0(a).
- It does not strip the fidelity apparatus on aesthetic grounds. Step 0(c).
- It does not touch verse. That is `42-verse.mjs`'s pass, and it comes after.
- It does not begin before Step 0(a) and 0(c) are answered — those two decide whether roughly
  2,000 brackets and 600 term instances are in scope, and re-deciding mid-book is the exact
  failure `glossary/decisions.md` exists to prevent.
