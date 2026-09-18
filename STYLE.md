# Vietnamese prose style — what the reference book teaches, and what it does not

This document exists because of one instruction: *learn the writing style from that book,
then update the translation to match it*. It records what was actually measured, which
traits are adoptable, and — just as importantly — which are not, and why.

Nothing here licenses changing what a sentence **says**. See §5.

---

## 1. The reference

`sample/BO De Tam FINAL.docx` → `sample/bo-de-tam.md`
(converted by `node tools/50-docx2md.mjs`, text verified character-identical to the source
`word/document.xml` once markup is stripped).

| | |
|---|---|
| Title | *Bồ Đề Tâm* — teachings of Lama Thamthog Rinpoche, former abbot of Namgyal Monastery |
| Vietnamese | Hồ Thị Thu Hiền, "Việt dịch và biên tập", Hamburg, 02/06/2026 |
| Origin | online teachings given to Italian and Vietnamese students during Covid, transcribed and edited over two years |
| Size | 21,807 words; 3 chapters + preface + afterword; 42 headings; 253 lines of verse |

**Its genre is not ours, and that governs everything below.** It is edited speech: a teacher
addressing students, in the second person, with anecdotes and repetition. The *Lamrim Chenmo*
is a fourteenth-century scholastic treatise that argues, cites, and enumerates. Some of the
distance between the two texts is a defect in ours. Some of it is the difference between a
Dharma talk and a śāstra, and closing that part would be a misrepresentation.

The sections that follow separate the two.

---

## 2. What was measured

`node tools/51-style-metrics.mjs sample/bo-de-tam.md lamrim-vi.md` — body prose only
(headings, blockquotes and list items excluded; page markers stripped).

| | reference | ours | |
|---|---:|---:|---|
| words of body prose | 30,103 | 269,109 | |
| **words / paragraph** | **89.1** | **85.5** | *already the same — paragraphing is not a problem* |
| words / sentence, mean | 26.3 | 44.3 | |
| words / sentence, median | 23 | 38 | |
| 90th percentile | 44 | 84 | |
| % of sentences over 40 words | 13.1% | **46.5%** | |
| commas / sentence | 1.60 | 1.89 | |

Per 1,000 words:

| feature | reference | ours | ratio |
|---|---:|---:|---|
| `[...]` translator insert | 0.20 | **19.16** | ×96 |
| `ấy` | 0.37 | **13.84** | ×37 |
| semicolon | 2.03 | **11.26** | ×5.5 |
| em dash `—` | 0.73 | **11.90** | ×16 |
| `v.v.` | 0.03 | 3.81 | ×127 |
| curly quotes `“ ”` | 5.91 | **0.00** | ours uses 3,778 straight `"` |
| `đó` | 7.08 | 4.13 | |
| `này` | 4.29 | 3.93 | |
| `chúng ta` | 5.12 | 0.14 | ×0.03 |
| bare `ta` | 13.62 | 1.41 | ×0.10 |
| `tôi` | 3.69 | 0.67 | |
| `Hãy` (imperative) | 1.66 | 0.16 | |
| rhetorical `?` | 2.19 | 1.10 | |

Our sentence-length distribution, in full:

```
   0-20    1401   #####################################
  20-30     898   ######################
  30-40     883   ######################
  40-50     723   ##################
  50-60     634   ################
  60-80     833   #####################
  80-100    353   #########
  100+      359   #########      longest: 279 words
```

**359 sentences of 100 words or more** is the headline finding. The reference book has
essentially none.

