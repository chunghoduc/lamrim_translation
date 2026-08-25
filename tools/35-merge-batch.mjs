// Phase 4, batch mode: fold a translation batch's results back into the project.
//
//   node tools/35-merge-batch.mjs <results.json>            dry run
//   node tools/35-merge-batch.mjs <results.json> --write    apply
//
// The translating agents write translation/<id>.md themselves - one file each, so they
// never collide. Everything SHARED (glossary.json, progress.json) is merged here, in one
// process, because concurrent writers would silently lose entries.
//
// A chunk is only marked translated if its fidelity check came back clean. Anything the
// checker flagged as fabrication, omission or glossary violation stays PENDING and is
// listed for repair - the point of the check is that it can hold work back.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ROOT, CLEAN } from './config.mjs';

// Same hash tools/32 stamps, so `stale` can compare like with like.
const sourceHash = c => {
  let t = '';
  for (let p = c.pages[0]; p <= c.pages[1]; p++) {
    const f = path.join(CLEAN, `p${String(p).padStart(4, '0')}.txt`);
    if (fs.existsSync(f)) t += fs.readFileSync(f, 'utf8');
  }
  return crypto.createHash('sha1').update(t, 'utf8').digest('hex').slice(0, 12);
};

const WRITE = process.argv.includes('--write');
const runIx = process.argv.indexOf('--run');
const runId = runIx >= 0 ? process.argv[runIx + 1] : null;
const file = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
if (!file && !runId) {
  console.error('usage: node tools/35-merge-batch.mjs <results.json> [--write]');
  console.error('       node tools/35-merge-batch.mjs --run <wf_runId> [--write]');
  process.exit(1);
}

// Read a workflow run's results straight out of its journal, so the loop needs no
// hand-copying of JSON out of a tool result. One {"type":"result"} line per agent.
function fromJournal(id) {
  const base = path.join(process.env.USERPROFILE || process.env.HOME, '.claude', 'projects');
  const hits = [];
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      if (e.name === id) { const j = path.join(dir, e.name, 'journal.jsonl'); if (fs.existsSync(j)) hits.push(j); }
      else walk(path.join(dir, e.name), depth + 1);
    }
  };
  walk(base, 0);
  if (!hits.length) { console.error(`no journal found for run ${id}`); process.exit(1); }

  const translate = new Map(), verify = new Map(), repair = new Map();
  for (const line of fs.readFileSync(hits[0], 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.type !== 'result' || !o.result || typeof o.result !== 'object') continue;
    const r = o.result;
    if (!r.chunkId) continue;
    if (r.resolved !== undefined) repair.set(r.chunkId, r);
    else if (r.verdict !== undefined) verify.set(r.chunkId, r);
    else translate.set(r.chunkId, r);
  }

  // A chunk passes if verification was clean, or repair resolved it.
  const ids = [...new Set([...translate.keys(), ...verify.keys(), ...repair.keys()])];
  const passed = ids.filter(id2 => verify.get(id2)?.verdict === 'clean' || repair.get(id2)?.resolved);
  const failed = ids.filter(id2 => !passed.includes(id2));
  return {
    attempted: ids.length, completed: ids.length,
    clean: passed,
    needsFix: failed.map(id2 => ({
      id: id2,
      fabrications: verify.get(id2)?.fabrications || [],
      omissions: verify.get(id2)?.omissions || [],
      glossaryViolations: verify.get(id2)?.glossaryViolations || [],
      repairNotes: repair.get(id2)?.remaining || [],
    })),
    newTerms: ids.flatMap(id2 => (translate.get(id2)?.newTerms || []).concat(repair.get(id2)?.glossaryGaps || [])),
    flags: ids.flatMap(id2 => (translate.get(id2)?.flags || []).map(f => ({ id: id2, flag: f }))),
  };
}

const res = runId ? fromJournal(runId) : JSON.parse(fs.readFileSync(file, 'utf8'));
if (runId) console.log(`read run ${runId}: ${res.attempted} chunk(s)\n`);
const gPath = path.join(ROOT, 'glossary', 'glossary.json');
const sPath = path.join(ROOT, 'progress.json');
const glossary = JSON.parse(fs.readFileSync(gPath, 'utf8'));
const state = JSON.parse(fs.readFileSync(sPath, 'utf8'));

const clean = res.clean || [];
const needsFix = res.needsFix || [];
const flagsBy = new Map();
for (const f of res.flags || []) {
  if (!flagsBy.has(f.id)) flagsBy.set(f.id, []);
  flagsBy.get(f.id).push(f.flag);
}

