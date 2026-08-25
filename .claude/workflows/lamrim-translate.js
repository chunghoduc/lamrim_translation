export const meta = {
  name: 'lamrim-translate',
  description: 'Translate a batch of Lamrim Chenmo chunks bo->vi, adversarially verify each against the Tibetan, then repair whatever the check rejected',
  whenToUse: 'Phase 4 translation loop. Pass args from: node tools/32-chunk.mjs batch <n>',
  phases: [
    { title: 'Translate', detail: 'one agent per chunk: read the Tibetan pages, translate, write translation/<id>.md' },
    { title: 'Verify', detail: 'an independent skeptic hunts fabrication, omission and glossary drift' },
    { title: 'Repair', detail: 'only for rejected chunks: apply the named fixes, nothing else' },
  ],
}

// Args: { chunks: [ {id, kind, pages:[from,to], section, sectionPath, part} ] }
// Produced by `node tools/32-chunk.mjs batch <n>`.
const CHUNKS = args.chunks
const ROOT = 'd:/Workplace/Translator/lamrim_translation'

const pagesOf = (c) => {
  const out = []
  for (let p = c.pages[0]; p <= c.pages[1]; p++) out.push('source/clean/p' + String(p).padStart(4, '0') + '.txt')
  return out.join(', ')
}

const TRANSLATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['chunkId', 'wrote', 'newTerms', 'flags'],
  properties: {
    chunkId: { type: 'string' },
    wrote: { type: 'boolean' },
    newTerms: {
      type: 'array',
      description: 'Terms fixed for the first time here (proper nouns, cited-text titles, doctrinal terms not already in glossary.json).',
      items: {
        type: 'object', additionalProperties: false, required: ['bo', 'vi'],
        properties: { bo: { type: 'string' }, vi: { type: 'string' }, skt: { type: 'string' }, kind: { type: 'string' }, note: { type: 'string' } },
      },
    },
    flags: { type: 'array', description: 'Honest uncertainty, each "unsure: <what and why>". Empty if genuinely nothing was uncertain.', items: { type: 'string' } },
  },
}

const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['chunkId', 'verdict', 'fabrications', 'omissions', 'glossaryViolations'],
  properties: {
    chunkId: { type: 'string' },
    verdict: { type: 'string', enum: ['clean', 'needs-fix'] },
    fabrications: { type: 'array', description: 'Vietnamese that cannot be traced to specific Tibetan on those pages. Quote it.', items: { type: 'string' } },
    omissions: { type: 'array', description: 'Tibetan in range with no counterpart in the Vietnamese. Quote it.', items: { type: 'string' } },
    glossaryViolations: { type: 'array', description: 'A term rendered other than as glossary.json fixes it, or southern spellings (sanh/phuoc).', items: { type: 'string' } },
  },
}

const REPAIR_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['chunkId', 'resolved', 'fixed', 'glossaryGaps', 'remaining'],
  properties: {
    chunkId: { type: 'string' },
    resolved: { type: 'boolean', description: 'true only if every fabrication and omission was fixed in the file' },
    fixed: { type: 'array', description: 'One line per issue actually corrected.', items: { type: 'string' } },
    glossaryGaps: {
      type: 'array',
      description: 'Issues that were NOT translator errors but missing glossary rulings. The wording stays; the glossary needs the entry.',
      items: {
        type: 'object', additionalProperties: false, required: ['bo', 'vi'],
        properties: { bo: { type: 'string' }, vi: { type: 'string' }, skt: { type: 'string' }, kind: { type: 'string' }, note: { type: 'string' } },
      },
    },
    remaining: { type: 'array', description: 'Anything deliberately left, with the reason. Prefer this over a forced fix.', items: { type: 'string' } },
  },
}

