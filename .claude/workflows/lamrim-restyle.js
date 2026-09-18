export const meta = {
  name: 'lamrim-restyle',
  description: 'Restyle a batch of already-translated Lamrim chunks for Vietnamese readability, verify every changed sentence against the Tibetan, repair or revert whatever the check rejects',
  whenToUse: 'Restyle Step 4 (see RESTYLE-PLAN.md). Pass args from: node tools/52-style-lint.mjs batch <n>',
  phases: [
    { title: 'Restyle', detail: 'one agent per chunk: split over-long sentences at Tibetan clause boundaries, re-point demonstratives, edit translation/<id>.md in place' },
    { title: 'Verify', detail: 'an independent skeptic compares before and after against the Tibetan: did any sentence gain or lose a claim?' },
    { title: 'Repair', detail: 'only for rejected chunks: fix, or revert to the faithful wording' },
  ],
}

// Args: { chunks: [ {id, kind, pages:[from,to], section, sectionPath, part, lint} ] }
// Produced by `node tools/52-style-lint.mjs batch <n>`.
//
// PRECONDITION: the working tree is committed before the batch runs. The Verify phase reads the
// pre-restyle text with `git show HEAD:translation/<id>.md`, which is the only way it can tell a
// sentence that was re-punctuated from one that was re-argued. If the tree is dirty, the
// comparison is against a half-restyled file and the check is worthless.
const CHUNKS = args.chunks
const ROOT = 'd:/Workplace/Translator/lamrim_translation'

const pagesOf = (c) => {
  const out = []
  for (let p = c.pages[0]; p <= c.pages[1]; p++) out.push('source/clean/p' + String(p).padStart(4, '0') + '.txt')
  return out.join(', ')
}

const RESTYLE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['chunkId', 'wrote', 'splits', 'demonstratives', 'newTerms', 'flags'],
  properties: {
    chunkId: { type: 'string' },
    wrote: { type: 'boolean' },
    splits: {
      type: 'array',
      description: 'Every sentence you split. For each: the Tibetan clause boundary you split at, quoted from the source, and the Vietnamese before and after. If you cannot quote the Tibetan boundary, you may not split there.',
      items: {
        type: 'object', additionalProperties: false, required: ['boBoundary', 'before', 'after', 'scopeCheck'],
        properties: {
          boBoundary: { type: 'string', description: 'The shad (།) you split at, quoted WITH the Tibetan words on either side of it, so it can be located in the source file.' },
          before: { type: 'string' }, after: { type: 'string' },
          scopeCheck: { type: 'string', description: 'What the sentence\'s final governing element is, and why nothing before your cut falls inside its scope. Name any ཀྱང / མོད་ཀྱང / སྙམ་ནས and say how it is still rendered on both sides. "none" only if the sentence genuinely has no governor reaching across the cut.' },
        },
      },
    },
    demonstratives: { type: 'array', description: 'Each `ấy` you changed or dropped, as "<old phrase> -> <new phrase>". Say "dropped" where the demonstrative is simply gone.', items: { type: 'string' } },
    newTerms: {
      type: 'array',
      description: 'Terms you found MISSING from the glossary. Report only; never change a term in the text.',
      items: {
        type: 'object', additionalProperties: false, required: ['bo', 'vi'],
        properties: { bo: { type: 'string' }, vi: { type: 'string' }, skt: { type: 'string' }, kind: { type: 'string' }, note: { type: 'string' } },
      },
    },
    flags: { type: 'array', description: 'Passages you could not make read well without asserting something the Tibetan does not. Each "unsure: <what and why>". Leaving one awkward and flagged is the CORRECT outcome.', items: { type: 'string' } },
  },
}