// ---- 1. the translation files must actually exist ----
const missing = [];
for (const id of clean) if (!fs.existsSync(path.join(ROOT, 'translation', `${id}.md`))) missing.push(id);
if (missing.length) console.error(`  !! ${missing.length} chunk(s) reported clean but have no translation file: ${missing.join(' ')}`);
const ok = clean.filter(id => !missing.includes(id));

// ---- 2. glossary ----
const have = new Set(glossary.terms.map(t => t.bo));
const added = [], conflicts = [];
for (const t of res.newTerms || []) {
  if (!t || !t.bo || !t.vi) continue;
  const existing = glossary.terms.find(x => x.bo === t.bo);
  if (existing) {
    // A term already fixed must not be quietly re-decided.
    if (existing.vi !== t.vi && existing.status !== 'open') conflicts.push({ bo: t.bo, was: existing.vi, now: t.vi });
    continue;
  }
  if (have.has(t.bo)) continue;
  have.add(t.bo);
  added.push({ bo: t.bo, ...(t.skt ? { skt: t.skt } : {}), vi: t.vi, status: 'provisional',
    ...(t.kind ? { kind: t.kind } : {}), ...(t.note ? { note: t.note } : {}), firstSeen: t.firstSeen || 'batch' });
}

console.log(`chunks reported clean : ${clean.length}`);
console.log(`chunks needing repair : ${needsFix.length}`);
console.log(`new glossary terms    : ${added.length}`);
console.log(`uncertainty flags     : ${(res.flags || []).length}`);
if (conflicts.length) {
  console.error(`\n  !! ${conflicts.length} term(s) a chunk rendered differently from the settled glossary - NOT applied:`);
  for (const c of conflicts) console.error(`     ${c.bo}: glossary "${c.was}" vs chunk "${c.now}"`);
}
if (needsFix.length) {
  console.log('\nheld back for repair:');
  for (const n of needsFix) {
    console.log(`  ${n.id}`);
    for (const f of n.fabrications || []) console.log(`     fabrication: ${f}`);
    for (const o of n.omissions || []) console.log(`     omission   : ${o}`);
    for (const g of n.glossaryViolations || []) console.log(`     glossary   : ${g}`);
  }
}
if (added.length) {
  console.log('\nnew terms:');
  for (const t of added) console.log(`  ${t.bo}  ->  ${t.vi}${t.kind ? `  (${t.kind})` : ''}`);
}

if (!WRITE) { console.log('\ndry run - pass --write to apply'); process.exit(0); }

glossary.terms.push(...added);
fs.writeFileSync(gPath, JSON.stringify(glossary, null, 2) + '\n', 'utf8');

let marked = 0;
const fixBy = new Map(needsFix.map(n => [n.id, n]));
for (const c of state.chunks) {
  // Record the verifier's verdict on every chunk it looked at, pass or fail, so a rejected
  // chunk carries the reason it was rejected instead of just going quiet.
  const bad = fixBy.get(c.id);
  if (bad) {
    c.verify = { verdict: 'needs-fix', fabrications: bad.fabrications || [], omissions: bad.omissions || [], glossaryViolations: bad.glossaryViolations || [] };
    continue;                       // stays pending
  }
  if (!ok.includes(c.id)) continue;
  const outFile = path.join(ROOT, 'translation', `${c.id}.md`);
  c.status = 'translated';
  c.translatedAt = new Date().toISOString().slice(0, 10);
  c.sourceHash = sourceHash(c);     // so tools/32 can spot it going stale after a repair
  // Provenance of the deliverable itself, so another machine can tell whether the file it
  // has is the file this record describes.
  c.outputHash = crypto.createHash('sha1').update(fs.readFileSync(outFile, 'utf8'), 'utf8').digest('hex').slice(0, 12);
  c.outputBytes = fs.statSync(outFile).size;
  if (runId) c.runId = runId;
  c.verify = { verdict: 'clean' };
  const f = flagsBy.get(c.id) || [];
  if (f.length) c.flags = [...(c.flags || []), ...f];
  marked++;
}
fs.writeFileSync(sPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
execFileSync(process.execPath, [path.join(ROOT, 'tools', '30-progress.mjs')], { cwd: ROOT, stdio: 'inherit' });
console.log(`\nmarked ${marked} chunk(s) translated, added ${added.length} glossary term(s)`);
if (needsFix.length) console.log(`${needsFix.length} chunk(s) left PENDING for repair.`);
