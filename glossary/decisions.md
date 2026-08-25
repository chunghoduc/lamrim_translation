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
