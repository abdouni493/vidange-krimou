// Isolated UI fixture: no Supabase login or production data writes.
// Run with Vite on :5173: node tools/test-label-entry-points.cjs [output dir]
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
const out=process.argv[2]||'/tmp/label-print-evidence';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const fixtures=[{id:'a',name:'Liqui Moly 10W40 A3/B4 5L',code:'4100410231707',price:6750,createdAt:'2026-01-01'},
 {id:'b',name:'Filtre',code:'0123456789012',price:650,createdAt:'2026-01-01'}];
 await page.route('**/src/main.jsx*',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await page.route('**/src/context.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useApp=()=>({db:window.fixtureDB,t:s=>s,can:()=>true,lang:'fr',update:()=>{throw Error('unexpected data write')}});`}));
 await page.goto('http://127.0.0.1:5173');
 await page.evaluate(async fixtures=>{
  window.fixtureDB={barcodes:fixtures,products:fixtures.map(e=>({...e,barcode:e.code,salePrice:e.price})),categories:[],settings:{name:'Garage Étoile'}};
  localStorage.setItem('krimou.labelPrinter.v1',JSON.stringify({mode:'browser'}));localStorage.removeItem('krimou.labelRotation');
  window.React=(await import('/node_modules/.vite/deps/react.js')).default;
  const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  window.testRoot=createRoot(document.getElementById('root'));
  const {default:Barcodes}=await import('/src/pages/Barcodes.jsx');
  testRoot.render(React.createElement(Barcodes));
 },fixtures);
 await page.getByTitle('Imprimer',{exact:true}).first().waitFor();
 const cards=page.locator('.card').filter({has:page.getByTitle('Imprimer',{exact:true})});
 await cards.nth(0).locator('input[type=number]').fill('2');
 for(const n of [0,1])await cards.nth(n).locator('input[type=checkbox]').check();
 const selection=page.getByRole('button',{name:/Imprimer la sélection/});
 const popupP=page.waitForEvent('popup');await selection.click();const pop=await popupP;
 await pop.waitForLoadState();await pop.emulateMedia({media:'print'});
 const codes=await pop.locator('.lbl img').evaluateAll(imgs=>imgs.map(e=>e.alt));
 assert.equal(codes.length,3);assert.ok(codes[0].includes(fixtures[0].code));assert.equal(codes[0],codes[1]);assert.ok(codes[2].includes(fixtures[1].code));
 await pop.pdf({path:`${out}/codes-barres-selection.pdf`,preferCSSPageSize:true,scale:1});
 const libraryImages=await cards.locator('canvas').evaluateAll(cs=>cs.map(c=>c.toDataURL()));
 const printImages=await pop.locator('img').evaluateAll(imgs=>imgs.map(i=>i.src));
 assert.equal(libraryImages[0],printImages[0]);assert.equal(libraryImages[1],printImages[2]);await pop.close();
 for(let i=0;i<2;i++){
  const onePopup=page.waitForEvent('popup');await cards.nth(i).getByTitle('Imprimer',{exact:true}).click();const one=await onePopup;await one.waitForLoadState();
  assert.equal(await one.locator('img').count(),i===0?2:1);
  assert.equal(await one.locator('img').first().getAttribute('src'),printImages[i===0?0:2]);await one.close();
 }
 console.log('PASS Codes-barres: selection A,A,B and per-product copies; library preview equals Chrome bitmap');
 for(let i=0;i<fixtures.length;i++){
  await page.evaluate(async i=>{
   const {ProductForm}=await import('/src/pages/Stock.jsx');
   testRoot.render(React.createElement(ProductForm,{key:i,editing:fixtureDB.products[i],onClose:()=>{}}));
  },i);
  await page.getByRole('button',{name:"Imprimer l'étiquette",exact:true}).waitFor();
  const preview=await page.locator('canvas').first().evaluate(c=>c.toDataURL());
  const next=page.waitForEvent('popup');await page.getByRole('button',{name:"Imprimer l'étiquette",exact:true}).click();const p=await next;
  await p.waitForLoadState();await p.emulateMedia({media:'print'});
  assert.equal(await p.locator('img').count(),1);
  assert.equal(await p.locator('img').getAttribute('src'),preview);
  assert.equal(await p.locator('img').getAttribute('src'),printImages[i===0?0:2]);
  await p.pdf({path:`${out}/stock-${i+1}.pdf`,preferCSSPageSize:true,scale:1});await p.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS Stock: both product buttons match Codes-barres and their preview; no page errors');
 // Simulated Windows agent verifies transport only; it does not verify physical printing.
 let rawJob;
 await page.route('**/api/printers',r=>r.fulfill({json:{ok:true,platform:'win32',printers:[{name:'Fixture XP-300B'}]}}));
 await page.route('**/api/print/raw',r=>{rawJob=r.request().postDataBuffer();return r.fulfill({json:{ok:true}});});
 const result=await page.evaluate(async fixtures=>{
  const lp=await import('/src/lib/labelPrinter.js');lp.savePrinterSettings({mode:'direct',gap:2,dpi:203,flip:true,offsetX:0,offsetY:0});await lp.detectAgent({force:true});
  return lp.printLabelsAuto([{...fixtures[0],copies:2},fixtures[1]],{size:'s40x20',rotation:'r90'});
 },fixtures);
 assert.equal(result.mode,'direct');assert.equal(result.count,3);assert.equal(result.ok,true);
 const job=rawJob.toString('latin1');assert.match(job,/SIZE 40 mm,20 mm/);assert.match(job,/GAP 2 mm,0 mm/);assert.match(job,/PRINT 2,1/);assert.match(job,/PRINT 1,1/);assert.match(job,/BITMAP 0,0,40,160,0,/);
 console.log('PASS direct transport: 40x20, gap 2, 320x160 bitmap, copies 2+1; browser rotation ignored');
 await page.unroute('**/api/printers');
 await page.route('**/api/printers',r=>r.fulfill({status:503,json:{error:'Fixture agent unavailable'}}));
 await page.evaluate(async()=>{const lp=await import('/src/lib/labelPrinter.js');await lp.detectAgent({force:true});});
 const fallbackPopup=page.waitForEvent('popup');
 const fallback=await page.evaluate(async fixture=>{
  const lp=await import('/src/lib/labelPrinter.js');return lp.printLabelsAuto([fixture],{size:'s40x20',rotation:'r0'});
 },fixtures[1]);
 const fp=await fallbackPopup;await fp.waitForLoadState();assert.equal(fallback.fallback,true);assert.equal(fallback.mode,'browser');assert.equal(await fp.locator('img').getAttribute('src'),printImages[2]);await fp.close();
 console.log('PASS unavailable direct agent: Chrome fallback matches fixture');
 // Restore browser mode to keep the test page harmless.
 await page.evaluate(()=>localStorage.setItem('krimou.labelPrinter.v1',JSON.stringify({mode:'browser'})));
 } finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
