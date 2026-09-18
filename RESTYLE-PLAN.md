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

## Step 0 — decisions only the project owner can make · **ANSWERED 2026-09-18**

**(a) Terminology — ADOPT the reference's.** *(I had recommended keeping ours; overruled, and
implemented in full.)* Applied in Step 2:

- `tánh` → `tính` and `chánh` → `chính`, **2,824 instances.** Scope note: the reference writes
  `tính không`, but changing only `tánh không` while leaving `tự tánh` (×793) and `thể tánh`
  (×347) would spell the same morpheme two ways in adjacent sentences. So the decision was
  carried through the whole morpheme, which is the only coherent reading of it.
- `Đại thừa` → `Đại Thừa`, 144.
- `bồ-đề tâm` → `bồ đề tâm` — subsumed by (b).

  This turned out to rest on firmer ground than the reference book. `glossary.json` already
  records `houseStyle.register = "northern"` with the rules *"sinh, never sanh"* and *"phuc,
  never phuoc"*. `tánh`/`chánh` are the southern halves of exactly that pair and were simply
  never included — 1,736 `tánh` against 84 `tính`, in a book that already writes `chúng sinh`
  and `phúc đức`. The change **closes an inconsistency the project had already decided
  against.** Recorded in `glossary/decisions.md` §6.

- **`yểm ly` / `viễn ly` / `xả ly` → `tâm buông bỏ`: NOT DONE, and should not be.** This is not
  a spelling change. Those three render **three different Tibetan terms** — `སྐྱོ་ཤས` (weariness),
  `རབ་ཏུ་དབེན་པ` (thorough seclusion), `སྤོང་བ་པ` (one who abandons) — and the reference's single
  phrase would collapse all three. Merging distinct source terms is a *fidelity* change, not a
  style one, and `glossary/decisions.md` §5 exists because this project has already been bitten
  by four Tibetan terms converging on one Vietnamese word. Raised rather than applied; if it is
  still wanted, it needs a per-term decision, not a sweep.

**(b) Hyphenation — DROP the hyphens.** Applied in Step 2: **69 forms, 2,692 occurrences.**

  One cost worth naming, now that the full inventory is visible rather than the four commonest
  forms: on long transliterations the hyphen was doing disambiguating work, and six forms read
  worse without it — `bổ-đặc-già-la` (×95, now four bare syllables), `xá-lợi-phất` (×9, where
  *xá lợi* alone means *relics*), `a-tỳ-đạt-ma`, `ma-hầu-la-già`, `ương-quật-ma-la`,
  `thức-xoa-ma-na`. They are dehyphenated as decided; pulling any of them back is a one-line
  edit to `HYPHENATED` in `tools/54-sweep.mjs` plus a re-run.

**(c) Bracket policy — LEAVE ALL 6,463 ALONE.** *(Decided after the pilot, as planned.)*

The pilot settled it, and against thinning. Three chunks improved sharply with every bracket in
place — median sentence 77→41, 55→33, 71→38, semicolons cut by three quarters. **The readability
gain came from sentence length and punctuation, not from the brackets**, so thinning them would
spend fidelity risk on what little is left. They are the audit trail for exactly the words that do
not trace to specific Tibetan, which is the project's central rule. Recorded as
`glossary/decisions.md` §9. The workflow forbids agents from removing even one, and the verifier
reports any loss as `apparatusLoss` — across the pilot's three chunks that list was empty.

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

## Step 2 — the mechanical sweep · **DONE** (`16945da`)

`tools/54-sweep.mjs`. Zero fidelity risk, so no agents and no verification — a diff review
instead. What it applied:

| | |
|---:|---|
| 3,778 | straight quotes → `“ ”` |
| 3,489 | verse lines given a hard line break |
| 2,692 | hyphens removed from 69 transliterated compounds — Step 0(b) |
| 2,824 | `tánh` → `tính`, `chánh` → `chính` — Step 0(a) |
| 144 | `Đại thừa` → `Đại Thừa` — Step 0(a) |
| 863 | glossary fields + `decisions.md`, swept to match |
| 75 | page-anchor locators, swept to match |

