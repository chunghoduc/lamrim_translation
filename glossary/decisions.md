# Terminology decisions

One entry per term whose Vietnamese rendering was contested. **Decide once, record why,
never relitigate mid-book** (PLAN.md §4, Phase 3). The characteristic failure of a long
translation is the same Tibetan term coming out differently in chapter 3 and chapter 19.

Status values are defined in `glossary.json`. Anything still `open` must be settled
**before** the chunks that use it are translated — `ཞི་གནས` and `ལྷག་མཐོང` alone appear
595 times and name two of the book's largest divisions.

---

## Still open — need a decision

_(none)_

---

## Settled

### 1. `ཞི་གནས` / `ལྷག་མཐོང` — a closed set, chosen per passage · **2026-08-24**

| | permitted forms | headword |
|---|---|---|
| `ཞི་གནས` (śamatha, ×351) | `chỉ` · `tịnh chỉ` · `thiền chỉ` | **tịnh chỉ** |
| `ལྷག་མཐོང` (vipaśyanā, ×244) | `quán` · `thắng quán` · `thiền quán` | **thắng quán** |

**Decision:** vary within these sets so the Vietnamese reads smoothly, rather than forcing
one form everywhere.

**Why this is not drift.** It is a deliberate exception to "one term, one rendering", so the
set is *closed*: any form outside the three listed is an error, not a stylistic choice. In
`glossary.json` the entries carry `status: "fixed-set"` with a `viVariants` list, and Phase 5's
consistency sweep must treat the listed variants as equivalent — otherwise it will report
hundreds of false positives and be switched off, which is the real risk.

**Working rules:**
- `tịnh chỉ` / `thắng quán` in section headings, and wherever the text defines or argues
  about the terms — which is most of the last two divisions.
- `chỉ` / `quán` inside the fixed compound `chỉ quán` (`ཟུང་འབྲེལ` — union).
- `thiền chỉ` / `thiền quán` where the sense is the practice being done.
- The pair must match register within a sentence: never `tịnh chỉ` beside bare `quán`.
- Keep one choice stable within a single section.

### 2. Orthographic register — northern · **2026-08-24**

`chúng sinh`, not `chúng sanh`. `phúc đức`, not `phước đức`. This fixes `sinh` everywhere
(`སྐྱེ་བ` → `sinh`, `sinh tử`, `tái sinh`) and applies to the whole book. Recorded in
`glossary.json` under `houseStyle`. A house-style call, not a scholarly one.

### 3. `སྐྱེས་བུ་ཆུང་ངུ / འབྲིང / ཆེན་པོ` — the three capacities · **2026-08-24**

`bậc hạ` / `bậc trung` / `bậc thượng` — without `sĩ`. These name the book's three main
divisions, so they appear in headings constantly.

### 5. The reverence family — `རིམ་གྲོ` / `གུས་པ` / `བཀུར་སྟི` / `བཀུར་བ` · **2026-08-24** · *provisional*

Surfaced by the batch-2 agents, not by a reader: four distinct Tibetan terms were all
converging on *cung kính* / *tôn kính*, and two conflicting glossary entries had already been
recorded for `རིམ་གྲོ` alone. On p0053–p0055 three of the four appear within thirty lines of
each other, so the section headword had become indistinguishable from a different term inside
its own body text.

| Tibetan | Vietnamese | |
|---|---|---|
| `རིམ་གྲོ` | **tôn kính** | the section headword (`ཆོས་དང་ཆོས་སྨྲ་བ་ལ་རིམ་གྲོ་བསྐྱེད་པ`) |
| `གུས་པ` | **cung kính** | |
| `བཀུར་སྟི` | **tôn trọng** | except in the fixed compound `རྙེད་བཀུར` → *lợi dưỡng và cung kính* |
| `བཀུར་བ` | **tôn trọng** | |

Each gets its own primary word so the four stay separable, with one recorded exception for an
established Sino-Vietnamese compound. **Marked `provisional`: this is a native-speaker call
and should be confirmed or overridden by the project owner.** Chunks already translated under
the older split (c004/c008/c010/c013 used *tôn kính*; c012/c015/c022/c026 used *cung kính*)
need a corpus sweep once the choice is confirmed — see the sweep note below.

### 4. `དལ་འབྱོར` · **2026-08-24**

`tám tự do và mười thuận duyên` — the full descriptive phrase, not the compact `nhàn mãn`.
The text enumerates all eighteen at length, so the phrase earns its length and no
translator's note is needed.

---

## Rules that apply across the glossary

- **`ཤེས་རབ`**: `trí tuệ` in general use; `bát-nhã` only inside `ཤེས་རབ་ཀྱི་ཕར་ཕྱིན` and in
  the titles of cited texts. Recorded so the split is deliberate rather than accidental.
- **`མཚན་ཉིད`** genuinely means two things — a defining characteristic, and a definition.
  Where the reading is not obvious, flag the chunk rather than choosing silently:
  `node tools/32-chunk.mjs done <id> "unsure: མཚན་ཉིད at p<N> - characteristic or definition"`.
- **Cited text titles** get one fixed Vietnamese title each, decided at first occurrence and
  added to the glossary immediately. The text cites sūtras and śāstras constantly.
- **Reference, do not copy.** The existing Vietnamese *Bồ Đề Đạo Thứ Đệ Quảng Luận* and the
  Snow Lion English translation may be consulted to *check* a choice. The translation itself
  is made from the Tibetan.

## §6 — Sa-bcad enumerations must be complete Vietnamese sentences

*Decided 2026-08-28, by the user, from the reading of c180 p0592.*

