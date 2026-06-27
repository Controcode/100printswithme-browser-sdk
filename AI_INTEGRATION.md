# 100PrintsWithMe Browser SDK — AI Integration Guide

This file provides complete natural-language context for AI coding assistants
(GitHub Copilot, Cursor, Claude, ChatGPT, Gemini) to correctly integrate the
`@100printswithme/browser-sdk` package.

**Read this file entirely before generating any code.**

---

## What is the 100PrintsWithMe Browser SDK?

The 100PrintsWithMe Browser SDK is a TypeScript library (`@100printswithme/browser-sdk`) that renders
visual document templates — ID cards, badges, certificates, event tickets, name tags, labels —
as downloadable PDFs or PNGs directly in the user's browser.

Rendering is 100% client-side. No backend server is required for rendering. The only network
call is a read-only fetch of the template design from the 100Prints API (cached in-memory after
the first call).

---

## Core Concepts

### Template

A **template** is a design created in the 100Prints web editor. It contains layers:
- Text layers with `{{variable}}` placeholders
- Image layers (URLs)
- QR code layers
- Barcode layers
- Shape layers
- Table layers
- Chart layers

Templates have a unique `templateId` string visible in the 100Prints dashboard.

### Payload

A **payload** is a plain JavaScript object `Record<string, any>` where each key matches a
`{{variable}}` name in the template. The SDK substitutes variables before rendering.

Example: if the template has a text layer containing `{{name}}`, passing `{ name: 'Alice' }`
renders "Alice" in that layer.

Image layer variables must be publicly accessible HTTPS URLs.

### Blob

`sdk.render()` returns a **Blob** — the browser's native binary data type. You must decide what
to do with it: trigger a download, upload to a server, or display in an `<img>` element.

### HTMLCanvasElement

`sdk.preview()` returns an **HTMLCanvasElement** — the raw canvas element rendered into the
container DOM element you provided.

---

## Installation

```bash
npm install @100printswithme/browser-sdk
# or
pnpm add @100printswithme/browser-sdk
# or
yarn add @100printswithme/browser-sdk
```

CDN (no build step):
```html
<script src="https://cdn.jsdelivr.net/npm/@100printswithme/browser-sdk/dist/100prints-sdk.umd.js"></script>
<!-- Global: BrowserSDK100Prints.BrowserSDK -->
```

---

## Authentication

Use a **publishable key** with prefix `pk_live_`. This key is safe to embed in browser JavaScript.
It can only read template designs — it cannot modify templates or access account settings.

Get your key from: 100Prints Dashboard → Settings → API Keys

Key permissions:
```json
{
  "templates": "all"          // allow access to all templates
  // or:
  "templates": ["id1", "id2"] // restrict to specific template IDs
}
```

---

## SDK Instantiation

**CRITICAL RULE**: Always create `BrowserSDK` at **module scope**, never inside a React component
body, Vue `setup()`, or any function that runs on every render.

```typescript
import { BrowserSDK } from '@100printswithme/browser-sdk';

// ✅ Correct — module-level singleton
const sdk = new BrowserSDK({
  key: 'pk_live_xxxxxxxxxxxxxxxxxx',
  // baseUrl?: string  // only for self-hosted deployments
});
```

```typescript
// ❌ Wrong — defeats caching, wastes API quota
function MyComponent() {
  const sdk = new BrowserSDK({ key: '...' }); // never do this
}
```

---

## API Reference

### `new BrowserSDK(options: BrowserSDKOptions)`

```typescript
interface BrowserSDKOptions {
  key:      string;   // required — publishable key (pk_live_...)
  baseUrl?: string;   // optional — override API base URL
}
```

### `sdk.render(options: RenderOptions): Promise<RenderResult>`

Renders a single record as a PDF or PNG Blob.

```typescript
interface RenderOptions {
  templateId: string;                                           // required
  payload?:   Record<string, any>;                             // optional — fills {{variables}}
  format?:    'pdf' | 'png';                                   // optional, default: 'pdf'
  quality?:   'draft' | 'standard' | 'high' | 'ultra';        // optional, default: 'high'
  // quality maps to DPI: draft=72, standard=150, high=300, ultra=600
  side?:      'front' | 'back' | 'both';                      // optional, default: 'both'
  // PDF: 'both' = 2 pages. PNG: pick one side.
}

interface RenderResult {
  blob:     Blob;    // the rendered file
  mimeType: string;  // 'application/pdf' or 'image/png'
  sizeKB:   number;  // approximate file size in KB
}
```

