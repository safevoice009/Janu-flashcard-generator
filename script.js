/* OccludeX — replacement script.js
   - Full single-file logic for image occlusion editor
   - Fixes: persistent masks, stable event wiring, DPR-aligned input,
           Tesseract worker progress, one-click deck, .apkg export checks,
           Gemini call error handling, undo/redo history.
*/

// ---- Globals and DOM ----
const state = {
  image: null,
  masks: [],           // {x,y,w,h,id}
  selectedId: null,
  ocrText: "",
  aiCards: [],
  deck: [],
  fsrs: {},
};

const imgCanvas = document.getElementById('imgCanvas');
const maskCanvas = document.getElementById('maskCanvas');
const ctxImg = imgCanvas.getContext('2d');
const ctxMask = maskCanvas.getContext('2d');
const ocrOutput = document.getElementById('ocrOutput');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressBar = document.getElementById('progressBar');
const busyOverlay = document.getElementById('busyOverlay');

const imageInput = document.getElementById('imageInput');
const scanOcrBtn = document.getElementById('scanOcrBtn');
const autoOccludeBtn = document.getElementById('autoOccludeBtn');
const oneClickDeckBtn = document.getElementById('oneClickDeckBtn');
const bulkCreateBtn = document.getElementById('bulkCreateBtn');
const exportApkgBtn = document.getElementById('exportApkgBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const resetViewBtn = document.getElementById('resetViewBtn');

let imgBitmap = null;

// History (undo/redo)
const history = { stack: [], idx: -1 };
function pushHistory() {
  history.stack = history.stack.slice(0, history.idx + 1);
  history.stack.push(JSON.stringify(state.masks));
  history.idx++;
}
function undo() {
  if (history.idx <= 0) return;
  history.idx--;
  state.masks = JSON.parse(history.stack[history.idx] || '[]');
  state.selectedId = null;
  drawImage(); drawMasks();
}
function redo() {
  if (history.idx >= history.stack.length - 1) return;
  history.idx++;
  state.masks = JSON.parse(history.stack[history.idx] || '[]');
  state.selectedId = null;
  drawImage(); drawMasks();
}
undoBtn.onclick = undo;
redoBtn.onclick = redo;

// View transform for zoom/pan
let view = { scale: 1, offsetX: 0, offsetY: 0 };
resetViewBtn.onclick = () => { view = { scale: 1, offsetX: 0, offsetY: 0 }; drawImage(); drawMasks(); };

// Small helpers
function el(id){ return document.getElementById(id); }
function showBusy(on, text='Working…'){ busyOverlay.classList.toggle('hidden', !on); if(on) busyOverlay.textContent = text; }
function setProgress(pct, txt=''){ progressFill.style.width = Math.round(pct*100) + '%'; progressText.textContent = txt || (Math.round(pct*100) + '%'); progressBar.classList.toggle('hidden', pct <= 0); }

// Device Pixel Ratio aware canvas sizing
function fitCanvasToImage(bitmap){
  const maxH = 520;
  const maxW = imgCanvas.parentElement.clientWidth || 900;
  const ratio = Math.min(maxW / bitmap.width, maxH / bitmap.height, 1);
  const dpr = window.devicePixelRatio || 1;

  imgCanvas.width = Math.floor(bitmap.width * ratio * dpr);
  imgCanvas.height = Math.floor(bitmap.height * ratio * dpr);
  maskCanvas.width = imgCanvas.width;
  maskCanvas.height = imgCanvas.height;

  imgCanvas.style.width = Math.floor(bitmap.width * ratio) + 'px';
  imgCanvas.style.height = Math.floor(bitmap.height * ratio) + 'px';
  maskCanvas.style.width = imgCanvas.style.width;
  maskCanvas.style.height = imgCanvas.style.height;

  // Reset view transforms
  view = { scale: 1, offsetX: 0, offsetY: 0 };
  ctxImg.setTransform(1,0,0,1,0,0);
  ctxMask.setTransform(1,0,0,1,0,0);
}

// Draw image (applies view transform)
function applyViewTransform(ctx){
  ctx.setTransform(view.scale,0,0,view.scale,view.offsetX,view.offsetY);
}
function drawImage(){
  if(!imgBitmap){ ctxImg.clearRect(0,0,imgCanvas.width,imgCanvas.height); return; }
  ctxImg.setTransform(1,0,0,1,0,0);
  ctxImg.clearRect(0,0,imgCanvas.width,imgCanvas.height);
  applyViewTransform(ctxImg);
  ctxImg.drawImage(imgBitmap, 0, 0, imgCanvas.width, imgCanvas.height);
}
function drawMasks(){
  ctxMask.setTransform(1,0,0,1,0,0);
  ctxMask.clearRect(0,0,maskCanvas.width,maskCanvas.height);
  applyViewTransform(ctxMask);
  state.masks.forEach(m => {
    const sel = (m.id === state.selectedId);
    ctxMask.fillStyle = sel ? 'rgba(122,162,247,0.45)' : 'rgba(58,91,160,0.45)';
    ctxMask.fillRect(m.x, m.y, m.w, m.h);
    ctxMask.strokeStyle = sel ? '#7aa2f7' : 'rgba(255,255,255,0.8)';
    ctxMask.lineWidth = sel ? 2 : 1;
    ctxMask.strokeRect(m.x, m.y, m.w, m.h);
    if(sel) drawHandles(m);
  });
}
function drawHandles(m){
  const hs = [{x:m.x,y:m.y},{x:m.x+m.w,y:m.y},{x:m.x,y:m.y+m.h},{x:m.x+m.w,y:m.y+m.h}];
  ctxMask.fillStyle = '#f7768e';
  hs.forEach(h => ctxMask.fillRect(h.x-8,h.y-8,16,16));
}

// Coordinate mapping: client -> image-space (DPR + view)
function clientToImagePoint(clientX, clientY){
  const rect = maskCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssX = clientX - rect.left;
  const cssY = clientY - rect.top;
  const x = cssX * dpr;
  const y = cssY * dpr;
  const vx = (x - view.offsetX) / view.scale;
  const vy = (y - view.offsetY) / view.scale;
  return { x: vx, y: vy };
}

// Mask hit testing
function corners(m){
  return [
    {name:'nw', x:m.x, y:m.y},
    {name:'ne', x:m.x+m.w, y:m.y},
    {name:'sw', x:m.x, y:m.y+m.h},
    {name:'se', x:m.x+m.w, y:m.y+m.h},
  ];
}
function findMaskAt(x,y){
  // check handles first on selected
  const sel = state.masks.find(mm => mm.id === state.selectedId);
  if(sel){
    for(const h of corners(sel)){
      if(Math.abs(h.x - x) <= 12 && Math.abs(h.y - y) <= 12) return {mask: sel, handle: h.name};
    }
  }
  // then masks top-down
  for(let i=state.masks.length-1;i>=0;i--){
    const m = state.masks[i];
    if(x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) return {mask: m, handle: null};
  }
  return {mask: null, handle: null};
}

// Interaction state
let dragMode = null; // draw | move | resize
let dragStart = null; // {x,y,ox,oy}
let resizeCorner = null;
let activeMask = null;

// Pointer handlers (works for mouse+touch)
function onPointerDown(e){
  e.preventDefault();
  const p = e.touches ? {x: e.touches[0].clientX, y: e.touches[0].clientY} : {x: e.clientX, y: e.clientY};
  const pt = clientToImagePoint(p.x, p.y);
  const hit = findMaskAt(pt.x, pt.y);
  if(hit.handle && hit.mask){
    state.selectedId = hit.mask.id;
    activeMask = hit.mask;
    dragMode = 'resize';
    resizeCorner = hit.handle;
  } else if(hit.mask){
    state.selectedId = hit.mask.id;
    activeMask = hit.mask;
    dragMode = 'move';
    dragStart = { x: pt.x, y: pt.y, ox: pt.x - activeMask.x, oy: pt.y - activeMask.y };
  } else {
    dragMode = 'draw';
    dragStart = { x: pt.x, y: pt.y };
    state.selectedId = null;
    activeMask = null;
  }
  drawMasks();
}
function onPointerMove(e){
  if(!dragMode) return;
  e.preventDefault();
  const p = e.touches ? {x: e.touches[0].clientX, y: e.touches[0].clientY} : {x: e.clientX, y: e.clientY};
  const pt = clientToImagePoint(p.x, p.y);
  if(dragMode === 'draw'){
    drawImage(); drawMasks();
    const r = normalizeRect(dragStart.x, dragStart.y, pt.x, pt.y);
    ctxMask.fillStyle = 'rgba(247,118,142,0.35)'; ctxMask.fillRect(r.x, r.y, r.w, r.h);
    ctxMask.strokeStyle = '#f7768e'; ctxMask.strokeRect(r.x, r.y, r.w, r.h);
  } else if(dragMode === 'move' && activeMask){
    activeMask.x = pt.x - dragStart.ox; activeMask.y = pt.y - dragStart.oy;
    clampMask(activeMask);
    drawImage(); drawMasks();
  } else if(dragMode === 'resize' && activeMask){
    resizeMask(activeMask, resizeCorner, pt.x, pt.y);
    clampMask(activeMask);
    drawImage(); drawMasks();
  }
}
function onPointerUp(e){
  if(!dragMode) return;
  e.preventDefault();
  const p = (e.changedTouches && e.changedTouches[0]) ? {x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY} : {x: e.clientX, y: e.clientY};
  const pt = clientToImagePoint(p.x, p.y);
  if(dragMode === 'draw'){
    const r = normalizeRect(dragStart.x, dragStart.y, pt.x, pt.y);
    if(r.w * r.h > 60){
      state.masks.push({ ...r, id: genId() });
      pushHistory();
      state.selectedId = state.masks[state.masks.length - 1].id;
    }
  } else if(dragMode === 'move' || dragMode === 'resize'){
    pushHistory();
  }
  dragMode = null; dragStart = null; resizeCorner = null; activeMask = null;
  drawImage(); drawMasks();
}
function onDoubleClick(e){
  e.preventDefault();
  const p = e.touches ? {x: e.touches[0].clientX, y: e.touches[0].clientY} : {x: e.clientX, y: e.clientY};
  const pt = clientToImagePoint(p.x, p.y);
  const hit = findMaskAt(pt.x, pt.y);
  if(hit.mask){
    // delete mask
    const idx = state.masks.findIndex(m => m.id === hit.mask.id);
    if(idx >= 0){
      state.masks.splice(idx, 1);
      state.selectedId = null;
      pushHistory();
      drawMasks();
    }
  }
}
maskCanvas.addEventListener('mousedown', onPointerDown);
maskCanvas.addEventListener('mousemove', onPointerMove);
maskCanvas.addEventListener('mouseup', onPointerUp);
maskCanvas.addEventListener('dblclick', onDoubleClick);
maskCanvas.addEventListener('touchstart', onPointerDown, {passive:false});
maskCanvas.addEventListener('touchmove', onPointerMove, {passive:false});
maskCanvas.addEventListener('touchend', onPointerUp, {passive:false});
maskCanvas.addEventListener('touchcancel', onPointerUp, {passive:false});

// Helpers: rect math, clamp, resize
function normalizeRect(x0,y0,x1,y1){
  let x=x0,y=y0,w=x1-x0,h=y1-y0;
  if(w<0){ x=x1; w=-w; } if(h<0){ y=y1; h=-h; }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}
function clampMask(m){
  m.x = Math.max(0, Math.min(m.x, imgCanvas.width - m.w));
  m.y = Math.max(0, Math.min(m.y, imgCanvas.height - m.h));
  m.w = Math.max(6, Math.min(m.w, imgCanvas.width));
  m.h = Math.max(6, Math.min(m.h, imgCanvas.height));
}
function resizeMask(m, corner, x, y){
  const right = m.x + m.w, bottom = m.y + m.h;
  if(corner === 'nw'){ const nx = Math.min(x, right-8); const ny = Math.min(y, bottom-8); m.w = right-nx; m.h = bottom-ny; m.x = nx; m.y = ny; }
  else if(corner === 'ne'){ const nx = Math.max(x, m.x+8); const ny = Math.min(y, bottom-8); m.w = nx-m.x; m.h = bottom-ny; m.y = ny; }
  else if(corner === 'sw'){ const nx = Math.min(x, right-8); const ny = Math.max(y, m.y+8); m.w = right-nx; m.h = ny-m.y; m.x = nx; }
  else if(corner === 'se'){ const nx = Math.max(x, m.x+8); const ny = Math.max(y, m.y+8); m.w = nx-m.x; m.h = ny-m.y; }
}

// ID generator
function genId(){ return 'm_' + Math.random().toString(36).slice(2); }

// Image load
imageInput.addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  if(!f) return;
  state.image = f;
  try{
    const ab = await f.arrayBuffer();
    imgBitmap = await createImageBitmap(new Blob([ab]));
    fitCanvasToImage(imgBitmap);
    state.masks = []; state.selectedId = null; history.stack=[]; history.idx=-1; pushHistory();
    drawImage(); drawMasks();
    ocrOutput.textContent = "Image loaded. Tap Auto occlude labels or draw masks.";
    console.log('Image loaded:', f.name);
  }catch(err){ console.error('Image load error', err); ocrOutput.textContent = 'Failed to load image'; }
});

