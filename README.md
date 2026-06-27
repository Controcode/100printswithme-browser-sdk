# 100PrintsWithMe Browser SDK

Official Browser SDK for **100PrintsWithMe**.
### Test SDK with Your API Key Live  **https://playground.100printswith.me**
Generate certificates, ID cards, event badges, invoices, reports, tickets, and other print-ready documents directly in the browser using templates created in the 100PrintsWithMe Dashboard.

No backend rendering required.

---

## Features

- 🚀 Browser-side rendering
- 🖼️ Live template preview
- 📄 Export as PDF or PNG
- 📦 Bulk document generation
- ⚡ Built-in rendering engine
- 🎨 Pixel-perfect output
- 📝 TypeScript support
- ⚛️ React ready
- 🌐 Framework agnostic
- 📚 Complete documentation

---

## Installation

```bash
npm install @100printswithme/browser-sdk
```

or

```bash
pnpm add @100printswithme/browser-sdk
```

---

## Quick Start

```ts
import { BrowserSDK } from "@100printswithme/browser-sdk";

const sdk = new BrowserSDK({
  key: "pk_live_xxxxxxxxxxxxxx",
});

const { blob } = await sdk.render({
  templateId: "template_abc123",
  payload: {
    name: "John Doe",
    company: "100PrintsWithMe",
  },
  format: "pdf",
});
```

---

## Live Preview

```ts
await sdk.preview({
  templateId: "template_abc123",
  payload,
  container: previewRef.current,
});
```

---

## Bulk Rendering

```ts
const result = await sdk.renderBulk({
  templateId: "template_abc123",
  rows: employees,
  format: "pdf",
  mode: "merged",
});
```

---

## Why 100PrintsWithMe?

Unlike low-level PDF libraries, the Browser SDK renders templates visually designed in the **100PrintsWithMe Dashboard**.

Your application only needs to:

1. Create a template visually.
2. Get the Template ID.
3. Pass your data.
4. Render.

No canvas programming.
No PDF layout code.
No manual positioning.

---

## Documentation

Complete documentation:

**https://100printswith.me/docs**

Documentation includes:

- Installation
- Authentication
- BrowserSDK
- Preview
- Render
- Bulk Rendering
- Type Definitions
- React Examples
- Vanilla JavaScript
- API Reference
- Best Practices
- FAQ

---

## Examples

Examples are available in the `/examples` directory.

- React
- Vanilla JavaScript
- TypeScript
- WordPress (coming soon)

---

## Supported Frameworks

- React
- Next.js
- Vue
- Angular
- Svelte
- Vite
- Vanilla JavaScript

---

## Browser Support

Modern browsers supporting:

- ES2020+
- Canvas API
- Blob API
- Fetch API

---

## Roadmap

- WordPress Plugin
- React Components
- Vue Components
- Shopify App
- Flutter SDK
- Node SDK

---

## License

Copyright (c) 2026 100PrintsWithMe.

This SDK is distributed under the MIT License.

See the LICENSE file for details.
