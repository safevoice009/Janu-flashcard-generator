/* OccludeX — client-only app
   - OCR via Tesseract.js
   - Image occlusion masks (canvas)
   - AI flashcards via Gemini API (key stored locally)
   - Export .apkg using anki-apkg-export
   - FSRS-like local review scheduling
*/

// Global state
const state = {
  image: null,
  masks: [], // {x,y,w,h}
  ocrText: "",
  aiCards: [], // {front, back, tags, type}
  deck: [],    // same shape as aiCards + occlusion cards
  fsrs: {},    // {cardId: {ease, interval, due}}
};

const imgCanvas = document.getElementById('imgCanvas');
const maskCanvas = document.getElementById('maskCanvas');
const ocrOutput = document.getElementById('ocrOutput');
const imageInput = document.getElementById('imageInput');

const ctxImg = imgCanvas.getContext('2d');
const ctxMask = maskCanvas.getContext('2d');

let imgBitmap = null;
let dragging = null;
let startPt = null;

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
  state.masks.forEach((m, i) => {
    ctxMask.fillStyle = "rgba(58, 91, 160, 0.55)";
    ctxMask.fillRect(m.x, m.y, m.w, m.h);
    ctxMask.strokeStyle = "rgba(255,255,255,0.8)";
    ctxMask.lineWidth = 1;
    ctxMask.strokeRect(m.x, m.y, m.w, m.h);
  });
}

imageInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const blob = await file.arrayBuffer();
  imgBitmap = await createImageBitmap(new Blob([blob]));
  fitCanvasToImage(imgBitmap);
  drawImage();
  drawMasks();
  state.masks = [];
  state.image = file;
  ocrOutput.textContent = "Image loaded. Ready for OCR or masks.";
});

// Mask interactions
maskCanvas.addEventListener('mousedown', (e) => {
  const rect = maskCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  if (e.button === 2) return; // context menu for delete
  startPt = {x, y};
  dragging = true;
});

maskCanvas.addEventListener('mousemove', (e) => {
  if (!dragging || !startPt) return;
  const rect = maskCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const w = x - startPt.x;
  const h = y - startPt.y;
  const temp = {x: startPt.x, y: startPt.y, w, h};
  drawImage(); drawMasks();
  // draw temp
  ctxMask.fillStyle = "rgba(247, 118, 142, 0.35)";
  ctxMask.fillRect(temp.x, temp.y, temp.w, temp.h);
});

maskCanvas.addEventListener('mouseup', (e) => {
  if (!dragging || !startPt) return;
  const rect = maskCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  let w = x - startPt.x;
  let h = y - startPt.y;
  if (w < 0) { startPt.x += w; w = -w; }
  if (h < 0) { startPt.y += h; h = -h; }
  state.masks.push({x: startPt.x, y: startPt.y, w, h});
  dragging = false; startPt = null;
  drawMasks();
});

maskCanvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const rect = maskCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  // delete nearest mask
  let idx = -1, best = 999999;
  state.masks.forEach((m, i) => {
    const cx = m.x + m.w/2, cy = m.y + m.h/2;
    const d = Math.hypot(cx-x, cy-y);
    if (d < best) { best = d; idx = i; }
  });
  if (idx >= 0) { state.masks.splice(idx,1); drawMasks(); }
});

// OCR
document.getElementById('scanOcrBtn').addEventListener('click', async () => {
  if (!state.image) { ocrOutput.textContent = "Upload an image first."; return; }
  ocrOutput.textContent = "Scanning with OCR…";
  const { data } = await Tesseract.recognize(state.image, 'eng', { logger: m => {} });
  state.ocrText = data.text;
  ocrOutput.textContent = state.ocrText.trim() || "(No text detected. Try higher quality or zoom.)";
});