> **These numbers are the BASELINE, measured before any change (commit `6900732`).** Do not
> compare a later measurement against them without reading this note first.
>
> Two of them move for reasons that have nothing to do with prose quality:
>
> - **Dehyphenation inflated every word count.** Removing 2,692 hyphens turned `bồ-tát` into two
>   tokens, adding 2,831 "words" corpus-wide. "Sentences over 80 words" rose 610 → 627 with no
>   prose touched. **The Step 4 progress baseline is therefore the post-sweep number, not this
>   one.**
> - **`51-style-metrics.mjs` excludes blockquotes; `52-style-lint.mjs` includes quoted prose.**
>   For comparing two books the first is the fair cut — every blockquote in the reference is
>   verse. For deciding what a restyle must fix, quoted prose is prose. Hence `ấy` at 3,718 here
>   and 4,362 there. Both are right for their own purpose.
>
> A third is simply a measurement bug now fixed: `52` counted the 1,160 double quotes in the YAML
> front matter as straight-quote defects. The body held 2.

---

## 3. What transfers — the adoptable rules

These are properties of Vietnamese prose, not of the doctrine. Adopting them changes how a
sentence reads, not what it asserts.

### 3.1 Sentence length — the main one

The Tibetan builds long periodic sentences with `ནས` / `སྟེ` / `ཏེ` / `ཞིང` / `ལ` chaining
clause after clause. Our translation carries that structure across intact, and Vietnamese
will not bear it: a 279-word sentence is not faithful, it is unread.

**Rule.** Where the Tibetan already has a clause boundary, the Vietnamese may take a full
stop there. Splitting at a junction the Tibetan itself marks adds nothing and removes
nothing — it is the same proposition, punctuated for a different language.

**Target.** Median at or below 30 words; no sentence over 80 except where the Tibetan is one
unbroken enumeration and splitting would invent a boundary. Not 23 words like the reference —
the argumentation genuinely is denser.

**What is forbidden.** Splitting by inserting a connective the Tibetan does not have
("Vì vậy", "Do đó", "Bởi thế") in order to make two sentences cohere. That is adding an
inference. If the two halves need a connective to stand apart, leave them joined.

#### The three ways a split changes meaning — learned from the Step 3 pilot

The pilot restyled three chunks, made 41 splits, and the independent check rejected both of the
first two chunks. Nothing was lost from the apparatus and no glossary term moved: **every
rejection was a split that quietly altered what the sentence claims.** Three distinct patterns,
and all three are invisible unless you are holding the Tibetan.

**1. Only a shad `།` is a reliable boundary.** `ཞིང` / `ལ` / `སྟེ` joined by a tsheg into the next
word is *not* a sentence break, however much it looks like one in translation. Of the pilot's 15
splits in c226, fourteen landed on a shad and were upheld; the one that landed on a tsheg-joined
`རློམ་ཞིང` was rejected, because the whole stretch was a single nominalised subject whose only head
was `ཤིན་ཏུ་མང་བར་སྣང་ངོ་།` at the far end. **Require a shad.** A split anywhere else needs an argument,
not an intuition.

**2. A concessive particle must survive the split.** `ཀྱང` and `མོད་ཀྱང` are rendered by the Vietnamese
pair *tuy … nhưng*. Split the sentence and drop the *tuy*, and a clause the text **concedes**
becomes a claim the text **asserts**:

> `ཐ་སྙད་དུ་འཇོག་པའི་དོན་རྣམས་ཐ་སྙད་པའི་ཚད་མས་གྲུབ་དགོས་ཀྱང་།`
> before — "các nghĩa … **tuy** phải được thành lập bởi lượng danh ngôn, **nhưng** …"
> after — "các nghĩa … phải được thành lập bởi lượng danh ngôn. **Nhưng** …"

In a Prāsaṅgika passage about exactly what conventional *pramāṇa* does and does not settle, that
is not neutral re-punctuation. Same fault, same chunk, twice.

**3. A sentence-final governor scopes over everything before it.** Tibetan puts the governing
element last, so `སྙམ་ནས` ("having thought thus"), or a single head over several `ལ`-linked clauses,
reaches back across the whole sentence. Put a full stop in the middle and that reach is silently
cut to the final clause — in c225 this turned two clauses that the text attributes to an
*opponent's thinking* into Tsongkhapa's own assertions. The repair reverted it verbatim.

