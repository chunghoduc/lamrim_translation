// Assemble the 292 chunk files into one continuous reading text.
//
//   node tools/39-assemble.mjs --check    report seams and anomalies, write nothing
//   node tools/39-assemble.mjs --write    write lamrim-vi.md
//
// The chunk files carry scaffolding that exists only because the book was translated in
// 292 pieces: a YAML front-matter block per file, and a pair of markers at every cut where
// a sentence runs across the boundary -
//
//     ...sẽ sinh khởi;            <- end of c043
//     *(tiếp sang chunk sau.)*
//     *(…tiếp theo:)* …nỗi khổ    <- start of c044
//
// Those two fragments are ONE sentence. Stripping the markers is not enough: the halves
// must be joined into a single paragraph, or the reader gets a paragraph break in the
// middle of a clause. The leading "…" is part of the marker, not the text.
//
// The pairing is checked, not assumed. Every closing marker must be answered by an opening
// marker on the next chunk and vice versa; a mismatch means a sentence would be silently
// welded to the wrong neighbour or left broken, so it is reported and never guessed at.
// Measured over the corpus: 264 closing markers, 264 opening markers, 27 clean boundaries.
//
// What is deliberately KEPT:
//   - the sa-bcad headings. They are the book's own structure, not chunk scaffolding.
//   - the *(tồn nghi: ...)* notes. Those are the translator's honest uncertainty flags,
//     which this project treats as content: an honest flag is a good outcome, and silently
//     deleting them from the reading text would hide exactly what the reader should know.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.mjs';

const WRITE = process.argv.includes('--write');
if (!WRITE && !process.argv.includes('--check')) {
  console.error('usage: node tools/39-assemble.mjs --check | --write');
  process.exit(1);
}

const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'progress.json'), 'utf8'));
const chunks = state.chunks.slice().sort((a, b) => a.id.localeCompare(b.id));

// PAGE MARKERS. Where each page of the Sera Jey edition begins, from tools/43-pages.mjs.
// They are injected HERE and stored nowhere in translation/*.md, so the chunk files keep
// their hashes and the verse ledger does not go stale. A marker whose locator no longer
// matches its chunk is reported, never approximated — see the header of tools/43.
const ANCHORS = path.join(ROOT, 'page-anchors.json');
const anchors = fs.existsSync(ANCHORS) ? JSON.parse(fs.readFileSync(ANCHORS, 'utf8')).anchors : [];
// Unnumbered front matter (pdf 1–7) carries no folio in the original either, so it gets the
// pdf page behind an asterisk rather than a folio number this edition does not print.
const label = a => (a.printed === null || a.printed === undefined) ? `【*${a.pdf}】` : `【${a.printed}】`;
const marks = { placed: 0, skipped: [] };
// The page markers are the one thing this assembly ADDS to the text. The stutter check and
// the content check both remove them again, so those still compare translation against
// translation — otherwise every marker would read as inserted text and prove nothing.
const MARK_G = /【\*?\d+】/g;

// Put a marker at `at` without breaking the block it lands in. A heading takes the marker on
// its own line above it; a quoted line takes it after the "> ", or the quotation would be
// split in two; everything else takes it inline, which is what a mid-sentence page turn is.
function inject(body, at, mark) {
  const nl = body.lastIndexOf('\n', at - 1) + 1;
  if (nl === at) {
    const end = body.indexOf('\n', at);
    const line = body.slice(at, end === -1 ? undefined : end);
    if (/^\s*#/.test(line)) return body.slice(0, at) + mark + '\n\n' + body.slice(at);
    const q = line.match(/^(\s*>\s?)/);
    if (q) return body.slice(0, at + q[1].length) + mark + body.slice(at + q[1].length);
    const b = line.match(/^(\s*(?:[-*+]|\d+[.)])\s+)/);
    if (b) return body.slice(0, at + b[1].length) + mark + body.slice(at + b[1].length);
  }
  return body.slice(0, at) + mark + body.slice(at);
}