// Auto-occlusion using OCR blocks
document.getElementById('autoOccludeBtn').addEventListener('click', async () => {
  if (!state.image) { ocrOutput.textContent = "Upload an image first."; return; }
  ocrOutput.textContent = "Finding text boxes…";
  const res = await Tesseract.recognize(state.image, 'eng', { });
  const boxes = res.data.blocks.flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words.map(w => w.bbox))));
  // Map original bbox to canvas coords
  // Note: assumes image fit; scale factors:
  const scaleX = imgCanvas.width / res.data.imageSize.width;
  const scaleY = imgCanvas.height / res.data.imageSize.height;
  boxes.forEach(b => {
    const x = Math.floor(b.x0 * scaleX);
    const y = Math.floor(b.y0 * scaleY);
    const w = Math.floor((b.x1 - b.x0) * scaleX);
    const h = Math.floor((b.y1 - b.y0) * scaleY);
    if (w*h > 50) state.masks.push({x,y,w,h});
  });
  drawMasks();
  ocrOutput.textContent = "Auto-occlusion complete. Adjust masks as needed.";
});

// Add manual blank mask
document.getElementById('addMaskBtn').addEventListener('click', () => {
  state.masks.push({x: 20, y: 20, w: 120, h: 60});
  drawMasks();
});

// Bulk create occlusion cards
document.getElementById('bulkCreateBtn').addEventListener('click', () => {
  if (!imgBitmap || state.masks.length === 0) {
    alert("Load an image and add masks first."); return;
  }
  // Create one card per mask: front = image with mask applied, back = image without that mask
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
  alert("Enter your Gemini API key in the field near AI section. It is stored locally (IndexedDB).");
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
    // Merge into deck
    state.deck.push(...state.aiCards.map(c => ({ ...c, id: `ai_${Date.now()}_${Math.random()}` })));
    renderDeckList();
  } catch (e) {
    alert("AI generation failed. Check your key or try shorter text.");
  }
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
  // Extract text
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  // Try to parse JSON within text
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

// Local storage (IndexedDB via simple fallback)
document.getElementById('saveLocalBtn').addEventListener('click', () => {
  const name = document.getElementById('deckName').value || 'Deck';
  const tag = document.getElementById('deckTag').value || 'tag';
  const payload = { name, tag, deck: state.deck };
  localStorage.setItem('occludex_deck', JSON.stringify(payload));
  localStorage.setItem('occludex_gemini_key', geminiKeyInput.value);
  alert("Saved locally.");
});

document.getElementById('loadLocalBtn').addEventListener('click', () => {
  const payload = JSON.parse(localStorage.getItem('occludex_deck') || '{}');
  if (payload.deck) {
    state.deck = payload.deck;
    document.getElementById('deckName').value = payload.name || 'Deck';
    document.getElementById('deckTag').value = payload.tag || 'tag';
    geminiKeyInput.value = localStorage.getItem('occludex_gemini_key') || '';
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

// Export .apkg
document.getElementById('exportApkgBtn').addEventListener('click', async () => {
  if (state.deck.length === 0) { alert("No cards to export."); return; }
  const deckName = document.getElementById('deckName').value || "OccludeX Deck";
  const apkg = new window.AnkiExport(deckName);

  // Add notes; handle image embedding for occlusion
  let media = [];
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
    alert("Export failed. Try fewer/lighter images.");
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
    <div style="opacity:0.5">Tap a rating below to reveal and schedule.</div>
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
  // Simple FSRS-like scheduling: adjust interval and ease
  const s = state.fsrs[card.id] || { ease: 2.5, interval: 1, due: Date.now() };
  const now = Date.now();
  const map = { again: 0, hard: 0.8, good: 1.0, easy: 1.3 };
  const mult = map[rate] || 1.0;
  s.ease = Math.max(1.3, s.ease * (rate === 'again' ? 0.7 : mult));
  s.interval = Math.max(1, Math.round(s.interval * s.ease));
  s.due = now + s.interval * 24*60*60*1000;
  state.fsrs[card.id] = s;
  setTimeout(() => alert(`Scheduled in ${s.interval} day(s).`), 50);
}

// Utils
function escapeHtml(s) {
  return s.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

// PWA install prompt
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredPrompt = e;
});
document.getElementById('installBtn').addEventListener('click', async () => {
  if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
});
