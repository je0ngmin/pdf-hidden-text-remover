# Architecture

## Detection pipeline

1. `lopdf` parses the document and decodes each page content stream.
2. The core walks PDF graphics and text operators while maintaining `q/Q` graphics-state snapshots.
3. Text-showing operators (`Tj`, `TJ`, `'`, `"`) receive stable IDs in the form `p{page}-o{operation}`. Adjacent fragments on the same baseline with matching style and detection signals are merged into one review sentence while retaining every source operation ID.
4. Each operation is scored against independent signals: text rendering mode, effective opacity, font size, contrast with an inferred page background, and placement against the page box.
5. The browser receives structured findings with the extracted phrase, category, severity, human-readable reason, page number, and evidence values.
6. Export expands a selected merged ID and drops only its exact source text-showing operations before saving a new PDF.

The IDs deliberately describe PDF operations instead of array positions in the UI. The Rust analyzer and sanitizer can therefore share the same selection contract.

## Current boundaries

- Background is inferred from the page's initial color and large filled rectangles; white is the safe fallback.
- Position checking uses text matrices and the page box. It is conservative because complete glyph geometry depends on embedded font metrics.
- Text decoding follows each active font's `ToUnicode` CMap or declared standard encoding, with UTF-16 and single-byte fallbacks. Some malformed or nonstandard embedded fonts can still produce replacement characters.
- Findings inside Form XObjects are not rewritten yet. The analyzer reports top-level page streams only so a selected removal is never falsely claimed.
- Encrypted, signed, malformed, and incrementally updated PDFs require policy decisions before production deployment.

## Security model

Browser use is local-first: the selected file stays in memory, Rust/WASM processes it, and the output is downloaded with no upload. Apply file-size/page-count limits in any hosted version. Never treat extracted PDF strings as HTML, and serve the app with a restrictive CSP.

