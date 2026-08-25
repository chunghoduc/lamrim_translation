// Chunk state for the Phase 4 translation loop. Edits progress.json, then regenerates
// PROGRESS.md, so status is never hand-maintained.
//
//   node tools/32-chunk.mjs list                     pending / flagged / stale overview
//   node tools/32-chunk.mjs next                     the next pending chunk
//   node tools/32-chunk.mjs batch [n]                next n pending chunks as JSON (workflow args)
//   node tools/32-chunk.mjs show <id>                everything known about one chunk
//   node tools/32-chunk.mjs done <id> ["unsure: X"]  mark translated, stamping the source hash
//   node tools/32-chunk.mjs review <id>              mark reviewed
//   node tools/32-chunk.mjs unflag <id>              clear flags after resolving them
//   node tools/32-chunk.mjs reset <id|--stale|--flagged>   send back to pending, to be redone
//   node tools/32-chunk.mjs stale                    chunks whose Tibetan changed since translation
//   node tools/32-chunk.mjs doctor [--fix]           reconcile progress.json against disk
//
// RESUMING ON ANOTHER MACHINE. Everything needed is in the repo: source/clean (the Tibetan),
// source/outline.json, glossary/, translation/, and progress.json. The raw glyph trail and the
// PDF are NOT needed to translate - only to re-extract. So: clone, `npm install`, then
// `node tools/32-chunk.mjs doctor` and carry on from `batch`.
// Run `doctor` FIRST. A batch that was interrupted leaves translation files that no merge ever
// recorded; doctor marks those `draft` and queues them again rather than letting them pass as
// finished work.
//
// WHY THE SOURCE HASH. source/clean is a reproducible transform of the raw glyphs, and it
// CHANGES whenever a repair-table entry is added - three times so far. A chunk translated
// before such a fix was translated from text that no longer exists. `done` stamps a hash of
// the exact Tibetan that was translated; `stale` finds every chunk whose source has moved
// since. Without it, a repair silently leaves wrong translations behind, and nothing reports it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ROOT, CLEAN } from './config.mjs';

const FILE = path.join(ROOT, 'progress.json');
const state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const [cmd, id, ...rest] = process.argv.slice(2);

const save = () => {
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
  execFileSync(process.execPath, [path.join(ROOT, 'tools', '30-progress.mjs')], { cwd: ROOT, stdio: 'inherit' });
};
const find = (key = id) => {
  const c = state.chunks.find(x => x.id === key);
  if (!c) { console.error(`no chunk "${key}". Known: ${state.chunks.length}`); process.exit(1); }
  return c;
};

// Hash of the exact Tibetan a chunk covers.
const sourceHash = c => {
  let t = '';
  for (let p = c.pages[0]; p <= c.pages[1]; p++) {
    const f = path.join(CLEAN, `p${String(p).padStart(4, '0')}.txt`);
    if (fs.existsSync(f)) t += fs.readFileSync(f, 'utf8');
  }
  return crypto.createHash('sha1').update(t, 'utf8').digest('hex').slice(0, 12);
};
const outPath = c => path.join(ROOT, 'translation', `${c.id}.md`);
const hasFile = c => fs.existsSync(outPath(c));
// Hash of the DELIVERABLE, so a file edited by hand outside the pipeline is visible.
const outputHash = c => hasFile(c)
  ? crypto.createHash('sha1').update(fs.readFileSync(outPath(c), 'utf8'), 'utf8').digest('hex').slice(0, 12)
  : null;
const isStale = c => c.status !== 'pending' && c.sourceHash && c.sourceHash !== sourceHash(c);
const isEdited = c => c.outputHash && hasFile(c) && c.outputHash !== outputHash(c);
const by = s => state.chunks.filter(c => c.status === s);
// Work still to do. A "draft" was written by a batch that never finished verifying it, so it
// is not trustworthy and is queued again alongside untouched chunks.
const todo = () => state.chunks.filter(c => c.status === 'pending' || c.status === 'draft');
const stamp = c => {
  c.sourceHash = sourceHash(c);
  c.outputHash = outputHash(c);
  c.outputBytes = hasFile(c) ? fs.statSync(outPath(c)).size : 0;
};

