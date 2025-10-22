/* OccludeX — advanced touch-friendly client-only app
   - OCR via Tesseract.js
   - Image occlusion masks (canvas) with selection, move, resize, delete
   - Auto-occlusion via OCR bounding boxes
   - AI flashcards via Gemini API (key stored locally)
   - Export .apkg using anki-apkg-export
   - FSRS-like local review scheduling
   - Mobile-first interactions (iPad/iPhone/Android)
*/

// Global state
const state = {
  image: null,
  masks: [], // {x,y,w,h, id}
  selectedId: null,
  ocrText: "",
  aiCards: [], // {front, back, tags, type}
  deck: [],    // includes occlusion and ai cards
  fsrs: {},    // {cardId: {ease, interval, due}}
};

const imgCanvas = document.getElementById('imgCanvas');
const maskCanvas = document.getElementById('maskCanvas');
const ocrOutput = document.getElementById('ocrOutput');
const imageInput = document.getElementById('imageInput');

const ctxImg = imgCanvas.getContext('2d');
const ctxMask = maskCanvas.getContext('2d');

let imgBitmap = null;

// Interaction state
let dragMode = null; // 'draw' | 'move' | 'resize'
let dragStart = null; // {x,y}
let resizeCorner = null; // 'nw'|'ne'|'sw'|'se'
let activeMask = null; // reference to selected mask during move/resize

// Utility: coordinates
function getCanvasPoint(evt, canvas) {
  const rect = canvas.getBoundingClientRect();
  const x = (evt.touches ? evt.touches[0].clientX : evt.clientX) - rect.left;
  const y = (evt.touches ? evt.touches[0].clientY : evt.clientY) - rect.top;
  return { x, y };
}

function fitCanvasToImage(bitmap) {
  const maxH = 420, maxW = imgCanvas.clientWidth;
  const ratio = Math.min(maxW / bitmap.width, maxH / bitmap.height);
  imgCanvas.width = Math.floor(bitmap.width * ratio);
  imgCanvas.height = Math.floor(bitmap.height * ratio);
  maskCanvas.width = imgCanvas.width;
  maskCanvas.height = imgCanvas.height;
}

function drawImage() {
  if (!imgBitmap) return;
  ctxImg.clearRect(0,0,imgCanvas.width,imgCanvas.height);
  ctxImg.drawImage(imgBitmap, 0, 0, imgCanvas.width, imgCanvas.height);
}

function drawMasks() {
  ctxMask.clearRect(0,0,maskCanvas.width,maskCanvas.height);
  state.masks.forEach((m) => {
    const selected = m.id === state.selectedId;
    ctxMask.fillStyle = selected ? "rgba(122,162,247,0.45)" : "rgba(58, 91, 160, 0.45)";
    ctxMask.fillRect(m.x, m.y, m.w, m.h);
    ctxMask.strokeStyle = selected ? "#7aa2f7" : "rgba(255,255,255,0.8)";
    ctxMask.lineWidth = selected ? 2 : 1;
    ctxMask.strokeRect(m.x, m.y, m.w, m.h);
    if (selected) drawResizeHandles(m);
  });
}

function drawResizeHandles(m) {
  const handles = corners(m);
  ctxMask.fillStyle = "#f7768e";
  handles.forEach(h => ctxMask.fillRect(h.x-6, h.y-6, 12, 12));
}

function corners(m) {
  return [
    { name:'nw', x: m.x, y: m.y },
    { name:'ne', x: m.x + m.w, y: m.y },
    { name:'sw', x: m.x, y: m.y + m.h },
    { name:'se', x: m.x + m.w, y: m.y + m.h },
  ];
}

function findMaskAtPoint(x, y) {
  // check resize handles first
  const sel = state.masks.find(mm => mm.id === state.selectedId);
  if (sel) {
    for (const h of corners(sel)) {
      if (Math.abs(h.x - x) <= 10 && Math.abs(h.y - y) <= 10) {
        return { mask: sel, handle: h.name };
      }
    }
  }
  // then check masks
  for (let i = state.masks.length - 1; i >= 0; i--) {
    const m = state.masks[i];
    if (x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) {
      return { mask: m, handle: null };
    }
  }
  return { mask: null, handle: null };
}

imageInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const blob = await file.arrayBuffer();
  imgBitmap = await createImageBitmap(new Blob([blob]));
  fitCanvasToImage(imgBitmap);
  drawImage();
  state.masks = [];
  state.selectedId = null;
  state.image = file;
  drawMasks();
  ocrOutput.textContent = "Image loaded. Ready for OCR or masks.";
});