**The rule that follows.** Before splitting, find the sentence's governing element and ask what
it governs. If anything before your proposed full stop is inside its scope — a hedge, a
concessive, an attributive frame, a quantifier — **leave the sentence long.** This is the case
STYLE.md §5 is about: the awkward true sentence is the deliverable.

### 3.2 `ấy` — 3,718 occurrences of a calque

`ấy` is how the current text renders Tibetan `དེ`. It is grammatical Vietnamese, but at 37×
the reference's rate it is the clearest single marker of translationese in the corpus:

```
 771  điều ấy      146  vị ấy       120  cái ấy      100  thứ ấy
  99  chừng ấy      86  người ấy     79  lời ấy       77  dạy ấy
```

**Rule.** `དེ` is a demonstrative, not a fixed word. Render it as the passage needs: `đó`,
`này`, the noun repeated, or — most often — nothing at all, since Vietnamese tolerates a bare
noun where Tibetan requires the demonstrative. Keep `ấy` where the text is genuinely pointing
back at a contrasted referent.

**Not a find-and-replace.** `điều ấy` → `điều đó` 771 times would trade one tic for another.
The fix is per occurrence, in view of the Tibetan.

### 3.3 Semicolons and em dashes

11.26 semicolons and 11.90 em dashes per 1,000 words against 2.03 and 0.73. Both are
symptoms of §3.1, not independent faults: a semicolon chain is a sentence that refused to
end, and the em dash is doing the work of a full stop. Fix the sentence and these fall on
their own. Do not chase them separately.

### 3.4 Typography — purely mechanical, zero fidelity risk

All of these are applied corpus-wide by `tools/54-sweep.mjs`. **An agent must never make these
changes by hand**: the Step 3 pilot showed why — one agent, left to its own taste, moved six
periods the *opposite* way to the reference's convention, which would have deepened an
inconsistency instead of fixing it. Typography is a corpus rule, not a per-chunk judgement.

- Quotation: `"..."` → `“...”` — 3,778 straight quotes; the reference uses curly throughout.
- Nested quotation: `'...'` → `‘...’` — 109 of them. **The apostrophe in a Wylie transliteration
  is not a quote mark**: in *sme'u zan*, *'tshal ba*, *bar mnar med pa'i 'khor mun nag chen po*
  it is the letter *a-chung*, and curling it corrupts the transliteration. The sweep protects
  italic spans that contain an apostrophe and no Vietnamese diacritic.
- **Period inside the closing quote**: `cả”.` → `cả.”` — 177. The reference runs 48:1 for inside;
  our corpus was split 237 inside / 171 outside, an inconsistency predating this pass. Every
  instance was checked: the period is always sentence-final, so moving it changes nothing.
- **Commas stay where they are.** The reference has no comma convention at all — 8 inside, 8
  outside — while our corpus is already consistent at 337 outside. The first version of the rule
  moved commas too and would have changed 337 of them, breaking a consistency we have on no
  authority. The period is the only half of this the reference actually settles.
- Verse inside a blockquote needs a hard line break (two trailing spaces) so a stanza
  survives in a generic Markdown viewer — 3,489 lines. Our own renderer (`tools/41-pdf.mjs`)
  already handles this correctly; this is for GitHub and anything else that reads the `.md`.
  *Watch the knock-on:* three tools told verse from prose by raw line length against a 76-char
  threshold, and two trailing spaces pushed some lines over it, silently dropping 6 stanzas out
  of the verse ledger. They now measure the trimmed line.
- Citation shape: the reference sets *`Title`* + `(chapter.verse)` + verb + colon —
  *Nhập Bồ Tát Hạnh* (8.131) dạy rằng: — which is **already our convention**. Keep it.

### 3.5 Direct address — only where the Tibetan has it

