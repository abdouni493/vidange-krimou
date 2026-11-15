// Integration regression: requires Vite on :5173, environment Playwright/Chromium,
// and pdftoppm/pdfinfo. Run: node tools/test-label-print.cjs [evidence directory].
const { chromium } = require('playwright');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const out = process.argv[2] || '/tmp/label-print-evidence';
fs.mkdirSync(out, {recursive:true});
const A={name:'Liqui Moly 10W40 A3/B4 5L',code:'4100410231707',price:6750,copies:2};
const B={name:'Filtre',code:'0123456789012',price:650,copies:1};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
 try {
 const page=await browser.newPage(); await page.goto('http://127.0.0.1:5173');
 const cases=[['fresh',[A,B],{}],['r0',[A,B],{rotation:'r0'}],['r90',[A,B],{rotation:'r90'}],['r270',[A,B],{rotation:'r270'}],
 ['300dpi',[A,B],{dpi:300}],['no-name',[A,B],{opts:{showName:false,showCode:true,showPrice:false,showStore:false}}],['30x20',[A,B],{size:'s30x20'}],
 ['all-fields',[{...A,name:'Écrou étanchéité à tête épaulée pour moteur professionnel'},{...B,name:'زيت المحرك الأصلي'}],{opts:{showName:true,showCode:true,showPrice:true,showStore:true},store:'Garage Étoile'}],
 ['variants',[{...A,name:'Écrou étanchéité à tête épaulée'},{...B,name:'زيت المحرك الأصلي'}],{opts:{showName:true,showCode:false,showPrice:false,showStore:true},store:'Garage Étoile'}]];
 const report=[];
 for(const [name,entries,options] of cases){
  const popupP=page.waitForEvent('popup'); popupP.catch(()=>{});
  const result=await page.evaluate(async({entries,options})=>{
   const m=await import('/src/barcode.js'); const lp=await import('/src/lib/labelPrinter.js');
   const {labelLayout}=await import('/src/lib/labelLayout.js');
   const {RGBLuminanceSource,HybridBinarizer,BinaryBitmap,EAN13Reader,MultiFormatReader,DecodeHintType,BarcodeFormat}=await import('/node_modules/.vite/deps/@zxing_library.js');
   localStorage.removeItem('krimou.labelRotation');
   if(options.rotation)m.saveLabelRotation(options.rotation);
   const rotation=m.loadLabelRotation();
   if(rotation!==(options.rotation||'r0'))throw Error('rotation persistence');
   lp.savePrinterSettings({mode:'browser',dpi:options.dpi||203,offsetX:0,offsetY:0});
   const geometry=[];
   for(const entry of entries){
    const canvas=lp.renderLabelCanvas(entry,{size:options.size||'s40x20',...options,settings:{dpi:options.dpi||203}});
    const {W,H,dots}=lp.canvasToDots(canvas);
    const packed=lp.packTsplBitmap({W,H,dots});
    const luminance=new Uint8ClampedArray(W*H);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)luminance[y*W+x]=(packed.bytes[y*packed.wb+(x>>3)] & (0x80>>(x%8)))?255:0;
    const hints=new Map([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.EAN_13]]]);
    const decoder=new EAN13Reader();
    const decoded=decoder.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance,W,H)))).getText();
    if(decoded!==entry.code)throw Error(`decode ${decoded} != ${entry.code}`);
    const layout=canvas.labelLayout;
    for(const row of layout.rows)if(row.y<0||row.y+row.h>H)throw Error('text overflow');
    const b=layout.bars;
    const intervals=[...layout.rows.map(r=>[r.y,r.y+r.h]),[b.y,b.y+b.h+(options.opts?.showCode===false?0:2)]].sort((a,b)=>a[0]-b[0]);
    for(let j=1;j<intervals.length;j++)if(intervals[j][0]<intervals[j-1][1])throw Error('overlapping content bands');
    const digits=layout.rows.find(r=>r.kind==='digits');
    if(digits&&(digits.visibleText!==entry.code||digits.visibleText.length!==13))throw Error('printed digits mismatch');
    for(let y=b.y;y<b.y+b.h;y++)for(let x=b.blockX;x<b.x;x++)if(dots[y*W+x])throw Error('left quiet zone ink');
    for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x+b.w;x<b.blockX+b.blockW;x++)if(dots[y*W+x])throw Error('right quiet zone ink');
    if((options.dpi||203)===203&&(options.size||'s40x20')==='s40x20'&&(W!==320||H!==160||b.module!==2||b.w!==190||b.blockW!==226))throw Error('203 dpi geometry');
    geometry.push({code:entry.code,decoded,layout});
   }
   await lp.printLabelsAuto(entries,{size:'s40x20',...options});
   return {rotation,geometry};
  },{entries,options});
  const popup=await popupP;await popup.waitForLoadState();await popup.emulateMedia({media:'print'});
  await popup.evaluate(()=>Promise.all(Array.from(document.images,i=>i.decode())));
  const measurements=await popup.evaluate(()=>{
   const rule=[...document.styleSheets[0].cssRules].find(r=>r.cssText.startsWith('@page')).cssText;
   const rect=e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height,x:r.x,y:r.y}};
   return {pageRule:rule,pages:[...document.querySelectorAll('.pg')].map(rect),labels:[...document.querySelectorAll('.lbl')].map(e=>({rect:rect(e),transform:getComputedStyle(e).transform}))};
  });
  await popup.pdf({path:`${out}/after-${name}.pdf`,preferCSSPageSize:true,scale:1,displayHeaderFooter:false});
  const info=execFileSync('pdfinfo',[`${out}/after-${name}.pdf`],{encoding:'utf8'});
  const copies=entries.reduce((n,e)=>n+(e.copies||1),0);assert.match(info,new RegExp(`Pages:\\s+${copies}\\b`));
  const [,w,h]=info.match(/Page size:\s+([\d.]+) x ([\d.]+)/);
  const turned=options.rotation&&options.rotation!=='r0';
  const mmW=options.size==='s30x20'?30:40, mmH=20;
  assert.ok(Math.abs(Number(w)-(turned?mmH:mmW)*72/25.4)<0.6);assert.ok(Math.abs(Number(h)-(turned?mmW:mmH)*72/25.4)<0.6);
  execFileSync('pdftoppm',['-r',String(options.dpi===300?304.8:203.2),'-png',`${out}/after-${name}.pdf`,`${out}/after-${name}`]);
  // Decode PDF-rendered pages independently of the renderer's canvas.
  if(!turned){
   const expected=entries.flatMap(e=>Array(e.copies||1).fill(e.code));
   for(let i=0;i<expected.length;i++){
    const file=`${out}/after-${name}-${i+1}.png`;
    const data=fs.readFileSync(file).toString('base64');
    const decoded=await page.evaluate(async data=>{
     const z=await import('/node_modules/.vite/deps/@zxing_library.js');
     const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();
     const c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);
     const rgba=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
     const gray=new Uint8ClampedArray(c.width*c.height);for(let j=0;j<gray.length;j++)gray[j]=rgba[j*4];
     const d=new z.EAN13Reader();
     const text=d.decode(new z.BinaryBitmap(new z.HybridBinarizer(new z.RGBLuminanceSource(gray,c.width,c.height)))).getText();
     let x0=c.width,y0=c.height,x1=0,y1=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(gray[y*c.width+x]<150){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
     return {text,width:c.width,height:c.height,inkBounds:{x0,y0,x1,y1}};
    },data);
    assert.equal(decoded.text,expected[i]);(result.pdfPages||=[]).push(decoded);
   }
  }
  fs.writeFileSync(`${out}/after-${name}.html`,await popup.content());
  report.push({name,options,...result,...measurements,pdfInfo:info});await popup.close();
  console.log(`PASS ${name}: ${copies} pages, direct decode${turned?'':', PDF decode'}, geometry, quiet zones`);
 }
 fs.writeFileSync(`${out}/after-measurements.json`,JSON.stringify(report,null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