const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['chunkId', 'verdict', 'meaningChanges', 'unsupportedSplits', 'apparatusLoss', 'glossaryChanges'],
  properties: {
    chunkId: { type: 'string' },
    verdict: { type: 'string', enum: ['clean', 'needs-fix'] },
    meaningChanges: { type: 'array', description: 'A sentence that now asserts more, less, or other than it did before. Quote before and after.', items: { type: 'string' } },
    unsupportedSplits: { type: 'array', description: 'A split placed where the Tibetan has no clause boundary, or joined by a connective the Tibetan does not have. Quote it.', items: { type: 'string' } },
    apparatusLoss: { type: 'array', description: 'A [...] bracket, a "tồn nghi:" note, a page marker, or a verse line that was removed, altered or reflowed. Quote it.', items: { type: 'string' } },
    glossaryChanges: { type: 'array', description: 'A glossary term rendered differently than before. Quote it.', items: { type: 'string' } },
  },
}

const REPAIR_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['chunkId', 'resolved', 'fixed', 'reverted', 'remaining'],
  properties: {
    chunkId: { type: 'string' },
    resolved: { type: 'boolean', description: 'true only if every meaning change, unsupported split, apparatus loss and glossary change is gone' },
    fixed: { type: 'array', description: 'One line per issue corrected while keeping the improvement.', items: { type: 'string' } },
    reverted: { type: 'array', description: 'One line per sentence restored to its pre-restyle wording because it could not be both faithful and fluent.', items: { type: 'string' } },
    remaining: { type: 'array', description: 'Anything deliberately left, with the reason from the Tibetan.', items: { type: 'string' } },
  },
}

// Everything both the restyler and the repairer must obey. Each prohibition here exists because
// of a failure this project has already had, or a distinction STYLE.md established.
const RULES = `
You are RESTYLING an existing Vietnamese translation of Tsongkhapa's Lamrim Chenmo. The
translation has ALREADY passed a fidelity check against the Tibetan. Your job is to make it
read as Vietnamese, and to change NOTHING ELSE.

THIS IS THE MOST DANGEROUS KIND OF EDIT THIS PROJECT MAKES. When translating a blank page every
word must be earned from the Tibetan. When rewriting text that is already fluent, "improving" a
sentence drifts toward what it OUGHT to say. That is fluent invention arriving by a different
door, and it is what the verifier after you is hunting.

An awkward TRUE sentence beats a graceful FALSE one. Where a passage cannot be made to read
well without asserting something the Tibetan does not, LEAVE IT AWKWARD and flag it.

THE ONLY FOUR THINGS YOU MAY DO
1. SPLIT an over-long sentence - but only AT A SHAD (།) in the Tibetan. You must quote that shad
   with the words on either side of it. A split you cannot point to in the source is forbidden.

   THIS RULE IS STRICTER THAN IT LOOKS, AND IT IS STRICTER BECAUSE OF WHAT WENT WRONG. In the
   pilot batch, 3 chunks out of 3 were rejected, and every single rejection was a split that
   changed what the sentence claims. ནས / སྟེ / ཞིང / ལ joined by a TSHEG into the following word is
   NOT a sentence boundary, however much the Vietnamese makes it look like one. Of 15 splits in
   one chunk, the 14 that landed on a shad were upheld and the one that landed on a tsheg-joined
   རློམ་ཞིང was rejected - that whole stretch was a single nominalised subject whose only head was
   ཤིན་ཏུ་མང་བར་སྣང་ངོ་། at the far end.

   BEFORE EVERY SPLIT, RUN THESE TWO CHECKS. Both failures below happened in the pilot:

   a) DOES A PARTICLE SCOPE ACROSS YOUR CUT? ཀྱང and མོད་ཀྱང are rendered by the Vietnamese pair
      "tuy ... nhưng". Split the sentence, drop the "tuy", and a clause the text CONCEDES becomes
      a claim the text ASSERTS. That is a meaning change, and in a Madhyamaka passage about what
      conventional pramana does and does not establish it is a serious one. Every hedge,
      concessive, quantifier and attributive frame that reached across your cut must still be
      rendered on both sides, or do not cut.

   b) WHAT DOES THE SENTENCE'S FINAL GOVERNOR GOVERN? Tibetan puts the governing element LAST, so
      སྙམ་ནས ("having thought thus"), or one head over several ལ-linked clauses, reaches back over the
      whole sentence. Put a full stop in the middle and that reach is silently cut to the last
      clause only. In the pilot this turned two clauses the text attributes to an OPPONENT'S
      thinking into Tsongkhapa's own assertions. Find the governor, work out its scope, and if
      anything before your proposed full stop sits inside that scope, LEAVE THE SENTENCE LONG.
2. RE-POINT OR DROP a demonstrative. ấy is a calque of Tibetan དེ and appears 4362 times, 37x the
   rate of good Vietnamese Buddhist prose. Render དེ as the passage needs: đó, này, the noun
   repeated, or - most often - nothing, since Vietnamese tolerates a bare noun where Tibetan
   requires the demonstrative. Keep ấy where the text genuinely points back at a contrasted
   referent.
3. RE-PUNCTUATE. A semicolon chain is a sentence that refused to end; an em dash doing the work
   of a full stop should be a full stop. Fix these as a consequence of (1), not on their own.
4. REORDER WITHIN A SENTENCE where Vietnamese requires it and no claim moves.

ABSOLUTELY FORBIDDEN
- Adding a connective the Tibetan does not have (Vì vậy, Do đó, Bởi thế) to make two split
  halves cohere. If they need one to stand apart, LEAVE THEM JOINED.
- Adding or removing any claim, qualifier, hedge, honorific, subject or explanation.
- Changing any glossary term. If you think a term is wrong, report it in newTerms and leave the
  text alone. Terminology is settled elsewhere and is not yours to move.
- Deleting or altering a [...] bracket. Those mark words supplied by the translator and are the
  fidelity audit trail, not clutter. There are 6463 of them and they all stay.
- Deleting or altering a "tồn nghi:" note or any inline uncertainty marker.
- Touching a 【22】 or 【*5】 page marker. Those mark where a page of the original begins.
- TOUCHING VERSE AT ALL. Any blockquote of short lines, and any run of short lines, is verse.
  It has its own pass with its own prosody constraints. Restyle PROSE only.
- Re-translating, or rewording a sentence that is already a reasonable length. Untouched text
  has already passed a fidelity check; every sentence you touch gives up that guarantee.
- HARD-WRAPPING. One prose paragraph is ONE line, however long. A newline inside a prose
  paragraph chops sentences in the raw file and splits bracketed words across lines. The only
  line breaks inside a paragraph are verse padas.

SHARED STATE IS OFF LIMITS. Edit translation/<your id>.md and nothing else. Do NOT edit
glossary.json, progress.json, page-anchors.json or restyle-check.json, and do NOT run
tools/32-chunk.mjs or tools/52-style-lint.mjs - not even to record a flag. Many of you run at
once. A chunk you mark yourself bypasses the verification that decides whether it counts.
Return flags and newTerms in your structured answer; that is how they get recorded.
`

