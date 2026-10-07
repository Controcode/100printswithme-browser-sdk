# 100PrintsWithMe Browser SDK

Render templates from 100PrintsWithMe directly in a modern browser. The v2 API keeps canvas, font loading, PDF creation, and renderer details behind one small class.

## Install

```bash
npm install @100printswithme/browser-sdk
```

## Quick start

```ts
import { HundredPrints } from "@100printswithme/browser-sdk";

const hp = new HundredPrints({
  publishableKey: "pk_live_xxx"
});

const image = await hp.png({
  templateId: "tpl_123",
  data: {
    Name: "Rishabh Dev",
    Role: "Chief Scientist"
  },
  side: "front"
});

document.querySelector<HTMLImageElement>("#badge")!.src = image.url;
```

Keys in `data` must match dynamic fields configured in the template.

`image.url` is a local browser object URL. It is useful for an `<img>` or local download, but it is not a permanent internet URL and must not be stored or shared externally. Call `image.revoke()` after the page no longer uses it.

## Images: choose one side

PNG and JPEG always render exactly one side. `side` is required and can only be `"front"` or `"back"`.

```ts
const front = await hp.png({
  templateId: "tpl_123",
  data,
  side: "front",
  quality: "high"
});

const back = await hp.png({
  templateId: "tpl_123",
  data,
  side: "back"
});

frontImage.src = front.url;
backImage.src = back.url;
```

JPEG uses the same renderer and explicit side model:

```ts
const image = await hp.jpeg({
  templateId: "tpl_123",
  data: { Name: "Rishabh Dev" },
  side: "front",
  quality: "high"
});
```

Image results contain `format`, `blob`, `url`, `width`, `height`, `side`, `download()`, and `revoke()`.

## PDFs: optionally include the back

PDFs are documents, so they use `includeBack` instead of `side`. It defaults to `false`.

```ts
const pdf = await hp.pdf({
  templateId: "tpl_123",
  data: { Name: "Rishabh Dev" },
  includeBack: true,
  quality: "ultra"
});

pdf.download("certificate.pdf");
```

- `includeBack: false` renders the front page only.
- `includeBack: true` renders the front page and the back page when the template has one.

For selectable text and vector artwork, use the existing vector PDF engine:

```ts
const pdf = await hp.vectorPdf({
  templateId: "tpl_123",
  data: { Name: "Rishabh Dev" },
  includeBack: true
});

pdf.download("print-ready.pdf");
```

PDF results contain `format`, `blob`, `url`, `pages`, `download()`, and `revoke()`.

## Generic render

`render()` uses a discriminated output object. TypeScript suggests `side` for images and `includeBack` for PDFs.

```ts
const image = await hp.render({
  templateId: "tpl_123",
  data: { Name: "Rishabh Dev" },
  output: {
    format: "png",
    side: "back",
    quality: "high"
  }
});

const pdf = await hp.render({
  templateId: "tpl_123",
  data: { Name: "Rishabh Dev" },
  output: {
    format: "pdf",
    includeBack: true,
    quality: "high"
  }
});
```

## Render directly to an image

`renderTo()` accepts a selector or an `HTMLImageElement`. It supports PNG and JPEG only and returns the image result.

```html
<img id="badge" alt="Rendered badge">
```

```ts
const result = await hp.renderTo("#badge", {
  templateId: "tpl_123",
  data: { Name: "Rishabh Dev" },
  output: {
    format: "png",
    side: "front",
    quality: "high"
  }
});

// Later, when the image is no longer displayed:
result.revoke();
```

There is no new `hp.preview()` method. `result.url` and `renderTo()` cover normal browser previewing.

## One-shot download

```ts
await hp.download({
  templateId: "tpl_123",
  data: { Name: "Rishabh Dev" },
  output: {
    format: "pdf",
    includeBack: true,
    quality: "high"
  },
  filename: "certificate.pdf"
});
```

The one-shot helper cleans up its temporary object URL after starting the download.

## Quality

- `draft`: fast, lower resolution
- `standard`: normal use
- `high`: higher resolution
- `ultra`: highest resolution for print

## Script tag

The UMD artifact exposes `HundredPrints` directly on `window`.

To run the local [script-tag example](examples/script-tag/index.html), run `npm run build` and `npm run dev` from the `sdk` folder, then open `http://localhost:5173/examples/script-tag/`. Opening the HTML file with `file://` prevents a reliable API request. The example displays the API or font error below the image if rendering fails.

```html
<script src="https://cdn.100printswith.me/sdk/v2/100prints-sdk.umd.js"></script>
<img id="badge" alt="Rendered badge">

<script>
  const hp = new HundredPrints({ publishableKey: "pk_live_xxx" });

  hp.renderTo("#badge", {
    templateId: "tpl_123",
    data: {
      Name: "Rishabh Dev",
      Role: "Chief Scientist"
    },
    output: {
      format: "png",
      side: "front",
      quality: "high"
    }
  });
</script>
```

## Errors

Failures reject with `HundredPrintsError`, which has a stable `code`, a useful message, and the original `cause` where available.

```ts
import { HundredPrintsError } from "@100printswithme/browser-sdk";

try {
  await hp.png({ templateId, data, side: "front" });
} catch (error) {
  if (error instanceof HundredPrintsError) {
    console.error(error.code, error.message);
  }
}
```

## Legacy API

`BrowserSDK` remains exported for existing integrations. Its `render()`, `preview()`, and `renderBulk()` methods and `payload` naming remain available. New integrations should use `HundredPrints`.

```ts
import { BrowserSDK } from "@100printswithme/browser-sdk";

const sdk = new BrowserSDK({ key: "pk_live_xxx" });
const { blob } = await sdk.render({
  templateId: "tpl_123",
  payload: { Name: "Rishabh Dev" },
  format: "pdf"
});
```

## Browser support

The SDK targets modern browsers with ES2020, Canvas, Blob, object URL, and Fetch support.

## License

MIT © 2026 100PrintsWithMe.