// OCR preprocess + scan
async function preprocessDataURL(file){
  const arr = await file.arrayBuffer();
  const bmp = await createImageBitmap(new Blob([arr]));
  const scale = Math.min(2, 1024 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const cx = c.getContext('2d');
  cx.drawImage(bmp, 0, 0, c.width, c.height);
  // simple contrast
  try{
    const id = cx.getImageData(0,0,c.width,c.height);
    for(let i=0;i<id.data.length;i+=4){
      id.data[i] = Math.min(255, id.data[i]*1.12);
      id.data[i+1] = Math.min(255, id.data[i+1]*1.12);
      id.data[i+2] = Math.min(255, id.data[i+2]*1.12);
    }
    cx.putImageData(id,0,0);
  }catch(e){ /* cross-origin may prevent getImageData for some images */ }
  return c.toDataURL('image/png');
}

scanOcrBtn.addEventListener('click', async () => {
  if(!state.image){ ocrOutput.textContent = 'Choose an image first'; return; }
  showBusy(true,'Preprocessing for OCR'); setProgress(0,'Preparing');
  try{
    const dataURL = await preprocessDataURL(state.image);
    setProgress(0.02,'Loading OCR worker');
    const worker = Tesseract.createWorker({
      logger: m => {
        if(m.status && m.progress!=null) setProgress(m.progress, m.status);
      }
    });
    await worker.load(); await worker.loadLanguage('eng'); await worker.initialize('eng');
    const res = await worker.recognize(dataURL);
    await worker.terminate();
    state.ocrText = res?.data?.text || '';
    ocrOutput.textContent = state.ocrText.trim() || '(No text detected)';
    setProgress(0);
    showBusy(false);
    console.log('OCR result', state.ocrText);
  }catch(err){
    console.error('OCR error', err); ocrOutput.textContent = 'OCR failed: ' + (err.message||err); setProgress(0); showBusy(false);
  }
});

// Auto-occlude with progress and merge
autoOccludeBtn.addEventListener('click', async () => {
  if(!state.image){ ocrOutput.textContent = 'Choose an image first'; return; }
  showBusy(true,'Auto-occluding labels'); setProgress(0.02,'Preparing');
  try{
    const dataURL = await preprocessDataURL(state.image);
    const worker = Tesseract.createWorker({
      logger: m => { if(m.status && m.progress!=null) setProgress(m.progress, m.status); }
    });
    await worker.load(); await worker.loadLanguage('eng'); await worker.initialize('eng');
    const res = await worker.recognize(dataURL);
    await worker.terminate();
    // Map OCR coords to canvas image space
    const imgW = res?.data?.imageSize?.width || imgCanvas.width;
    const imgH = res?.data?.imageSize?.height || imgCanvas.height;
    const scaleX = imgCanvas.width / imgW;
    const scaleY = imgCanvas.height / imgH;

    // Collect line boxes
    const lineBoxes = [];
    (res?.data?.blocks || []).forEach(b => (b.paragraphs || []).forEach(p => (p.lines || []).forEach(l => {
      const words = (l.words || []).map(w => {
        const x0 = Math.floor(w.bbox.x0 * scaleX);
        const y0 = Math.floor(w.bbox.y0 * scaleY);
        const x1 = Math.floor(w.bbox.x1 * scaleX);
        const y1 = Math.floor(w.bbox.y1 * scaleY);
        return { x: x0, y: y0, w: x1-x0, h: y1-y0, text: w.text || '' };
      }));
      if(words.length === 0) return;
      const minX = Math.min(...words.map(w=>w.x));
      const minY = Math.min(...words.map(w=>w.y));
      const maxX = Math.max(...words.map(w=>w.x+w.w));
      const maxY = Math.max(...words.map(w=>w.y+w.h));
      const txt = words.map(w=>w.text).join(' ').trim();
      if(txt.length >= 2 && /[A-Za-z0-9]/.test(txt) && (maxX-minX)*(maxY-minY) > 40){
        lineBoxes.push({ x: minX, y: minY, w: maxX-minX, h: maxY-minY, text: txt });
      }
    })));

    // Merge nearby boxes
    function mergeBoxes(boxes, pad=12){
      const out = [];
      boxes.sort((a,b)=> a.y === b.y ? a.x - b.x : a.y - b.y);
      for(const b of boxes){
        let merged = false;
        for(const o of out){
          if(!(o.x > b.x + b.w + pad || o.x + o.w + pad < b.x || o.y > b.y + b.h + pad || o.y + o.h + pad < b.y)){
            const nx = Math.min(o.x,b.x), ny = Math.min(o.y,b.y);
            const rx = Math.max(o.x + o.w, b.x + b.w), by = Math.max(o.y + o.h, b.y + b.h);
            o.x = nx; o.y = ny; o.w = rx - nx; o.h = by - ny;
            o.text = (o.text ? o.text + ' ' : '') + b.text;
            merged = true; break;
          }
        }
        if(!merged) out.push({...b});
      }
      return out;
    }

    const merged = mergeBoxes(lineBoxes, 10);
    // Add masks and persist
    merged.forEach(r => state.masks.push({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), id: genId() }));
    pushHistory();
    drawImage(); drawMasks();
    ocrOutput.textContent = `Auto-occluded ${merged.length} labels. Adjust if needed.`;
    setProgress(0);
    showBusy(false);
    console.log('Auto-occlude masks:', merged.length);
  }catch(err){
    console.error('Auto-occlude error', err);
    ocrOutput.textContent = 'Auto-occlude failed: ' + (err.message||err);
    setProgress(0); showBusy(false);
  }
});

