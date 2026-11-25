import { CATS, PRESETS, classify, nerLines, nerText } from './classify.js?v=5';
import { ai, loadModel, runModel, isCached } from './ner.js?v=5';
import { loadImage, loadPdf, scanPage, warmUp, scramble } from './ocr.js?v=5';
import { render } from './paint.js?v=5';
import { invalidate, saveFiles } from './exporter.js?v=5';
import { initViewer, openViewer, refreshViewer } from './viewer.js?v=5';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CHECK = '<svg viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const LS = 'scrub.settings.v2';
const state = { cats: new Set(PRESETS.smart), files: [], extra: new Set(), fast: false, ai: false };
try { const s = JSON.parse(localStorage.getItem(LS) || 'null'); if (s) { state.cats = new Set(s.cats); state.fast = !!s.fast; state.ai = !!s.ai; $('#keepWords').value = s.keep || ''; } } catch (e) { /* storage blocked */ }
const persist = () => { try { localStorage.setItem(LS, JSON.stringify({ cats: [...state.cats], fast: state.fast, ai: state.ai, keep: $('#keepWords').value })); } catch (e) { /* ignore */ } };
const extraFrom = v => new Set(v.toLowerCase().split(/[,\n]+/).flatMap(s => s.trim().split(/\s+/)).filter(Boolean));
state.extra = extraFrom($('#keepWords').value);
document.querySelector(`input[name=q][value=${state.fast ? 'fast' : 'thorough'}]`).checked = true;

let queue = Promise.resolve();
const catsOf = f => f.cats || state.cats;

// ---------- toast ----------
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- category chips ----------
function counts(files) {
  const c = {};
  for (const f of files) if (f.status === 'done') for (const pg of f.pages) for (const w of pg.words) c[w.cat] = (c[w.cat] || 0) + 1;
  return c;
}
let lastCounts = {};
function drawChips() {
  const box = $('#cats'), n = counts(state.files), any = state.files.some(f => f.status === 'done');
  if (!box.children.length) {
    box.innerHTML = CATS.map(c => `<label class="chip"><input type="checkbox" value="${c.id}"><span class="box">${CHECK}</span>${c.label}<span class="n"></span></label>`).join('');
  }
  [...box.children].forEach(el => {
    const id = el.querySelector('input').value, on = state.cats.has(id), cnt = n[id] || 0;
    el.classList.toggle('on', on); el.querySelector('input').checked = on;
    el.classList.toggle('zero', any && !cnt);
    const ns = el.querySelector('.n'); ns.hidden = !any;
    if (ns.textContent !== String(cnt)) { ns.textContent = cnt; if (lastCounts[id] !== undefined) { ns.classList.remove('bump'); void ns.offsetWidth; ns.classList.add('bump'); } }
  });
  lastCounts = n;
  const key = [...state.cats].sort().join();
  document.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', [...PRESETS[b.dataset.preset]].sort().join() === key));
}
$('#cats').addEventListener('change', e => {
  const id = e.target.value; e.target.checked ? state.cats.add(id) : state.cats.delete(id);
  persist(); drawChips(); rerenderAll();
});
document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
  state.cats = new Set(PRESETS[b.dataset.preset]); persist(); drawChips(); rerenderAll();
  toast(b.textContent + (b.dataset.preset === 'everything' ? ': every word' : ''));
});

// ---------- files ----------
function kindOf(file) {
  if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) return 'pdf';
  if (/^image\//.test(file.type) || /\.(png|jpe?g|webp|gif|bmp|heic|heif|avif)$/i.test(file.name)) return 'img';
  return null;
}

function card(f) {
  const el = document.createElement('article'); el.className = 'card busy';
  el.innerHTML = `
    <div class="thumbwrap" title="Review"><canvas></canvas></div>
    <div class="card-main">
      <div class="card-top"><span class="fname">${esc(f.name)}</span><span class="state"><svg class="ring" viewBox="0 0 26 26"><circle class="t" cx="13" cy="13" r="11"/><circle class="p" cx="13" cy="13" r="11"/></svg></span>
        <button class="icon-btn rm" aria-label="Remove ${esc(f.name)}"><svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>
      <div class="status">Waiting in line…</div>
      <div class="found"></div>
      <div class="actions" hidden><button class="btn rv">Review &amp; edit</button><button class="btn pri sv">Save</button></div>
    </div>`;
  el.querySelector('.rm').onclick = () => remove(f);
  el.querySelector('.rv').onclick = () => openViewer(f);
  el.querySelector('.thumbwrap').onclick = () => f.status === 'done' && openViewer(f);
  el.querySelector('.sv').onclick = async () => { const m = await saveFiles([f]); toast(m === 'READY' ? 'Ready. Tap Save again to share.' : m); };
  f.el = el; return el;
}

function progress(f, label, p) {
  f.el.querySelector('.status').textContent = label;
  const r = f.el.querySelector('.ring .p'); if (r) r.style.strokeDashoffset = 69.1 * (1 - Math.max(0.03, Math.min(1, p)));
}

