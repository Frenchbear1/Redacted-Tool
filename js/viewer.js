// Full-screen review sheet: tap to toggle words, lasso to hide / show / cover, undo, zoom, compare.
import { CATS } from './classify.js';
import { render, polyBox } from './paint.js';

const $ = s => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
let ctx, V = { f: null, i: 0, tool: 'tap', zoom: 1, pts: null, comparing: false };
const sheet = $('#sheet'), vc = $('#vc'), ov = $('#overlay'), wrap = $('#pagewrap'), stage = $('#stage');

const HINTS = {
  tap: 'Tap a word to hide or show it. <b>Green outline</b> = left visible.',
  hide: 'Draw a loop around words to <b>scrub</b> them.',
  show: 'Draw a loop around words or covered areas to <b>un-scrub</b> them.',
  cover: 'Draw a loop around anything to <b>blank it out</b>, like photos, logos or signatures.',
};

const page = () => V.f.pages[V.i];

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const center = b => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];

function snapshot(pg) {
  pg.hist = pg.hist || [];
  pg.hist.push({ force: pg.words.map(w => w.force || null), covers: pg.covers.slice() });
  if (pg.hist.length > 60) pg.hist.shift();
}

function redraw(full = true) {
  const pg = page();
  if (full) {
    const src = V.comparing ? pg.orig : pg.out;
    if (vc.width !== src.width || vc.height !== src.height) { vc.width = src.width; vc.height = src.height; }
    vc.getContext('2d').drawImage(src, 0, 0);
  }
  overlay();
  const n = V.f.pages.length;
  $('#vpg').textContent = `${V.i + 1} / ${n}`;
  $('.pager').classList.toggle('multi', n > 1);
  $('#vprev').disabled = V.i === 0; $('#vnext').disabled = V.i >= n - 1;
  $('#vundo').disabled = !(pg.hist && pg.hist.length);
  const hid = pg.words.filter(w => w.hidden).length;
  $('#vsub').textContent = `${hid} scrubbed · ${pg.words.length - hid} visible${pg.covers.length ? ` · ${pg.covers.length} covered` : ''}`;
}

function overlay(flashWords = []) {
  const pg = page();
  ov.setAttribute('viewBox', `0 0 ${pg.orig.width} ${pg.orig.height}`);
  const sw = Math.max(1.5, pg.orig.width / 600);
  let s = '';
  if (!V.comparing) for (const w of pg.words) if (!w.hidden) {
    const b = w.b; s += `<rect class="kept" x="${b.x0 - 3}" y="${b.y0 - 3}" width="${b.x1 - b.x0 + 6}" height="${b.y1 - b.y0 + 6}" rx="${sw * 2}" stroke-width="${sw}"/>`;
  }
  for (const w of flashWords) { const b = w.b; s += `<rect class="flash" x="${b.x0 - 3}" y="${b.y0 - 3}" width="${b.x1 - b.x0 + 6}" height="${b.y1 - b.y0 + 6}" rx="${sw * 2}"/>`; }
  if (V.pts && V.pts.length > 1) s += `<path class="path ${V.tool}" stroke-width="${sw * 1.6}" d="M${V.pts.map(p => p.join(',')).join('L')}Z"/>`;
  ov.innerHTML = s;
}

function fit() {
  const pg = page(), r = stage.getBoundingClientRect();
  const availW = r.width - 36, availH = r.height - 36, aspect = pg.orig.width / pg.orig.height;
  let w = Math.min(availW, 980);
  if (w / aspect < availH * 1.05 && aspect > 1) w = Math.min(w, availH * aspect); // landscape: fit whole page
  wrap.style.width = Math.round(w * V.zoom) + 'px';
}

function apply(changed) {
  const pg = page();
  render(pg, ctx.catsOf(V.f));
  ctx.changed(V.f);
  redraw(); overlay(changed || []);
}

function pt(e) {
  const r = wrap.getBoundingClientRect(), pg = page();
  return [Math.round((e.clientX - r.left) * pg.orig.width / r.width), Math.round((e.clientY - r.top) * pg.orig.height / r.height)];
}

function wordAt([x, y]) {
  const pad = Math.max(4, page().orig.width / 300);
  const hits = page().words.filter(w => x >= w.b.x0 - pad && x <= w.b.x1 + pad && y >= w.b.y0 - pad && y <= w.b.y1 + pad);
  hits.sort((a, b) => (a.b.x1 - a.b.x0) * (a.b.y1 - a.b.y0) - (b.b.x1 - b.b.x0) * (b.b.y1 - b.b.y0));
  return hits[0];
}

function finishLasso() {
  const pts = V.pts; V.pts = null;
  if (!pts || pts.length < 3) { overlay(); return; }
  const bb = polyBox(pts);
  if (bb.x1 - bb.x0 < 6 || bb.y1 - bb.y0 < 6) { overlay(); return; }
  const pg = page();
  const inside = pg.words.filter(w => inPoly(...center(w.b), pts));
  if (V.tool === 'cover') {
    snapshot(pg); pg.covers.push(pts); apply();
    ctx.toast('Area covered'); return;
  }
  if (V.tool === 'hide') {
    if (!inside.length) { overlay(); ctx.toast('No text there. Use Cover to blank an area.'); return; }
    snapshot(pg); inside.forEach(w => w.force = 'hide'); apply(inside);
    ctx.toast(`Scrubbed ${inside.length} word${inside.length === 1 ? '' : 's'}`); return;
  }
  // show
  const covers = pg.covers.filter(c => inPoly(...center(polyBox(c)), pts) || c.some(p => inPoly(p[0], p[1], pts)) || pts.some(p => inPoly(p[0], p[1], c)));
  if (!inside.length && !covers.length) { overlay(); ctx.toast('Nothing to un-scrub there.'); return; }
  snapshot(pg);
  inside.forEach(w => w.force = 'keep');
  pg.covers = pg.covers.filter(c => !covers.includes(c));
  apply();
  ctx.toast([inside.length && `Showing ${inside.length} word${inside.length === 1 ? '' : 's'}`, covers.length && `removed ${covers.length} cover${covers.length === 1 ? '' : 's'}`].filter(Boolean).join(', '));
}