// One-click deck generation (OCR -> auto-occlude -> create)
oneClickDeckBtn.addEventListener('click', async () => {
  if(!state.image){ alert('Choose an image first'); return; }
  showBusy(true,'Generating deck'); setProgress(0.05,'Running OCR + auto-occlude');
  try{
    // run auto-occlude (reuse handler)
    await (async () => {
      // trigger internal auto-occlude work directly to ensure sequencing
      const dataURL = await preprocessDataURL(state.image);
      setProgress(0.12,'OCR running');
      const worker = Tesseract.createWorker({ logger: m => { if(m.status && m.progress!=null) setProgress(m.progress, m.status);} });
      await worker.load(); await worker.loadLanguage('eng'); await worker.initialize('eng');
      const res = await worker.recognize(dataURL);
      await worker.terminate();
      const imgW = res?.data?.imageSize?.width || imgCanvas.width;
      const imgH = res?.data?.imageSize?.height || imgCanvas.height;
      const scaleX = imgCanvas.width / imgW;
      const scaleY = imgCanvas.height / imgH;
      const lineBoxes = [];
      (res?.data?.blocks || []).forEach(b => (b.paragraphs||[]).forEach(p => (p.lines||[]).forEach(l => {
        const words = (l.words||[]).map(w => {
          const x0 = Math.floor(w.bbox.x0 * scaleX);
          const y0 = Math.floor(w.bbox.y0 * scaleY);
          const x1 = Math.floor(w.bbox.x1 * scaleX);
          const y1 = Math.floor(w.bbox.y1 * scaleY);
          return { x: x0, y: y0, w: x1-x0, h: y1-y0, text: w.text || '' };
        }));
        if(words.length === 0) return;
        const minX = Math.min(...words.map(w=>w.x)), minY = Math.min(...words.map(w=>w.y));
        const maxX = Math.max(...words.map(w=>w.x+w.w)), maxY = Math.max(...words.map(w=>w.y+w.h));
        const txt = words.map(w=>w.text).join(' ').trim();
        if(txt.length >= 2 && /[A-Za-z0-9]/.test(txt) && (maxX-minX)*(maxY-minY) > 40){
          lineBoxes.push({ x: minX, y: minY, w: maxX-minX, h: maxY-minY, text: txt });
        }
      })));
      const merged = (function mergeBoxes(boxes, pad=12){
        const out=[]; boxes.sort((a,b)=> a.y === b.y ? a.x - b.x : a.y - b.y);
        for(const b of boxes){
          let merged=false;
          for(const o of out){
            if(!(o.x > b.x + b.w + pad || o.x + o.w + pad < b.x || o.y > b.y + b.h + pad || o.y + o.h + pad < b.y)){
              const nx=Math.min(o.x,b.x), ny=Math.min(o.y,b.y);
              const rx=Math.max(o.x+o.w,b.x+b.w), by=Math.max(o.y+o.h,b.y+b.h);
              o.x=nx;o.y=ny;o.w=rx-nx;o.h=by-ny;o.text=(o.text?o.text+' ':'')+b.text; merged=true; break;
            }
          }
          if(!merged) out.push({...b});
        }
        return out;
      })(lineBoxes,12);
      merged.forEach(r => state.masks.push({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), id: genId() }));
      pushHistory();
    })();

    // create occlusion cards
    if(state.masks.length === 0) {
      alert('No masks found after auto-occlude. Add masks manually or try a clearer image.');
      showBusy(false); setProgress(0); return;
    }
    const cards = state.masks.map((m, idx) => {
      return { id:`occ_${Date.now()}_${idx}`, front: renderImageWithSingleMask(m), back: renderImageWithoutMasks(), tags: ['image-occlusion'], type: 'occlusion' };
    });
    state.deck.push(...cards);
    drawImage(); drawMasks();
    showBusy(false); setProgress(0);
    alert(`Created ${cards.length} occlusion cards in deck.`);
  }catch(err){
    console.error('One-click deck error', err);
    alert('Deck generation failed: ' + (err.message||err));
    showBusy(false); setProgress(0);
  }
});

