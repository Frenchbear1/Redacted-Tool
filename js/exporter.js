// Builds output files in the same format they came in, and saves/shares them.
/* global jspdf, JSZip */
const toBlob = (c, type, q) => new Promise(r => c.toBlob(r, type, q));
const stem = n => n.replace(/\.[^.]+$/, '');

export async function build(f) {
  if (f.kind === 'pdf') {
    const { jsPDF } = window.jspdf; let doc = null;
    for (const pg of f.pages) {
      const o = pg.ptW > pg.ptH ? 'l' : 'p';
      if (!doc) doc = new jsPDF({ unit: 'pt', format: [pg.ptW, pg.ptH], orientation: o, compress: true });
      else doc.addPage([pg.ptW, pg.ptH], o);
      doc.addImage(pg.out.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, pg.ptW, pg.ptH);
    }
    return { name: stem(f.name) + '-scrubbed.pdf', blob: doc.output('blob') };
  }
  const t = (f.file.type || '').toLowerCase(), ext = (f.name.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
  let mime = 'image/png', out = 'png';
  if (/jpe?g/.test(t) || /^jpe?g$/.test(ext)) { mime = 'image/jpeg'; out = ext === 'jpeg' ? 'jpeg' : 'jpg'; }
  else if (/webp/.test(t) || ext === 'webp') { mime = 'image/webp'; out = 'webp'; }
  else if (/hei[cf]|avif/.test(t) || /^(heic|heif|avif)$/.test(ext)) { mime = 'image/jpeg'; out = 'jpg'; }
  let blob = await toBlob(f.pages[0].out, mime, 0.92);
  if (!blob || blob.type !== mime) { blob = await toBlob(f.pages[0].out, 'image/png'); out = 'png'; }
  return { name: stem(f.name) + '-scrubbed.' + out, blob };
}

// Exports are rebuilt in the background after every change so a tap can share instantly
// (phones only allow the share sheet straight from a tap).
export function invalidate(f) {
  f.exp = null; clearTimeout(f.expT);
  f.expT = setTimeout(() => { const p = build(f); f.expP = p; p.then(r => { if (f.expP === p) f.exp = r; }).catch(() => {}); }, 700);
}
async function get(f) { if (f.exp) return f.exp; const r = await build(f); f.exp = r; return r; }

let downloads = null;
try { if (window.claude && window.claude.use) window.claude.use('downloads').then(d => { downloads = d; }).catch(() => {}); } catch (e) { /* not in Claude */ }

const touch = matchMedia('(pointer: coarse)').matches;
const asFile = r => new File([r.blob], r.name, { type: r.blob.type || 'application/octet-stream' });
function canShare(list) { try { return touch && navigator.canShare && navigator.canShare({ files: list.map(asFile) }); } catch (e) { return false; } }

function anchor(r) {
  const a = document.createElement('a'), u = URL.createObjectURL(r.blob);
  a.href = u; a.download = r.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 30000);
}

// Returns a short message for the toast.
export async function saveFiles(files, { zip = false } = {}) {
  if (!files.length) return 'Nothing to save yet.';
  if (zip) {
    const z = new JSZip(), used = new Set();
    for (const f of files) { const r = await get(f); let n = r.name, k = 2; while (used.has(n)) n = r.name.replace(/(\.[^.]+)$/, `-${k++}$1`); used.add(n); z.file(n, r.blob); }
    return deliver([{ name: 'scrubbed-files.zip', blob: await z.generateAsync({ type: 'blob' }) }], true);
  }
  // If every export is already built, share/save right away inside the tap.
  const ready = files.every(f => f.exp);
  const list = ready ? files.map(f => f.exp) : await Promise.all(files.map(get));
  return deliver(list, ready);
}

async function deliver(list, inGesture) {
  if (downloads) {
    for (const r of list) {
      try { await downloads.save({ filename: r.name, data: r.blob }); }
      catch (e) { return e && e.code === 'declined' ? 'Save cancelled.' : 'Couldn’t save the file.'; }
    }
    return list.length > 1 ? `Saved ${list.length} files` : 'Saved ' + list[0].name;
  }
  if (canShare(list)) {
    if (!inGesture) return 'READY';
    try { await navigator.share({ files: list.map(asFile) }); return list.length > 1 ? `Shared ${list.length} files` : 'Shared ' + list[0].name; }
    catch (e) { if (e && e.name === 'AbortError') return 'Cancelled.'; /* fall through to download */ }
  }
  for (const r of list) { anchor(r); await new Promise(res => setTimeout(res, 300)); }
  return list.length > 1 ? `Downloaded ${list.length} files` : 'Downloaded ' + list[0].name;
}