// Every placed anchor for one chunk, applied back to front so earlier offsets stay valid.
function markPages(id, body) {
  const mine = anchors.filter(a => a.chunk === id && a.status !== 'pending')
    .sort((x, y) => x.pdf - y.pdf);
  const points = [];
  for (const a of mine) {
    if (a.kind === 'chunk-start') { points.push({ a, at: 0 }); continue; }
    // A locator may carry its insertion point as "⟪⟫" when the phrase after the point is not
    // itself unique — the formulaic sutra passages repeat verbatim. tools/43 owns that form.
    const lit = a.locator.split('⟪⟫').join(''), off = Math.max(0, a.locator.indexOf('⟪⟫'));
    const n = body.split(lit).length - 1;
    if (n !== 1) { marks.skipped.push(`p${a.pdf} (${id}): locator ${n === 0 ? 'not found' : 'not unique'}`); continue; }
    points.push({ a, at: body.indexOf(lit) + off });
  }
  for (const p of points.sort((x, y) => y.at - x.at)) { body = inject(body, p.at, label(p.a)); marks.placed++; }
  return body;
}

// "*(tiếp sang chunk sau.)*" / "*(tiếp sang c044.)*" and the one file that words it as
// "*(Câu cuối tiếp tục sang trang sau — xem c005.)*". Missing that variant would have left
// the marker sitting in the finished text.
const CLOSE = /\n*\*\([^)]*(?:tiếp sang|tiếp tục sang)[^)]*\)\*\s*$/;
// "*(…tiếp theo:)* …" / "*(…tiếp theo c114, phần thân của mục "...":)* …". Three chunks
// carry it INSIDE a blockquote ("> *(…tiếp theo:)* …"), because the cut fell in the middle
// of a quoted passage, so the leading "> " has to be tolerated here.
const OPEN = /^(\s*>\s?)?\*\(\s*[….]*\s*tiếp theo[^)]*\)\*\s*[….]*\s*/;

// Join two fragments of one sentence. The join is at LINE level, not paragraph level: a
// newline between them would put a paragraph break inside a clause. When both sides are
// blockquote lines the incoming "> " must go, or the marker of the quote lands mid-sentence.
function weld(prev, next) {
  const p = prev.split('\n');
  const n = next.split('\n');
  let pLast = p[p.length - 1];
  let nFirst = n[0];
  const pQ = /^\s*>/.test(pLast), nQ = /^\s*>/.test(nFirst);
  // Different block kinds are NOT one clause running on. This is the cut falling between a
  // lead-in ("...cũng nói:") and the quotation it introduces; welding them onto one line
  // would drop a "> " into the middle of a sentence. Keep them as separate blocks.
  if (pQ !== nQ) return prev + '\n\n' + next;
  if (pQ && nQ) nFirst = nFirst.replace(/^\s*>\s?/, '');
  nFirst = nFirst.replace(/^\s+/, '');
  // Where the marker sat on its own line the continuation ellipsis survives on the text
  // line, and welding then yields "mong cầu… …thì không có". Drop one ONLY when both sides
  // carry it: a doubled ellipsis is certainly an artifact of the cut, while a single one may
  // be a real elision inside a quotation and is left alone.
  if (/…\s*$/.test(pLast) && /^…/.test(nFirst)) nFirst = nFirst.replace(/^…\s*/, '');
  p[p.length - 1] = pLast.replace(/\s*$/, '') + ' ' + nFirst;
  return p.concat(n.slice(1)).join('\n');
}

const parts = [];
const anomalies = [];
const overlaps = [];

// Longest suffix of `prev` that is also a prefix of `next`, ignoring whitespace and the
// quote markers. Only reported above a length where coincidence is implausible.
function overlap(prev, next) {
  const norm = s => s.replace(/^\s*>\s?/gm, '').replace(MARK_G, '').replace(/\s+/g, ' ').trim();
  const a = norm(prev), b = norm(next);
  const max = Math.min(a.length, b.length, 300);
  for (let n = max; n >= 25; n--) if (a.slice(-n) === b.slice(0, n)) return b.slice(0, n);
  return null;
}
let joined = 0, clean = 0;
let prevOpen = false;   // did the previous chunk end with a closing marker?

