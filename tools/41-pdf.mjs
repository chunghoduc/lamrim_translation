// Render lamrim-vi.md to a print-ready PDF.
//
//   node tools/41-pdf.mjs            build lamrim-vi.html then print to lamrim-vi.pdf
//   node tools/41-pdf.mjs --html     stop after the HTML
//
// There is no pandoc/wkhtmltopdf/LaTeX on this machine, and adding a Markdown dependency to
// a project that has five is not worth it for the small syntax subset this document uses:
// headings, paragraphs, blockquotes, emphasis, lists, tables, fences, rules. So the renderer
// is here, deliberately narrow, and the PDF is printed by the Edge that ships with Windows.
//
// THE ONE THING THAT MUST NOT BREAK: verse. Markdown folds consecutive blockquote lines into
// a single paragraph, which would run every śloka together into prose. The whole corpus sets
// one pada per line, so inside a blockquote each source line stays its own line. Prose
// quotations are single long lines (the reflow in tools/36 made them so) and wrap normally -
// the same signal that tool used to tell verse from wrapped prose.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './config.mjs';

const SRC = path.join(ROOT, 'lamrim-vi.md');
const HTML = path.join(ROOT, 'lamrim-vi.html');
const PDF = path.join(ROOT, 'lamrim-vi.pdf');

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Inline: `code`, **bold**, *italic*. Order matters - code first so its content is literal.
function inline(s) {
  const code = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => `\u0000${code.push(c) - 1}\u0000`);
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${esc(code[+i])}</code>`);
  return s;
}

function render(md) {
  const out = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];

    if (!l.trim()) { i++; continue; }

    if (/^```/.test(l)) {                                   // fenced code
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)$/);                 // heading
    if (h) { const n = h[1].length; out.push(`<h${n}>${inline(h[2].trim())}</h${n}>`); i++; continue; }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(l)) { out.push('<hr>'); i++; continue; }

    if (/^\s*>/.test(l)) {                                  // blockquote
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      // Split on the bare '>' separators the corpus uses between quoted paragraphs.
      const runs = []; let cur = [];
      for (const b of buf) { if (!b.trim()) { if (cur.length) runs.push(cur); cur = []; } else cur.push(b); }
      if (cur.length) runs.push(cur);
      const inner = runs.map(r => r.length > 1
        // several lines -> verse. One pada per line, preserved.
        ? `<p class="verse">${r.map(x => inline(x)).join('<br>')}</p>`
        : `<p>${inline(r[0])}</p>`).join('');
      out.push(`<blockquote>${inner}</blockquote>`);
      continue;
    }

    if (/^\s*\|/.test(l)) {                                 // table
      const buf = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) buf.push(lines[i++]);
      const rows = buf.filter(r => !/^\s*\|[\s:|-]+\|\s*$/.test(r))
        .map(r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      const head = rows.shift() || [];
      out.push(`<table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead>`
        + `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }

    if (/^\s*([-*+]\s|\d+[.)]\s)/.test(l)) {                // list
      const ordered = /^\s*\d/.test(l);
      const items = [];
      while (i < lines.length && /^\s*([-*+]\s|\d+[.)]\s)/.test(lines[i])) {
        let item = lines[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, '');
        while (i < lines.length && lines[i].trim() && !/^\s*([-*+]\s|\d+[.)]\s)/.test(lines[i])
               && !/^\s*[>#|]/.test(lines[i])) item += ' ' + lines[i++].trim();
        items.push(`<li>${inline(item)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }

    const buf = [];                                          // paragraph
    while (i < lines.length && lines[i].trim() && !/^\s*[>#|`]/.test(lines[i])
           && !/^\s*([-*+]\s|\d+[.)]\s)/.test(lines[i]) && !/^\s*(---|\*\*\*|___)\s*$/.test(lines[i]))
      buf.push(lines[i++]);
    // Not all verse is in a blockquote. c004's homage stanzas are plain lines, and joining
    // them printed four padas as one running prose sentence in the first PDF. Same test
    // tools/36 uses to tell a hand-broken run from a machine-wrapped one: if every line sits
    // well short of the wrap column, the breaks are the author's and must survive.
    const handBroken = buf.length > 1 && buf.every(x => [...x].length < 76);
    out.push(handBroken
      ? `<p class="verse">${buf.map(x => inline(x)).join('<br>')}</p>`
      : `<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

const md = fs.readFileSync(SRC, 'utf8');
const body = render(md);

// FONT CHOICE IS NOT COSMETIC HERE. Measured by printing a probe page and extracting its
// text back: Cambria shatters Vietnamese into base + combining marks in the PDF's text layer
// ("Vi thi" comes out as V / i-grave / th / e-space), and Georgia breaks the stacked ones.
// Constantia, Times New Roman and Segoe UI all keep the composed characters intact. A
// 663-page reference work whose text layer cannot be searched for "the" is not usable, so
// the stack starts at Constantia and never reaches Cambria.
const css = `
@page { size: A4; margin: 20mm 18mm 22mm 18mm; }
html { font-size: 11.5pt; }
body { font-family: Constantia, "Times New Roman", "Microsoft Himalaya", serif;
       line-height: 1.55; color: #111; text-align: justify; hyphens: none; margin: 0; }
h1,h2,h3,h4,h5,h6 { font-family: Calibri, "Segoe UI", sans-serif; line-height: 1.25;
       color: #1a1a1a; text-align: left; break-after: avoid; page-break-after: avoid; }
h1 { font-size: 1.5rem; margin: 1.6em 0 .7em; padding-bottom: .25em;
     border-bottom: 1.5px solid #999; break-before: page; page-break-before: always; }
h1:first-of-type { break-before: auto; page-break-before: auto; }
h2 { font-size: 1.22rem; margin: 1.5em 0 .55em; }
h3 { font-size: 1.08rem; margin: 1.35em 0 .45em; }
h4 { font-size: 1rem; margin: 1.2em 0 .4em; font-style: italic; font-weight: 600; }
h5,h6 { font-size: .96rem; margin: 1.1em 0 .35em; font-style: italic; font-weight: 500; color: #444; }
p { margin: 0 0 .6em; orphans: 2; widows: 2; }
blockquote { margin: .9em 0 .9em 1.4em; padding-left: 1em; border-left: 2px solid #bbb;
             color: #262626; break-inside: avoid-page; }
blockquote p { margin: 0 0 .5em; }
/* Verse: one pada per line, never justified - justification stretches short lines apart. */
p.verse { text-align: left; text-indent: -1.2em; padding-left: 1.2em;
             line-height: 1.45; }
em { font-style: italic; }
/* The front matter carries the edition's apparatus criticus in Tibetan (variant readings
   marked *བསྒྲུབས), so the Tibetan face has to be in the stack or those lines print as
   tofu. Microsoft Himalaya ships with Windows; Jomolhari/Kailasa are the usual fallbacks. */
code, .bo { font-family: "Microsoft Himalaya", Jomolhari, Kailasa, "Noto Serif Tibetan",
       Consolas, "Courier New", monospace; }
code { font-size: .85em;
       background: #f2f2f2; padding: .05em .3em; border-radius: 2px; }
pre { background: #f6f6f6; border: 1px solid #ddd; padding: .6em .8em; overflow-wrap: anywhere;
      white-space: pre-wrap; font-size: .82rem; break-inside: avoid; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; margin: .8em 0; font-size: .92rem; width: 100%; }
th,td { border: 1px solid #bbb; padding: .35em .55em; text-align: left; vertical-align: top; }
th { background: #eee; }
ul,ol { margin: 0 0 .6em 1.3em; padding: 0; }
li { margin: 0 0 .25em; }
hr { border: none; border-top: 1px solid #bbb; margin: 2em 0; break-before: page; page-break-before: always; }
`;

const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<title>Bồ-đề Đạo Thứ Đệ Quảng Luận</title>
<style>${css}</style></head><body>
${body}
</body></html>`;

fs.writeFileSync(HTML, html, 'utf8');
console.log(`html : ${(html.length / 1024 / 1024).toFixed(1)} MB -> ${HTML}`);

if (process.argv.includes('--html')) process.exit(0);

const browsers = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const exe = browsers.find(b => fs.existsSync(b));
if (!exe) { console.error('no Edge or Chrome found to print with'); process.exit(1); }

console.log(`printing with ${path.basename(exe)} ... (a 1000-page book takes a few minutes)`);
// Two flags are load-bearing and were not obvious: without --user-data-dir Edge silently
// writes nothing when the default profile is already open (it exits 0, so the failure looks
// like success), and without a large --virtual-time-budget it prints before a 1.6 MB page
// has finished laying out, truncating the book.
const profile = path.join(process.env.TEMP || process.env.TMP || '.', `edge-pdf-${process.pid}`);
execFileSync(exe, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--user-data-dir=${profile}`,
  '--virtual-time-budget=600000',
  '--run-all-compositor-stages-before-draw',
  '--no-pdf-header-footer',
  `--print-to-pdf=${PDF}`,
  'file:///' + HTML.replace(/\\/g, '/'),
], { stdio: 'inherit', timeout: 20 * 60 * 1000 });
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
if (!fs.existsSync(PDF)) { console.error('the browser exited without writing a PDF'); process.exit(1); }

const kb = fs.statSync(PDF).size / 1024;
console.log(`pdf  : ${(kb / 1024).toFixed(1)} MB -> ${PDF}`);