**Quote direction is decided by context, not by pairing.** Pairing failed twice: per line, a
quotation set as verse opens on the first pada and closes on the last (c017's runs four lines),
giving 64 false "unpaired" reports; per block, quotations that open in one paragraph and close
in the next still came out odd. The context rule holds no state, so one unbalanced quote cannot
invert its neighbours. Validated separately: **0 typographically impossible calls** corpus-wide.
18 files do not balance — they were already unbalanced as straight quotes.

**Acceptance — met.** Normalising away the five intended axes on both sides leaves **292/292
files byte-identical to HEAD**. No unintended edit anywhere.

### Three things the sweep broke, all caught by the harness rather than by eye

1. **75 of 673 page-marker locators stopped matching** — a locator is a literal substring of the
   body, and the body had been respelled. Exactly the 75 containing a sweep target. Applying the
   *identical* transform to the locator is not a judgement call, so **all 673 recovered
   mechanically and zero boundaries needed re-aligning by reading.** The sweep now does this.
2. **`hangingParagraphs` jumped 9 → 66.** Not a regression in the text: `40-verify-text.mjs`
   accepted a straight `"` as terminal punctuation but not a curly `”`, so 57 correctly
   terminated paragraphs read as cut off mid-clause. Fixed in the checker.
3. **The verse ledger lost 6 units and 22 lines.** Three tools measured *raw* line length
   against the 76-character hand-break threshold, and two trailing spaces pushed some lines over
   it — those stanzas stopped registering as verse at all and would have dropped silently out of
   the verse pass. `41-pdf`, `42-verse` and `52-style-lint` now measure the trimmed line. Ledger
   back to 842 units / 4,357 lines.

The general lesson for Step 4, where the edits are much larger: **a corpus-wide change breaks
tools that measure the corpus, not just the corpus.** Run `53-invariants.mjs` and
`42-verse.mjs list` after every batch, and treat a moved count as a question, not noise.

---

## Step 3 — pilot · **DONE**. Read this before authorising Step 4.

Three worst-ranked chunks (c225, c245, c226), through the full Step 4 machinery. 9 agents,
826k subagent tokens, 25 minutes.

**All three were rejected by the independent check on the first pass. All three passed after
repair.** That is the single most important result: the verifier is not decoration.

| chunk | >80 words | >120 | median | 90th pct | longest | `ấy`/1k | `;`/1k |
|---|---|---|---|---|---|---|---|
| c225 | 9 → **2** | 3 → 1 | 77 → **41** | 124 → 80 | 166 → 132 | 9.0 → 6.4 | 10.9 → **4.5** |
| c245 | 7 → **3** | 3 → 1 | 55 → **33** | 122 → 76 | 140 → 122 | 18.9 → 13.6 | 8.3 → **1.8** |
| c226 | 9 → **4** | 2 → 0 | 71 → **38** | 116 → 81 | 157 → 94 | 17.6 → 8.8 | 8.2 → **1.9** |

41 splits and 39 demonstrative edits were made. **Zero apparatus loss, zero glossary changes,
zero verse touched** — every prohibition held, across three agents, without exception.

### The targets in this plan were too strict. Revised, on evidence.

The plan asked for median ≤ 30 and no sentence over 80. The pilot got median 33–41 and 2–4
sentences over 80 per chunk, **because the verifier refused the splits that would have got
there** — see STYLE.md §3.1 for the three mechanisms. Those refusals were correct. The realistic
target, which is what Step 4 should be measured against:

- median **≤ 45** (from 55–77)
- sentences over 80 **cut by about two thirds**
- sentences over 120 **nearly eliminated**
- semicolons **cut by about three quarters** — the clearest win, and the least risky
- `ấy` **down by a third**, not to the reference's rate; much of the rest is load-bearing

**Do not push past this by loosening the check.** A long faithful sentence is the deliverable.

### What the pilot cost, and what Step 4 therefore costs

275k subagent tokens per chunk. **289 chunks remain → roughly 80M subagent tokens**, about 29
batches of 10, on the order of 15–20 hours of wall clock. This is a real commitment and should
be authorised explicitly, not drifted into.

### Three measurement bugs it exposed, all of which had been overstating or distorting the problem

Every "sentences over 80 words" figure quoted before the pilot was wrong. The trustworthy
pre-restyle baseline is **572 over 80, 111 over 120, longest 237, median 26**.

1. **The front-matter quote count.** `52` scored the 1,160 YAML `section:` quotes as
   straight-quote defects; the body held 2.
2. **`v.v.` at a sentence end.** Protecting every `v.v.` from the splitter also protected the
   real full stop in `khuôn mặt v.v. Vì thế`, fusing two sentences into one 86-word unit. **Found
   by a restyle agent**, which flagged the unit as a measurement artifact instead of splitting a
   sentence that was not there. Worth 12 false long sentences corpus-wide.
3. **The period inside the closing quote — self-inflicted.** Step 2's own sweep moved 176 periods
   inside the quotation, after which the period is followed by `”` and not by whitespace, so the
   splitter stopped seeing those 176 boundaries. It made restyling three chunks look as though it
   had pushed the corpus's longest sentence from 237 words to 290. The splitter now accepts an
   optional closing quote.

The lesson is the same one Step 2 taught, and it is worth stating as a rule: **when a sweep
changes the corpus, re-derive the baseline with the corrected tool before comparing anything.**

### One process failure, mine

I hand-typed the workflow args instead of passing `.wf.json`, and fed three agents a **stale
`section` and `sectionPath`** from an earlier run, plus a wrong word count. No damage — the
agents read the actual files and pages, and one of them caught and reported the discrepancy
rather than editing the front matter to match. But it is the second time retyping those numbers
has cost something. Pass the file.

---

## Step 3 — the original plan for the pilot (kept for the record)

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

**Pass `.wf.json` to the workflow programmatically — never retype its numbers.** On the pilot I
hand-copied the lint block into the workflow args and used a stale pre-sweep word count (1858
where the file said 1562). The worklist-critical fields happened to be right, so the agents were
guided correctly, but I then read the agent's output as a 16% loss of content when it was a 6-word
change. Wrong numbers in the args are wrong numbers in the report.

```bash
git status --porcelain            # MUST be clean: Verify reads `git show HEAD:translation/<id>.md`
node tools/52-style-lint.mjs batch 10 > .wf.json       # worst-first, pending only
node tools/37-chunk-glossary.mjs --batch .wf.json      # the agents still need the rulings
# run the `lamrim-restyle` workflow with that object as args; note the Run ID

# --- fold it back in ---------------------------------------------------------
node tools/32-chunk.mjs restamp                        # re-formatting is not re-translating
node tools/52-style-lint.mjs done <ids that PASSED>    # only the ones that passed
node tools/43-pages.mjs init                           # demotes the locators the edits broke
node tools/43-pages.mjs batch 20 > .wf.json            # re-place exactly those, by reading
# run the page-alignment workflow; then
node tools/43-pages.mjs place results.json
node tools/39-assemble.mjs --write
node tools/53-invariants.mjs                           # must pass before the next batch
node tools/42-verse.mjs list                           # unit count must not have moved
git commit                                             # before the NEXT batch, not after it
```

**Do not use `35-merge-batch.mjs` here.** It is built for Phase 4: it stamps `translatedAt` and
writes a `verify` record, so running it would overwrite each chunk's original Phase 4 fidelity
verdict with a restyle verdict — destroying the record that the *translation* was ever checked.
A restyle is not a translation. `restamp` + `52-style-lint.mjs done` is the correct pair:
`restamp` re-records `outputHash` without touching status (CLAUDE.md: "re-formatting is not
re-translating, and it must never promote a draft"), and the restyle ledger is separate by
design.

`newTerms` and `flags` come back in the workflow's return value and have to be folded into
`glossary.json` and the chunk records by hand, or through a small merge tool if the volume
justifies one. Do not let agents write them — that is the rule that exists because agents twice
marked their own unverified work as finished.

**Unlike Phase 4, commit before each batch rather than after.** Verify obtains the pre-restyle
text with `git show HEAD:translation/<id>.md`; if the tree is dirty when a batch starts, it
compares against a half-restyled file and the check is worth nothing.

### The workflow: `.claude/workflows/lamrim-restyle.js` · **WRITTEN** (`62ff530`)

Modelled on `lamrim-translate.js`, three phases, same contract — **agents write only
`translation/<id>.md`; only the merge may mark a chunk done.**

Two things in it are worth knowing before reading the table. **The restyler must quote the
Tibetan clause boundary for every split it makes** — a split it cannot point to in the source is
refused, which turns "split only where the Tibetan does" from an instruction into something the
verifier can audit. And **the repairer is told that reverting is a correct outcome**, not a
failure: the pre-restyle sentence had passed a fidelity check and a restyled one a checker doubts
has not, so a long faithful sentence is the deliverable.

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