const RULES = `
You are translating Tsongkhapa's Lamrim Chenmo from Classical Tibetan into Vietnamese.

CORRECTNESS IS THE ONLY CRITERION. A fluent translation that misrepresents the source is
WORSE than no translation, because the error is invisible to the reader.

- Every Vietnamese sentence must trace to specific Tibetan in the source. If you cannot point
  to the words it came from, it does not go in.
- NEVER fill gaps from your knowledge of Buddhism. Knowing Lamrim doctrine makes it easy to
  "complete" a passage from memory of what it should say. That is fabrication even when the
  doctrine is correct.
- Inside a QUOTATION this is absolute: a cited sutra or sastra verse gets no interpretive
  expansion, no gloss absorbed from the commentary around it, and no honorific the Tibetan
  does not have. Where you must supply a word for Vietnamese to parse, bracket it: [quả].
- Do not resolve an ambiguous Tibetan genitive into a definite claim about agency. If the
  Tibetan will not say who did it, neither may you.
- NEVER smooth over an unclear passage. Flag it. An honest flag is a GOOD outcome.
- Do NOT translate from the English or Vietnamese editions. Consult them to CHECK a term,
  never as the thing being rendered. The source is the Tibetan.
- Do NOT normalise the source. It has genuine typos. Translate what is there and flag it.

GLOSSARY - binding. Read glossary/glossary.json and glossary/decisions.md BEFORE translating.
- status "fixed": use exactly that Vietnamese, every time.
- status "fixed-set": use ONLY a form from that entry's viVariants, per its note.
- HOUSE STYLE is northern: "sinh" not "sanh", "phuc duc" not "phuoc duc", everywhere.
- A term already in the glossary is SETTLED. Do not re-decide it.
- Fix a genuinely new term (proper noun, cited title, doctrinal term not listed) and report
  it in newTerms. Never edit glossary.json yourself.

SHARED STATE IS OFF LIMITS. Write translation/<your id>.md and nothing else. Do NOT edit
glossary.json or progress.json, and do NOT run tools/32-chunk.mjs - not even to record a flag.
Many of you run at once; the merge step folds everything in afterwards, in one process, and a
chunk you mark yourself bypasses the fidelity check that decides whether it counts as done.
Return flags and newTerms in your structured answer instead - that is how they get recorded.

STYLE. Vietnamese Buddhist register, Sino-Vietnamese where that is the established
convention. Verse stays verse: one line per shad-delimited Tibetan line, in a Markdown
blockquote. Cited sutras and sastras stay blockquotes.
`

phase('Translate')

