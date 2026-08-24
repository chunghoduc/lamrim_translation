// List the syllables a secondary-font CID appears in, under competing candidates.
import fs from 'node:fs'; import path from 'node:path';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { loadFont } from './pdffonts.mjs';
import { QOMOLANGMA_REPAIR } from './secondary-repair-table.mjs';
import { RAW, PDF_URL } from './config.mjs';
const FONT='DTREBQ+Qomolangma-Uchen-Sarchen';
const lib=await PDFDocument.load(fs.readFileSync(PDF_URL),{updateMetadata:false}); const ctx=lib.context;
const cm=new Map();
for(const [,o] of ctx.enumerateIndirectObjects()){ if(!(o instanceof PDFDict))continue;
  if(o.get(PDFName.of('Type'))?.toString()!=='/Font')continue; const f=loadFont(ctx,o);
  if(f?.base===FONT) for(const [c,u] of f.toUniMap) if(!cm.has(c)) cm.set(c,u); }
const TSHEG='་'; const S=new Map();
for(const file of fs.readdirSync(path.join(RAW,'glyphs')).sort()){
  const run=JSON.parse(fs.readFileSync(path.join(RAW,'glyphs',file),'utf8')).filter(g=>g.fb===FONT&&g.y>=55&&g.y<=535);
  let syl=[]; const flush=()=>{ if(syl.length&&syl.length<=12) for(const c of new Set(syl)){ if(!S.has(c))S.set(c,new Map()); const m=S.get(c); const k=syl.join(','); m.set(k,(m.get(k)||0)+1);} syl=[]; };
  for(const g of run){ if((cm.get(g.code)??'')===TSHEG) flush(); else syl.push(g.code); } flush(); }
for(const arg of process.argv.slice(2)){
  const [cidS,...cands]=arg.split(':'); const cid=Number(cidS);
  const m=S.get(cid); if(!m){console.log(cid,'no data');continue;}
  console.log(`\n=== CID ${cid} (${[...m.values()].reduce((a,b)=>a+b,0)} occurrences) ===`);
  for(const v of cands){
    const dec=(seq)=>seq.map(c=>c===cid?v:(QOMOLANGMA_REPAIR[c]?.to??cm.get(c)??'')).join('');
    const rows=[...m.entries()].map(([k,n])=>({s:dec(k.split(',').map(Number)),n})).sort((a,b)=>b.n-a.n);
    console.log(`  "${v}": ` + rows.slice(0,8).map(r=>`${r.s}(${r.n})`).join('  '));
  }
}
