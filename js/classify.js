// Sorts every OCR word into a category so the user can choose what gets scrubbed.
import { LABELS, MONTHS, STREET, STATES, TITLES, FIRST, LAST, CONTEXT } from './vocab.js';

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
export function nerLines(words) {
  const out = [];
  for (const l of buildLines(words)) for (const run of l.runs) out.push(run);
  return out;
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
      headers = l.ws.map(w => ({ x0: w.b.x0, x1: w.b.x1, cat: contextOf(norm(w.text)), li }));
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
        if (!cctx && headers.length && li - headers[0].li <= 25) {
          const cx = (w.b.x0 + w.b.x1) / 2;
          const hd = headers.find(h => cx >= h.x0 - (h.x1 - h.x0) * 0.6 && cx <= h.x1 + (h.x1 - h.x0) * 0.6);
          if (hd) cctx = hd.cat;
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
