// Sorts every OCR word into a category so the user can choose what gets scrubbed.
import { LABELS, MONTHS, STREET, STATES, TITLES, FIRST, LAST, CONTEXT } from './vocab.js?v=5';

export const CATS = [
  { id: 'names', label: 'Names', on: true },
  { id: 'orgs', label: 'Companies & orgs', on: true },
  { id: 'places', label: 'Places', on: true },
  { id: 'emails', label: 'Emails', on: true },
  { id: 'phones', label: 'Phone numbers', on: true },
  { id: 'addresses', label: 'Addresses', on: true },
  { id: 'dates', label: 'Dates', on: true },
  { id: 'amounts', label: 'Money', on: true },
  { id: 'ids', label: 'IDs & account #s', on: true },
  { id: 'numbers', label: 'Other numbers', on: true },
  { id: 'links', label: 'Links & usernames', on: true },
  { id: 'text', label: 'Other text', on: true },
  { id: 'labels', label: 'Labels & headings', on: false },
];

export const PRESETS = {
  everything: CATS.map(c => c.id),
  smart: CATS.filter(c => c.on).map(c => c.id),
  names: ['names'],
  contact: ['names', 'emails', 'phones', 'addresses', 'links'],
  people: ['names', 'orgs', 'places'],
  numbers: ['phones', 'dates', 'amounts', 'ids', 'numbers'],
};

