window.addEventListener('error', e => setStatus('Error: ' + e.message, true));
window.addEventListener('unhandledrejection', e => setStatus('Error: ' + (e.reason?.message || e.reason), true));
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

const RENDER_SCALE = 300 / 72;           // render PDF pages at 300 DPI
const DPI = 300;
const $ = id => document.getElementById(id);

const state = {
  pages: [],                                  // full-res canvases, one per page
  active: 'front',
  boxes: {                                    // coordinates in full-res page pixels
    front: { page: 0, x: 0, y: 0, w: 0, h: 0, rot: 0, flip: false },
    back:  { page: 0, x: 0, y: 0, w: 0, h: 0, rot: 0, flip: false },
  },
  fx: { b: 100, c: 100, s: 100 },
  viewScale: 1,
  fileName: 'card',
};

// ---------- File loading ----------
const dropZone = $('dropZone'), fileInput = $('fileInput');
// The drop zone is a <label> wrapping the input, so clicking it opens the file picker natively.
$('newFileBtn').onclick = () => fileInput.click();
fileInput.onchange = e => {
  const f = e.target.files[0];
  e.target.value = '';                  // allow re-selecting the same file
  if (f) loadFile(f);
};
['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('over'); }));
// Accept drops anywhere on the page so the browser never navigates away to open the PDF itself.
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('over');
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
});
// Paste a screenshot or copied file with Ctrl+V.
window.addEventListener('paste', e => {
  const item = [...(e.clipboardData?.items || [])].find(i => i.kind === 'file');
  if (item) loadFile(item.getAsFile());
});

async function loadFile(file) {
  setStatus('Loading…');
  state.fileName = file.name.replace(/\.[^.]+$/, '') || 'card';
  try {
    state.pages = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
      ? await renderPdf(file) : [await loadImage(file)];
  } catch (err) {
    setStatus('Could not open file: ' + (err.message || err), true);
    return;
  }
  const sel = $('pageSelect');
  sel.innerHTML = state.pages.map((_, i) => `<option value="${i}">${i + 1}</option>`).join('');
  // A new file starts with no rotation or flip carried over from the previous one.
  for (const b of Object.values(state.boxes)) { b.rot = 0; b.flip = false; }
  $('dropZoneWrap').classList.add('hidden');
  $('editor').classList.remove('hidden');
  $('app').classList.remove('empty');
  document.querySelectorAll('#steps li').forEach(li => {
    li.classList.toggle('done', li.dataset.step === '1');
    li.classList.toggle('active', li.dataset.step !== '1');
  });
  ['dlPdf', 'dlJpg', 'printBtn'].forEach(id => $(id).disabled = false);
  autoDetect();
  setStatus(`${state.pages.length} page(s) loaded. ${$('status').textContent}`);
}

async function renderPdf(file) {
  if (!window.pdfjsLib) throw new Error('PDF library missing – keep the "lib" folder next to index.html');
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: RENDER_SCALE });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    out.push(c);
  }
  return out;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
      resolve(c);
    };
    img.onerror = () => reject(new Error('unsupported image'));
    img.src = URL.createObjectURL(file);
  });
}