function setTool(t) {
  V.tool = t;
  wrap.classList.toggle('lasso', t !== 'tap'); wrap.classList.toggle('tap', t === 'tap');
  $('#vhint').innerHTML = HINTS[t];
}

const CHECK = '<svg viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function fileChips() {
  const cats = ctx.catsOf(V.f), counts = {};
  for (const pg of V.f.pages) for (const w of pg.words) counts[w.cat] = (counts[w.cat] || 0) + 1;
  $('#vcats').innerHTML = CATS.map(c => `<label class="chip ${cats.has(c.id) ? 'on' : ''} ${counts[c.id] ? '' : 'zero'}"><input type="checkbox" value="${c.id}" ${cats.has(c.id) ? 'checked' : ''}><span class="box">${CHECK}</span>${c.label}<span class="n">${counts[c.id] || 0}</span></label>`).join('');
  $('#vreset').hidden = !V.f.cats;
}

export function initViewer(c) {
  ctx = c;
  $('#vclose').onclick = close;
  $('#vprev').onclick = () => { if (V.i > 0) { V.i--; fit(); redraw(); stage.scrollTo(0, 0); } };
  $('#vnext').onclick = () => { if (V.i < V.f.pages.length - 1) { V.i++; fit(); redraw(); stage.scrollTo(0, 0); } };
  $('#vsave').onclick = async () => ctx.save(V.f);
  $('#vundo').onclick = () => {
    const pg = page(), h = pg.hist && pg.hist.pop(); if (!h) return;
    pg.words.forEach((w, i) => { w.force = h.force[i] || undefined; }); pg.covers = h.covers; apply(); ctx.toast('Undone');
  };
  $('#vzin').onclick = () => { V.zoom = Math.min(4, V.zoom * 1.4); fit(); };
  $('#vzout').onclick = () => { V.zoom = Math.max(0.5, V.zoom / 1.4); fit(); };
  document.querySelectorAll('input[name=tool]').forEach(r => r.onchange = () => setTool(r.value));

  const hold = $('#vorig');
  const on = e => { e.preventDefault(); V.comparing = true; hold.classList.add('on'); hold.textContent = 'Original'; redraw(); };
  const off = () => { if (!V.comparing) return; V.comparing = false; hold.classList.remove('on'); hold.textContent = 'Hold to compare'; redraw(); };
  hold.addEventListener('pointerdown', on); ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => hold.addEventListener(t, off));
  hold.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') on(e); });
  hold.addEventListener('keyup', off);
  hold.addEventListener('contextmenu', e => e.preventDefault());

  wrap.addEventListener('click', e => {
    if (V.tool !== 'tap' || V.comparing) return;
    const w = wordAt(pt(e)); if (!w) return;
    snapshot(page()); w.force = w.hidden ? 'keep' : 'hide'; apply([w]);
  });
  wrap.addEventListener('pointerdown', e => {
    if (V.tool === 'tap' || V.comparing) return;
    e.preventDefault(); wrap.setPointerCapture(e.pointerId); V.pts = [pt(e)]; overlay();
  });
  wrap.addEventListener('pointermove', e => {
    if (!V.pts) return;
    const p = pt(e), l = V.pts[V.pts.length - 1], min = page().orig.width / 300;
    if (Math.hypot(p[0] - l[0], p[1] - l[1]) > min) { V.pts.push(p); overlay(); }
  });
  wrap.addEventListener('pointerup', finishLasso);
  wrap.addEventListener('pointercancel', () => { V.pts = null; overlay(); });

  $('#vcats').addEventListener('change', e => {
    const id = e.target.value; if (!id) return;
    if (!V.f.cats) V.f.cats = new Set(ctx.catsOf(V.f));
    e.target.checked ? V.f.cats.add(id) : V.f.cats.delete(id);
    ctx.rerender(V.f); fileChips(); redraw();
  });
  $('#vreset').onclick = () => { V.f.cats = null; ctx.rerender(V.f); fileChips(); redraw(); ctx.toast('Following the main settings again'); };

  addEventListener('resize', () => { if (!sheet.hidden) fit(); });
  addEventListener('keydown', e => {
    if (sheet.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') $('#vprev').click();
    if (e.key === 'ArrowRight') $('#vnext').click();
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); $('#vundo').click(); }
  });
}

export function openViewer(f) {
  V.f = f; V.i = 0; V.zoom = 1; V.pts = null; V.comparing = false;
  $('#vt').textContent = f.name;
  sheet.hidden = false; sheet.classList.remove('closing');
  document.body.style.overflow = 'hidden';
  setTool(document.querySelector('input[name=tool]:checked').value);
  fileChips();
  requestAnimationFrame(() => { fit(); redraw(); });
}

export function refreshViewer(f) { if (!sheet.hidden && V.f === f) { fileChips(); redraw(); } }

function close() {
  sheet.classList.add('closing');
  sheet.addEventListener('animationend', () => { sheet.hidden = true; sheet.classList.remove('closing'); document.body.style.overflow = ''; ctx.closed(V.f); }, { once: true });
}