export const norm = t => t.toLowerCase().replace(/^[\s("'\[{<*•·–-]+/, '').replace(/[\s:#.,;)\]}>"'*?!]+$/, '');
const hasDigit = t => /\d/.test(t);
const isEmail = t => /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(t);
const isUrl = t => /^(https?:\/\/|www\.)/i.test(t) || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|gov|edu|co|us|uk|ca|app|dev|info|biz)(\/\S*)?$/i.test(norm(t)) || /^@[a-z0-9_.]{2,}$/i.test(t);
const isCap = t => /^\p{Lu}/u.test(t.replace(/^[("'\[]+/, ''));
const lettersOnly = t => /^\p{L}[\p{L}'.-]*$/u.test(norm(t) || '-');

function isVocab(t, extra) {
  if (/[\d@]/.test(t)) return false;
  const w = norm(t);
  if (!w) return /^[^\p{L}\p{N}]+$/u.test(t); // bullets, dashes, lone symbols
  return w.split(/[-\/&]/).every(p => !p || LABELS.has(p) || extra.has(p));
}

function contextOf(label) {
  if (!label) return null;
  if (/\bnames?\b/.test(label)) return 'names';
  for (const [cat, re] of CONTEXT) if (re.test(label)) return cat;
  return null;
}

// Visual lines → runs (word groups separated by big horizontal gaps).
function buildLines(words) {
  const ws = words.slice().sort((a, b) => (a.b.y0 + a.b.y1) - (b.b.y0 + b.b.y1));
  const lines = [];
  for (const w of ws) {
    const cy = (w.b.y0 + w.b.y1) / 2, h = w.b.y1 - w.b.y0;
    const ln = lines.find(l => Math.abs(l.cy - cy) < Math.max(h, l.h) * 0.45);
    if (ln) ln.ws.push(w); else lines.push({ cy, h, ws: [w] });
  }
  lines.sort((a, b) => a.cy - b.cy);
  for (const l of lines) {
    l.ws.sort((a, b) => a.b.x0 - b.b.x0);
    l.runs = []; let run = [];
    for (const w of l.ws) {
      const prev = run[run.length - 1], h = w.b.y1 - w.b.y0;
      if (prev && w.b.x0 - prev.b.x1 > h * 2.2) { l.runs.push(run); run = []; }
      run.push(w);
    }
    if (run.length) l.runs.push(run);
  }
  return lines;
}

const PHONE = /^\+?\d{0,2}[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;
const DATE = /^(\d{1,4}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}-\d{2}-\d{2})$/;
const MONEY = /^[-+(]?[$€£¥₹][\d,.]*\d|^[-+(]?\d[\d,]*\.\d{2}\)?$|^\d[\d,.]*\s?(usd|eur|gbp)$/i;

// Try joining 1..n consecutive tokens starting at i; returns length matched or 0.
function joinMatch(vals, i, re, max = 4) {
  let s = '';
  for (let n = 0; n < max && i + n < vals.length; n++) {
    s += (n ? ' ' : '') + vals[i + n].text;
    if (re.test(s.replace(/[,;]$/, ''))) return n + 1;
  }
  return 0;
}

// Word groups the AI model reads as one sentence (a visual line segment).
// Whole visual lines, so a table row gives the model context ("Meyer Jane Planning Director").
export function nerLines(words) {
  return buildLines(words).map(l => l.ws);
}
// The model is case-sensitive: "MCCONNELL" reads like an acronym, "Mcconnell" like a name.
export function nerText(t) {
  return /^[\p{Lu}][\p{Lu}'’.-]+[,;:]?$/u.test(t) ? t[0] + t.slice(1).toLowerCase() : t;
}

// Table columns: if a good share of a column's cells are names, the rest of that column is too.
function columnVote(lines, extra) {
  const all = lines.flatMap(l => l.ws);
  if (all.length < 12) return;
  const pageW = Math.max(...all.map(w => w.b.x1));
  const tol = Math.max(8, pageW * 0.012);
  // column anchors: x positions where many words start
  const xs = all.map(w => w.b.x0).sort((a, b) => a - b), anchors = [];
  for (let i = 0; i < xs.length;) {
    let j = i; while (j + 1 < xs.length && xs[j + 1] - xs[i] <= tol) j++;
    if (j - i + 1 >= 4) anchors.push(xs.slice(i, j + 1).reduce((a, b) => a + b) / (j - i + 1));
    i = j + 1;
  }
  if (anchors.length < 2) return;
  const near = x => anchors.findIndex(a => Math.abs(a - x) <= tol);
  // cells: runs split again wherever a word starts on a column anchor
  const cols = new Map();
  lines.forEach((l, li) => { for (const run of l.runs) {
    let cell = [], col = -1;
    const push = () => { if (cell.length && col >= 0) { cell.li = li; if (!cols.has(col)) cols.set(col, []); cols.get(col).push(cell); } };
    for (const w of run) {
      const a = near(w.b.x0);
      if (a >= 0 && cell.length && a !== col) { push(); cell = []; }
      if (!cell.length) col = a;
      cell.push(w);
    }
    push();
  } });
  const alphaOf = cells => cells.filter(c => c.length <= 3 && c.every(w => !w.colon && !/[\d@]/.test(w.text) && /\p{L}/u.test(w.text) && lettersOnly(w.text)));
  const nameCols = [];
  for (const [k, cells] of cols) {
    const alpha = alphaOf(cells);
    const named = alpha.filter(c => c.some(w => w.cat === 'names'));
    if (alpha.length < 4 || named.length < 3 || named.length / alpha.length < 0.3) continue;
    markNames(alpha, extra); nameCols.push(k);
  }
  // "LAST | FIRST" tables: the column just left of a names column, one or two words per row, is surnames.
  for (const k of nameCols) {
    let j = k - 1; while (j >= 0 && !(cols.has(j) && cols.get(j).length >= 4)) j--;
    if (j < 0 || nameCols.includes(j)) continue;
    const rows = new Set(cols.get(k).filter(c => c.some(w => w.cat === 'names')).map(c => c.li));
    const alpha = alphaOf(cols.get(j)).filter(c => c.length <= 2);
    const aligned = alpha.filter(c => rows.has(c.li));
    if (alpha.length >= 4 && aligned.length >= 3 && aligned.length >= alpha.length * 0.6 && alpha.length >= cols.get(j).length * 0.6) markNames(aligned, extra);
  }
}
function markNames(cells, extra) {
  for (const c of cells) {
    if (c.every(w => isVocab(w.text, extra))) continue; // column header like "LAST NAME"
    c.forEach(w => { if (['text', 'orgs', 'places', 'labels', 'names'].includes(w.cat) && !isVocab(w.text, extra)) w.cat = 'names'; });
  }
}

// Use the AI model's labels (w.ner) to catch names / companies / places without labels.
function applyNer(words) {
  for (const w of words) {
    const n = w.ner; if (!n || n.e === 'MISC' || w.colon) continue;
    if (/[\d@]/.test(w.text) || !/\p{L}/u.test(w.text)) continue;
    const cat = n.e === 'PER' ? 'names' : n.e === 'ORG' ? 'orgs' : n.e === 'LOC' ? 'places' : null;
    if (!cat) continue;
    if (w.cat === 'text' && n.s > 0.55) w.cat = cat;
    else if (w.cat === 'labels' && n.s > 0.85 && isCap(w.text)) w.cat = cat;
  }
}

export function classify(words, extraWords = new Set(), useNer = false) {
  for (const w of words) { w.cat = null; w.colon = false; }
  const lines = buildLines(words);
  let headers = []; // column headers: {x0,x1,cat,line}

  lines.forEach((l, li) => {
    // A header row: every word is a structural word and there are at least 2.
    if (l.ws.length >= 2 && l.ws.every(w => isVocab(w.text, extraWords))) {
      // header cells are runs, so "LAST NAME" stays one phrase
      headers = l.runs.map(r => ({ x0: r[0].b.x0, x1: r[r.length - 1].b.x1, h: r[0].b.y1 - r[0].b.y0, cat: contextOf(r.map(w => norm(w.text)).join(' ')), li }))
        .sort((a, b) => a.x0 - b.x0);
    }
    for (const run of l.runs) {
      // "Label:" at the start of a run
      const ci = run.findIndex(w => /:$/.test(w.text) || w.text === ':');
      let label = '', vals = run;
      if (ci >= 0 && ci < 5 && !run.slice(0, ci + 1).some(w => /[\d@]/.test(w.text))) {
        run.slice(0, ci + 1).forEach(w => { w.cat = 'labels'; w.colon = true; });
        label = run.slice(0, ci + 1).map(w => norm(w.text)).join(' ');
        vals = run.slice(ci + 1);
      }
      let ctx = contextOf(label);
      for (let i = 0; i < vals.length; i++) {
        const w = vals[i];
        if (w.cat) continue;
        // column context from a header row above
        let cctx = ctx;
        if (!cctx && headers.length && li - headers[0].li <= 60 && li > headers[0].li) {
          // left-aligned columns: the right-most header starting at or before this word
          const tol = headers[0].h * 1.5;
          let hd = null; for (const h of headers) if (h.x0 - tol <= w.b.x0) hd = h;
          if (hd && w.b.x0 <= hd.x1 + tol * 6) cctx = hd.cat;
        }
        let n;
        if (isEmail(w.text)) { w.cat = 'emails'; continue; }
        if (isUrl(w.text)) { w.cat = 'links'; continue; }
        if (/^\d{3}-\d{2}-\d{4}$/.test(w.text)) { w.cat = 'ids'; continue; }
        if (hasDigit(w.text) && (n = joinMatch(vals, i, PHONE))) { vals.slice(i, i + n).forEach(v => v.cat = 'phones'); i += n - 1; continue; }
        if (DATE.test(w.text.replace(/[,.]$/, ''))) { w.cat = 'dates'; continue; }
        if (MONTHS.has(norm(w.text)) && isCap(w.text) && vals[i + 1] && /^\d{1,4},?$/.test(vals[i + 1].text)) {
          w.cat = 'dates'; let k = i + 1;
          while (k < vals.length && k <= i + 2 && /^\d{1,4},?$/.test(vals[k].text)) vals[k++].cat = 'dates';
          i = k - 1; continue;
        }
        if (/^\d{1,2}(st|nd|rd|th)?,?$/.test(w.text) && vals[i + 1] && MONTHS.has(norm(vals[i + 1].text))) { w.cat = vals[i + 1].cat = 'dates'; if (vals[i + 2] && /^\d{4}$/.test(vals[i + 2].text)) vals[i + 2].cat = 'dates'; i++; continue; }
        if (MONEY.test(w.text)) { w.cat = 'amounts'; continue; }
        // card numbers written in 4-digit groups
        if (/^\d{4}$/.test(w.text) && (n = joinMatch(vals, i, /^(\d{4} ){2,4}\d{1,4}$/, 5)) >= 3) { vals.slice(i, i + n).forEach(v => v.cat = 'ids'); i += n - 1; continue; }
        if (hasDigit(w.text)) {
          if (cctx === 'phones' || cctx === 'dates' || cctx === 'amounts' || cctx === 'ids' || cctx === 'addresses') w.cat = cctx;
          else w.cat = (w.text.replace(/\D/g, '').length >= 5 || /^#/.test(w.text)) ? 'ids' : 'numbers';
          continue;
        }
        if (cctx === 'names' && lettersOnly(w.text) && !isVocab(w.text, extraWords)) { w.cat = 'names'; continue; }
        if (cctx && cctx !== 'names' && !isVocab(w.text, extraWords)) { w.cat = cctx === 'amounts' || cctx === 'phones' ? 'text' : cctx; continue; }
        w.cat = isVocab(w.text, extraWords) ? 'labels' : 'text';
      }
      detectAddress(vals);
    }
  });
  detectNames(lines, extraWords);
  if (useNer) applyNer(words);
  columnVote(lines, extraWords);
  // Headings: noticeably larger text with no digits keeps its unknown words visible.
  const hs = words.map(w => w.b.y1 - w.b.y0).sort((a, b) => a - b), med = hs[Math.floor(hs.length / 2)] || 0;
  for (const l of lines) {
    const lh = l.ws.map(w => w.b.y1 - w.b.y0).sort((a, b) => a - b)[Math.floor(l.ws.length / 2)];
    if (l.ws.length <= 8 && lh > med * 1.45 && l.ws.every(w => w.cat === 'text' || w.cat === 'labels')) l.ws.forEach(w => { w.cat = 'labels'; });
  }
  for (const w of words) {
    if (!w.cat) w.cat = 'text';
    if (extraWords.size && extraWords.has(norm(w.text)) && w.cat !== 'emails') w.cat = 'labels';
  }
  return words;
}

function detectAddress(vals) {
  // "42 Maple Street" / "1200 N. Oak Ave, Apt 4"
  for (let i = 0; i < vals.length; i++) {
    if (!/^\d{1,6}[a-z]?$/i.test(vals[i].text)) continue;
    for (let j = i + 1; j < Math.min(vals.length, i + 6); j++) {
      if (STREET.has(norm(vals[j].text)) && isCap(vals[j].text)) {
        let end = j;
        // trailing unit like "Apt 4B" / "Suite 200"
        if (vals[end + 1] && /^#?\d+[a-z]?,?$/i.test(vals[end + 1].text) && STREET.has(norm(vals[end].text))) end++;
        vals.slice(i, end + 1).forEach(v => v.cat = 'addresses');
        // city, ST 12345 on the same run
        for (let k = end + 1; k < vals.length; k++) { if (vals[k].cat === 'emails' || vals[k].cat === 'phones') break; vals[k].cat = 'addresses'; }
        break;
      }
    }
  }
  // "Springfield, IL 62704"
  for (let i = 1; i < vals.length; i++) {
    if (/^\d{5}(-\d{4})?$/.test(vals[i].text) && STATES.has(norm(vals[i - 1].text)) && vals[i - 1].text.replace(/[^A-Za-z]/g, '').length === 2) {
      let s = i - 1;
      while (s - 1 >= 0 && isCap(vals[s - 1].text) && !hasDigit(vals[s - 1].text) && i - s < 4) s--;
      vals.slice(s, i + 1).forEach(v => v.cat = 'addresses');
    }
  }
}

function detectNames(lines, extra) {
  const nameish = w => w && lettersOnly(w.text) && isCap(w.text) && !isVocab(w.text, extra) && (w.cat === 'text' || w.cat === 'names');
  for (const l of lines) for (const run of l.runs) {
    for (let i = 0; i < run.length; i++) {
      const w = run[i], n = norm(w.text);
      const titled = TITLES.has(n.replace(/\.$/, '')) && nameish(run[i + 1]);
      const first = FIRST.has(n) && (isCap(w.text)) && (w.cat === 'text' || w.cat === 'names');
      const lastPair = LAST.has(n) && isCap(w.text) && run[i - 1] && run[i - 1].cat === 'names';
      if (!(titled || first || lastPair)) continue;
      if (titled) { w.cat = 'labels'; i++; }
      run[i].cat = 'names';
      // following capitalised words (middle/last names), "Doe, Jane" too
      let k = i + 1;
      while (k < run.length && k <= i + 3 && (nameish(run[k]) || /^\p{Lu}\.?$/u.test(run[k].text))) run[k++].cat = 'names';
      // preceding capitalised word in "Doe, Jane"
      if (i > 0 && /,$/.test(run[i - 1].text) && nameish(run[i - 1])) run[i - 1].cat = 'names';
      i = k - 1;
    }
  }
}
