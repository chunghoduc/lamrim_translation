import fs from 'node:fs'; import path from 'node:path';
import * as fontkit from 'fontkit'; import { Resvg } from '@resvg/resvg-js';
import { QA } from './config.mjs';
const census=JSON.parse(fs.readFileSync(path.join(QA,'cid-census.json'),'utf8'));
const font=fontkit.openSync(path.join(QA,'font','DTREBQ_MonlamUniOuChan2.ttf'));
const upem=font.unitsPerEm; const info=new Map(census.cids.map(c=>[c.cid,c]));
const cids=process.argv[2].split(',').map(Number); const tag=process.argv[3]||'big';
const COLS=4, CELL=400, LABEL=54, PAD=12;
const rows=Math.ceil(cids.length/COLS);
const W=COLS*CELL+PAD*2, H=rows*(CELL+LABEL)+PAD*2;
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>`;
cids.forEach((cid,i)=>{
  const cx=PAD+(i%COLS)*CELL, cy=PAD+Math.floor(i/COLS)*(CELL+LABEL);
  svg+=`<rect x="${cx}" y="${cy}" width="${CELL-6}" height="${CELL+LABEL-6}" fill="#fbfbfb" stroke="#bbb"/>`;
  svg+=`<line x1="${cx+8}" y1="${cy+CELL-92}" x2="${cx+CELL-14}" y2="${cy+CELL-92}" stroke="#e11" stroke-width="1.5" stroke-dasharray="5,5"/>`;
  let d=''; try{ d=font.getGlyph(cid).path.toSVG()||''; }catch{}
  if(d){ const s=(CELL-120)/upem; svg+=`<g transform="translate(${cx+CELL/2} ${cy+CELL-92}) scale(${s} ${-s})"><path d="${d}" fill="#111"/></g>`; }
  const r=info.get(cid)||{};
  svg+=`<text x="${cx+CELL/2-3}" y="${cy+CELL+8}" font-size="26" font-family="monospace" fill="#04c" text-anchor="middle">CID ${cid}</text>`;
  svg+=`<text x="${cx+CELL/2-3}" y="${cy+CELL+34}" font-size="20" font-family="monospace" fill="#555" text-anchor="middle">${r.count??''}x  maps-&gt;[${(r.toUnicode??'').split('').map(c=>c.codePointAt(0).toString(16).toUpperCase()).join(',')}]</text>`;
});
svg+='</svg>';
const png=new Resvg(svg,{fitTo:{mode:'width',value:W}}).render().asPng();
const f=path.join(QA,'glyphs',`${tag}.png`); fs.writeFileSync(f,png);
console.log(f, `${W}x${H}`, cids.length,'glyphs');
