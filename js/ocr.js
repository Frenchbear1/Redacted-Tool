// Loading files into page canvases and running the three OCR passes.
/* global Tesseract, pdfjsLib */
const base = new URL('../vendor/', import.meta.url).href;
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';

let workerP = null, logFn = null;
const OUT = { blocks: true, text: false, hocr: false, tsv: false };

function getWorker() {
  if (!workerP) {
    workerP = Tesseract.createWorker('eng', 1, {
      workerPath: base + 'worker.min.js', corePath: base + 'core', langPath: base + 'lang',
      workerBlobURL: false, cacheMethod: 'none', logger: m => logFn && logFn(m),
    }).then(async w => { await w.setParameters({ tessedit_pageseg_mode: '11', thresholding_method: '2' }); return w; });
    workerP.catch(() => { workerP = null; });
  }
  return workerP;
}
export const warmUp = () => getWorker().catch(() => {});

// Digits → #, letters → a (A if uppercase), everything else kept.
export function scramble(t) {
  let o = '';
  for (const ch of t) {
    if (/\p{Nd}/u.test(ch)) o += '#';
    else if (/\p{L}/u.test(ch)) o += ch !== ch.toLowerCase() ? 'A' : 'a';
    else o += ch;
  }
  return o;
}

function blank(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  return [c, x];
}

export async function loadImage(file, fast) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i);
      i.onerror = () => rej(new Error('This image format can’t be opened here. Try a JPG or PNG.'));
      i.src = url;
    });
    const max = fast ? 2000 : 3200, s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const [c, x] = blank(Math.round(img.naturalWidth * s), Math.round(img.naturalHeight * s));
    x.drawImage(img, 0, 0, c.width, c.height);
    return [{ orig: c }];
  } finally { URL.revokeObjectURL(url); }
}

export async function loadPdf(file, fast, onPage) {
  if (!window.pdfjsLib) throw new Error('PDF reader failed to load.');
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    onPage(n, pdf.numPages);
    const p = await pdf.getPage(n), v1 = p.getViewport({ scale: 1 });
    const v = p.getViewport({ scale: Math.min(fast ? 2 : 3, (fast ? 1700 : 2500) / v1.width) });
    const [c, x] = blank(Math.round(v.width), Math.round(v.height));
    await p.render({ canvasContext: x, viewport: v }).promise;
    pages.push({ orig: c, ptW: v1.width, ptH: v1.height });
  }
  return pages;
}

function wordsFrom(data) {
  const out = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) {
    const t = (w.text || '').trim(); if (!t) continue;
    const bb = w.bbox; if (bb.x1 - bb.x0 < 2 || bb.y1 - bb.y0 < 3) continue;
    out.push({ text: t, rep: scramble(t), b: { ...bb }, base: l.baseline });
  }
  return out;
}

export function overlap(a, b) {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
}

// Three passes: normal (sparse), inverted (light-on-dark), block mode (isolated short values).
export async function scanPage(pg, fast, progress) {
  const w = await getWorker();
  const merge = list => { for (const nw of list) if (!pg.words.some(o => overlap(o.b, nw.b) > 0.3)) pg.words.push(nw); };
  const passes = fast ? 2 : 3;
  let k = 0;
  const step = label => { const i = k++; logFn = m => { if (m.status === 'recognizing text') progress(label, (i + m.progress) / passes); }; };

  step('Reading text');
  pg.words = wordsFrom((await w.recognize(pg.orig, {}, OUT)).data);
  if (!fast) {
    step('Checking light-on-dark text');
    const [inv, ix] = blank(pg.orig.width, pg.orig.height);
    ix.filter = 'invert(1) grayscale(1)'; ix.drawImage(pg.orig, 0, 0);
    merge(wordsFrom((await w.recognize(inv, {}, OUT)).data));
  }
  step('Double-checking short values');
  await w.setParameters({ tessedit_pageseg_mode: '3' });
  try { merge(wordsFrom((await w.recognize(pg.orig, {}, OUT)).data)); }
  finally { await w.setParameters({ tessedit_pageseg_mode: '11' }); logFn = null; }
}