// Render front/back images for cards
function renderImageWithoutMasks(){
  const c = document.createElement('canvas');
  c.width = imgCanvas.width; c.height = imgCanvas.height;
  const cx = c.getContext('2d'); cx.drawImage(imgBitmap, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
function renderImageWithSingleMask(mask){
  const c = document.createElement('canvas');
  c.width = imgCanvas.width; c.height = imgCanvas.height;
  const cx = c.getContext('2d'); cx.drawImage(imgBitmap,0,0,c.width,c.height);
  cx.fillStyle = "#1f2937"; cx.globalAlpha = 0.85; cx.fillRect(Math.round(mask.x), Math.round(mask.y), Math.round(mask.w), Math.round(mask.h)); cx.globalAlpha = 1;
  return c.toDataURL('image/png');
}

// Export .apkg (checks library presence)
exportApkgBtn.addEventListener('click', async () => {
  if(!window.AnkiExport && !window.AnkiExportDefault){
    alert('Anki export library not found. Make sure the CDN script is included in index.html.');
    console.error('AnkiExport not defined. Check script tag for anki-apkg-export CDN.');
    return;
  }
  if(state.deck.length === 0){ alert('No cards to export. Create occlusion cards first.'); return; }
  const deckName = document.getElementById('deckName')?.value || 'OccludeX Deck';
  const apkg = new (window.AnkiExport || window.AnkiExportDefault)(deckName);
  const media = [];
  for(const c of state.deck){
    if(c.type === 'occlusion' && c.front.startsWith('data:image')){
      const f1 = `front_${Math.random().toString(36).slice(2)}.png`;
      const f2 = `back_${Math.random().toString(36).slice(2)}.png`;
      media.push([f1, dataUrlToBlob(c.front)]); media.push([f2, dataUrlToBlob(c.back)]);
      apkg.addCard(`<img src="${f1}" />`, `<img src="${f2}" />`, (c.tags||[]).join(' '));
    } else {
      apkg.addCard(c.front, c.back, (c.tags||[]).join(' '));
    }
  }
  try{
    const blob = await apkg.saveAsBlob(media);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = deckName.replace(/\s+/g,'_') + '.apkg'; a.click(); URL.revokeObjectURL(url);
  }catch(err){
    console.error('Export error', err);
    alert('Export failed: ' + (err.message || err));
  }
});
function dataUrlToBlob(dataUrl){
  const [h,d] = dataUrl.split(',');
  const mime = h.match(/:(.*?);/)[1];
  const bin = atob(d); const arr = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return new Blob([arr], {type:mime});
}

// AI (Gemini) minimal wrapper (errors surfaced)
const geminiKeyInput = document.getElementById('geminiKey');
document.getElementById('generateAiBtn')?.addEventListener('click', async () => {
  const key = geminiKeyInput?.value?.trim();
  if(!key){ alert('Enter Gemini API key first'); return; }
  const src = document.getElementById('aiSourceText')?.value?.trim() || state.ocrText;
  if(!src){ alert('No source text: run OCR or paste text'); return; }
  try{
    showBusy(true,'Generating AI cards'); setProgress(0.03,'Calling Gemini');
    const prompt = `Return JSON: {"cards":[{"front":"...","back":"...","tags":["auto"]}]}\n\nText:\n${src}`;
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + encodeURIComponent(key), {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }] })
    });
    if(!res.ok) throw new Error('Gemini API error ' + res.status);
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : { cards: [] };
    state.aiCards = parsed.cards || [];
    // add to deck
    state.deck.push(...state.aiCards.map(c => ({ ...c, id: `ai_${Date.now()}_${Math.random()}`, type: c.type || 'ai' })));
    alert(`Generated ${state.aiCards.length} AI cards`);
    drawImage(); drawMasks();
    showBusy(false); setProgress(0);
  }catch(err){
    console.error('Gemini error', err);
    showBusy(false); setProgress(0);
    alert('AI generation failed: ' + (err.message || err) + '. If CORS blocked, use a server proxy or run in Chrome on desktop for key testing.');
  }
});

