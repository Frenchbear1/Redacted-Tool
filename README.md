# Redacted Tool

**▶ Open the app: https://frenchbear1.github.io/Redacted-Tool/**

Scrub sensitive info out of photos and PDFs while keeping the layout readable, so an AI can learn the structure of a document without seeing the real data.

- **Smart filter**: every value is sorted into a type — names, emails, phone numbers, addresses, dates, money, IDs & account numbers, other numbers, links & usernames, other text — and you pick which types get scrubbed (with live counts). Presets: Smart, Names only, Contact info, Numbers, Everything. Labels and headings (`Name:`, `Total Due:`, column headers, big titles) stay readable by default.
- **Scrambling**: numbers become `#`, letters become random letters (case kept), symbols stay: `jane.doe@mail.com` → `xqzm.tpe@pwea.bok`, `(555) 014-2290` → `(###) ###-####`.
- **Review & edit**: tap any word to hide/show it, or draw a lasso to **Hide** words, **Show** words (also removes covers), or **Cover** any area (photos, logos, signatures). Undo, zoom, hold-to-compare, and per-file filter overrides.
- **Exports match the input**: PNG → PNG, JPG → JPG, WebP → WebP, PDF → PDF (multi-page). **Save all** saves each file separately (on phones it opens the share sheet); **.zip** bundles them. HEIC/GIF/BMP come back as JPG/PNG.
- **Private**: OCR (Tesseract.js), PDF reading (pdf.js) and export (jsPDF, JSZip) run in your browser from `vendor/`. Nothing is uploaded.

## Project layout

```
index.html        markup
css/app.css       styles + animations
js/main.js        app state, file list, filters, saving
js/ocr.js         file loading + 3 OCR passes
js/classify.js    sorts words into categories
js/vocab.js       label words, first/last names, states, street types
js/paint.js       draws the scrubbed page
js/viewer.js      review sheet: tap, lasso, cover, undo, zoom
js/exporter.js    same-format export, share/download, zip
vendor/           third-party libraries (local copies)
```

## Use it

Open `index.html` through any static host, e.g. GitHub Pages, or locally:

```
python -m http.server 8000
```

then go to http://localhost:8000. (Opening the file directly with `file://` won't work because the OCR engine runs in a web worker.)

## Limits

Text recognition can miss tiny, faint, stylized or handwritten text, and it doesn't detect photos, logos or signatures (use Cover). Name detection uses labels (`Name:`, `Customer:`…), column headers, titles (Mr., Dr.) and a list of common first/last names, so unusual names outside those cues land in "Other text". Always review each file before sharing it. Scanning uses three passes per page (normal, light-on-dark, and a block pass for short isolated values); "Faster, lower detail scan" skips the light-on-dark pass and uses lower resolution.

## Third-party code (in `vendor/`)

Tesseract.js 5.1.1 + tesseract.js-core (Apache-2.0), English trained data from tesseract-ocr (Apache-2.0), pdf.js 3.11.174 (Apache-2.0), jsPDF 2.5.1 (MIT), JSZip 3.10.1 (MIT).
