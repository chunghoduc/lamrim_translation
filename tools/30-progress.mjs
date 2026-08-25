// Regenerate PROGRESS.md from progress.json PLUS the actual artifacts on disk.
//
// The point: a hand-maintained status doc goes stale and starts lying. This one
// derives every number from the files themselves, so "what is done" is measured,
// not remembered.
//
//   node tools/30-progress.mjs            fast (file inspection only)
//   node tools/30-progress.mjs --verify   also re-runs the health checks
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT, RAW, CLEAN, QA } from './config.mjs';

const VERIFY = process.argv.includes('--verify');
const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'progress.json'), 'utf8'));

const exists = p => fs.existsSync(path.join(ROOT, p));
const countFiles = (dir, ext) => {
  const d = path.join(ROOT, dir);
  if (!fs.existsSync(d)) return 0;
  return fs.readdirSync(d).filter(f => !ext || f.endsWith(ext)).length;
};
const sizeMB = p => exists(p) ? (fs.statSync(path.join(ROOT, p)).size / 1024 / 1024).toFixed(2) : null;

// ---------- measured facts ----------
const facts = {
  rawPages: countFiles('source/raw/glyphs', '.json'),
  cleanPages: countFiles('source/clean', '.txt') - (exists('source/clean/lamrim.txt') ? 1 : 0),
  cleanSize: sizeMB('source/clean/lamrim.txt'),
  chunksTotal: state.chunks.length,
  chunksTranslated: state.chunks.filter(c => c.status === 'translated' || c.status === 'reviewed').length,
  chunksReviewed: state.chunks.filter(c => c.status === 'reviewed').length,
  chunksDraft: state.chunks.filter(c => c.status === 'draft').length,
  translationFiles: countFiles('translation', '.md'),
  glossaryTerms: (() => {
    const p = path.join(ROOT, 'glossary', 'glossary.json');
    if (!fs.existsSync(p)) return 0;
    try {
      const g = JSON.parse(fs.readFileSync(p, 'utf8'));
      return Array.isArray(g) ? g.length : (Array.isArray(g.terms) ? g.terms.length : Object.keys(g).length);
    } catch { return 0; }
  })(),
  glossaryOpen: (() => {
    const p = path.join(ROOT, 'glossary', 'glossary.json');
    if (!fs.existsSync(p)) return 0;
    try { return (JSON.parse(fs.readFileSync(p, 'utf8')).terms || []).filter(t => t.status === 'open').length; }
    catch { return 0; }
  })(),
  outline: exists('source/outline.json'),
};

// repair-table sizes, read from the tables themselves
const { REPAIR, UNRESOLVED } = await import('./repair-table.mjs');
const { QOMOLANGMA_REPAIR, QOMOLANGMA_UNRESOLVED } = await import('./secondary-repair-table.mjs');
facts.repairBody = Object.keys(REPAIR).length;
facts.repairSecondary = Object.keys(QOMOLANGMA_REPAIR).length;
facts.unresolved = Object.keys(UNRESOLVED).length + Object.keys(QOMOLANGMA_UNRESOLVED).length;

// ---------- health checks ----------
const CHECKS = [
  { name: 'Line reconstruction (all 978 pages)', cmd: 'node tools/21-verify-lines.mjs', grep: /preserves stream order and content: (\S+)/ },
  { name: 'Genitive agreement', cmd: 'node tools/24-genitive-check.mjs', grep: /agreement: ([\d.]+%)/ },
  { name: 'Illegal Tibetan stacks', cmd: 'node tools/15-apply-repair.mjs', grep: /AFTER\s+repair: (\S+)/ },
  { name: 'Lexicon vs repair table', cmd: 'node tools/19-lexicon-check.mjs', grep: /(none - lexicon agrees[^\n]*)|(\d+ disagreement)/ },
  { name: 'Dropped-stack sweep', cmd: 'node tools/26-final-sweep.mjs', grep: /total suspect stacks across all fonts: (\d+)/ },
];

