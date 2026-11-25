// Draws the scrubbed version of a page.
function lum(c) { return c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114; }

function pixels(pg) {
  if (!pg.px) pg.px = pg.orig.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, pg.orig.width, pg.orig.height).data;
  return pg.px;
}

// Background = median colour of a ring around the box; ink = the pixel inside that differs most.
export function sampleColors(pg, bb) {
  const W = pg.orig.width, H = pg.orig.height, d = pixels(pg);
  const x0 = Math.max(0, Math.floor(bb.x0) - 3), y0 = Math.max(0, Math.floor(bb.y0) - 3);
  const x1 = Math.min(W - 1, Math.ceil(bb.x1) + 3), y1 = Math.min(H - 1, Math.ceil(bb.y1) + 3);
  const ring = [], at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const sx = Math.max(1, Math.round((x1 - x0) / 40)), sy = Math.max(1, Math.round((y1 - y0) / 10));
  for (let x = x0; x <= x1; x += sx) { ring.push(at(x, y0), at(x, y1)); }
  for (let y = y0; y <= y1; y += sy) { ring.push(at(x0, y), at(x1, y)); }
  ring.sort((a, b) => lum(a) - lum(b));
  const bg = ring[Math.floor(ring.length / 2)], bl = lum(bg);
  let best = null, bd = -1;
  const ix = Math.max(1, Math.round((x1 - x0) / 30)), iy = Math.max(1, Math.round((y1 - y0) / 12));
  for (let y = y0 + 3; y < y1 - 3; y += iy) for (let x = x0 + 3; x < x1 - 3; x += ix) {
    const c = at(x, y), dd = Math.abs(lum(c) - bl);
    if (dd > bd) { bd = dd; best = c; }
  }
  const ink = bd > 50 ? best : (bl > 128 ? [20, 20, 20] : [240, 240, 240]);
  return { bg: `rgb(${bg})`, ink: `rgb(${ink})` };
}

function paintWord(x, pg, w) {
  const bb = w.b, h = bb.y1 - bb.y0, wd = bb.x1 - bb.x0;
  const { bg, ink } = sampleColors(pg, bb);
  x.fillStyle = bg; x.fillRect(bb.x0 - 2, bb.y0 - 2, wd + 4, h + 4);
  let by = bb.y1 - h * 0.2;
  if (w.base && w.base.y0 > bb.y0 && w.base.y0 <= bb.y1 + 1) by = Math.min(bb.y1, (w.base.y0 + w.base.y1) / 2);
  const fs = Math.max(6, Math.min(h * 1.05, (by - bb.y0) / 0.74));
  x.save(); x.fillStyle = ink; x.font = `${fs}px Arial, Helvetica, sans-serif`; x.textBaseline = 'alphabetic';
  const m = x.measureText(w.rep).width || 1;
  x.translate(bb.x0, by); x.scale(wd / m, 1); x.fillText(w.rep, 0, 0); x.restore();
}

export function polyBox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

function paintCover(x, pg, pts) {
  const bb = polyBox(pts), { bg, ink } = sampleColors(pg, bb);
  x.save(); x.beginPath(); pts.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.closePath();
  x.fillStyle = bg; x.fill(); x.clip();
  const h = Math.max(12, Math.min(60, (bb.y1 - bb.y0) / 4));
  x.strokeStyle = ink; x.globalAlpha = 0.3; x.lineWidth = Math.max(1.5, h / 10);
  for (let k = bb.x0 - (bb.y1 - bb.y0); k < bb.x1; k += h) { x.beginPath(); x.moveTo(k, bb.y1); x.lineTo(k + (bb.y1 - bb.y0), bb.y0); x.stroke(); }
  x.restore();
}

// Decide per word and paint. cats = Set of category ids that get scrubbed.
export function hidden(w, cats) { return w.force ? w.force === 'hide' : cats.has(w.cat); }

export function render(pg, cats) {
  if (!pg.out) { pg.out = document.createElement('canvas'); pg.out.width = pg.orig.width; pg.out.height = pg.orig.height; }
  const x = pg.out.getContext('2d'); x.drawImage(pg.orig, 0, 0);
  for (const w of pg.words) { w.hidden = hidden(w, cats); if (w.hidden) paintWord(x, pg, w); }
  for (const c of pg.covers) paintCover(x, pg, c);
}