// Touch & mouse events for maskCanvas
function startDraw(evt) {
  evt.preventDefault();
  const { x, y } = getCanvasPoint(evt, maskCanvas);
  const hit = findMaskAtPoint(x, y);
  if (hit.handle && hit.mask) {
    state.selectedId = hit.mask.id;
    activeMask = hit.mask;
    dragMode = 'resize';
    resizeCorner = hit.handle;
  } else if (hit.mask) {
    state.selectedId = hit.mask.id;
    activeMask = hit.mask;
    dragMode = 'move';
    dragStart = { x, y, ox: x - activeMask.x, oy: y - activeMask.y };
  } else {
    // start drawing a new mask
    dragMode = 'draw';
    dragStart = { x, y };
    state.selectedId = null;
    activeMask = null;
  }
  drawMasks();
}

function moveDraw(evt) {
  if (!dragMode) return;
  evt.preventDefault();
  const { x, y } = getCanvasPoint(evt, maskCanvas);

  if (dragMode === 'draw') {
    // draw temp rectangle
    drawImage(); drawMasks();
    const temp = normalizeRect(dragStart.x, dragStart.y, x, y);
    ctxMask.fillStyle = "rgba(247,118,142,0.35)";
    ctxMask.fillRect(temp.x, temp.y, temp.w, temp.h);
    ctxMask.strokeStyle = "#f7768e";
    ctxMask.strokeRect(temp.x, temp.y, temp.w, temp.h);
  } else if (dragMode === 'move' && activeMask) {
    activeMask.x = x - dragStart.ox;
    activeMask.y = y - dragStart.oy;
    clampMask(activeMask);
    drawImage(); drawMasks();
  } else if (dragMode === 'resize' && activeMask) {
    resizeMask(activeMask, resizeCorner, x, y);
    clampMask(activeMask);
    drawImage(); drawMasks();
  }
}

function endDraw(evt) {
  if (!dragMode) return;
  evt.preventDefault();
  const { x, y } = getCanvasPoint(evt, maskCanvas);
  if (dragMode === 'draw') {
    const rect = normalizeRect(dragStart.x, dragStart.y, x, y);
    if (rect.w * rect.h > 25) {
      state.masks.push({ ...rect, id: genId() });
      state.selectedId = state.masks[state.masks.length - 1].id;
    }
  }
  dragMode = null;
  dragStart = null;
  resizeCorner = null;
  activeMask = null;
  drawMasks();
}

function dblTapDelete(evt) {
  // double-tap to delete selected
  const { x, y } = getCanvasPoint(evt, maskCanvas);
  const hit = findMaskAtPoint(x, y);
  if (hit.mask) {
    const idx = state.masks.findIndex(m => m.id === hit.mask.id);
    if (idx >= 0) {
      state.masks.splice(idx, 1);
      if (state.selectedId === hit.mask.id) state.selectedId = null;
      drawMasks();
    }
  }
}

// mouse
maskCanvas.addEventListener('mousedown', startDraw);
maskCanvas.addEventListener('mousemove', moveDraw);
maskCanvas.addEventListener('mouseup', endDraw);
maskCanvas.addEventListener('dblclick', dblTapDelete);
// touch
maskCanvas.addEventListener('touchstart', startDraw, { passive: false });
maskCanvas.addEventListener('touchmove', moveDraw, { passive: false });
maskCanvas.addEventListener('touchend', endDraw, { passive: false });
maskCanvas.addEventListener('touchcancel', endDraw, { passive: false });

// helpers
function normalizeRect(x0, y0, x1, y1) {
  let x = x0, y = y0, w = x1 - x0, h = y1 - y0;
  if (w < 0) { x = x1; w = -w; }
  if (h < 0) { y = y1; h = -h; }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}
function clampMask(m) {
  m.x = Math.max(0, Math.min(m.x, maskCanvas.width - m.w));
  m.y = Math.max(0, Math.min(m.y, maskCanvas.height - m.h));
}
function resizeMask(m, corner, x, y) {
  const right = m.x + m.w, bottom = m.y + m.h;
  if (corner === 'nw') {
    const nx = Math.min(x, right - 10);
    const ny = Math.min(y, bottom - 10);
    m.w = right - nx; m.h = bottom - ny; m.x = nx; m.y = ny;
  } else if (corner === 'ne') {
    const nx = Math.max(x, m.x + 10);
    const ny = Math.min(y, bottom - 10);
    m.w = nx - m.x; m.h = bottom - ny; m.y = ny;
  } else if (corner === 'sw') {
    const nx = Math.min(x, right - 10);
    const ny = Math.max(y, m.y + 10);
    m.w = right - nx; m.h = ny - m.y; m.x = nx;
  } else if (corner === 'se') {
    const nx = Math.max(x, m.x + 10);
    const ny = Math.max(y, m.y + 10);
    m.w = nx - m.x; m.h = ny - m.y;
  }
}
function genId() { return 'm_' + Math.random().toString(36).slice(2); }