// ---------- Auto detection ----------
// Finds card-shaped regions: downscale, mark non-white pixels, group them into
// connected blobs, keep blobs whose bounding box has a card-like aspect ratio.
function detectCards(canvas) {
  const target = 700;
  const k = Math.min(1, target / Math.max(canvas.width, canvas.height));
  const W = Math.round(canvas.width * k), H = Math.round(canvas.height * k);
  const small = document.createElement('canvas');
  small.width = W; small.height = H;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(canvas, 0, 0, W, H);
  const px = sctx.getImageData(0, 0, W, H).data;

  const ink = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    ink[i] = (r < 235 || g < 235 || b < 235) ? 1 : 0;
  }
  // Dilate by 2px so card contents merge with their border into one blob.
  const dil = new Uint8Array(W * H);
  const R = 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!ink[y * W + x]) continue;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H) dil[ny * W + nx] = 1;
    }
  }
  const seen = new Uint8Array(W * H), blobs = [], stack = [];
  for (let i = 0; i < W * H; i++) {
    if (!dil[i] || seen[i]) continue;
    let minX = W, minY = H, maxX = 0, maxY = 0;
    stack.push(i); seen[i] = 1;
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p / W) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      const nb = [p - 1, p + 1, p - W, p + W];
      for (let j = 0; j < 4; j++) {
        const q = nb[j];
        if (q < 0 || q >= W * H || seen[q] || !dil[q]) continue;
        if ((j === 0 && x === 0) || (j === 1 && x === W - 1)) continue;
        seen[q] = 1; stack.push(q);
      }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const ratio = Math.max(w, h) / Math.min(w, h);
    if (w * h > W * H * 0.02 && w * h < W * H * 0.9 && ratio > 1.3 && ratio < 1.95) {
      blobs.push({ x: (minX + R) / k, y: (minY + R) / k, w: (w - 2 * R) / k, h: (h - 2 * R) / k, area: w * h });
    }
  }
  // Card-shaped page with no smaller card on it (e.g. Sarathi DL PDFs, one card per page):
  // the page itself is the card, so use its content trimmed of any white margin.
  const pageRatio = Math.max(W, H) / Math.min(W, H);
  if (!blobs.length && pageRatio > 1.45 && pageRatio < 1.8) {
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!ink[y * W + x]) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return maxX < 0 ? [] : [{ x: minX / k, y: minY / k, w: (maxX - minX + 1) / k, h: (maxY - minY + 1) / k }];
  }
  blobs.sort((a, b) => b.area - a.area);
  return blobs.slice(0, 2).sort((a, b) => (Math.abs(a.y - b.y) < a.h / 2 ? a.x - b.x : a.y - b.y));
}

function autoDetect() {
  const found = [];
  state.pages.forEach((pg, i) => detectCards(pg).forEach(b => found.push({ ...b, page: i })));
  const fallback = (idx) => {
    const pg = state.pages[0], w = pg.width * 0.42, h = w * (54 / 85.6);
    return { page: 0, x: pg.width * (idx ? 0.53 : 0.05), y: pg.height * 0.03, w, h };
  };
  ['front', 'back'].forEach((key, idx) => {
    const src = found[idx] || fallback(idx);
    Object.assign(state.boxes[key], { page: src.page, x: src.x, y: src.y, w: src.w, h: src.h });
  });
  setStatus(found.length >= 2 ? 'Detected front and back cards.' :
    found.length === 1 ? 'Detected one card; place the other box manually.' : 'No cards detected; place boxes manually.');
  showActivePage();
}
$('autoBtn').onclick = autoDetect;

// ---------- Editor stage ----------
const stage = $('stage'), pageCanvas = $('pageCanvas');
const boxEls = {};
['front', 'back'].forEach(key => {
  const el = document.createElement('div');
  el.className = 'box ' + key;
  el.innerHTML = `<span class="tag">${key === 'front' ? 'FRONT' : 'BACK'}</span>` +
    ['nw', 'ne', 'sw', 'se'].map(h => `<div class="h ${h}" data-h="${h}"></div>`).join('');
  stage.appendChild(el);
  boxEls[key] = el;
  el.addEventListener('pointerdown', e => startDrag(e, key));
});

function setActive(key) {
  state.active = key;
  $('selFront').classList.toggle('active', key === 'front');
  $('selBack').classList.toggle('active', key === 'back');
  showActivePage();
}
$('selFront').onclick = () => setActive('front');
$('selBack').onclick = () => setActive('back');
$('pageSelect').onchange = e => { state.boxes[state.active].page = +e.target.value; showActivePage(); };

function showActivePage() {
  const pIdx = state.boxes[state.active].page;
  const src = state.pages[pIdx];
  if (!src) return;
  $('pageSelect').value = pIdx;
  const wrap = stage.parentElement, cs = getComputedStyle(wrap);
  const maxW = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 1;
  state.viewScale = Math.min(1, maxW / src.width);
  pageCanvas.width = Math.round(src.width * state.viewScale);
  pageCanvas.height = Math.round(src.height * state.viewScale);
  pageCanvas.getContext('2d').drawImage(src, 0, 0, pageCanvas.width, pageCanvas.height);
  layoutBoxes();
  renderPreviews();
}