for (let i = 0; i < chunks.length; i++) {
  const c = chunks[i];
  const file = path.join(ROOT, 'translation', `${c.id}.md`);
  if (!fs.existsSync(file)) { anomalies.push(`${c.id}: file missing`); continue; }
  let t = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

  // front matter
  t = t.replace(/^---\n[\s\S]*?\n---\n/, '');
  t = t.trim();

  const hasOpen = OPEN.test(t);
  if (hasOpen) t = t.replace(OPEN, '');
  const hasClose = CLOSE.test(t);
  if (hasClose) t = t.replace(CLOSE, '');
  t = t.trim();
  t = markPages(c.id, t);

  // Pairing check: a fragment must be answered on both sides, or the join is a guess.
  if (hasOpen && !prevOpen) anomalies.push(`${c.id}: opens as a continuation but ${chunks[i - 1]?.id || '(none)'} did not close as one`);
  if (!hasOpen && prevOpen) anomalies.push(`${c.id}: does not open as a continuation but ${chunks[i - 1]?.id} closed as one`);

  if (hasOpen && prevOpen && parts.length) {
    // A weld can expose a real defect in the translation: where the cut fell, the second
    // chunk sometimes RESTATES the clause instead of continuing it, so joining stutters.
    // Detect the overlap and report it - do not silently drop either copy. Choosing which
    // half to delete is editing the translation, which is not this tool's job.
    const ov = overlap(parts[parts.length - 1], t);
    if (ov) overlaps.push(`${chunks[i - 1].id} -> ${c.id}: repeats ${ov.length} chars — "${ov.slice(0, 70)}"`);
    parts[parts.length - 1] = weld(parts[parts.length - 1], t);
    joined++;
  } else {
    if (parts.length) clean++;
    parts.push(t);
  }
  prevOpen = hasClose;
}
if (prevOpen) anomalies.push('the last chunk closes as a continuation with nothing to follow');