// OCR
document.getElementById('scanOcrBtn').addEventListener('click', async () => {
  if (!state.image) { ocrOutput.textContent = "Upload an image first."; return; }
  ocrOutput.textContent = "Scanning with OCR…";
  const { data } = await Tesseract.recognize(state.image, 'eng', { logger: m => {} });
  state.ocrText = data.text;
  ocrOutput.textContent = state.ocrText.trim() || "(No text detected. Try higher quality or zoom.)";
});

// Auto-occlusion using OCR words
document.getElementById('autoOccludeBtn').addEventListener('click', async () => {
  if (!state.image) { ocrOutput.textContent = "Upload an image first."; return; }
  ocrOutput.textContent = "Finding text boxes…";
  const res = await Tesseract.recognize(state.image, 'eng', { });
  const scaleX = imgCanvas.width / res.data.imageSize.width;
  const scaleY = imgCanvas.height / res.data.imageSize.height;

  // Collect word boxes and merge nearby ones
  const wordBoxes = [];
  res.data.blocks.forEach(b => b.paragraphs.forEach(p => p.lines.forEach(l => l.words.forEach(w => {
    const x = Math.floor(w.bbox.x0 * scaleX);
    const y = Math.floor(w.bbox.y0 * scaleY);
    const wdt = Math.floor((w.bbox.x1 - w.bbox.x0) * scaleX);
    const hgt = Math.floor((w.bbox.y1 - w.bbox.y0) * scaleY);
    if (wdt*hgt > 30) wordBoxes.push({ x, y, w: wdt, h: hgt });
  }))));

  const merged = mergeBoxes(wordBoxes, 12);
  // Add as masks
  merged.forEach(r => state.masks.push({ ...r, id: genId() }));
  drawMasks();
  ocrOutput.textContent = "Auto-occlusion complete. Adjust masks as needed.";
});

function mergeBoxes(boxes, pad = 8) {
  // simple clustering: merge overlapping/nearby boxes horizontally or vertically
  const out = [];
  boxes.sort((a,b)=> a.y === b.y ? a.x - b.x : a.y - b.y);
  for (const b of boxes) {
    let merged = false;
    for (const o of out) {
      if (overlapsOrNear(o, b, pad)) {
        const nx = Math.min(o.x, b.x);
        const ny = Math.min(o.y, b.y);
        const rx = Math.max(o.x + o.w, b.x + b.w);
        const by = Math.max(o.y + o.h, b.y + b.h);
        o.x = nx; o.y = ny; o.w = rx - nx; o.h = by - ny;
        merged = true; break;
      }
    }
    if (!merged) out.push({ ...b });
  }
  return out;
}
function overlapsOrNear(a, b, pad) {
  return !(a.x > b.x + b.w + pad || a.x + a.w + pad < b.x || a.y > b.y + b.h + pad || a.y + a.h + pad < b.y);
}

// Add manual blank mask
document.getElementById('addMaskBtn').addEventListener('click', () => {
  state.masks.push({ x: 20, y: 20, w: 120, h: 60, id: genId() });
  state.selectedId = state.masks[state.masks.length - 1].id;
  drawMasks();
});

// Bulk create occlusion cards
document.getElementById('bulkCreateBtn').addEventListener('click', () => {
  if (!imgBitmap || state.masks.length === 0) {
    alert("Load an image and add masks first."); return;
  }
  const cards = state.masks.map((m, idx) => {
    const front = renderImageWithSingleMask(m);
    const back = renderImageWithoutMasks();
    return { id: `occ_${Date.now()}_${idx}`, front, back, tags: ['image-occlusion'], type: 'occlusion' };
  });
  state.deck.push(...cards);
  renderDeckList();
  alert(`Created ${cards.length} occlusion cards.`);
});