switch (cmd) {
  case 'list': {
    if (!state.chunks.length) { console.log('no chunks yet - Phase 2 creates them from the sa-bcad outline'); break; }
    const stale = state.chunks.filter(isStale);
    const orphan = state.chunks.filter(c => c.status !== 'pending' && !hasFile(c));
    console.log(`pending ${by('pending').length} | draft ${by('draft').length} | translated ${by('translated').length} | reviewed ${by('reviewed').length}  (of ${state.chunks.length})`);
    if (by('draft').length) console.log(`  ${by('draft').length} draft(s) were written by a batch that never finished verifying them - they are queued again.`);
    if (stale.length) console.log(`\n${stale.length} STALE - the Tibetan changed after they were translated. Re-run them:\n  ${stale.map(c => c.id).join(' ')}`);
    if (orphan.length) console.error(`\n${orphan.length} marked done but have NO translation file:\n  ${orphan.map(c => c.id).join(' ')}`);
    const flagged = state.chunks.filter(c => (c.flags || []).length);
    if (flagged.length) {
      console.log(`\nflagged (${flagged.length}) - must be resolved before Phase 5 sign-off:`);
      for (const c of flagged) console.log(`  ${c.id}  ${c.section ?? ''}\n      ${(c.flags || []).join('\n      ')}`);
    }
    console.log('\nnext pending:', by('pending')[0]?.id ?? '(none)');
    break;
  }
  case 'next': {
    const n = todo()[0];
    console.log(n ? `${n.id}\t${n.section ?? ''}\tpages ${(n.pages || []).join('-')}` : '(none pending)');
    break;
  }
  // Emit the next n pending chunks as the `args.chunks` a translation workflow takes.
  // This is what makes the loop mechanical: batch -> workflow -> merge -> batch again.
  case 'batch': {
    const n = Number(id) || 10;
    const out = todo().slice(0, n).map(c => ({
      id: c.id, kind: c.kind, pages: c.pages, section: c.section,
      sectionPath: c.sectionPath ?? null, part: c.part ?? null,
    }));
    console.log(JSON.stringify({ chunks: out }));
    break;
  }
  case 'show': {
    const c = find();
    console.log(JSON.stringify({ ...c, currentSourceHash: sourceHash(c), stale: isStale(c), hasFile: hasFile(c) }, null, 2));
    break;
  }
  case 'stale': {
    const stale = state.chunks.filter(isStale);
    if (!stale.length) { console.log('no stale chunks - every translation matches the Tibetan it was made from'); break; }
    console.log(`${stale.length} stale chunk(s):`);
    for (const c of stale) console.log(`  ${c.id}  pages ${c.pages.join('-')}  was ${c.sourceHash}, now ${sourceHash(c)}  ${c.section ?? ''}`);
    console.log(`\nsend them back with: node tools/32-chunk.mjs reset --stale`);
    break;
  }
  case 'done': {
    const c = find();
    if (!hasFile(c)) console.error(`warning: translation/${c.id}.md does not exist`);
    c.status = 'translated';
    c.translatedAt = new Date().toISOString().slice(0, 10);
    stamp(c);
    if (rest.length) c.flags = [...(c.flags || []), ...rest];
    save();
    break;
  }

  // Reconcile progress.json against what is actually on disk. This is the command to run
  // FIRST on a machine that did not produce the work - after a clone, or after a batch was
  // interrupted. Nothing about the project's state lives outside the repo, but a workflow
  // that died mid-run leaves translation files that no merge ever recorded, and those must
  // not be mistaken for finished work.
  case 'doctor': {
    const FIX = process.argv.includes('--fix');
    const missing = [], orphan = [], edited = [], stale = [], noHash = [];
    for (const c of state.chunks) {
      if (c.status === 'pending' && hasFile(c)) orphan.push(c);
      else if (c.status !== 'pending' && !hasFile(c)) missing.push(c);
      if (isEdited(c)) edited.push(c);
      if (isStale(c)) stale.push(c);
      if (c.status !== 'pending' && !c.outputHash) noHash.push(c);
    }
    const done = state.chunks.filter(c => c.status !== 'pending' && c.status !== 'draft');
    console.log(`chunks        : ${state.chunks.length}`);
    console.log(`  pending     : ${by('pending').length}`);
    console.log(`  draft       : ${by('draft').length}   (file written, verification not recorded)`);
    console.log(`  translated  : ${by('translated').length}`);
    console.log(`  reviewed    : ${by('reviewed').length}`);
    console.log(`files on disk : ${fs.existsSync(path.join(ROOT, 'translation')) ? fs.readdirSync(path.join(ROOT, 'translation')).filter(f => f.endsWith('.md')).length : 0}`);
    const say = (label, list, hint) => {
      if (!list.length) return;
      console.log(`\n${label} (${list.length}): ${list.map(c => c.id).join(' ')}`);
      if (hint) console.log(`  -> ${hint}`);
    };
    say('DRAFT - written but never merged', orphan,
      FIX ? 'marking them draft now' : 'run with --fix to record them as draft, then re-verify or reset them');
    say('MISSING - marked done but the file is gone', missing, 'reset these and redo them');
    say('EDITED - the file changed since it was recorded', edited, 'expected if you edited by hand; re-stamp with `done <id>`');
    say('STALE - the Tibetan moved after translation', stale, 'reset --stale, then redo');
    say('UNSTAMPED - done before hashes were tracked', noHash, FIX ? 'stamping now' : 'run with --fix to stamp');
    if (!orphan.length && !missing.length && !edited.length && !stale.length && !noHash.length)
      console.log('\nconsistent: every chunk record matches the file on disk.');
    if (FIX) {
      for (const c of orphan) { c.status = 'draft'; stamp(c); }
      for (const c of noHash) stamp(c);
      save();
      console.log(`\nrecorded ${orphan.length} draft(s), stamped ${noHash.length}.`);
    }
    break;
  }
  case 'review': {
    const c = find();
    if (c.status !== 'translated') console.error(`warning: ${id} was "${c.status}", not "translated"`);
    if (isStale(c)) { console.error(`refusing: ${id} is STALE - the Tibetan changed since it was translated. Reset and redo it first.`); process.exit(1); }
    c.status = 'reviewed';
    save();
    break;
  }
  case 'unflag': {
    const c = find();
    c.flags = [];
    save();
    break;
  }
  // Send work back to pending so it gets redone - after a repair-table change, or when a
  // fidelity check rejected it. Keeps the history rather than pretending it never happened.
  case 'reset': {
    let targets;
    if (id === '--stale') targets = state.chunks.filter(isStale);
    else if (id === '--flagged') targets = state.chunks.filter(c => (c.flags || []).length);
    else targets = [find()];
    if (!targets.length) { console.log('nothing to reset'); break; }
    for (const c of targets) {
      c.retranslations = (c.retranslations || 0) + 1;
      c.previousStatus = c.status;
      c.status = 'pending';
      delete c.sourceHash;
    }
    console.log(`reset ${targets.length} chunk(s) to pending: ${targets.map(c => c.id).join(' ')}`);
    save();
    break;
  }
  default:
    console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 12).join('\n').replace(/^\/\/ ?/gm, ''));
}