**Standard usage — trigger browser download:**
```typescript
const { blob } = await sdk.render({
  templateId: 'tpl_abc123',
  payload:    { name: 'Alice', role: 'Engineer', photo: 'https://example.com/alice.jpg' },
  format:     'pdf',
  quality:    'high',   // 300 DPI, print-ready
  side:       'both',   // front + back = 2-page PDF
});

const url = URL.createObjectURL(blob);
const a   = document.createElement('a');
a.href = url; a.download = 'badge.pdf'; a.click();
setTimeout(() => URL.revokeObjectURL(url), 1000);
// ALWAYS revoke after download to release memory
```

### `sdk.preview(options: PreviewOptions): Promise<HTMLCanvasElement>`

Renders a live canvas into a DOM element. Use for real-time previews while users fill forms.

```typescript
interface PreviewOptions {
  templateId: string;      // required
  container:  HTMLElement; // required — DOM element to render into (existing children cleared)
  payload?:   Record<string, any>; // optional
  scale?:     number;      // optional, default: 1 — use 0.5 for half-size preview
}
```

**React usage (the correct pattern):**
```tsx
const containerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!containerRef.current) return;  // always check before using ref
  sdk.preview({
    templateId: 'tpl_abc123',
    container:  containerRef.current,
    payload:    { name, role },
    scale:      0.5,
  });
}, [name, role]);  // re-render on data change

return <div ref={containerRef} style={{ width: 428, minHeight: 270 }} />;
```

### `sdk.renderBulk(options: BulkRenderOptions): Promise<BulkRenderResult>`

Renders multiple records, producing a merged PDF or ZIP archive.

```typescript
interface BulkRenderOptions {
  templateId:  string;                                     // required
  rows:        Record<string, any>[];                      // required — one doc per row
  format?:     'pdf' | 'png';                             // optional, default: 'pdf'
  quality?:    'draft' | 'standard' | 'high' | 'ultra';  // optional, default: 'high'
  mode?:       'merged' | 'zip';                          // optional, default: 'merged'
  // 'merged' = single PDF, one page per row
  // 'zip' = individual files in a ZIP archive
  onProgress?: (current: number, total: number, name: string) => void; // optional
}

interface BulkRenderResult {
  blob:     Blob;    // merged PDF or ZIP
  filename: string;  // suggested filename (e.g., 'BadgeTemplate_Export.pdf')
  sizeKB:   number;
}
```

**Usage with progress bar:**
```typescript
const { blob, filename } = await sdk.renderBulk({
  templateId: 'tpl_abc123',
  rows:       employees,
  format:     'pdf',
  quality:    'high',
  mode:       'merged',
  onProgress: (cur, tot, name) => {
    progressEl.style.width = `${(cur / tot) * 100}%`;
    labelEl.textContent = `${name} (${cur}/${tot})`;
  },
});

const url = URL.createObjectURL(blob);
const a   = document.createElement('a');
a.href = url; a.download = filename; a.click();
setTimeout(() => URL.revokeObjectURL(url), 1000);
```

### `sdk.destroy(): void`

Clears the internal template and font caches. Call in React `useEffect` cleanup if SDK is
component-scoped (not needed for module-level singletons).

```tsx
useEffect(() => {
  const sdk = new BrowserSDK({ key: 'pk_live_...' });
  return () => sdk.destroy();
}, []);
```

---

## TypeScript Types (all exported from package)

```typescript
import type {
  BrowserSDKOptions,
  RenderOptions,
  RenderResult,
  BulkRenderOptions,
  BulkRenderResult,
  PreviewOptions,
} from '@100printswithme/browser-sdk';
```

---

## Framework-Specific Notes

### React
- Create SDK at module scope (outside component)
- Use `useRef<HTMLDivElement>` for `sdk.preview()` container
- Check `if (!ref.current) return` before using ref in `useEffect`
- Revoke object URLs in `useEffect` cleanup

