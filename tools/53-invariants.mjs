// One command for the invariants table in RESTYLE-PLAN.md. Run it after every restyle batch.
//
//   node tools/53-invariants.mjs                  run every check, PASS/FAIL per line
//   node tools/53-invariants.mjs --baseline       freeze the current counters as the baseline
//
// WHY A BASELINE. Four of the corpus findings are pre-existing and are not this pass's job:
// 3 heading level jumps, 1 repeated heading, 9 hanging paragraphs, 204 headwords carrying
// conflicting renderings. "No new findings" is only a checkable statement against a recorded
// number, and without one the temptation is to eyeball the summary and call it unchanged.
// A counter that goes UP fails. A counter that goes down is reported and is good news.
//
// Nothing here writes to the corpus: every check is read-only, and `--check` is passed to the
// assembler so a run cannot quietly regenerate the deliverable.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './config.mjs';

const BASELINE = path.join(ROOT, 'invariants-baseline.json');

const run = (tool, ...args) => {
  try {
    return execFileSync(process.execPath, [path.join(ROOT, 'tools', tool), ...args],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    // A non-zero exit still carries the output we need to report on.
    return (e.stdout || '') + (e.stderr || '');
  }
};

const num = (s, re) => { const m = s.match(re); return m ? Number(m[1]) : null; };

console.log('running checks...\n');
const doctor = run('32-chunk.mjs', 'doctor');
const stale = run('32-chunk.mjs', 'stale');
const pages = run('43-pages.mjs', 'check');
const asm = run('39-assemble.mjs', '--check');
const vt = run('40-verify-text.mjs');

// Counters that must hold exactly.
const hard = [
  ['chunk records match files on disk', /consistent: every chunk record matches/.test(doctor)],
  ['no chunk drifted from its Tibetan', /no stale chunks/.test(stale)],
  ['page boundaries all accounted for', num(pages, /page boundaries : (\d+)/) === 965],
  ['  none pending', num(pages, /pending\s+: (\d+)/) === 0],
  ['  every locator still matches', /all placed anchors still match/.test(pages)],
  ['assembly: 965 markers placed', num(asm, /page markers\s+: (\d+) placed/) === 965],
  ['assembly: no leftover markers', num(asm, /leftover markers\s+: (\d+)/) === 0],
  ['assembly: content check OK', /content check\s+: OK/.test(asm)],
  ['no southern spellings', num(vt, /southern spellings \(sanh\/phước\)\s+(\d+)/) === 0],
];

// Counters compared against the baseline: lower or equal passes.
const counters = {
  headingLevelJumps: num(vt, /(\d+) heading level jump/) ?? 0,
  headingsRepeated: num(vt, /(\d+) heading\(s\) repeated/) ?? 0,
  hangingParagraphs: num(vt, /(\d+) prose paragraph\(s\) end without/) ?? 0,
  conflictingHeadwords: num(vt, /(\d+) headword\(s\) carry conflicting/) ?? 0,
  assemblyAnomalies: num(asm, /anomalies\s+: (\d+)/) ?? 0,
  stutteringWelds: num(asm, /welds that stutter: (\d+)/) ?? 0,
};

if (process.argv.includes('--baseline')) {
  fs.writeFileSync(BASELINE, JSON.stringify({
    frozenAt: new Date().toISOString().slice(0, 10),
    note: 'Pre-existing findings that the restyle pass is not responsible for. A counter above these fails; below is an improvement.',
    counters,
  }, null, 2) + '\n', 'utf8');
  console.log('baseline written to invariants-baseline.json:');
  for (const [k, v] of Object.entries(counters)) console.log(`  ${k.padEnd(22)} ${v}`);
  process.exit(0);
}

let failed = 0;
for (const [label, ok] of hard) {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}`);
  if (!ok) failed++;
}

if (!fs.existsSync(BASELINE)) {
  console.log('\nno baseline recorded - run with --baseline once on a known-good tree.');
  for (const [k, v] of Object.entries(counters)) console.log(`   ?    ${k.padEnd(22)} ${v}`);
} else {
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).counters;
  console.log('');
  for (const [k, v] of Object.entries(counters)) {
    const b = base[k] ?? 0;
    const verdict = v > b ? 'FAIL' : v < b ? 'BETTER' : 'PASS';
    if (v > b) failed++;
    console.log(`  ${verdict.padEnd(6)}${k.padEnd(22)} ${v}${v === b ? '' : `  (baseline ${b})`}`);
  }
}

console.log(failed ? `\n${failed} INVARIANT(S) BROKEN - stop and find out why before continuing.`
  : '\nall invariants hold.');
process.exit(failed ? 1 : 0);