// Deck manager helpers (minimal UI interactions)
function renderDeckList(){
  const el = document.getElementById('deckList');
  if(!el) return;
  el.innerHTML = '';
  state.deck.forEach((c,i) => {
    const div = document.createElement('div'); div.className = 'card';
    div.innerHTML = `<div><strong>#${i+1}</strong> <span>${c.type||'card'}</span></div>
      <div><button class="btn" data-edit="${i}">Edit</button> <button class="btn danger" data-del="${i}">Delete</button></div>`;
    el.appendChild(div);
  });
  el.querySelectorAll('button[data-del]').forEach(b => b.onclick = () => {
    const idx = parseInt(b.getAttribute('data-del')); state.deck.splice(idx,1); renderDeckList();
  });
  el.querySelectorAll('button[data-edit]').forEach(b => b.onclick = () => {
    const idx = parseInt(b.getAttribute('data-edit'));
    const card = state.deck[idx];
    const front = prompt('Edit front (HTML allowed):', card.front);
    const back = prompt('Edit back (HTML allowed):', card.back);
    if(front != null) card.front = front; if(back != null) card.back = back; renderDeckList();
  });
}

// Bulk create occlusion cards from masks
bulkCreateBtn?.addEventListener('click', () => {
  if(!imgBitmap){ alert('Load image first'); return; }
  if(state.masks.length === 0){ alert('No masks to create cards from'); return; }
  const cards = state.masks.map((m, idx) => ({ id:`occ_${Date.now()}_${idx}`, front: renderImageWithSingleMask(m), back: renderImageWithoutMasks(), tags:['image-occlusion'], type:'occlusion' }));
  state.deck.push(...cards); renderDeckList(); alert(`Created ${cards.length} cards`);
});

