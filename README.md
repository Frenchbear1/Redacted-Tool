# Redacted Tool

Scrub sensitive info out of photos and PDFs while keeping the layout readable, so an AI can learn the structure of a document without seeing the real data.

- **Numbers** become `#`, **letters** become random letters (case kept), **symbols** stay: `jane.doe@mail.com` → `xqzm.tpe@pwea.bok`, `(555) 014-2290` → `(###) ###-####`.
- **Smart mode** (default) keeps labels and headings visible (`Name:`, `Total Due:`, `Description`, `Billing Details`…) and only scrubs the values. Anything with a digit or `@` is always scrubbed. There's also a "Scrub every word" mode and an "Also keep these words" box.
- **Review screen**: green outlines show what was left visible. Tap any word to hide/show it, or use **Add box** to cover anything the text reader missed.
- **Exports match the input**: PNG → PNG, JPG → JPG, WebP → WebP, PDF → PDF (multi-page). **Download all** saves each file separately in its own format; **As .zip** bundles them. HEIC/GIF/BMP come back as JPG/PNG since browsers can't write those.
- **Private**: OCR (Tesseract.js), PDF reading (pdf.js) and export (jsPDF, JSZip) all run in your browser from the `vendor/` folder. Nothing is uploaded.

## Use it

Open `index.html` through any static host, e.g. GitHub Pages, or locally:

```
python -m http.server 8000
```

then go to http://localhost:8000. (Opening the file directly with `file://` won't work because the OCR engine runs in a web worker.)

## Limits

Text recognition can miss tiny, faint, stylized or handwritten text, and it doesn't detect photos, logos or signatures. Always review each file before sharing it. Scanning uses three passes per page (normal, light-on-dark, and a block pass for short isolated values); "Faster, lower detail scan" skips the light-on-dark pass and uses lower resolution.

## Third-party code (in `vendor/`)

Tesseract.js 5.1.1 + tesseract.js-core (Apache-2.0), English trained data from tesseract-ocr (Apache-2.0), pdf.js 3.11.174 (Apache-2.0), jsPDF 2.5.1 (MIT), JSZip 3.10.1 (MIT).