const results = await pipeline(
  CHUNKS,

  // ---------- 1. translate ----------
  (c) => agent(
    `${RULES}

OUTPUT. Write ${ROOT}/translation/${c.id}.md. Read translation/c005.md first as the model for
layout and tone. Front matter exactly:

---
chunk: ${c.id}
kind: ${c.kind}
pages: [${c.pages[0]}, ${c.pages[1]}]
printedPages: ${c.kind === 'front' ? 'null' : `[${c.pages[0] - 20}, ${c.pages[1] - 20}]`}
source: source/clean/p${String(c.pages[0]).padStart(4, '0')}.txt - source/clean/p${String(c.pages[1]).padStart(4, '0')}.txt
section: "${c.section}"
sectionPath: "${c.sectionPath || ''}"
---

Body rules:
- Translate the section's heading as a Markdown heading.${c.part && !String(c.part).startsWith('1/') ? ' This is NOT part 1 of the section, so do NOT restate the heading.' : ''}
- If the chunk opens mid-sentence, begin "*(...tiep theo:)*" and complete it.
- If it ends mid-sentence, close with "*(tiep sang chunk sau.)*".
- Translation only. No Tibetan in the body.

YOUR CHUNK: ${c.id}   pdf pages ${c.pages[0]}-${c.pages[1]}
  section : ${c.section}
  path    : ${c.sectionPath || '(none)'}
  ${c.part ? `part    : ${c.part} - a split WE made, not the book's.` : ''}

STEPS: read the glossary files and translation/c005.md; read your pages (${pagesOf(c)});
ALSO read the page before your range for context only, since sentences run across page and
chunk boundaries; translate ONLY your range; write the file; return newTerms and flags.

Work from ${ROOT}. Your final answer is the structured object only.`,
    { label: `tr:${c.id}`, phase: 'Translate', schema: TRANSLATE_SCHEMA }
  ),

  // ---------- 2. verify, adversarially ----------
  (tr, c) => tr == null ? null : agent(
    `You are checking a Vietnamese translation of Classical Tibetan for FIDELITY. Be skeptical.
Your job is to find fabrication, not to praise the work.

The text is Tsongkhapa's Lamrim Chenmo. The dominant failure mode is FLUENT INVENTION:
plausible, well-formed Buddhist prose that is not what the Tibetan says. It reads beautifully
and is wrong. Doctrinally correct content that is NOT in the source is still a fabrication -
that is exactly what you are hunting.

Read, from ${ROOT}:
  - Tibetan source : ${pagesOf(c)}
  - Vietnamese     : translation/${c.id}.md
  - glossary/glossary.json and glossary/decisions.md

Report three lists:
1. fabrications - Vietnamese that cannot be traced to specific Tibetan on those pages.
   Watch especially for: added qualifiers and honorifics; a commentary gloss pulled into a
   quoted verse; an ambiguous genitive resolved into a claim about agency; a verb rendered
   as a stronger or different act than the Tibetan states.
2. omissions - Tibetan in range with no Vietnamese counterpart. Ignore the deliberate
   lead-in/lead-out fragments at chunk boundaries.
3. glossaryViolations - a "fixed" term rendered differently, a "fixed-set" term outside its
   viVariants, or southern spellings. If the glossary simply has NO ruling for the term, say
   so explicitly in the entry - that is a glossary gap, not a translator error, and the
   repair stage treats the two differently.

verdict is "clean" only if all three lists are empty. Default to reporting when unsure.
Your final answer is the structured object only.`,
    { label: `vf:${c.id}`, phase: 'Verify', schema: VERDICT_SCHEMA }
  ).then((v) => ({ tr, v, c })),

  // ---------- 3. repair, only what was rejected ----------
  (r) => {
    if (r == null) return null
    if (!r.v || r.v.verdict === 'clean') return { ...r, rep: null }
    const list = (t, a) => (a && a.length) ? `\n${t}:\n` + a.map((x, i) => `  ${i + 1}. ${x}`).join('\n') : ''
    return agent(
      `${RULES}

A fidelity check REJECTED your project's translation of chunk ${r.c.id}. Repair it.

Read, from ${ROOT}:
  - Tibetan source : ${pagesOf(r.c)}
  - Vietnamese     : translation/${r.c.id}.md
  - glossary/glossary.json and glossary/decisions.md
${list('FABRICATIONS - content not in the Tibetan. Remove or correct every one', r.v.fabrications)}
${list('OMISSIONS - Tibetan with no Vietnamese counterpart. Supply every one', r.v.omissions)}
${list('GLOSSARY - each is EITHER a wrong rendering OR a missing ruling. Decide which', r.v.glossaryViolations)}

HOW TO REPAIR:
- Edit translation/${r.c.id}.md in place. Change ONLY what is listed. Do not restyle or
  re-translate passages nobody objected to - untouched text has already passed.
- Fabrication and omission are always real defects. Fix them against the Tibetan.
- A glossary item splits two ways:
    * the glossary HAS a ruling and the text departed from it -> change the text.
    * the glossary has NO ruling -> the wording may well be right. KEEP it and return the
      entry in glossaryGaps so it gets recorded once, centrally.
- If a criticism is wrong, do not "fix" it to satisfy the checker. Leave the text and say so
  in "remaining", with your reason from the Tibetan.

Set resolved=true only if every fabrication and omission is genuinely addressed.
Your final answer is the structured object only.`,
      { label: `rp:${r.c.id}`, phase: 'Repair', schema: REPAIR_SCHEMA }
    ).then((rep) => ({ ...r, rep }))
  }
)

const done = results.filter(Boolean)

// A chunk passes if it was clean, or if repair resolved every fabrication/omission.
const passed = done.filter((r) => (r.v && r.v.verdict === 'clean') || (r.rep && r.rep.resolved))
const failed = done.filter((r) => !((r.v && r.v.verdict === 'clean') || (r.rep && r.rep.resolved)))

log(`${done.length}/${CHUNKS.length} translated | clean first pass ${done.filter((r) => r.v && r.v.verdict === 'clean').length} | repaired ${done.filter((r) => r.rep && r.rep.resolved).length} | still failing ${failed.length}`)

return {
  attempted: CHUNKS.length,
  completed: done.length,
  clean: passed.map((r) => r.c.id),
  needsFix: failed.map((r) => ({
    id: r.c.id,
    fabrications: (r.v && r.v.fabrications) || [],
    omissions: (r.v && r.v.omissions) || [],
    glossaryViolations: (r.v && r.v.glossaryViolations) || [],
    repairNotes: (r.rep && r.rep.remaining) || [],
  })),
  // both the translators' new terms and the rulings repair found were missing
  newTerms: done.flatMap((r) => ((r.tr && r.tr.newTerms) || []).concat((r.rep && r.rep.glossaryGaps) || [])),
  flags: done.flatMap((r) => ((r.tr && r.tr.flags) || []).map((f) => ({ id: r.c.id, flag: f }))),
  repairs: done.filter((r) => r.rep).map((r) => ({ id: r.c.id, resolved: r.rep.resolved, fixed: r.rep.fixed, remaining: r.rep.remaining })),
}