phase('Restyle')

const results = await pipeline(
  CHUNKS,

  // ---------- 1. restyle ----------
  (c) => agent(
    `${RULES}

YOUR CHUNK: ${c.id}   pdf pages ${c.pages[0]}-${c.pages[1]}
  section : ${c.section}
  path    : ${c.sectionPath || '(none)'}
  ${c.part ? `part    : ${c.part} - a split WE made, not the book's.` : ''}

WHAT THE LINTER FLAGGED IN YOUR CHUNK:
  sentences over 80 words : ${c.lint.long}   (over 120: ${c.lint.vlong})
  longest sentence        : ${c.lint.max} words
  median / 90th pct       : ${c.lint.med} / ${c.lint.p90} words
  "ấy" per 1000 words     : ${c.lint.ayPer1k}   (${c.lint.ay} occurrences)
  semicolons per 1000     : ${c.lint.semiPer1k}

TARGET: median at or below 30 words, no sentence over 80 UNLESS the Tibetan is one unbroken
enumeration and splitting would invent a boundary. Do not chase the number past that point -
this is a treatise and its argumentation is genuinely dense. Leaving three long sentences that
the Tibetan really does run together is a better outcome than three splits you cannot justify.

STEPS
1. Read STYLE.md sections 3, 4 and 5 - the rules above are its summary, and section 5 is why.
2. Read glossary/by-chunk/${c.id}.md and glossary/decisions.md. Do NOT read glossary.json
   (2 MB); the view holds every ruling that can bind your pages. A term missing from it is a
   GAP - report it in newTerms, do not change the text.
3. Read your Tibetan pages: ${pagesOf(c)}
4. Read translation/${c.id}.md.
5. Run: node tools/52-style-lint.mjs show ${c.id}
   That prints every sentence over 80 words in your chunk. Those, plus the ấy count, are your
   whole worklist. Work through them one at a time, each against the Tibetan.
6. Edit translation/${c.id}.md in place.
7. Re-run \`node tools/52-style-lint.mjs show ${c.id}\` and confirm the numbers moved.

Return: every split with the Tibetan boundary you split at, every demonstrative you changed,
any missing glossary terms, and a flag for anything you left awkward on purpose.

Work from ${ROOT}. Your final answer is the structured object only.`,
    { label: `rs:${c.id}`, phase: 'Restyle', schema: RESTYLE_SCHEMA }
  ),

  // ---------- 2. verify, adversarially, before against after ----------
  (rs, c) => rs == null ? null : agent(
    `You are checking a RESTYLE of a Vietnamese translation of Classical Tibetan. The text had
already passed a fidelity check before being restyled, so you are not re-checking the
translation - you are checking whether the restyle CHANGED WHAT IT SAYS.

Be skeptical. Your job is to find meaning that moved, not to praise readability.

The dominant failure mode of a restyle is a sentence that reads better and asserts something
slightly different: a connective inserted to make two halves cohere (which adds an inference
the Tibetan does not draw), a dropped demonstrative that was actually carrying a contrast, a
subject supplied while "simplifying", a hedge lost, a split placed where the Tibetan runs on.

Read, from ${ROOT}:
  - Tibetan source : ${pagesOf(c)}
  - AFTER  (restyled) : translation/${c.id}.md
  - BEFORE (original) : run \`git show HEAD:translation/${c.id}.md\`
  - glossary/by-chunk/${c.id}.md and glossary/decisions.md. Do NOT read glossary.json.

Diff them yourself and examine EVERY changed sentence. The restyler claimed these splits:
${(rs.splits || []).length ? rs.splits.map((s, i) => `  ${i + 1}. at Tibetan «${s.boBoundary}»\n     before: ${s.before}\n     after : ${s.after}\n     its scope check: ${s.scopeCheck || '(none given)'}`).join('\n') : '  (none claimed)'}

For EACH claimed split, do all three of these - the pilot batch was rejected 3 out of 3, and
each of these caught a real failure:

  a) FIND THE SHAD in the source file. Only a shad (།) is a boundary. ནས / སྟེ / ཞིང / ལ joined by a
     TSHEG into the next word is not one, whatever the Vietnamese looks like. A split not on a
     shad is an unsupportedSplit.
  b) CHECK FOR A LOST PARTICLE. If ཀྱང or མོད་ཀྱང scoped across the cut, the Vietnamese "tuy" must
     still be there. Without it a CONCEDED clause has become an ASSERTED one - a meaningChange.
  c) CHECK THE FINAL GOVERNOR'S SCOPE. Tibetan puts the governing element last, so སྙམ་ནས, or one
     head over several ལ-linked clauses, reaches back over the whole sentence. If a full stop now
     cuts that reach short, clauses the text attributed to an opponent may read as the author's
     own - a meaningChange. Verify the scopeCheck the restyler gave; do not take it on trust.

Report four lists:
1. meaningChanges     - a sentence that now asserts more, less, or other than before. This
                        includes an added connective: "A. Vì vậy B." claims a causal link that
                        "A và B" did not.
2. unsupportedSplits  - a split with no Tibetan clause boundary at that point.
3. apparatusLoss      - any [...] bracket, "tồn nghi:" note, 【page marker】 or verse line
                        removed, altered or reflowed; any prose paragraph hard-wrapped.
4. glossaryChanges    - a glossary term rendered differently than in the BEFORE text.

verdict is "clean" only if all four lists are empty. Default to reporting when unsure - a false
alarm costs one repair agent, a missed meaning change costs the reader the text.
Your final answer is the structured object only.`,
    { label: `vf:${c.id}`, phase: 'Verify', schema: VERDICT_SCHEMA }
  ).then((v) => ({ rs, v, c })),

  // ---------- 3. repair, only what was rejected ----------
  (r) => {
    if (r == null) return null
    if (!r.v || r.v.verdict === 'clean') return { ...r, rep: null }
    const list = (t, a) => (a && a.length) ? `\n${t}:\n` + a.map((x, i) => `  ${i + 1}. ${x}`).join('\n') : ''
    return agent(
      `${RULES}

A check REJECTED the restyle of chunk ${r.c.id}. Repair it.

Read, from ${ROOT}:
  - Tibetan source    : ${pagesOf(r.c)}
  - AFTER  (restyled) : translation/${r.c.id}.md
  - BEFORE (original) : run \`git show HEAD:translation/${r.c.id}.md\`
  - glossary/by-chunk/${r.c.id}.md and glossary/decisions.md. Do NOT read glossary.json.
${list('MEANING CHANGES - the sentence no longer says what it said. Fix every one', r.v.meaningChanges)}
${list('UNSUPPORTED SPLITS - no Tibetan boundary there. Rejoin, or move to a real boundary', r.v.unsupportedSplits)}
${list('APPARATUS LOSS - restore every bracket, note, page marker and verse line exactly', r.v.apparatusLoss)}
${list('GLOSSARY CHANGES - restore the term the BEFORE text used', r.v.glossaryChanges)}

HOW TO REPAIR
- Edit translation/${r.c.id}.md in place. Change ONLY what is listed.
- WHEN IN DOUBT, REVERT. The pre-restyle sentence had passed a fidelity check; a restyled one
  that a checker doubts has not. Restoring the original wording verbatim from
  \`git show HEAD:translation/${r.c.id}.md\` is always an acceptable repair and often the right
  one. Record it in "reverted". Reverting is not failure - a long faithful sentence is the
  deliverable, a short unfaithful one is not.
- You may keep an improvement only if you can show the meaning did not move.
- Apparatus loss is never a judgement call: restore it exactly.
- If a criticism is wrong, leave the text and say so in "remaining", with your reason from the
  Tibetan.

Set resolved=true only if every listed item is genuinely addressed.
Your final answer is the structured object only.`,
      { label: `rp:${r.c.id}`, phase: 'Repair', schema: REPAIR_SCHEMA }
    ).then((rep) => ({ ...r, rep }))
  }
)

