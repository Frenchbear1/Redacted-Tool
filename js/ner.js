// Main-thread side of the optional AI model (see ner-worker.js).
let worker = null, loadP = null, seq = 0;
const pending = new Map();
let progressFn = null;
export const ai = { ready: false };

function spawn() {
  if (worker) return worker;
  worker = new Worker(new URL('./ner-worker.js?v=5', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') progressFn && progressFn(data.loaded, data.total);
    else if (data.type === 'result' || (data.type === 'error' && data.id)) {
      const p = pending.get(data.id); pending.delete(data.id);
      if (p) data.type === 'result' ? p.res(data.labels) : p.rej(new Error(data.message));
    }
  };
  return worker;
}

export function loadModel(onProgress) {
  progressFn = onProgress;
  if (!loadP) {
    loadP = new Promise((res, rej) => {
      const w = spawn();
      const h = ({ data }) => {
        if (data.type === 'ready') { w.removeEventListener('message', h); ai.ready = true; res(); }
        else if (data.type === 'error' && !data.id) { w.removeEventListener('message', h); rej(new Error(data.message)); }
      };
      w.addEventListener('message', h);
      w.postMessage({ type: 'load' });
    }).catch(e => { loadP = null; worker && worker.terminate(); worker = null; throw e; });
  }
  return loadP;
}

export function runModel(lines) {
  const id = ++seq;
  return new Promise((res, rej) => { pending.set(id, { res, rej }); spawn().postMessage({ type: 'run', id, lines }); });
}

export async function isCached() {
  try {
    if (!('caches' in window)) return false;
    const c = await caches.open('transformers-cache');
    return (await c.keys()).some(r => /bert-base-NER.*model_quantized\.onnx/.test(r.url));
  } catch (e) { return false; }
}