let checkResults = null;
if (VERIFY) {
  checkResults = [];
  for (const c of CHECKS) {
    process.stderr.write(`  running: ${c.name}...\n`);
    try {
      const out = execSync(c.cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = out.match(c.grep);
      checkResults.push({ ...c, result: m ? (m[1] || m[0]).trim() : 'ran, no match' });
    } catch (e) {
      checkResults.push({ ...c, result: 'FAILED' });
    }
  }
  fs.writeFileSync(path.join(QA, 'last-verify.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), results: checkResults.map(({ name, result }) => ({ name, result })) }, null, 1));
} else if (fs.existsSync(path.join(QA, 'last-verify.json'))) {
  const prev = JSON.parse(fs.readFileSync(path.join(QA, 'last-verify.json'), 'utf8'));
  checkResults = CHECKS.map(c => ({ ...c, result: prev.results.find(r => r.name === c.name)?.result ?? '-' }));
  checkResults.ranAt = prev.ranAt;
}

// ---------- render ----------
const bar = (done, total, width = 24) => {
  if (!total) return '(not yet segmented)';
  const n = Math.round((done / total) * width);
  return '`' + '#'.repeat(n) + '.'.repeat(width - n) + '`' + ` ${done}/${total} (${((100 * done) / total).toFixed(1)}%)`;
};
const icon = s => ({ done: '[x]', in_progress: '[~]', not_started: '[ ]', blocked: '[!]' }[s] ?? '[ ]');

const L = [];
L.push('# Translation Progress');
L.push('');
L.push('> **Generated file — do not hand-edit.** Edit `progress.json`, then run `node tools/30-progress.mjs`.');
L.push('> Every number below is measured from the files on disk, not remembered.');
L.push('');
L.push(`**${state.project}** · target **${state.targetLanguage}** · ${state.scope} · ${state.deliverable}`);
L.push('');
L.push('---');
L.push('');

// --- resume here ---
L.push('## Resume here');
L.push('');
L.push(`**Phase ${state.nextAction.phase} — ${state.phases[state.nextAction.phase].name}**`);
L.push('');
L.push(state.nextAction.summary);
L.push('');
L.push('```');
L.push(state.nextAction.firstCommand);
L.push('```');
if (state.nextAction.notes) { L.push(''); L.push(state.nextAction.notes); }
L.push('');
L.push('Before starting, confirm nothing drifted:');
L.push('');
L.push('```');
L.push('node tools/30-progress.mjs --verify');
L.push('```');
L.push('');

// --- phases ---
L.push('## Phases');
L.push('');
L.push('| | Phase | Status |');
L.push('|---|---|---|');
for (const [n, p] of Object.entries(state.phases)) {
  L.push(`| ${icon(p.status)} | **${n}. ${p.name}** | ${p.status.replace('_', ' ')}${p.verified ? ' · verified' : ''} |`);
}
L.push('');

// --- measured state ---
L.push('## Measured state');
L.push('');
L.push('| Artifact | Value |');
L.push('|---|---|');
L.push(`| Raw glyph pages (audit trail) | ${facts.rawPages} |`);
L.push(`| Clean text pages | ${facts.cleanPages} |`);
L.push(`| \`source/clean/lamrim.txt\` | ${facts.cleanSize ? facts.cleanSize + ' MB' : 'missing'} |`);
L.push(`| Repair entries (body font) | ${facts.repairBody} |`);
L.push(`| Repair entries (secondary fonts) | ${facts.repairSecondary} |`);
L.push(`| CIDs deliberately left unrepaired | ${facts.unresolved} |`);
L.push(`| sa-bcad outline built | ${facts.outline ? 'yes' : 'no'} |`);
L.push(`| Glossary terms | ${facts.glossaryTerms}${facts.glossaryOpen ? ` (**${facts.glossaryOpen} still \`open\`** — settle before translating)` : ''} |`);
L.push(`| Translation files written | ${facts.translationFiles} |`);
L.push('');

// --- translation progress ---
L.push('## Translation progress');
L.push('');
L.push(`Translated: ${bar(facts.chunksTranslated, facts.chunksTotal)}`);
L.push('');
L.push(`Reviewed:   ${bar(facts.chunksReviewed, facts.chunksTotal)}`);
L.push('');
if (facts.chunksDraft) {
  L.push(`**${facts.chunksDraft} chunk(s) are \`draft\`** — a translation file exists but no fidelity check was ever`);
  L.push('recorded for it, so it does not count as done. They are queued again automatically.');
  L.push('Run `node tools/32-chunk.mjs doctor` for the full reconciliation.');
  L.push('');
}
if (!facts.chunksTotal) {
  L.push('_Chunks are created in Phase 2 from the sa-bcad outline; nothing to track yet._');
} else {
  const pend = state.chunks.filter(c => c.status === 'pending');
  L.push(`Next chunk: **${pend.length ? pend[0].id + ' — ' + (pend[0].section ?? '') : 'none pending'}**`);
  const flagged = state.chunks.filter(c => (c.flags || []).length);
  if (flagged.length) {
    L.push('');
    L.push(`**${flagged.length} chunk(s) carry unresolved flags** — these must be settled before Phase 5 signs off:`);
    for (const c of flagged.slice(0, 15)) L.push(`- \`${c.id}\` — ${(c.flags || []).join('; ')}`);
  }
}
L.push('');

// --- health ---
L.push('## Health checks');
L.push('');
if (checkResults) {
  L.push(checkResults.ranAt ? `_Last run: ${checkResults.ranAt}_ (re-run with \`--verify\`)` : '_Just run._');
  L.push('');
  L.push('| Check | Result | Expected |');
  L.push('|---|---|---|');
  const expect = {
    'Line reconstruction (all 978 pages)': '978/978',
    'Genitive agreement': '~99.9%',
    'Illegal Tibetan stacks': '59 (all Sanskrit)',
    'Lexicon vs repair table': 'no disagreement',
    'Dropped-stack sweep': '11 (all probe false positives)',
  };
  for (const c of checkResults) L.push(`| ${c.name} | ${c.result} | ${expect[c.name] ?? ''} |`);
} else {
  L.push('_Never run. Run `node tools/30-progress.mjs --verify`._');
}
L.push('');

// --- decisions ---
L.push('## Decisions already locked in');
L.push('');
L.push('_Do not relitigate these mid-project without recording why._');
L.push('');
for (const d of state.decisions) L.push(`- ${d}`);
L.push('');

if (state.openQuestions?.length) {
  L.push('## Open questions');
  L.push('');
  for (const q of state.openQuestions) L.push(`- ${q}`);
  L.push('');
}

// --- map ---
L.push('## Where things live');
L.push('');
L.push('| Path | What |');
L.push('|---|---|');
L.push('| `PLAN.md` | The plan. Section 2 has a **superseded** rule marked as such |');
L.push('| `FINDINGS.md` | Extraction diagnosis + every repair decision and its evidence |');
L.push('| `progress.json` | **Editable state.** Source of truth for this file |');
L.push('| `source/raw/glyphs/` | Per-glyph audit trail. **Never edit** |');
L.push('| `source/clean/` | Repaired Tibetan, per page + whole book |');
L.push('| `source/outline.json` | The sa-bcad outline: 284 sections, depth, page ranges |');
L.push('| `tools/repair-table.mjs` | Body-font CID fixes, each with its evidence |');
L.push('| `tools/secondary-repair-table.mjs` | Heading/front-matter font fixes |');
L.push('| `tools/decode.mjs` | **Single decoder** used by every tool — keep it that way |');
L.push('| `data/monlam-lexicon.txt` | 367k-entry Tibetan lexicon (Apache-2.0) |');
L.push('| `glossary/` | bo→vi terminology + decisions log |');
L.push('| `translation/` | The deliverable |');
L.push('| `qa/` | Rendered pages, glyph sheets, check output |');
L.push('');

L.push('## Continuing on another machine');
L.push('');
L.push('Everything needed to carry on translating is in the repo. The 116 MB glyph trail and the');
L.push('PDF are only needed to *re-extract*, not to translate.');
L.push('');
L.push('```');
L.push('git clone <repo> && cd lamrim_translation && npm install');
L.push('node tools/32-chunk.mjs doctor      # reconcile progress.json against translation/');
L.push('node tools/32-chunk.mjs batch 25    # -> args for the lamrim-translate workflow');
L.push('```');
L.push('');
L.push('Run `doctor` first. Each chunk records the hash of the Tibetan it was made from and the');
L.push('hash of the file it produced, so a half-finished batch, a hand-edited file, or a');
L.push('translation whose source moved under it are all detected rather than assumed away.');
L.push('');

L.push('## Rebuilding from scratch');
L.push('');
L.push('If `source/clean/` is ever lost or a repair table changes:');
L.push('');
L.push('```');
L.push('node tools/11-extract-glyphs.mjs   # PDF -> source/raw/glyphs  (only if raw/ is gone)');
L.push('node tools/16-build-text.mjs       # raw + repair tables -> source/clean');
L.push('node tools/30-progress.mjs --verify');
L.push('```');
L.push('');
L.push('To inspect any single page against its render:');
L.push('');
L.push('```');
L.push('node tools/20-compare-page.mjs <page> 3     # prints numbered lines + writes qa/compare/pNNNN.png');
L.push('```');
L.push('');

fs.writeFileSync(path.join(ROOT, 'PROGRESS.md'), L.join('\n'), 'utf8');
console.log(`PROGRESS.md written — phase ${state.nextAction.phase}, ${facts.cleanPages} clean pages, ` +
  `${facts.chunksTranslated}/${facts.chunksTotal} chunks translated`);
