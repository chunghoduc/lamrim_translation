// Update chunk state in progress.json without hand-editing JSON, then regenerate
// PROGRESS.md. Used during the Phase 4 translation loop.
//
//   node tools/32-chunk.mjs list                      show pending / flagged
//   node tools/32-chunk.mjs next                      print the next pending chunk id
//   node tools/32-chunk.mjs done c003                 mark translated
//   node tools/32-chunk.mjs done c003 "unsure: X"     mark translated, carrying a flag
//   node tools/32-chunk.mjs review c003               mark reviewed (clears nothing)
//   node tools/32-chunk.mjs unflag c003               clear flags after resolving them
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './config.mjs';

const FILE = path.join(ROOT, 'progress.json');
const state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const [cmd, id, ...rest] = process.argv.slice(2);

const save = () => {
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
  execFileSync(process.execPath, [path.join(ROOT, 'tools', '30-progress.mjs')], { cwd: ROOT, stdio: 'inherit' });
};
const find = () => {
  const c = state.chunks.find(x => x.id === id);
  if (!c) { console.error(`no chunk "${id}". Known: ${state.chunks.length}`); process.exit(1); }
  return c;
};

switch (cmd) {
  case 'list': {
    if (!state.chunks.length) { console.log('no chunks yet - Phase 2 creates them from the sa-bcad outline'); break; }
    const by = s => state.chunks.filter(c => c.status === s);
    console.log(`pending ${by('pending').length} | translated ${by('translated').length} | reviewed ${by('reviewed').length}`);
    const flagged = state.chunks.filter(c => (c.flags || []).length);
    if (flagged.length) {
      console.log(`\nflagged (${flagged.length}) - must be resolved before Phase 5 sign-off:`);
      for (const c of flagged) console.log(`  ${c.id}  ${c.section ?? ''}\n      ${(c.flags || []).join('\n      ')}`);
    }
    console.log('\nnext pending:', by('pending')[0]?.id ?? '(none)');
    break;
  }
  case 'next': {
    const n = state.chunks.find(c => c.status === 'pending');
    console.log(n ? `${n.id}\t${n.section ?? ''}\tpages ${(n.pages || []).join('-')}` : '(none pending)');
    break;
  }
  case 'done': {
    const c = find();
    c.status = 'translated';
    c.translatedAt = new Date().toISOString().slice(0, 10);
    if (rest.length) c.flags = [...(c.flags || []), ...rest];
    save();
    break;
  }
  case 'review': {
    const c = find();
    if (c.status !== 'translated') console.error(`warning: ${id} was "${c.status}", not "translated"`);
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
  default:
    console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 10).join('\n').replace(/^\/\/ ?/gm, ''));
}