// The appendix is GENERATED, not hand-written into lamrim-vi.md, because this tool
// overwrites that file on every run - an appendix appended by hand would vanish on the next
// assembly. Every number in it is measured here rather than typed, so it cannot drift.
function appendix() {
  const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'glossary', 'glossary.json'), 'utf8'));
  const bound = g.terms.filter(t => t.status === 'fixed' || t.status === 'fixed-set').length;
  const prov = g.terms.filter(t => t.status === 'provisional').length;
  const flags = state.chunks.reduce((a, c) => a + (c.flags || []).length, 0);
  const flagged = state.chunks.filter(c => (c.flags || []).length).length;
  const inline = (body.match(/tồn nghi:/g) || []).length;
  const headOf = t => String(t.bo || '').split(/\s*\(/)[0].trim();
  const byHead = new Map();
  for (const t of g.terms) { const h = headOf(t); if (!h) continue; if (!byHead.has(h)) byHead.set(h, new Set()); byHead.get(h).add(t.viVariants ? t.viVariants.join('|') : t.vi); }
  const conflicting = [...byHead.values()].filter(v => v.size > 1).length;
  const noVerify = state.chunks.filter(c => c.status === 'translated' && !c.verify).map(c => c.id);
  const placedNow = anchors.filter(a => a.status !== 'pending').length;

  return `

---

# Phụ lục

*Phần này do công cụ sinh ra từ dữ liệu của dự án; mọi con số đều được đo, không gõ tay.*

## A. Quy ước trong bản dịch

- **\`[ ]\` — chữ trong ngoặc vuông** là do người dịch bổ sung để câu tiếng Việt đọc được.
  Tạng văn **không có** những chữ ấy. Đây là quy ước quan trọng nhất của bản dịch: người đọc
  luôn phân biệt được đâu là lời bản văn, đâu là chỗ tiếng Việt buộc phải thêm.
- **\`【22】\` — số trang của bản gốc.** Dấu này đặt đúng tại chỗ **trang 22 của ấn bản Sera
  Jey bắt đầu**; chữ đứng sau dấu là chữ đầu trang ấy. Vì trang trong Tạng văn thường sang
  trang giữa câu, dấu nằm ngay giữa câu tiếng Việt là bình thường — đó chính là chỗ ngắt
  thật. Số trong dấu là **số trang in trên sách**; \`【*5】\` là các trang bìa và trang bản
  quyền (bản gốc không đánh số), lấy theo số trang PDF.
  Hiện đã đánh dấu **${placedNow}/${anchors.length}** trang: ${anchors.filter(a => a.kind === 'chunk-start').length} chỗ suy ra được chính xác từ ranh giới đoạn dịch,
  ${anchors.filter(a => a.status === 'placed').length} chỗ được đối chiếu Tạng văn để định vị. Chỗ chưa đánh dấu thì **bỏ trống**
  chứ không ước lượng — xem \`node tools/43-pages.mjs list\`.
- **Đoạn thụt lề (\`>\`)** là kinh, luận được trích dẫn. Kệ tụng giữ mỗi dòng một *pāda*
  đúng theo cách ngắt của Tạng văn.
- **\`*(tồn nghi: …)*\`** là chỗ người dịch không quyết được — xem mục B.
- **Chính tả theo phương ngữ Bắc**: *sinh* (không *sanh*), *phúc đức* (không *phước đức*).
- Trang 8–20 của bản gốc là **mục lục** (*dkar chag*) nên không dịch; toàn bộ 965 trang
  chính văn còn lại đều có mặt.

## B. Về các ghi chú tồn nghi

Nguyên tắc của dự án: **thà nêu nghi vấn còn hơn đoán cho trơn tru**. Một bản dịch trôi
chảy mà sai lệch với bản gốc thì tệ hơn là không dịch, vì cái sai trở nên vô hình đối với
người đọc. Cho nên chỗ nào Tạng văn không quyết được, người dịch phải nói ra chứ không được
san bằng.

- **${inline}** ghi chú nằm ngay trong chính văn, dạng \`*(tồn nghi: …)*\`.
- **${flags}** ghi chú khác được lưu theo từng đoạn, trải trên **${flagged}/${state.chunks.length}** đoạn.
  Chúng **chưa** được đưa vào bản đọc này.

Cách tra ghi chú của một đoạn:

\`\`\`
node tools/32-chunk.mjs show c123
\`\`\`

Toàn bộ danh sách nằm trong \`progress.json\` và được tóm tắt trong \`PROGRESS.md\`.

## C. Về bảng thuật ngữ

**Bảng thuật ngữ không in kèm trong bản dịch này.** Nó là một tập dữ liệu sống, còn đang
được bổ sung và sửa đổi; in kèm sẽ đóng băng một trạng thái nhất thời và mâu thuẫn với
chính nó sau vài lần cập nhật. Nguồn chuẩn duy nhất:

| Tệp | Nội dung |
|---|---|
| \`glossary/glossary.json\` | **${g.terms.length}** mục: Tạng ngữ, Phạn ngữ, tiếng Việt, và lý do chọn |
| \`glossary/decisions.md\` | Các quyết định về thuật ngữ và văn phong, kèm lập luận |

Trong đó **${bound}** mục có trạng thái \`fixed\` / \`fixed-set\` — bắt buộc, không được dịch
khác; **${prov}** mục còn ở trạng thái \`provisional\` — đã dùng nhất quán nhưng chưa chốt.

Tra một chữ Tạng ngữ:

\`\`\`
node -e "JSON.parse(require('fs').readFileSync('glossary/glossary.json','utf8')).terms.filter(t=>t.bo.includes(process.argv[1])).forEach(t=>console.log(t.bo,'->',t.vi,'['+t.status+']',t.note||''))" ཆོས
\`\`\`

Kiểm tra tính nhất quán của chính bảng thuật ngữ:

\`\`\`
node tools/37-chunk-glossary.mjs --report
\`\`\`

## D. Nguồn và cách làm

Bản gốc: *Byang chub lam rim chen mo*, ấn bản Sera Jey Rigzod Chenmo, 978 trang. Dịch
**trực tiếp từ Tạng văn cổ điển**; các bản Anh ngữ và Việt ngữ đã có chỉ được tham khảo để
*đối chiếu* một lựa chọn thuật ngữ, không bao giờ là thứ được đem ra dịch.

Chữ Tạng dùng để dịch không lấy thẳng từ PDF: bảng ToUnicode của phông trong bản gốc bị lỗi,
làm rơi mất các phụ âm ghép dưới (\`གྱི\` bị đọc thành \`གི\`). Chữ đã được phục hồi ở mức
mã glyph, mỗi chỗ sửa đều cần **hai bằng chứng độc lập đồng thuận**; chỗ nào không đủ bằng
chứng thì để nguyên chứ không đoán. Chi tiết trong \`FINDINGS.md\`.

Mỗi đoạn trong ${state.chunks.length} đoạn đều đi qua ba bước: **dịch → kiểm chứng đối chiếu
Tạng văn → sửa**. Người kiểm chứng là một tác nhân độc lập, có quyền bác bỏ.

## E. Những điều bản dịch này **chưa** có

Phần này được ghi ra một cách có chủ ý. Đây là bản thảo đầy đủ, **chưa phải bản dịch hoàn
chỉnh**.

1. **Chưa có lần đọc lại độc lập sau khi sửa.** Người kiểm chứng bác gần như toàn bộ các
   đoạn và nêu ra lỗi; người sửa đã sửa rồi **tự khai là xong**. Không có ai kiểm lại lời
   tự khai ấy. Đây là thiếu sót lớn nhất.
2. **${flags} ghi chú tồn nghi chưa được giải quyết.**
3. **${conflicting} mục từ hiện có nhiều cách dịch khác nhau** trong bảng thuật ngữ. Một số
   là tách nghĩa có thật, một số là trôi dạt — chỉ người đọc kỹ từng đoạn mới phân định được.
4. **${noVerify.length} đoạn (${noVerify.join(', ')}) không có bản ghi kiểm chứng nào** — chúng được dịch tay
   trước khi quy trình kiểm chứng ra đời.
5. **Cấp tiêu đề (\`#\`, \`##\`, …) không phản ánh độ sâu thật của sa-bcad.** Cấu trúc gốc sâu
   tới 19 tầng trong khi Markdown chỉ có 6, và mỗi đoạn được dịch độc lập nên tự chọn cấp
   riêng. Muốn tra cấu trúc chính xác, dùng \`source/outline.json\` (284 mục, có đường dẫn
   phân cấp đầy đủ).
6. **Chưa qua Phase 5** — chưa có lần rà soát và ký duyệt sau cùng.
`;
}

