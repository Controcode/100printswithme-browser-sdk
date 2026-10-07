# 100PrintsWithMe Browser SDK

[![npm version](https://img.shields.io/npm/v/%40100printswithme%2Fbrowser-sdk)](https://www.npmjs.com/package/@100printswithme/browser-sdk)
[![license](https://img.shields.io/npm/l/%40100printswithme%2Fbrowser-sdk)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6)](https://www.typescriptlang.org/)

Official Browser SDK for **100PrintsWithMe**.

Render 100PrintsWithMe templates as PNG, JPEG, raster PDF, or vector PDF directly in a modern browser.

Create templates visually in the **100PrintsWithMe Dashboard**, connect them with dynamic data, and render certificates, ID cards, event badges, invoices, reports, tickets, product graphics, and other print-ready documents without building your own rendering engine.

No backend rendering is required for browser-based generation.

### Try the SDK live with your Publishable Key

**https://playground.100printswith.me**

Create templates and browser-safe publishable keys at:

**https://100printswith.me**

The v2 API handles template loading, dynamic field replacement, fonts, rendering, downloads, and object URL cleanup behind one small class.

---

## Features

- Browser-side PNG, JPEG, raster PDF, and vector PDF rendering
- Front and back template support
- Typed TypeScript API with autocomplete-friendly inputs
- Dynamic template data replacement
- Direct rendering into an `<img>` element
- Built-in download helpers
- Blob and object URL results for browser previews
- Deterministic platform and custom font loading
- Automatic font fallback handling
- ESM package and standalone UMD/browser bundle
- npm and `<script>` / CDN usage
- Framework agnostic
- No backend renderer required for browser-side generation
- Legacy `BrowserSDK` compatibility for existing v1 integrations

---

## Use Cases

The SDK can be used anywhere you need to turn structured data into a reusable visual template.

### Certificates

Generate personalized course, event, participation, achievement, or training certificates.

```ts
const certificate = await prints.pdf({
  templateId: "tpl_certificate",
  data: {
    Name: "Rishabh Dev",
    Course: "Advanced Mathematics",
    Date: "October 7, 2026"
  },
  includeBack: false
});

certificate.download("certificate.pdf");
```

### ID Cards and Membership Cards

Render the front or back of an ID card independently.

```ts
const card = await prints.png({
  templateId: "tpl_id_card",
  data: {
    Name: "Rishabh Dev",
    EmployeeID: "EMP-1042",
    Department: "Engineering"
  },
  side: "front"
});

document.querySelector<HTMLImageElement>("#card")!.src = card.url;
```

### Event Badges

Generate badges from event registration data.

```ts
const badge = await prints.png({
  templateId: "tpl_badge",
  data: {
    Name: "Maya Lin",
    Company: "Example Labs",
    Role: "Speaker"
  },
  side: "front"
});
```

### Student Reports and Report Cards

Create personalized academic reports from student data.

```ts
const report = await prints.pdf({
  templateId: "tpl_report",
  data: {
    StudentName: "Maya Lin",
    Grade: "11",
    Mathematics: 98,
    Physics: 95,
    Chemistry: 96
  },
  includeBack: true
});
```

### Invoices and Business Documents

Merge customer, order, payment, and company information into reusable document templates.

### Tickets and Passes

Generate event tickets, visitor passes, QR-enabled passes, coupons, and admission documents.

### Dynamic Website Graphics

Use templates to generate dynamic graphics directly inside a website or web application.

Useful for:

- e-commerce product banners
- sale and discount cards
- personalized recommendation graphics
- product promotion images
- marketplace seller creatives
- dynamic catalog visuals
- social sharing graphics
- price-drop graphics
- customer-specific banners

Example:

```ts
const banner = await prints.png({
  templateId: "tpl_product_banner",
  data: {
    ProductName: "Running Shoes",
    Price: "₹2,499",
    Discount: "30% OFF",
    ProductImage: "https://example.com/shoe.png"
  },
  side: "front",
  quality: "high"
});

document.querySelector<HTMLImageElement>("#offer-banner")!.src = banner.url;
```

This makes it possible to update a visual using live application data without manually rebuilding the graphic.

### Personalized Downloadable Documents

Generate documents or graphics that users can preview and download immediately inside a browser application.

### Bulk Generation

Reuse the same template with many rows of data to create batches of personalized documents.

---

## Installation

```bash
npm install @100printswithme/browser-sdk
```

```bash
pnpm add @100printswithme/browser-sdk
```

```bash
yarn add @100printswithme/browser-sdk
```

The SDK runs in the browser and requires Canvas, Fetch, Blob, and object URL support.

---

## Quick Start

```ts
import { HundredPrints } from "@100printswithme/browser-sdk";

const prints = new HundredPrints({
  publishableKey: "pk_live_xxx"
});

const image = await prints.png({
  templateId: "tpl_123",
  data: {
    Name: "Rishabh Dev",
    Role: "Chief Scientist"
  },
  side: "front",
  quality: "high"
});

document.querySelector<HTMLImageElement>("#preview")!.src = image.url;
```

Keys in `data` must match the dynamic fields configured in the template.

Use a browser-safe **publishable key**. Never expose a secret backend key in client-side code.

`image.url` is a local object URL. It works for browser previews and downloads, but it is not a permanent public URL.

Call:

```ts
image.revoke();
```

after the page no longer needs it.

---

## Create a Client

```ts
const prints = new HundredPrints({
  publishableKey: "pk_live_xxx"
});
```

Create your templates and publishable keys from:

**https://100printswith.me**

Create the client once and reuse it so template and font caches remain effective.

---

## PNG and JPEG

Images render exactly one template side.

`side` is required and accepts:

```ts
"front" | "back"
```

Example:

```ts
const png = await prints.png({
  templateId: "tpl_123",
  data: {
    Name: "Rishabh Dev"
  },
  side: "front",
  quality: "high"
});

const jpeg = await prints.jpeg({
  templateId: "tpl_123",
  data: {
    Name: "Rishabh Dev"
  },
  side: "back",
  quality: "standard"
});

png.download("front.png");
jpeg.download("back.jpg");
```

Image results provide:

```text
format
blob
url
width
height
side
download()
revoke()
```

---

## PDF

PDF output renders the front by default.

Set:

```ts
includeBack: true
```

to add the back as a second page when the template contains one.

```ts
const pdf = await prints.pdf({
  templateId: "tpl_123",
  data: {
    Name: "Rishabh Dev"
  },
  includeBack: true,
  quality: "ultra"
});

pdf.download("document.pdf");
```

---

## Vector PDF

For selectable text and supported vector artwork, use the vector PDF renderer:

```ts
const pdf = await prints.vectorPdf({
  templateId: "tpl_123",
  data: {
    Name: "Rishabh Dev"
  },
  includeBack: true
});

pdf.download("print-ready.pdf");
```

PDF results provide:

```text
format
blob
url
pages
download()
revoke()
```

---

## Generic Render

`render()` accepts a discriminated output object.

TypeScript requires `side` for image outputs and exposes `includeBack` for PDF outputs.

### Image

```ts
const result = await prints.render({
  templateId: "tpl_123",
  data: {
    Name: "Rishabh Dev"
  },
  output: {
    format: "png",
    side: "front",
    quality: "high"
  }
});
```

### PDF

```ts
const result = await prints.render({
  templateId: "tpl_123",
  data: {
    Name: "Rishabh Dev"
  },
  output: {
    format: "pdf",
    includeBack: true,
    quality: "high"
  }
});
```

Supported formats:

```text
png
jpeg
pdf
vector-pdf
```

---

## Render Directly into an Image

`renderTo()` accepts a CSS selector or an `HTMLImageElement`.

It supports PNG and JPEG output.

```html
<img id="preview" alt="Rendered template">
```

```ts
const result = await prints.renderTo("#preview", {
  templateId: "tpl_123",
  data: {
    Name: "Rishabh Dev"
  },
  output: {
    format: "png",
    side: "front",
    quality: "high"
  }
});
```

The returned result can still be used:

```ts
result.download("preview.png");
```

When the image is no longer needed:

```ts
result.revoke();
```

---

## One-Step Download

Use `download()` when you only need the generated file.

```ts
await prints.download({
  templateId: "tpl_123",
  data: {
    Name: "Rishabh Dev"
  },
  output: {
    format: "pdf",
    includeBack: true,
    quality: "high"
  },
  filename: "document.pdf"
});
```

The helper cleans up its temporary object URL after starting the download.

---

## Quality Levels

| Quality | Intended use |
| --- | --- |
| `draft` | Fast previews |
| `standard` | Normal screen output |
| `high` | High-resolution output |
| `ultra` | Maximum-resolution print output |

---

## Script Tag and CDN

The browser/UMD build exposes:

```js
window.HundredPrints
```

so the SDK can be used without npm or a bundler.

### jsDelivr

```html
<script src="https://cdn.jsdelivr.net/npm/@100printswithme/browser-sdk@2.0.0/dist/100prints-sdk.umd.js"></script>
```

Example:

```html
<img id="preview" alt="Rendered template">

<script src="https://cdn.jsdelivr.net/npm/@100printswithme/browser-sdk@2.0.0/dist/100prints-sdk.umd.js"></script>

<script>
  const prints = new HundredPrints({
    publishableKey: "pk_live_xxx"
  });

  prints.renderTo("#preview", {
    templateId: "tpl_123",

    data: {
      Name: "Rishabh Dev"
    },

    output: {
      format: "png",
      side: "front",
      quality: "high"
    }
  }).catch(console.error);
</script>
```

You can also use unpkg:

```html
<script src="https://unpkg.com/@100printswithme/browser-sdk@2.0.0/dist/100prints-sdk.umd.js"></script>
```

For production applications, prefer a version-pinned CDN URL.

Serve integrations over HTTP or HTTPS. Opening the page through `file://` prevents reliable API and font requests.

---

## Font Handling

The SDK resolves fonts before drawing.

Resolution order:

1. Explicit template or custom font URL
2. 100PrintsWithMe platform font library
3. Google Fonts for families outside the platform library
4. Inter, the platform default
5. Browser `sans-serif`

Known platform fonts use absolute 100PrintsWithMe asset URLs so the SDK works when embedded on another origin.

Recoverable platform or Google font failures emit a warning and continue using an available fallback.

Explicit custom font URLs retain their configured behavior and can raise:

```text
FONT_LOAD_FAILED
```

when the custom font itself cannot be loaded.

---

## Error Handling

SDK failures reject with `HundredPrintsError`.

Each error contains:

```text
code
message
cause
```

where available.

```ts
import {
  HundredPrints,
  HundredPrintsError
} from "@100printswithme/browser-sdk";

try {
  await prints.png({
    templateId: "tpl_123",
    data: {},
    side: "front"
  });
} catch (error) {
  if (error instanceof HundredPrintsError) {
    console.error(
      error.code,
      error.message,
      error.cause
    );
  }
}
```

Error codes can include:

```text
AUTH_INVALID
TEMPLATE_NOT_FOUND
INVALID_INPUT
UNSUPPORTED_FORMAT
UNSUPPORTED_SIDE
INVALID_TARGET
FONT_LOAD_FAILED
RENDER_FAILED
DOWNLOAD_FAILED
```

---

## Migrating from v1

Version 2 introduces `HundredPrints` as the recommended public API.

### Main changes

```text
key
→ publishableKey

payload
→ data

PNG / JPEG
→ explicit side

PDF
→ includeBack

render result
→ blob + url + download() + revoke()
```

Example v2:

```ts
import { HundredPrints } from "@100printswithme/browser-sdk";

const prints = new HundredPrints({
  publishableKey: "pk_live_xxx"
});
```

The original `BrowserSDK` remains available for existing integrations:

```ts
import { BrowserSDK } from "@100printswithme/browser-sdk";

const sdk = new BrowserSDK({
  key: "pk_live_xxx"
});

const { blob } = await sdk.render({
  templateId: "tpl_123",
  payload: {
    Name: "Rishabh Dev"
  },
  format: "pdf"
});
```

New integrations should use `HundredPrints`.

---

## Browser Support

The package targets ES2020 and current versions of:

- Chrome
- Edge
- Firefox
- Safari

Rendering requires a browser DOM and is not intended for Node.js server-side rendering.

In frameworks with server-side rendering, import and call the SDK from client-side code.

---

## Why 100PrintsWithMe Browser SDK?

Low-level Canvas or PDF libraries usually require developers to manually build document layouts in code.

100PrintsWithMe uses a different workflow:

```text
design template visually
↓
get template ID
↓
pass application data
↓
render
```

Your application only needs to provide dynamic values.

No manual PDF positioning.

No Canvas layout code.

No custom rendering engine setup.

The same template can be reused across thousands of renders with different data.

---

## Development

```bash
npm install
npm test
npm run build
```

The script-tag example is available at:

```text
examples/script-tag/index.html
```

After building:

```bash
npm run dev
```

then open:

```text
http://localhost:5173/examples/script-tag/
```

---

## Links

- Website: **https://100printswith.me**
- SDK Playground: **https://playground.100printswith.me**
- npm: **https://www.npmjs.com/package/@100printswithme/browser-sdk**
- Documentation: **https://100printswith.me/docs**

---

## License

[MIT](./LICENSE) © 2026 100PrintsWithMe.