const done = results.filter(Boolean)
const passed = done.filter((r) => (r.v && r.v.verdict === 'clean') || (r.rep && r.rep.resolved))
const failed = done.filter((r) => !((r.v && r.v.verdict === 'clean') || (r.rep && r.rep.resolved)))

log(`${done.length}/${CHUNKS.length} restyled | clean first pass ${done.filter((r) => r.v && r.v.verdict === 'clean').length} | repaired ${done.filter((r) => r.rep && r.rep.resolved).length} | still failing ${failed.length}`)
log(`splits: ${done.reduce((a, r) => a + ((r.rs && r.rs.splits) || []).length, 0)} | demonstratives: ${done.reduce((a, r) => a + ((r.rs && r.rs.demonstratives) || []).length, 0)} | reverted: ${done.reduce((a, r) => a + ((r.rep && r.rep.reverted) || []).length, 0)}`)

return {
  passed: passed.map((r) => r.c.id),
  failed: failed.map((r) => r.c.id),
  chunks: done.map((r) => ({
    id: r.c.id,
    verdict: r.v ? r.v.verdict : null,
    splits: (r.rs && r.rs.splits) || [],
    demonstratives: (r.rs && r.rs.demonstratives) || [],
    newTerms: (r.rs && r.rs.newTerms) || [],
    flags: (r.rs && r.rs.flags) || [],
    findings: r.v ? {
      meaningChanges: r.v.meaningChanges, unsupportedSplits: r.v.unsupportedSplits,
      apparatusLoss: r.v.apparatusLoss, glossaryChanges: r.v.glossaryChanges,
    } : null,
    repair: r.rep || null,
  })),
}