function layoutBoxes() {
  const pIdx = state.boxes[state.active].page;
  for (const key of ['front', 'back']) {
    const b = state.boxes[key], el = boxEls[key], s = state.viewScale;
    el.classList.toggle('hidden', b.page !== pIdx);
    Object.assign(el.style, { left: b.x * s + 'px', top: b.y * s + 'px', width: b.w * s + 'px', height: b.h * s + 'px' });
    el.style.zIndex = key === state.active ? 2 : 1;
  }
}

function startDrag(e, key) {
  e.preventDefault(); e.stopPropagation();
  if (state.active !== key) { state.active = key; setActive(key); }
  const b = state.boxes[key], s = state.viewScale;
  const handle = e.target.dataset.h;
  const start = { mx: e.clientX, my: e.clientY, ...b };
  const ratio = parseFloat($('cardW').value) / parseFloat($('cardH').value) || 85.6 / 54;
  const pg = state.pages[b.page];
  const el = boxEls[key];
  el.setPointerCapture(e.pointerId);

  const move = ev => {
    const dx = (ev.clientX - start.mx) / s, dy = (ev.clientY - start.my) / s;
    if (!handle) {
      b.x = clamp(start.x + dx, 0, Math.max(0, pg.width - b.w));
      b.y = clamp(start.y + dy, 0, Math.max(0, pg.height - b.h));
    } else {
      const west = handle.includes('w'), north = handle.includes('n');
      // The opposite corner stays fixed, so the box may only grow as far as the page edge.
      const maxW = west ? start.x + start.w : pg.width - start.x;
      const maxH = north ? start.y + start.h : pg.height - start.y;
      let w = clamp(start.w + (west ? -dx : dx), 40, maxW);
      let h = clamp(start.h + (north ? -dy : dy), 25, maxH);
      if ($('lockRatio').checked) {
        const curRatio = start.w / start.h > 1 ? ratio : 1 / ratio;
        h = w / curRatio;
        if (h > maxH) { h = maxH; w = h * curRatio; }
      }
      b.w = w; b.h = h;
      b.x = west ? start.x + start.w - w : start.x;
      b.y = north ? start.y + start.h - h : start.y;
    }
    layoutBoxes();
    renderPreviews();
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);   // e.g. touch scroll takes over; otherwise the drag gets stuck
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
window.addEventListener('resize', () => state.pages.length && showActivePage());

// ---------- Rendering cards ----------
function filterString() {
  const { b, c, s } = state.fx;
  return `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
}

// Draws one card at the requested pixel size (landscape), applying crop, rotation, flip and filters.
function renderCard(key, outW, outH) {
  const b = state.boxes[key], src = state.pages[b.page];
  const out = document.createElement('canvas');
  out.width = outW; out.height = outH;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, outW, outH);
  if (!src || !b.w) return out;
  ctx.save();
  ctx.filter = filterString();
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate(b.rot * Math.PI / 180);
  if (b.flip) ctx.scale(-1, 1);
  const sideways = b.rot % 180 !== 0;
  const dw = sideways ? outH : outW, dh = sideways ? outW : outH;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, b.x, b.y, b.w, b.h, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  return out;
}

function cardPx() {
  const w = parseFloat($('cardW').value) || 8.56, h = parseFloat($('cardH').value) || 5.4;
  return { wcm: w, hcm: h, w: Math.round(w / 2.54 * DPI), h: Math.round(h / 2.54 * DPI) };
}

let previewQueued = false;
function renderPreviews() {
  if (previewQueued) return;
  previewQueued = true;
  requestAnimationFrame(() => {
    previewQueued = false;
    const { wcm, hcm } = cardPx();
    const pw = 400, ph = Math.round(pw * hcm / wcm);
    for (const [key, id] of [['front', 'prevFront'], ['back', 'prevBack']]) {
      const c = $(id), card = renderCard(key, pw, ph);
      c.width = pw; c.height = ph;
      c.getContext('2d').drawImage(card, 0, 0);
    }
  });
}

document.querySelectorAll('[data-rot]').forEach(btn => btn.onclick = () => {
  const b = state.boxes[btn.dataset.rot]; b.rot = (b.rot + 90) % 360; renderPreviews();
});
document.querySelectorAll('[data-flip]').forEach(btn => btn.onclick = () => {
  const b = state.boxes[btn.dataset.flip]; b.flip = !b.flip; renderPreviews();
});
$('swapBtn').onclick = () => {
  [state.boxes.front, state.boxes.back] = [state.boxes.back, state.boxes.front];
  showActivePage();
};
const FX_INPUTS = [['bright', 'b'], ['contrast', 'c'], ['sat', 's']];
function syncFxLabels() { FX_INPUTS.forEach(([id, k]) => $(id + 'Val').textContent = state.fx[k] + '%'); }
FX_INPUTS.forEach(([id, k]) =>
  $(id).oninput = e => { state.fx[k] = +e.target.value; syncFxLabels(); renderPreviews(); });
$('resetFx').onclick = () => {
  state.fx = { b: 100, c: 100, s: 100 };
  $('bright').value = $('contrast').value = $('sat').value = 100;
  syncFxLabels();
  renderPreviews();
};
['cardW', 'cardH'].forEach(id => $(id).oninput = () => { updatePaperSpec(); renderPreviews(); });
function updatePaperSpec() {
  const { wcm, hcm } = cardPx();
  const txt = `${fmtCm(wcm)} × ${fmtCm(hcm)} cm`;
  $('cardSpec').textContent = txt;
}

// ---------- Print output: each page is exactly card size (landscape), one card per page ----------
// Page size = Card width × height (8.5 × 5.5 cm by default); paper is chosen in the printer dialog.
function pageCm() {
  const { wcm, hcm } = cardPx();
  return { w: wcm, h: hcm };
}
const fmtCm = v => (Math.round(v * 100) / 100).toString();
const MODE_NOTES = {
  color: '2 pages: front, back (color)',
  gray: '2 pages: front, back (grayscale)',
  both: '4 pages: front, back (color), then front, back (grayscale)',
};
let colorMode = 'color';

document.querySelectorAll('#colorMode .seg').forEach(btn => btn.onclick = () => {
  colorMode = btn.dataset.mode;
  document.querySelectorAll('#colorMode .seg').forEach(b => {
    b.classList.toggle('active', b === btn);
    b.setAttribute('aria-checked', b === btn);
  });
  $('modeNote').textContent = MODE_NOTES[colorMode];
  renderSheetPreview();
});
$('rounded').onchange = renderSheetPreview;

function toGray(canvas) {
  const out = document.createElement('canvas');
  out.width = canvas.width; out.height = canvas.height;
  const ctx = out.getContext('2d');
  ctx.filter = 'grayscale(100%)';
  ctx.drawImage(canvas, 0, 0);
  return out;
}

// Same as ctx.roundRect(0, 0, w, h, r), which older browsers lack.
function roundedRectPath(ctx, w, h, r) {
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r); ctx.arcTo(w, h, 0, h, r);
  ctx.arcTo(0, h, 0, 0, r); ctx.arcTo(0, 0, w, 0, r);
  ctx.closePath();
}

function clipRounded(card) {
  if (!$('rounded').checked) return card;
  const r = Math.round(card.width * 0.037);   // ~3.18 mm corner radius on CR80
  const out = document.createElement('canvas');
  out.width = card.width; out.height = card.height;
  const ctx = out.getContext('2d');
  ctx.beginPath(); roundedRectPath(ctx, card.width, card.height, r); ctx.clip();
  ctx.drawImage(card, 0, 0);
  return out;
}

// The page is exactly card size and the card covers it edge to edge.
function composePage(card, dpi) {
  const pg = pageCm();
  const pw = Math.round(pg.w / 2.54 * dpi), ph = Math.round(pg.h / 2.54 * dpi);
  const page = document.createElement('canvas');
  page.width = pw; page.height = ph;
  const ctx = page.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pw, ph);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(card, 0, 0, pw, ph);
  return page;
}

// Returns [{ canvas, label }] in print order for the selected colour mode.
function buildPages(dpi = DPI) {
  // Render the cards straight at their print resolution so they stay sharp.
  const { wcm, hcm } = cardPx();
  const w = Math.round(wcm / 2.54 * dpi), h = Math.round(hcm / 2.54 * dpi);
  const cards = {
    front: clipRounded(renderCard('front', w, h)),
    back: clipRounded(renderCard('back', w, h)),
  };
  const set = gray => ['front', 'back'].map(side => ({
    canvas: composePage(gray ? toGray(cards[side]) : cards[side], dpi),
    label: `${side === 'front' ? 'Front' : 'Back'}${gray ? ' · Gray' : colorMode === 'both' ? ' · Color' : ''}`,
    file: `${side}${gray ? '_gray' : colorMode === 'both' ? '_color' : ''}`,
  }));
  if (colorMode === 'color') return set(false);
  if (colorMode === 'gray') return set(true);
  return [...set(false), ...set(true)];
}

function renderSheetPreview() {
  const box = $('sheetPreview');
  if (!state.pages.length) { box.innerHTML = ''; return; }
  const pages = buildPages(60);
  box.innerHTML = '';
  pages.forEach((p, i) => {
    const fig = document.createElement('figure');
    fig.appendChild(p.canvas);
    const cap = document.createElement('figcaption');
    cap.textContent = `Page ${i + 1} · ${p.label}`;
    fig.appendChild(cap);
    box.appendChild(fig);
  });
}

let sheetTimer = 0;
const _renderPreviews = renderPreviews;
renderPreviews = function () {
  _renderPreviews();
  clearTimeout(sheetTimer);
  sheetTimer = setTimeout(renderSheetPreview, 150);
};

$('dlPdf').onclick = () => {
  setStatus('Building PDF…');
  const pages = buildPages();
  const pg = pageCm();
  const doc = new window.jspdf.jsPDF({ unit: 'cm', format: [pg.w, pg.h], orientation: 'landscape' });
  pages.forEach((p, i) => {
    if (i) doc.addPage([pg.w, pg.h], 'landscape');
    doc.addImage(p.canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pg.w, pg.h);
  });
  doc.save(`${state.fileName}_card.pdf`);
  setStatus(`PDF downloaded (${pages.length} pages, ${fmtCm(pg.w)} × ${fmtCm(pg.h)} cm).`);
};

$('dlJpg').onclick = () => {
  const pages = buildPages();
  pages.forEach((p, i) => setTimeout(() => {
    const a = document.createElement('a');
    a.download = `${state.fileName}_${p.file}_card.jpg`;
    a.href = p.canvas.toDataURL('image/jpeg', 0.95);
    a.click();
  }, i * 300));
  const c = pages[0].canvas;
  setStatus(`${pages.length} JPG files downloaded (${c.width} × ${c.height} px, 300 DPI).`);
};

$('printBtn').onclick = () => {
  const pages = buildPages();
  const w = window.open('', '_blank');
  if (!w) { setStatus('Allow pop-ups for this page to print.'); return; }
  // Build the print document with DOM calls rather than an HTML string, so no markup
  // (and no user-supplied file name) is ever parsed as HTML.
  const doc = w.document, pg = pageCm();
  doc.title = `${state.fileName} - card print`;
  const style = doc.createElement('style');
  style.textContent = `
    @page { size: ${pg.w}cm ${pg.h}cm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    img { display: block; width: ${pg.w}cm; height: ${pg.h}cm; break-after: page; }
    img:last-child { break-after: auto; }`;
  doc.head.appendChild(style);
  const loads = pages.map(p => new Promise(resolve => {
    const img = doc.createElement('img');
    img.onload = img.onerror = resolve;
    img.src = p.canvas.toDataURL('image/jpeg', 0.95);
    doc.body.appendChild(img);
  }));
  Promise.all(loads).then(() => { w.focus(); w.print(); });
};

function setStatus(msg, isError = false) {
  const el = $('status');
  el.textContent = msg;
  el.classList.toggle('error', isError);
}
updatePaperSpec();