function renderImageWithoutMasks() {
  const c = document.createElement('canvas');
  c.width = imgCanvas.width; c.height = imgCanvas.height;
  const cx = c.getContext('2d');
  cx.drawImage(imgBitmap, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

function renderImageWithSingleMask(mask) {
  const c = document.createElement('canvas');
  c.width = imgCanvas.width; c.height = imgCanvas.height;
  const cx = c.getContext('2d');
  cx.drawImage(imgBitmap, 0, 0, c.width, c.height);
  cx.fillStyle = "#1f2937";
  cx.globalAlpha = 0.85;
  cx.fillRect(mask.x, mask.y, mask.w, mask.h);
  cx.globalAlpha = 1;
  return c.toDataURL('image/png');
}

// AI generation (Gemini)
const geminiKeyInput = document.getElementById('geminiKey');
document.getElementById('settingsBtn').addEventListener('click', () => {
  alert("Enter your Gemini API key in the AI section. It’s stored locally.");
});

document.getElementById('generateAiBtn').addEventListener('click', async () => {
  const key = geminiKeyInput.value.trim();
  if (!key) { alert("Add your Gemini API key first."); return; }
  const mode = document.getElementById('aiMode').value;
  const src = document.getElementById('aiSourceText').value.trim() || state.ocrText;
  if (!src) { alert("Provide text via OCR or paste."); return; }

  const prompt = buildPrompt(mode, src);
  try {
    const output = await callGeminiJSON(key, prompt);
    state.aiCards = output.cards || [];
    renderAiCards();
    state.deck.push(...state.aiCards.map(c => ({ ...c, id: `ai_${Date.now()}_${Math.random()}` })));
    renderDeckList();
  } catch (e) {
    alert("AI generation failed. Check your key or try shorter text.");
  }
});

// AI suggests occlusion keywords
document.getElementById('suggestOccludeBtn').addEventListener('click', async () => {
  const key = geminiKeyInput.value.trim();
  const text = state.ocrText.trim();
  if (!key) { alert("Add your Gemini API key first."); return; }
  if (!text) { alert("Run OCR first."); return; }
  const prompt = `From the text below, list key terms to occlude on an anatomy diagram (e.g., artery names).
Return JSON: { "terms": ["term1","term2",...] }.
Text:
${text}`;
  try {
    const res = await callGeminiJSON(key, prompt);
    const terms = res.terms || [];
    if (terms.length === 0) { alert("No terms suggested."); return; }
    alert("Suggested terms: " + terms.slice(0,10).join(', '));
  } catch (e) { alert("AI suggestion failed."); }
});

function buildPrompt(mode, text) {
  return `You are generating Anki-style flashcards.
Type: ${mode}
Input text:
${text}

Return JSON: { "cards": [ { "front": "...", "back": "...", "tags": ["auto"], "type": "${mode}" } ] }.
For cloze, use {{c1::...}} format on front and plain on back.
For mcq, front: question + choices A-D; back: correct answer + brief explanation.`;
}

// Minimal Gemini JSON call (text-only)
async function callGeminiJSON(key, prompt) {
  const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key="+encodeURIComponent(key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }]}]
    })
  });
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const m = text.match(/\{[\s\S]*\}/);
  const json = m ? JSON.parse(m[0]) : { cards: [] };
  return json;
}

function renderAiCards() {
  const aiList = document.getElementById('aiCards');
  aiList.innerHTML = "";
  state.aiCards.forEach(c => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `<strong>Front:</strong><br>${escapeHtml(c.front)}<br><br><strong>Back:</strong><br>${escapeHtml(c.back)}<br><span class="chip">${(c.tags||[]).join(', ')}</span>`;
    aiList.appendChild(div);
  });
}

// Deck manager
function renderDeckList() {
  const el = document.getElementById('deckList');
  el.innerHTML = "";
  state.deck.forEach((c, i) => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `<div><strong>#${i+1}</strong> <span>${c.type||'card'}</span></div>
      <div>
        <button class="btn" data-edit="${i}">Edit</button>
        <button class="btn danger" data-del="${i}">Delete</button>
      </div>`;
    el.appendChild(div);
  });
  el.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', () => {
    const idx = parseInt(b.getAttribute('data-del'));
    state.deck.splice(idx,1); renderDeckList();
  }));
  el.querySelectorAll('button[data-edit]').forEach(b => b.addEventListener('click', () => {
    const idx = parseInt(b.getAttribute('data-edit'));
    const card = state.deck[idx];
    const front = prompt("Edit front:", card.front);
    const back = prompt("Edit back:", card.back);
    if (front != null) card.front = front;
    if (back != null) card.back = back;
    renderDeckList();
  }));
}