### Next.js App Router
- Add `'use client'` as **first line** of any file importing the SDK
- Use `process.env.NEXT_PUBLIC_100PRINTS_KEY` (must be `NEXT_PUBLIC_` prefix)
- Never import SDK in Server Components or Route Handlers

### Vue 3 / Nuxt
- Create SDK outside `setup()` or in a composable
- Use `onMounted` and `templateRef` for preview container
- In Nuxt: use `<ClientOnly>` wrapper for SDK components

### Vanilla JS / CDN
```javascript
// Global namespace when loaded via UMD CDN build:
const sdk = new BrowserSDK100Prints.BrowserSDK({ key: 'pk_live_...' });
```

### WordPress / PHP
```php
wp_enqueue_script('100prints-sdk',
  'https://cdn.jsdelivr.net/npm/@100printswithme/browser-sdk/dist/100prints-sdk.umd.js',
  [], '1.0.0', true
);
wp_add_inline_script('100prints-sdk', '
  window.__100PrintsSDK = new BrowserSDK100Prints.BrowserSDK({
    key: "' . get_option("my_plugin_100prints_key") . '"
  });
');
```

---

## Critical Rules (AI Must Follow)

1. **Never** create `new BrowserSDK()` inside a React component body or Vue `setup()`. Module scope only.
2. **Always** add `'use client'` in Next.js App Router files that import the SDK.
3. **Always** call `URL.revokeObjectURL(url)` after download (use `setTimeout(() => ..., 1000)`).
4. **Always** check `if (!ref.current) return` before calling `sdk.preview()` in React.
5. Image URLs in payload must be **publicly accessible HTTPS** — never localhost, private S3, or data URIs.
6. **Always** wrap SDK calls in `try/catch` — API errors are thrown as `Error` objects.
7. For Next.js, env var must be `NEXT_PUBLIC_100PRINTS_KEY` to be exposed to browser.
8. ESM: import as `BrowserSDK`. UMD: `BrowserSDK100Prints.BrowserSDK`.
9. Use `quality: 'draft'` for previews; `'high'` for final downloads.
10. For bulk batches > 100 records, consider chunking to avoid browser memory issues.

---

## Error Reference

SDK throws `Error` objects. `err.message` contains the HTTP status.

| Status | Cause                           | Fix                                              |
|--------|---------------------------------|--------------------------------------------------|
| 401    | Invalid or missing API key      | Verify `pk_live_...` key in dashboard            |
| 402    | Payment required                | Upgrade to Pro or Enterprise plan                |
| 403    | Key cannot access this template | Check key's `templates` permission in dashboard  |
| 404    | Template ID not found           | Verify template exists in your account           |
| 429    | Rate limit (5 req/min)          | Implement exponential backoff; cache hits free   |

---

## Rate Limits

- **5 requests/minute** per publishable key
- Applies only to the template fetch endpoint
- Template caching means a bulk render of N records = exactly 1 API call
- Exponential backoff recommended for 429 errors

---

## Common Patterns

### Download PDF
```typescript
const { blob } = await sdk.render({ templateId, payload, format: 'pdf', quality: 'high' });
const url = URL.createObjectURL(blob);
Object.assign(document.createElement('a'), { href: url, download: 'output.pdf' }).click();
setTimeout(() => URL.revokeObjectURL(url), 1000);
```

### Live preview (React)
```tsx
const sdk = new BrowserSDK({ key: 'pk_live_...' }); // module scope
function Preview({ payload }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    sdk.preview({ templateId, container: ref.current, payload, scale: 0.5 });
  }, [payload]);
  return <div ref={ref} />;
}
```

### Bulk export with progress
```typescript
const { blob, filename } = await sdk.renderBulk({
  templateId, rows, format: 'pdf', quality: 'high', mode: 'merged',
  onProgress: (cur, tot) => setProgress(cur / tot),
});
```

### Upload to server
```typescript
const { blob } = await sdk.render({ templateId, payload, format: 'pdf' });
const fd = new FormData();
fd.append('file', blob, 'badge.pdf');
await fetch('/api/upload', { method: 'POST', body: fd });
```