`chúng ta` 0.14/1k against 5.12; `Hãy` 0.16 against 1.66. Part of this gap is genre and must
stay (§4). But part is probably under-translation: Tsongkhapa does write `བདག་ཅག` ("we") and
does use imperative and optative forms in the exhortation passages, and a rendering that
flattens those into impersonal statements loses something that is in the source.

**Rule.** Where the Tibetan has a first-person plural or an imperative, let the Vietnamese
have one. Where it does not, do not add one. This is a check to run, not a quota to hit.

---

## 4. What does not transfer

### 4.1 The spoken register

The reference says *"Hãy thành thật nhìn lại mình trong hai mươi bốn giờ qua"*. Tsongkhapa
does not. Importing second-person exhortation, rhetorical warmth, or the teacher's "tôi" into
a treatise would be writing a different book. §3.5 is the narrow, source-licensed exception.

### 4.2 Terminology

The two texts make different lexical choices, and ours are recorded decisions with reasons:

| | reference | ours |
|---|---|---|
| śūnyatā | `tính không` | `tánh không` (×207) |
| bodhicitta | `bồ đề tâm` (×155) | `bồ-đề tâm` (×113) |
| mahāyāna | `Đại Thừa` | `Đại thừa` (×126) |
| renunciation | `tâm buông bỏ` | `yểm ly` / `viễn ly` |
| hyphenation | none | `bồ-tát`, `niết-bàn`, `ba-la-mật` |

**These are not style and must not move as part of a style pass.** CLAUDE.md is explicit:
the Vietnamese editions "may be consulted to *check* a terminology choice, never as the thing
being rendered". Any change here goes through `glossary/decisions.md` as its own decision,
with its own reason, and triggers a corpus-wide sweep — it is not a side effect of prose
polishing.

(The hyphenation and `tánh`/`tính` questions are legitimately the project owner's call. They
are listed in RESTYLE-PLAN.md §Step 0 so they get decided deliberately rather than drifted.)

### 4.3 The `[...]` apparatus

6,463 bracketed insertions against the reference's 4. But the reference is a transcript of
speech with no obligation to mark what the speaker did not say, and ours is a translation
whose central rule is that **every Vietnamese word traces to specific Tibetan**. The brackets
are the audit trail for exactly the words that do not.

They are still too dense to read — `[nó]` ×322, `[tâm]` ×215, `[chúng]` ×196 — and most of
them supply a subject or object that Vietnamese grammar requires and that the Tibetan makes
unambiguous. That is a case for a **policy** on when a supplied word needs marking, not for
deleting the marks. Step 0 of the plan puts the policy question to the owner; until it is
answered, brackets stay exactly as they are.

### 4.4 Paragraphing

89.1 vs 85.5 words per paragraph. Already matched. Nothing to do.

---

## 5. The line that must not be crossed

A style pass is the most dangerous kind of edit this project can make, more dangerous than
translating a fresh chunk. When translating, there is nothing on the page and every word has
to be earned from the Tibetan. When rewriting for fluency, there is already fluent text on
the page, and "improving" it drifts toward what the sentence *ought* to say. That is the
project's named failure mode — fluent invention — arriving by a different door.

Three rules follow, and they are not negotiable:

1. **A restyled sentence is re-verified against the Tibetan**, by an agent that did not write
   it, exactly as a newly translated chunk is. A chunk whose restyle has not passed
   verification is not done.
2. **The style pass may not change the glossary.** If a restyle wants a different word for a
   term, it stops and reports the term; it does not change it.
3. **No sentence may gain or lose a claim.** Splitting, re-pointing a demonstrative and
   re-punctuating are permitted. Adding a connective, a subject, a hedge, an explanation or a
   doctrinal completion is not — those are the same fabrication whether they arrive in a
   first draft or a polish.

Where a passage cannot be made to read well without asserting something the Tibetan does not,
**leave it reading badly and flag it**. An awkward true sentence beats a graceful false one.