// Local storage
document.getElementById('saveLocalBtn').addEventListener('click', () => {
  const name = document.getElementById('deckName').value || 'Deck';
  const tag = document.getElementById('deckTag').value || 'tag';
  const payload = { name, tag, deck: state.deck, masks: state.masks };
  localStorage.setItem('occludex_deck', JSON.stringify(payload));
  localStorage.setItem('occludex_gemini_key', geminiKeyInput.value);
  alert("Saved locally.");
});

document.getElementById('loadLocalBtn').addEventListener('click', () => {
  const payload = JSON.parse(localStorage.getItem('occludex_deck') || '{}');
  if (payload.deck) {
    state.deck = payload.deck;
    state.masks = payload.masks || [];
    document.getElementById('deckName').value = payload.name || 'Deck';
    document.getElementById('deckTag').value = payload.tag || 'tag';
    geminiKeyInput.value = localStorage.getItem('occludex_gemini_key') || '';
    drawMasks();
    renderDeckList();
    alert("Loaded deck.");
  } else {
    alert("No saved deck found.");
  }
});

document.getElementById('clearLocalBtn').addEventListener('click', () => {
  localStorage.removeItem('occludex_deck');
  alert("Cleared local deck.");
});

// Export .apkg (correct API)
document.getElementById('exportApkgBtn').addEventListener('click', async () => {
  if (state.deck.length === 0) { alert("No cards to export."); return; }
  const deckName = document.getElementById('deckName').value || "OccludeX Deck";
  const apkg = new window.AnkiExport(deckName);

  // Add notes; embed images if occlusion
  const media = [];
  for (const c of state.deck) {
    if (c.type === 'occlusion' && c.front.startsWith('data:image')) {
      const fnameFront = `front_${Math.random().toString(36).slice(2)}.png`;
      const fnameBack = `back_${Math.random().toString(36).slice(2)}.png`;
      media.push([fnameFront, dataUrlToBlob(c.front)]);
      media.push([fnameBack, dataUrlToBlob(c.back)]);
      const frontHTML = `<img src="${fnameFront}" style="max-width:100%">`;
      const backHTML = `<img src="${fnameBack}" style="max-width:100%">`;
      apkg.addCard(frontHTML, backHTML, (c.tags||[]).join(' '));
    } else {
      apkg.addCard(c.front, c.back, (c.tags||[]).join(' '));
    }
  }

  try {
    const zipBlob = await apkg.saveAsBlob(media);
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = deckName.replace(/\s+/g,'_') + ".apkg";
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert("Export failed. Try fewer/lighter images. " + (e?.message||""));
  }
});

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const bin = atob(data);
  const arr = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// Review (FSRS-like)
document.getElementById('startReviewBtn').addEventListener('click', () => {
  const now = Date.now();
  const dueCards = state.deck.filter(c => {
    const s = state.fsrs[c.id] || { due: now-1 };
    return s.due <= now;
  });
  const card = dueCards[0] || state.deck[0];
  if (!card) { alert("No cards available."); return; }
  showReviewCard(card);
});

function showReviewCard(card) {
  const el = document.getElementById('reviewCard');
  el.innerHTML = `<div class="card">
    <div><strong>Front</strong></div>
    <div>${card.front.startsWith('data:image') ? `<img src="${card.front}" style="max-width:100%">` : escapeHtml(card.front)}</div>
    <hr>
    <div style="opacity:0.6">Rate below to reveal and schedule.</div>
  </div>`;
  document.querySelectorAll('.reviewBtns .btn').forEach(btn => {
    btn.onclick = () => rateCard(card, btn.dataset.rate);
  });
}

function rateCard(card, rate) {
  const el = document.getElementById('reviewCard');
  el.innerHTML = `<div class="card">
    <div><strong>Back</strong></div>
    <div>${card.back.startsWith('data:image') ? `<img src="${card.back}" style="max-width:100%">` : escapeHtml(card.back)}</div>
  </div>`;
  const s = state.fsrs[card.id] || { ease: 2.5, interval: 1, due: Date.now() };
  const now = Date.now();
  const map = { again: 0, hard: 0.8, good: 1.0, easy: 1.3 };
  const mult = map[rate] || 1.0;
  s.ease = Math.max(1.3, s.ease * (rate === 'again' ? 0.7 : mult));
  s.interval = Math.max(1, Math.round(s.interval * s.ease));
  s.due = now + s.interval * 24*60*60*1000;
  state.fsrs[card.id] = s;
  setTimeout(() => alert(`Scheduled in ${s.interval} day(s).`), 20);
}

// Utils
function escapeHtml(s) {
  return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

// PWA install prompt
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredPrompt = e;
});
document.getElementById('installBtn').addEventListener('click', async () => {
  if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
});