// Local save/load
document.getElementById('saveLocalBtn')?.addEventListener('click', () => {
  const payload = { deckName: document.getElementById('deckName')?.value || 'OccludeX Deck', masks: state.masks, deck: state.deck };
  localStorage.setItem('occludex_saved', JSON.stringify(payload)); localStorage.setItem('gemini_key', geminiKeyInput?.value || '');
  alert('Saved locally');
});
document.getElementById('loadLocalBtn')?.addEventListener('click', () => {
  const p = JSON.parse(localStorage.getItem('occludex_saved') || '{}');
  if(p.deck){ state.masks = p.masks || []; state.deck = p.deck || []; document.getElementById('deckName').value = p.deckName || 'OccludeX Deck'; geminiKeyInput.value = localStorage.getItem('gemini_key') || ''; pushHistory(); drawImage(); drawMasks(); renderDeckList(); alert('Loaded'); } else alert('No saved deck found');
});
document.getElementById('clearLocalBtn')?.addEventListener('click', () => { localStorage.removeItem('occludex_saved'); alert('Cleared local storage'); });

// Review (FSRS-like)
document.getElementById('startReviewBtn')?.addEventListener('click', () => {
  const now = Date.now();
  const due = state.deck.filter(c => (state.fsrs[c.id]?.due || 0) <= now);
  const card = due[0] || state.deck[0];
  if(!card){ alert('No cards to review'); return; }
  showReview(card);
});
function showReview(card){
  const el = document.getElementById('reviewCard');
  if(!el) return;
  el.innerHTML = `<div class="card"><div><strong>Front</strong></div><div>${card.front.startsWith('data:image') ? `<img src="${card.front}" style="max-width:100%"/>` : escapeHtml(card.front)}</div><hr><div style="opacity:0.6">Rate below to reveal and schedule.</div></div>`;
  document.querySelectorAll('.reviewBtns .btn').forEach(btn => btn.onclick = () => rateCard(card, btn.dataset.rate));
}
function rateCard(card, rate){
  const el = document.getElementById('reviewCard'); if(!el) return;
  el.innerHTML = `<div class="card"><div><strong>Back</strong></div><div>${card.back.startsWith('data:image') ? `<img src="${card.back}" style="max-width:100%"/>` : escapeHtml(card.back)}</div></div>`;
  const s = state.fsrs[card.id] || { ease: 2.5, interval: 1, due: Date.now() };
  const now = Date.now();
  const map = { again: 0, hard: 0.8, good: 1.0, easy: 1.3 };
  const mult = map[rate] || 1.0;
  s.ease = Math.max(1.3, s.ease * (rate === 'again' ? 0.7 : mult));
  s.interval = Math.max(1, Math.round(s.interval * s.ease));
  s.due = now + s.interval * 24*60*60*1000;
  state.fsrs[card.id] = s;
  setTimeout(()=> alert(`Scheduled in ${s.interval} day(s).`), 40);
}

// Small utils
function escapeHtml(s){ return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

// Ensure there is at least a blank deck list container to avoid errors
renderDeckList();

// Initial draw
drawImage(); drawMasks();

// Debug guidance for you if buttons still appear to do nothing:
// - Open Safari -> Share -> Request Desktop Site -> Open Web Inspector (or use desktop Chrome) to view console errors.
// - If anki-apkg-export shows 404, ensure your index.html has:
//   <script src="https://cdn.jsdelivr.net/npm/anki-apkg-export@3.2.1/dist/anki-apkg-export.min.js"></script>
// - If Tesseract worker fails to load, try again on a different network or pre-bundle tesseract assets (large).
// - If Gemini returns CORS or 403, test the key on desktop curl or console and ensure billing/API access is enabled.

// End of script.js