function thumb(f) {
  const t = f.el.querySelector('.thumbwrap canvas'), src = f.pages[0] && (f.pages[0].out || f.pages[0].orig); if (!src) return;
  const s = 220 / Math.max(src.width, src.height);
  t.width = Math.round(src.width * s); t.height = Math.round(src.height * s);
  const x = t.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, t.width, t.height);
}

function summary(f) {
  const n = {}, cats = catsOf(f); let hid = 0;
  for (const pg of f.pages) for (const w of pg.words) { n[w.cat] = (n[w.cat] || 0) + 1; if (w.hidden) hid++; }
  const covers = f.pages.reduce((a, p) => a + p.covers.length, 0);
  f.el.querySelector('.status').textContent = `${hid} scrubbed${covers ? ` · ${covers} covered` : ''} · ${f.pages.length} page${f.pages.length === 1 ? '' : 's'}${f.cats ? ' · custom' : ''}`;
  f.el.querySelector('.found').innerHTML = CATS.filter(c => c.id !== 'labels' && n[c.id]).map((c, i) =>
    `<span class="${cats.has(c.id) ? 'on' : ''}" style="animation-delay:${i * 40}ms">${n[c.id]} ${c.label.toLowerCase()}</span>`).join('');
}

function renderFile(f) {
  const cats = catsOf(f);
  for (const pg of f.pages) render(pg, cats);
  thumb(f); summary(f); invalidate(f);
  refreshViewer(f);
}
let raf = 0;
function rerenderAll() { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => state.files.filter(f => f.status === 'done' && !f.cats).forEach(renderFile)); }

function addFiles(list) {
  const arr = [...list]; if (!arr.length) return;
  warmUp();
  for (const file of arr) {
    const f = { id: Math.random().toString(36).slice(2), file, name: file.name, kind: kindOf(file), pages: [], status: 'wait', cats: null };
    state.files.push(f); $('#list').prepend(card(f));
    if (!f.kind) { fail(f, 'Not supported. Save it as a PDF or screenshot it, then add that.'); continue; }
    queue = queue.then(() => processFile(f));
  }
  toast(`Added ${arr.length} file${arr.length === 1 ? '' : 's'}`);
  updateDock();
  $('.files').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function fail(f, msg) {
  f.status = 'err'; f.el.classList.remove('busy');
  const st = f.el.querySelector('.status'); st.textContent = msg; st.classList.add('err');
  f.el.querySelector('.state').innerHTML = '';
}

async function processFile(f) {
  if (!state.files.includes(f)) return;
  f.status = 'busy'; updateDock();
  const fast = state.fast;
  try {
    progress(f, 'Opening…', 0.02);
    f.pages = f.kind === 'pdf'
      ? await loadPdf(f.file, fast, (n, t) => progress(f, `Opening page ${n} of ${t}…`, 0.04))
      : await loadImage(f.file, fast);
    for (const pg of f.pages) pg.covers = [];
    thumb(f);
    const N = f.pages.length;
    for (let i = 0; i < N; i++) {
      if (!state.files.includes(f)) return;
      await scanPage(f.pages[i], fast, (label, p) => progress(f, `${label}${N > 1 ? ` · page ${i + 1} of ${N}` : ''}…`, (i + p) / N));
      if (state.ai && ai.ready) await nerPage(f.pages[i], p => progress(f, `Finding names with AI${N > 1 ? ` · page ${i + 1} of ${N}` : ''}…`, (i + p) / N));
      classify(f.pages[i].words, state.extra, useAi());
    }
    f.status = 'done'; f.el.classList.remove('busy');
    f.el.querySelector('.state').innerHTML = `<span class="done-tick">${CHECK}</span>`;
    f.el.querySelector('.actions').hidden = false;
    renderFile(f);
  } catch (e) {
    console.error(e);
    fail(f, 'Couldn’t read this file: ' + (e && e.message ? e.message : e));
  }
  updateDock(); drawChips();
}

function remove(f) {
  state.files.splice(state.files.indexOf(f), 1);
  f.el.classList.add('out'); setTimeout(() => f.el.remove(), 300);
  updateDock(); drawChips();
}

function updateDock() {
  const fs = state.files, ready = fs.filter(f => f.status === 'done'), busy = fs.filter(f => f.status === 'busy' || f.status === 'wait').length;
  $('#dock').hidden = !fs.length; $('#empty').hidden = !!fs.length;
  $('#all').disabled = !ready.length; $('#zip').disabled = ready.length < 2; $('#clear').disabled = !!busy;
  $('#all').textContent = ready.length > 1 ? `Save all ${ready.length}` : 'Save';
  $('#dmsg').textContent = busy ? `Scanning… ${ready.length} of ${fs.length} done` : `${ready.length} file${ready.length === 1 ? '' : 's'} ready`;
}

$('#all').onclick = async () => { const m = await saveFiles(state.files.filter(f => f.status === 'done')); toast(m === 'READY' ? 'Ready. Tap Save again to share.' : m); };
$('#zip').onclick = async () => { toast('Packing zip…'); const m = await saveFiles(state.files.filter(f => f.status === 'done'), { zip: true }); toast(m === 'READY' ? 'Ready. Tap .zip again to share.' : m); };
$('#clear').onclick = () => { [...state.files].forEach(remove); toast('Cleared'); };

// ---------- inputs ----------
$('#pick').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
const drop = $('#drop');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('over')));
drop.addEventListener('drop', e => { e.preventDefault(); addFiles(e.dataTransfer.files); });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length && !drop.contains(e.target)) addFiles(e.dataTransfer.files); });
addEventListener('paste', e => { const fs = [...(e.clipboardData && e.clipboardData.files || [])]; if (fs.length) addFiles(fs); });

