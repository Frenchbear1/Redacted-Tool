// Runs the optional name/organisation/place model off the main thread.
// The model is downloaded once from Hugging Face and kept in the browser's cache.
import { pipeline, env, Tensor } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';

const MODEL = 'Xenova/bert-base-NER';
env.allowLocalModels = false;
env.useBrowserCache = true;

let pipe = null;

async function load() {
  if (pipe) return pipe;
  pipe = await pipeline('token-classification', MODEL, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: p => {
      if (p.status === 'progress_total') postMessage({ type: 'progress', loaded: p.loaded, total: p.total });
    },
  });
  return pipe;
}

// lines: array of arrays of word strings. Returns, per word, {e: 'PER'|'ORG'|'LOC'|'MISC', s: score} or null.
async function run(lines) {
  const p = await load(), tok = p.tokenizer, id2label = p.model.config.id2label;
  const special = tok.encode('', { add_special_tokens: true }), cls = special[0], sep = special[special.length - 1];
  const out = [];
  for (const words of lines) {
    const ids = [cls], owner = [-1];
    words.forEach((w, k) => {
      const t = tok.encode(w, { add_special_tokens: false });
      for (const id of t) { if (ids.length < 510) { ids.push(id); owner.push(k); } }
    });
    ids.push(sep); owner.push(-1);
    const n = ids.length;
    const input_ids = new Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, n]);
    const attention_mask = new Tensor('int64', new BigInt64Array(n).fill(1n), [1, n]);
    const token_type_ids = new Tensor('int64', new BigInt64Array(n), [1, n]);
    const { logits } = await p.model({ input_ids, attention_mask, token_type_ids });
    const L = logits.dims[2], data = logits.data;
    const res = words.map(() => null), seen = new Set();
    for (let j = 1; j < n - 1; j++) {
      const k = owner[j]; if (k < 0 || seen.has(k)) continue; // label each word by its first sub-token
      seen.add(k);
      const row = Array.from(data.subarray(j * L, j * L + L)), mx = Math.max(...row);
      let bi = 0, sum = 0;
      for (let c = 0; c < L; c++) { sum += Math.exp(row[c] - mx); if (row[c] > row[bi]) bi = c; }
      const label = id2label[bi] || 'O';
      if (label !== 'O') res[k] = { e: label.replace(/^[BI]-/, ''), s: 1 / sum };
    }
    out.push(res);
  }
  return out;
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') { await load(); postMessage({ type: 'ready' }); }
    else if (data.type === 'run') postMessage({ type: 'result', id: data.id, labels: await run(data.lines) });
  } catch (e) {
    postMessage({ type: 'error', id: data.id, message: String(e && e.message || e) });
  }
};