The Tibetan sa-bcad writes `X ལ་གསུམ།` — literally "X has three" — with no classifier,
because Tibetan does not need one. Rendered word-for-word this gives *"Cách tu học có ba"*,
which in Vietnamese is **cụt**. It must be complete:

> Cách thức tu học riêng từng phần **gồm có ba cách**: …

The classifier is chosen from **what is actually being enumerated**, not by preference: if
the items are themselves `cách …`, it is `cách`; otherwise `phần`. Over the corpus that is
14 `cách` against 149 `phần`. `tools/38-sabcad-style.mjs` applies this and is idempotent.

Within such a sentence the **items** are lightened from `cách thức …` to `cách …`, while the
sentence's subject and the section heading keep `cách thức`. Tibetan repeats `ཚུལ` once per
item without strain because it is a light nominaliser; `cách thức` is a heavy two-syllable
noun and three of them in one sentence is what made the passage read badly.

Not changed, deliberately: headings of the form *"Cách thức tu học tịnh chỉ, tức thể tính
của tĩnh lự"*. The trailing appositive attaches to the nearest noun phrase, which is the
right one (`tịnh chỉ`), so these are correct as they stand.

## §7 — `ཟུང་དུ་འབྲེལ་བ` is *song vận*, never *song vận hợp nhất*

*Decided 2026-08-28, by the user.*

`ཟུང་དུ་འབྲེལ་བ` (yuganaddha) is two things **yoked as a pair**, each still itself. 雙運
*song vận* already carries the whole word. *hợp nhất* is not merely redundant — it means
merging into one, and asserts something the Tibetan does not say. Where śamatha and
vipaśyanā are in union that distinction carries doctrine: they are conjoined, not fused.

Four occurrences were corrected. The glossary entry is updated accordingly.

## §8 — Orthographic register, continued: `tính` / `chính` · **2026-09-18**

*Decided by the project owner, adopting the reference edition's spelling.*

`tính`, not `tánh`. `chính`, not `chánh`. Applied corpus-wide by `tools/54-sweep.mjs`:
**2,824 instances** across `translation/`, `glossary.json` and this file.

**This finishes §2 rather than opening a new question.** §2 fixed the register as northern —
`chúng sinh` not `chúng sanh`, `phúc đức` not `phước đức` — and `glossary.json` records both
rules under `houseStyle`. `tánh` and `chánh` are the southern halves of the same pair and were
simply never listed, which left the book writing `chúng sinh` and `phúc đức` beside `tự tánh`
(×793), `thể tánh` (×347) and `chánh lý`: **1,736 `tánh` against 84 `tính`.** The inconsistency
was ours, not the source's.

**Why it runs through the whole morpheme.** The decision was to adopt the reference's
`tính không`. Changing only `tánh không` (×207) would have spelled one morpheme two ways in
adjacent sentences — *tính không của tự tánh* — which is worse than either spelling used
consistently. There is no Vietnamese word in which these letters mean anything else, which is
why a substring substitution is safe here and would not be for a lexical change.

### What was NOT changed, and must not be changed by a sweep

`yểm ly` / `viễn ly` / `xả ly`. The reference edition renders renunciation as `tâm buông bỏ`,
and adopting that would have collapsed **three different Tibetan terms** into one phrase:

| Tibetan | Vietnamese | sense |
|---|---|---|
| `སྐྱོ་ཤས` | **lòng yểm ly** | weariness with, disenchantment |
| `རབ་ཏུ་དབེན་པ` | **viễn ly** | thorough seclusion, isolation |
| `སྤོང་བ་པ` | **bậc xả ly** | one who abandons |

This is §5's failure again — several distinct Tibetan terms converging on one Vietnamese word —
and it is a **fidelity** change, not an orthographic one. Raised and left unapplied. If the
merge is still wanted it needs a decision per Tibetan term, with a reason recorded for each.

### Hyphenation — same date, same sweep

Hyphens removed from 69 transliterated compounds, **2,692 occurrences**: `bồ-tát` → `bồ tát`,
`niết-bàn` → `niết bàn`, `ba-la-mật` → `ba la mật`. A house-style call by the project owner,
matching the reference edition, which uses none.

On six long transliterations the hyphen had been doing disambiguating work and they read worse
without it: `bổ-đặc-già-la` (×95), `xá-lợi-phất` (×9, where *xá lợi* alone means *relics*),
`a-tỳ-đạt-ma`, `ma-hầu-la-già`, `ương-quật-ma-la`, `thức-xoa-ma-na`. Dehyphenated as decided and
recorded here rather than silently exempted; restoring any of them is a one-line edit to
`HYPHENATED` in `tools/54-sweep.mjs` plus a re-run.

## §9 — The `[...]` apparatus stays, in full · **2026-09-18**

*Decided by the project owner after the Step 3 restyle pilot.*

All **6,463** bracketed insertions remain. They run at 19.02 per 1,000 words against the
reference edition's 0.20, and a policy was on the table to drop them around a pronoun or subject
that Vietnamese grammar obliges and the Tibetan leaves unambiguous — `[nó]` ×322, `[tâm]` ×215,
`[chúng]` ×196, `[họ]` ×119, `[ta]` ×90, roughly a third of the total.

**The pilot settled it against thinning.** Three chunks improved sharply with every bracket left
in place — median sentence 77→41, 55→33, 71→38; semicolons cut by three quarters. The readability
gain came from sentence length and punctuation, not from the brackets. Thinning them would spend
fidelity risk on what is left, and the brackets are the audit trail for exactly the words that do
*not* trace to specific Tibetan — the project's central rule.

`.claude/workflows/lamrim-restyle.js` forbids agents from removing even one, and the verifier
reports any loss as `apparatusLoss`. Across the pilot's three chunks that list was empty.