document.querySelectorAll('input[name=q]').forEach(r => r.onchange = () => { state.fast = r.value === 'fast'; persist(); toast(state.fast ? 'Fast scan for new files' : 'Thorough scan for new files'); });
let kwT;
$('#keepWords').oninput = () => {
  clearTimeout(kwT);
  kwT = setTimeout(() => {
    state.extra = extraFrom($('#keepWords').value); persist();
    reclassifyAll();
    drawChips();
  }, 450);
};

// ---------- AI model ----------
const useAi = () => state.ai && ai.ready;
function reclassifyAll() {
  for (const f of state.files) if (f.status === 'done') { f.pages.forEach(pg => classify(pg.words, state.extra, useAi())); renderFile(f); }
  drawChips();
}
async function nerPage(pg, onP) {
  const runs = nerLines(pg.words);
  onP && onP(0.5);
  const labels = await runModel(runs.map(r => r.map(w => nerText(w.text))));
  runs.forEach((r, i) => r.forEach((w, k) => { w.ner = labels[i] && labels[i][k]; }));
  pg.nerDone = true;
}
async function nerBackfill() {
  for (const f of state.files) if (f.status === 'done') {
    for (const pg of f.pages) if (!pg.nerDone) { try { await nerPage(pg); } catch (e) { console.error(e); } }
  }
  reclassifyAll();
}
const aiBtn = $('#aiBtn'), aiBox = $('#ai'), aiSub = $('#aiSub'), aiBar = $('#aiBar');
const AI_IDLE = aiSub.textContent;
const mb = n => (n / 1048576).toFixed(0);
function aiUI() {
  aiBtn.setAttribute('aria-checked', String(state.ai));
  aiBox.classList.toggle('loading', state.ai && !ai.ready);
}
async function startAi(firstTime) {
  aiUI(); aiBar.hidden = false; aiBar.firstChild.style.width = '2%';
  aiSub.textContent = firstTime ? 'Starting download…' : 'Loading the model…';
  try {
    await loadModel((loaded, total) => {
      if (!total) return;
      aiBar.firstChild.style.width = Math.max(2, Math.round(loaded / total * 100)) + '%';
      aiSub.textContent = loaded >= total ? 'Preparing the model…' : `Downloading ${mb(loaded)} of ${mb(total)} MB. Keep this page open.`;
    });
    aiBar.hidden = true;
    aiSub.textContent = 'On. Names, companies and places are found by AI on this device.';
    aiUI();
    if (firstTime) toast('AI detection is ready');
    nerBackfill();
  } catch (e) {
    console.error(e);
    state.ai = false; persist(); aiUI(); aiBar.hidden = true;
    aiSub.textContent = 'Couldn\u2019t load the model. Check your connection and try again.';
  }
}
aiBtn.onclick = async () => {
  state.ai = !state.ai; persist(); aiUI();
  if (state.ai) startAi(!(await isCached()));
  else { aiSub.textContent = AI_IDLE; aiBar.hidden = true; reclassifyAll(); }
};
if (state.ai) startAi(false); else aiUI();

initViewer({
  catsOf, toast,
  changed: f => { thumb(f); summary(f); invalidate(f); },
  rerender: f => { renderFile(f); },
  save: async f => { const m = await saveFiles([f]); toast(m === 'READY' ? 'Ready. Tap Save again to share.' : m); },
  closed: f => { if (state.files.includes(f)) { thumb(f); summary(f); } drawChips(); },
});

// ---------- hero demo: values scramble as the scan line passes ----------
(function demo() {
  const vs = [...document.querySelectorAll('.doc .v')], line = $('.scanline');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reset = () => vs.forEach(v => { v.textContent = v.dataset.t; v.classList.remove('done'); });
  const cycle = () => {
    reset();
    const doc = $('.doc'), H = doc.offsetHeight || 1;
    vs.forEach(v => {
      const y = v.getBoundingClientRect().top - doc.getBoundingClientRect().top + 10;
      setTimeout(() => {
        let n = 0; const t = setInterval(() => { v.textContent = scramble(v.dataset.t); if (++n > 4) { clearInterval(t); v.classList.add('done'); } }, 55);
      }, 4800 * 0.55 * ((y + 50) / (H + 50)));
    });
  };
  if (reduce) { vs.forEach(v => { v.textContent = scramble(v.dataset.t); v.classList.add('done'); }); return; }
  reset(); cycle(); line.addEventListener('animationiteration', cycle);
})();

drawChips(); updateDock();