const body = parts.join('\n\n') + '\n';

console.log(`chunks assembled : ${chunks.length}`);
console.log(`seams welded     : ${joined}   (a sentence ran across the cut)`);
console.log(`clean boundaries : ${clean}`);
console.log(`anomalies        : ${anomalies.length}`);
for (const a of anomalies) console.log(`  !! ${a}`);
console.log(`welds that stutter: ${overlaps.length}   (the second chunk restates instead of continuing)`);
for (const o of overlaps) console.log(`  !! ${o}`);
console.log(`page markers     : ${marks.placed} placed${marks.skipped.length ? `, ${marks.skipped.length} SKIPPED` : ''}`);
for (const s of marks.skipped.slice(0, 10)) console.log(`  !! ${s}`);
console.log(`output size      : ${(body.length / 1024).toFixed(0)} KB, ${body.split('\n').length} lines`);

// Independent sweep for leftovers. Deliberately keyed on the WORDS, not on the regexes that
// did the stripping - checking a strip with the strip's own pattern proves nothing, and that
// is exactly how the "Câu cuối tiếp tục sang trang sau" variant slipped through the first
// run of this tool.
const leftovers = (body.match(/^.*(tiếp sang|tiếp theo c\d|chunk sau|xem c\d{3}).*$/gm) || []);
console.log(`leftover markers : ${leftovers.length}`);
for (const l of leftovers.slice(0, 5)) console.log(`  !! ${l.trim().slice(0, 110)}`);

// Nothing but scaffolding may be lost. Compare word content before and after.
const raw = chunks.map(c => {
  const f = path.join(ROOT, 'translation', `${c.id}.md`);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '') : '';
}).join('\n');
// Words only. Quote markers and the continuation ellipses are formatting that the assembly
// deliberately changes, so they are normalised away here; anything else that differs means
// text was actually lost or duplicated.
const strip = s => s.replace(OPEN_G, '').replace(CLOSE_G, '').replace(MARK_G, '')
  .replace(/^\s*>\s?/gm, '').replace(/…/g, '').replace(/\s+/g, ' ').trim();
const OPEN_G = /\*\(\s*[….]*\s*tiếp theo[^)]*\)\*\s*[….]*\s*/g;
const CLOSE_G = /\*\([^)]*(?:tiếp sang|tiếp tục sang)[^)]*\)\*/g;
const before = strip(raw), after = strip(body);
if (before === after) console.log('content check    : OK - identical once markers and whitespace are normalised');
else {
  console.log('content check    : MISMATCH');
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    if (before[i] !== after[i]) { console.log('  first diff at', i, JSON.stringify(before.slice(i - 70, i + 70)), '->', JSON.stringify(after.slice(i - 70, i + 70))); break; }
  }
}

if (WRITE) {
  const out = path.join(ROOT, 'lamrim-vi.md');
  // The appendix is written OUTSIDE `body` on purpose: every check above runs against the
  // translation alone, so appendix prose can never mask a missing or duplicated passage.
  fs.writeFileSync(out, body + appendix(), 'utf8');
  console.log(`\nwrote ${out}  (translation + generated appendix)`);
} else {
  console.log('\ncheck only - pass --write to produce lamrim-vi.md');
}
