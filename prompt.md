# 100PrintsWithMe Browser SDK v2 — Final Public API Redesign

Redesign the existing:

```text
@100printswithme/browser-sdk
```

into a much simpler, polished **v2 developer API** while preserving the current renderer and current rendering behavior.

The renderer has already been updated separately and brought into parity with the current 100Prints frontend renderer.

Therefore:

> This is NOT a renderer rewrite.

Treat the current SDK renderer as working, tested infrastructure.

The task is to build a clean, extremely easy-to-use developer-facing API around it.

The desired experience is that an ordinary developer can generate an image or PDF without understanding:

```text
Canvas
renderer classes
PDF internals
Blob creation
object URLs
font loading internals
template parsing internals
worker architecture
renderer-specific methods
```

---

# 1. Core goal

A developer should be able to write:

```javascript
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

document.querySelector("#badge").src = image.url;
```

or:

```javascript
const pdf = await hp.pdf({
  templateId: "tpl_123",

  data: {
    Name: "Rishabh Dev"
  },

  includeBack: true
});

pdf.download("certificate.pdf");
```

That should be the normal developer experience.

---

# 2. Important scope

This task is ONLY:

> Browser SDK v2 developer API redesign.

Do NOT:

- rewrite the renderer
- change renderer math
- change text rendering
- change shapes
- change SVG behavior
- change image rendering
- change table rendering
- change chart rendering
- change QR/barcode rendering
- change font behavior
- change PDF rendering
- change vector-PDF rendering
- change template parsing
- redesign backend APIs
- add server-side rendering
- add Instant URLs
- add Zapier
- add Make
- add n8n
- add Google Workspace
- add React-specific wrappers
- add Vue-specific wrappers
- rewrite the WordPress plugin
- build a new Web Worker system
- migrate the renderer to OffscreenCanvas
- introduce aggressive bundle splitting

The renderer underneath the SDK is already working.

The job is to create a clean public abstraction around it.

---

# 3. v2 priorities

In order:

```text
1. developer API simplicity
2. renderer correctness
3. predictable image front/back behavior
4. npm usability
5. direct <script> usability
6. TypeScript autocomplete
7. backward compatibility
8. documentation
9. stability
```

Not priorities for v2:

```text
full worker architecture
OffscreenCanvas
advanced lazy loading
micro-optimizing bundle size
framework wrappers
new renderer features
```

Those can come later.

---

# 4. First inspect the current SDK

Before modifying code, inspect the existing SDK carefully.

Inspect:

- package exports
- `BrowserSDK`
- `render()`
- `preview()`
- `renderBulk()`
- template fetching
- publishable-key authentication
- renderer entry points
- PNG rendering
- JPEG rendering if supported
- raster PDF rendering
- vector-PDF rendering
- image front/back behavior
- current stacked/both-side image behavior, if any
- quality handling
- Blob creation
- object URL creation
- downloading
- font loading
- assets
- TypeScript definitions
- npm build
- browser/UMD build
- WordPress/browser bundle if relevant
- tests
- README

Do not assume capabilities based on names.

Actually inspect the implementation.

Before implementation, establish internally:

```text
existing capability
→ existing internal implementation
→ desired v2 public method
```

Example:

```text
current PNG renderer
→ hp.png()

current JPEG renderer
→ hp.jpeg()

current raster PDF renderer
→ hp.pdf()

current vector PDF renderer
→ hp.vectorPdf()

existing render pipeline
→ hp.render()

Blob download logic
→ result.download() / hp.download()

image result
→ blob + url + side
```

Proceed with implementation after this audit.

Do not stop merely to report the audit unless there is a genuine blocking problem.

---

# 5. Main class

Create the canonical v2 class:

```javascript
import { HundredPrints } from "@100printswithme/browser-sdk";

const hp = new HundredPrints({
  publishableKey: "pk_live_xxx"
});
```

The publishable key is configured once.

Do NOT require it in every render call.

Primary v2 methods:

```javascript
hp.render(...)
hp.png(...)
hp.jpeg(...)
hp.pdf(...)
hp.vectorPdf(...)
hp.renderTo(...)
hp.download(...)
```

That is the intended core surface.

Keep it small.

Do not add methods merely because they might be useful someday.

---

# 6. Important decision — NO new `preview()` API

Do NOT create:

```javascript
hp.preview(...)
```

Do NOT create:

```javascript
hp.mount(...)
```

Do NOT create another dedicated preview abstraction.

It is unnecessary in v2.

Why?

Image rendering already returns:

```javascript
{
  blob,
  url
}
```

The developer can preview directly:

```javascript
const image = await hp.png({
  templateId,
  data,
  side: "front"
});

document.querySelector("img").src = image.url;
```

Therefore:

```text
render
→ get image.url
→ assign to <img>
```

already IS the preview workflow.

There is no reason to duplicate this with another public API.

---

# 7. Legacy `BrowserSDK.preview()`

If the old `BrowserSDK` already contains:

```javascript
sdk.preview(...)
```

do not intentionally break it.

Existing customers may still use it.

However:

- do not promote it in v2 documentation
- do not add an equivalent `hp.preview()`
- do not redesign it
- do not build new preview infrastructure around it

Treat it only as legacy compatibility.

The new v2 API should use:

```javascript
hp.png()
hp.jpeg()
hp.renderTo()
```

for visual display.

---

# 8. Extremely important image-side model

Image outputs and document outputs must have DIFFERENT semantics.

This should be explicit in the public API.

For:

```text
PNG
JPEG
```

the SDK produces an image representing exactly ONE template side.

Therefore every new v2 image render MUST specify:

```javascript
side: "front"
```

or:

```javascript
side: "back"
```

This is intentional.

Do NOT make image side ambiguous.

Do NOT silently return a stacked front+back image in the new v2 API.

Do NOT make:

```javascript
side: "both"
```

part of the primary v2 image API.

If the old renderer internally supports vertically stacked front+back images, preserve that behavior only where needed for legacy `BrowserSDK` compatibility.

The clean v2 API should use one side per image result.

---

# 9. Why image side is explicit

An image URL:

```javascript
image.url
```

must have a clear meaning.

For example:

```javascript
const image = await hp.png({
  templateId,
  data,
  side: "front"
});
```

means:

```text
image.url
= front-side PNG
```

Likewise:

```javascript
const image = await hp.png({
  templateId,
  data,
  side: "back"
});
```

means:

```text
image.url
= back-side PNG
```

There should never be uncertainty such as:

```text
Does this URL represent:
front?
back?
both?
stacked output?
```

The v2 contract should make the answer obvious.

---

# 10. Need both image sides?

Do NOT introduce a special `both` result abstraction in this task.

If a developer wants both sides, they can explicitly request both:

```javascript
const front = await hp.png({
  templateId,
  data,
  side: "front"
});

const back = await hp.png({
  templateId,
  data,
  side: "back"
});
```

Then:

```javascript
frontImage.src = front.url;
backImage.src = back.url;
```

This is simple, explicit and predictable.

A future API could optimize simultaneous rendering if needed.

Do not complicate v2 for this.

---

# 11. `hp.png()`

Target API:

```javascript
const image = await hp.png({
  templateId: "tpl_123",

  data: {
    Name: "Rishabh Dev",
    Role: "Chief Scientist",
    Company: "Diffusion Vector"
  },

  side: "front",
  quality: "high"
});
```

Important:

```javascript
side
```

is REQUIRED for the v2 image API.

Allowed values:

```typescript
type RenderSide =
  | "front"
  | "back";
```

No `"both"` in the clean v2 API.

Result:

```javascript
{
  format: "png",

  blob,
  url,

  width,
  height,

  side: "front",

  download(filename),
  revoke()
}
```

The returned:

```javascript
side
```

must represent the side actually rendered.

It should not be optional.

---

# 12. PNG result semantics

Example:

```javascript
const front = await hp.png({
  templateId,
  data,
  side: "front"
});
```

Then:

```javascript
front.format === "png"
front.side === "front"
front.blob instanceof Blob
```

and:

```javascript
front.url
```

is an object URL representing exactly the front image.

Usage:

```javascript
document.querySelector("#front").src = front.url;
```

Download:

```javascript
front.download("badge-front.png");
```

Cleanup:

```javascript
front.revoke();
```

---

# 13. `hp.jpeg()`

Only expose JPEG if current renderer genuinely supports it.

Target API:

```javascript
const image = await hp.jpeg({
  templateId: "tpl_123",

  data: {
    Name: "Rishabh Dev"
  },

  side: "back",
  quality: "high"
});
```

Again:

```javascript
side
```

is REQUIRED.

Result:

```javascript
{
  format: "jpeg",

  blob,
  url,

  width,
  height,

  side: "back",

  download(filename),
  revoke()
}
```

If JPEG does not currently exist, inspect whether it can be provided through a trivial and safe conversion over the existing raster pipeline.

Do not fake support.

Do not introduce a major renderer change solely for JPEG.

---

# 14. Image result type

Prefer something like:

```typescript
interface ImageRenderResult {
  format: "png" | "jpeg";

  blob: Blob;
  url: string;

  width: number;
  height: number;

  side: "front" | "back";

  download(filename?: string): void;
  revoke(): void;
}
```

Important:

```typescript
side
```

is NOT optional.

An image result must always know which side it represents.

---

# 15. Blob URL behavior

For image results:

```javascript
result.url
```

should normally be:

```text
blob:https://...
```

created using:

```javascript
URL.createObjectURL(blob)
```

Document clearly:

> `url` is a local browser object URL. It is not a permanent internet URL and should not be stored in a database or shared externally.

The developer can use it directly:

```javascript
img.src = result.url;
```

No manual object-URL creation should be needed for normal usage.

---

# 16. `revoke()`

Every result that owns an object URL should expose:

```javascript
result.revoke();
```

Internally:

```javascript
URL.revokeObjectURL(result.url);
```

Make repeated calls safe/idempotent if practical.

Example:

```javascript
const image = await hp.png({
  templateId,
  data,
  side: "front"
});

img.src = image.url;

// later, after no longer needed:
image.revoke();
```

Do not revoke automatically while the developer is still using the result.

---

# 17. PDF semantics are different

PDFs are documents, not individual side images.

Therefore:

```text
PNG / JPEG
→ side

PDF / Vector PDF
→ includeBack
```

This distinction is fundamental.

---

# 18. `hp.pdf()`

Target:

```javascript
const pdf = await hp.pdf({
  templateId: "tpl_123",

  data: {
    Name: "Rishabh Dev",
    Role: "Chief Scientist"
  },

  includeBack: true,
  quality: "ultra"
});
```

Meaning:

```text
includeBack: false
→ front page only

includeBack: true
→ front page + back page
```

If omitted, use:

```javascript
includeBack: false
```

unless existing renderer semantics require otherwise.

Document the default clearly.

Result:

```javascript
{
  format: "pdf",

  blob,
  url,

  pages,

  download(filename),
  revoke()
}
```

A single PDF Blob/Object URL represents the entire document.

That is correct because a PDF naturally contains multiple pages.

---

# 19. `hp.vectorPdf()`

Target:

```javascript
const pdf = await hp.vectorPdf({
  templateId: "tpl_123",

  data: {
    Name: "Rishabh Dev"
  },

  includeBack: true
});
```

Result:

```javascript
{
  format: "vector-pdf",

  blob,
  url,

  pages,

  download(filename),
  revoke()
}
```

Use the existing vector-PDF renderer.

Do NOT change vector rendering algorithms.

If quality affects raster fallbacks inside vector PDF, expose it only according to existing engine behavior.

Do not invent new semantics.

---

# 20. PDF result type

Prefer:

```typescript
interface PdfRenderResult {
  format: "pdf" | "vector-pdf";

  blob: Blob;
  url: string;

  pages?: number;

  download(filename?: string): void;
  revoke(): void;
}
```

Do not add a `side` property to PDF results.

The PDF itself can represent multiple pages.

---

# 21. Generic `hp.render()`

Provide one advanced generic method.

Image example:

```javascript
const result = await hp.render({
  templateId: "tpl_123",

  data: {
    Name: "Rishabh Dev"
  },

  output: {
    format: "png",
    side: "back",
    quality: "high"
  }
});
```

PDF example:

```javascript
const result = await hp.render({
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

---

# 22. Use discriminated TypeScript types

Do NOT use one loose output object where everything is optional.

Avoid:

```typescript
{
  format: RenderFormat;
  side?: RenderSide;
  includeBack?: boolean;
}
```

because this allows invalid combinations such as:

```javascript
{
  format: "png",
  includeBack: true
}
```

or:

```javascript
{
  format: "pdf",
  side: "back"
}
```

Instead use a discriminated union.

For example:

```typescript
interface ImageRenderOutput {
  format: "png" | "jpeg";

  side: "front" | "back";

  quality?: RenderQuality;
}
```

and:

```typescript
interface PdfRenderOutput {
  format: "pdf" | "vector-pdf";

  includeBack?: boolean;

  quality?: RenderQuality;
}
```

Then:

```typescript
interface BaseRenderRequest {
  templateId: string;
  data?: Record<string, unknown>;
}
```

and:

```typescript
type RenderInput =
  | (BaseRenderRequest & {
      output: ImageRenderOutput;
    })
  | (BaseRenderRequest & {
      output: PdfRenderOutput;
    });
```

This gives excellent TypeScript autocomplete and prevents invalid combinations before runtime.

Adapt exact definitions to the real implementation.

---

# 23. Convenience methods must use one pipeline

These:

```javascript
hp.png()
hp.jpeg()
hp.pdf()
hp.vectorPdf()
```

must NOT become four independent renderer implementations.

Internally:

```text
hp.png()
    ↓
normalize v2 image input
    ↓
shared render controller
    ↓
existing renderer
```

Likewise:

```text
hp.pdf()
    ↓
normalize v2 PDF input
    ↓
shared render controller
    ↓
existing renderer
```

One renderer.

One normalized pipeline.

Several convenience methods.

---

# 24. Template data

Use one public name:

```javascript
data
```

Example:

```javascript
data: {
  Name: "Rishabh Dev",
  Role: "Chief Scientist",
  Company: "Diffusion Vector",
  QRData: "https://example.com"
}
```

Document:

> Keys inside `data` must match dynamic fields configured in the template.

Do not use a confusing mixture of:

```text
payload
variables
fields
values
```

in the new v2 API.

---

# 25. Legacy `payload`

Old `BrowserSDK` may use:

```javascript
payload
```

Keep that working for legacy compatibility where practical.

Conceptually:

```text
legacy BrowserSDK
payload
↓
existing internal behavior
```

New v2:

```text
HundredPrints
data
↓
normalized internal data
```

Do not require existing users to immediately migrate.

But all new documentation should use:

```javascript
data
```

---

# 26. `hp.renderTo()` — exact purpose

Keep `renderTo()` because it provides an extremely convenient browser/script-tag workflow.

But its behavior must be VERY clear.

`renderTo()` is for IMAGE OUTPUT only in v2.

Supported:

```text
PNG
JPEG
```

Not supported:

```text
PDF
vector-PDF
```

An `<img>` can display one image, so `renderTo()` MUST require an explicit side.

---

# 27. `renderTo()` correct usage

HTML:

```html
<img id="badge">
```

JavaScript:

```javascript
const result = await hp.renderTo("#badge", {
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
```

Internal behavior:

```text
validate target
↓
validate image output
↓
render requested side
↓
create Blob URL
↓
set target.src = result.url
↓
return ImageRenderResult
```

Important:

`renderTo()` should return the image result too.

Therefore:

```javascript
const result = await hp.renderTo(...);

result.url
result.blob
result.side
result.download()
result.revoke()
```

remain available.

---

# 28. `renderTo()` back side

Example:

```javascript
await hp.renderTo("#back", {
  templateId: "tpl_123",
  data,

  output: {
    format: "png",
    side: "back",
    quality: "high"
  }
});
```

Now:

```text
#back
```

displays exactly the back-side image.

No ambiguity.

---

# 29. `renderTo()` validation

Reject:

```javascript
await hp.renderTo("#badge", {
  templateId,
  data,

  output: {
    format: "pdf"
  }
});
```

with a useful error.

Likewise reject an image render without side:

```javascript
output: {
  format: "png"
}
```

The error should explain:

```text
Image rendering requires side: "front" or "back".
```

Do not silently guess.

---

# 30. `renderTo()` target validation

Allow:

```javascript
await hp.renderTo("#badge", config);
```

and:

```javascript
const img = document.querySelector("#badge");

await hp.renderTo(img, config);
```

Validate:

- selector exists
- target can display an image
- output is PNG/JPEG
- side is valid

Return predictable SDK errors.

Do not fail silently.

---

# 31. No dedicated preview because `renderTo()` + URL already solve it

There are now two simple preview workflows.

Workflow A:

```javascript
const image = await hp.png({
  templateId,
  data,
  side: "front"
});

img.src = image.url;
```

Workflow B:

```javascript
await hp.renderTo("#preview", {
  templateId,
  data,

  output: {
    format: "png",
    side: "front"
  }
});
```

That is sufficient.

Do NOT add another:

```javascript
hp.preview()
```

API.

---

# 32. `result.download()`

Every render result should provide:

```javascript
result.download(filename);
```

Image:

```javascript
const image = await hp.png({
  templateId,
  data,
  side: "front"
});

image.download("badge.png");
```

PDF:

```javascript
const pdf = await hp.pdf({
  templateId,
  data,
  includeBack: true
});

pdf.download("certificate.pdf");
```

Use sensible default filenames if omitted.

Examples:

```text
render.png
render.jpeg
render.pdf
```

For vector PDF:

```text
render.pdf
```

is preferable to inventing a nonstandard file extension.

---

# 33. `hp.download()`

Also provide one-shot rendering + download.

Example:

```javascript
await hp.download({
  templateId: "tpl_123",

  data: {
    Name: "Rishabh Dev"
  },

  output: {
    format: "pdf",
    includeBack: true,
    quality: "high"
  },

  filename: "certificate.pdf"
});
```

Image example:

```javascript
await hp.download({
  templateId,
  data,

  output: {
    format: "png",
    side: "front",
    quality: "high"
  },

  filename: "badge.png"
});
```

Internally:

```text
shared render pipeline
↓
Blob
↓
temporary object URL if needed
↓
trigger browser download
↓
clean temporary download resources
```

Do not duplicate renderer code.

---

# 34. Publishable-key behavior

Canonical:

```javascript
const hp = new HundredPrints({
  publishableKey: "pk_live_xxx"
});
```

The publishable key is public browser configuration.

Do NOT:

- hide it
- encrypt it
- describe it as secret

If secret server API keys use a different prefix such as:

```text
sk_...
```

do not encourage using them in this browser SDK.

If practical, reject obvious secret-key usage with a clear error.

Do not change backend security architecture during this task.

---

# 35. Quality

Inspect current renderer quality values.

Likely:

```typescript
type RenderQuality =
  | "draft"
  | "standard"
  | "high"
  | "ultra";
```

Verify from implementation.

Document conceptually:

```text
draft
→ fast / lower resolution

standard
→ normal use

high
→ higher-resolution output

ultra
→ highest-resolution print output
```

Do not expose internal scaling numbers as the public API unless required.

Do not silently change existing rendering defaults.

---

# 36. Base public input types

Prefer something similar to:

```typescript
interface HundredPrintsOptions {
  publishableKey: string;
}
```

Common render data:

```typescript
interface BaseRenderInput {
  templateId: string;

  data?: Record<string, unknown>;

  quality?: RenderQuality;
}
```

Image:

```typescript
interface ImageRenderInput extends BaseRenderInput {
  side: "front" | "back";
}
```

Notice:

```typescript
side
```

is REQUIRED.

PDF:

```typescript
interface PdfRenderInput extends BaseRenderInput {
  includeBack?: boolean;
}
```

Adapt exact types to current implementation.

---

# 37. Public format types

Prefer:

```typescript
type ImageRenderFormat =
  | "png"
  | "jpeg";
```

and:

```typescript
type PdfRenderFormat =
  | "pdf"
  | "vector-pdf";
```

Combined:

```typescript
type RenderFormat =
  | ImageRenderFormat
  | PdfRenderFormat;
```

Only expose JPEG if genuinely supported.

---

# 38. TypeScript should prevent incorrect combinations

These should be accepted:

```javascript
{
  format: "png",
  side: "front"
}
```

```javascript
{
  format: "jpeg",
  side: "back"
}
```

```javascript
{
  format: "pdf",
  includeBack: true
}
```

These should ideally be TypeScript errors:

```javascript
{
  format: "png",
  includeBack: true
}
```

```javascript
{
  format: "pdf",
  side: "back"
}
```

```javascript
{
  format: "png"
}
```

because image side is required in v2.

Use discriminated unions to make autocomplete guide the developer.

---

# 39. Error model

Create one predictable error class.

For example:

```typescript
class HundredPrintsError extends Error {
  code: string;
  details?: unknown;
  cause?: unknown;
}
```

Possible codes:

```text
AUTH_INVALID
TEMPLATE_NOT_FOUND
INVALID_INPUT
UNSUPPORTED_FORMAT
UNSUPPORTED_SIDE
INVALID_TARGET
ASSET_LOAD_FAILED
FONT_LOAD_FAILED
RENDER_FAILED
DOWNLOAD_FAILED
```

Use actual needs after inspecting the code.

Do not expose arbitrary internal error strings as a stable API contract.

Preserve original cause where useful.

---

# 40. Runtime validation

TypeScript does not protect plain JavaScript/script-tag users.

Therefore runtime validation is still required.

Validate:

```text
missing templateId

image render missing side

side not front/back

invalid quality

unsupported format

includeBack used with PNG/JPEG

side used with PDF/vector-PDF

invalid renderTo selector

invalid renderTo element

PDF passed to renderTo
```

Errors should explain what the developer should change.

Example:

```text
INVALID_INPUT:
PNG rendering requires side: "front" or "back".
```

---

# 41. Script-tag usage is mandatory

The SDK must support browser usage without npm.

Target:

```html
<script src="https://cdn.100printswith.me/sdk/v2/100prints.min.js"></script>

<img id="badge">

<script>
  const hp = new HundredPrints({
    publishableKey: "pk_live_xxx"
  });

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

The browser build should expose:

```javascript
window.HundredPrints
```

or the equivalent existing global.

The API concept must be identical between npm and `<script>` usage.

Do NOT create two different APIs.

---

# 42. npm usage

Target:

```bash
npm install @100printswithme/browser-sdk
```

Then:

```javascript
import { HundredPrints } from "@100printswithme/browser-sdk";

const hp = new HundredPrints({
  publishableKey: "pk_live_xxx"
});
```

Same API:

```javascript
hp.render()
hp.png()
hp.jpeg()
hp.pdf()
hp.vectorPdf()
hp.renderTo()
hp.download()
```

---

# 43. Browser SDK v2 should NOT expose new preview API

The new main API list should remain:

```text
hp.render()
hp.png()
hp.jpeg()
hp.pdf()
hp.vectorPdf()
hp.renderTo()
hp.download()
```

NOT:

```text
hp.preview()
```

Do not include preview in primary v2 autocomplete/docs.

---

# 44. Bulk rendering decision

Do NOT redesign bulk rendering during this task unless it is required by existing compatibility.

Existing:

```javascript
BrowserSDK.renderBulk(...)
```

may remain functional.

Do NOT add a large new:

```javascript
hp.bulk
```

namespace unless implementation is essentially free and obviously clean.

Bulk API redesign can be a separate task.

Core v2 should not be delayed by it.

---

# 45. Backward compatibility

The existing package already has users.

Existing code such as:

```javascript
import { BrowserSDK } from "@100printswithme/browser-sdk";

const sdk = new BrowserSDK({
  key: "pk_live_xxx"
});
```

and:

```javascript
await sdk.render({
  templateId,
  payload,
  format: "pdf"
});
```

should continue working if practical.

Also preserve existing:

```javascript
sdk.preview(...)
sdk.renderBulk(...)
```

if those methods already exist.

But they are LEGACY APIs.

Do not use their design to make the new v2 API messy.

---

# 46. Recommended compatibility architecture

Prefer conceptually:

```text
                    existing renderer
                           ↑
                           |
                 shared render controller
                   ↑                 ↑
                   |                 |
          HundredPrints          BrowserSDK
            v2 API              legacy API
```

Do not maintain two renderers.

Do not duplicate render logic.

Where appropriate:

```typescript
/** @deprecated Use HundredPrints instead. */
export class BrowserSDK {
  ...
}
```

Keep old behavior isolated from the clean v2 API.

---

# 47. Important legacy image behavior

If legacy `BrowserSDK` supports:

```text
front + back stacked PNG
```

or similar behavior, do not necessarily remove it.

Preserve it inside legacy compatibility if required.

But do NOT allow that legacy design to pollute the new v2 image API.

New v2 image contract is:

```text
one call
→ one side
→ one Blob
→ one URL
→ one clear result
```

---

# 48. Internal architecture

Do not perform unnecessary repository restructuring.

A reasonable conceptual separation is:

```text
src/

  public/
    HundredPrints.ts
    types.ts
    results.ts
    errors.ts

  runtime/
    render-controller.ts

  render/
    existing renderer

  export/
    existing export logic

  api/
  assets/
  fonts/
  templates/
```

But adapt to the current repository.

Do not move dozens of files just to match this structure.

Core principle:

```text
public API
≠
renderer implementation
```

---

# 49. Renderer is frozen

Do not modify renderer algorithms unless absolutely necessary for wrapper compatibility.

Preserve existing:

```text
text rendering
font behavior
shape rendering
image behavior
SVG rendering
charts
tables
QR
barcode
clipping
rotation
opacity
front/back
PNG output
JPEG output
PDF output
vector PDF output
quality behavior
```

If v2 requires a renderer modification beyond a tiny adapter:

STOP and clearly document why before changing renderer logic.

Do not casually rewrite rendering code.

---

# 50. Off-main-thread decision

Do NOT add a new off-main-thread architecture in v2.

Do NOT introduce:

```text
new Web Worker design
OffscreenCanvas migration
worker-client abstraction
worker controller
new worker bundling requirement
capability-detection framework
```

If existing code already performs some operations in a worker and it naturally continues working, preserve it.

But do not expand it.

Full off-main-thread rendering is planned for a later version such as v3.

---

# 51. Bundle size decision

Current renderer/browser bundle is around:

```text
~1.2–1.5 MB raw
```

This is acceptable for v2.

Do NOT spend significant time splitting:

```text
png.js
jpeg.js
pdf.js
vector-pdf.js
```

during this task.

Correctness and API simplicity matter more.

Future versions may lazy-load renderer modules.

The public API should be designed so future internal lazy loading does NOT require API changes.

For example:

```javascript
hp.vectorPdf(...)
```

should remain the same whether vector-PDF code is bundled eagerly today or lazy-loaded internally later.

---

# 52. Developer should never manually load renderer modules

Do NOT require:

```html
<script src="core.js"></script>
<script src="png.js"></script>
<script src="vector-pdf.js"></script>
```

The developer should load one SDK.

Any future optimization should happen internally.

---

# 53. Build outputs

Inspect current Vite/package configuration.

Produce suitable artifacts such as:

```text
ESM
UMD/IIFE browser build
TypeScript declarations
source maps if appropriate
```

Conceptually:

```text
dist/
  index.js
  index.d.ts
  100prints.min.js
```

Exact filenames should follow existing package conventions.

No new worker artifact is required solely because of v2.

---

# 54. Result utility implementation

Result objects should centralize common functionality.

For example:

```text
create image/PDF result
↓
attach Blob
↓
create object URL
↓
attach download()
↓
attach revoke()
```

Avoid repeating URL/download code in every convenience method.

Prefer shared helpers.

---

# 55. Object URL ownership

Be careful with lifecycle.

For:

```javascript
const result = await hp.png(...);
```

the caller owns the result URL until:

```javascript
result.revoke();
```

Do not automatically revoke it immediately after assigning it to an image.

For:

```javascript
hp.download(...)
```

where the result is not returned for reuse, temporary URLs may be cleaned automatically after the download is triggered.

Document the behavior.

---

# 56. `renderTo()` result ownership

For:

```javascript
const result = await hp.renderTo("#badge", {...});
```

the returned result should remain usable.

For example:

```javascript
result.download("badge.png");
```

should still work.

Do not immediately revoke:

```javascript
result.url
```

after assigning it to the `<img>`.

If you implement automatic cleanup when `renderTo()` replaces a previous SDK-generated image on the same target, do so only if it is safe and simple.

Do not complicate v2 solely for this optimization.

---

# 57. README — first example

The first README example should be extremely simple but explicit.

```javascript
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

document.querySelector("#badge").src = image.url;
```

This demonstrates the complete mental model.

---

# 58. README — back image

```javascript
const back = await hp.png({
  templateId: "tpl_123",
  data,
  side: "back"
});

document.querySelector("#badge-back").src = back.url;
```

This makes the front/back model obvious.

---

# 59. README — JPEG

If supported:

```javascript
const image = await hp.jpeg({
  templateId: "tpl_123",

  data: {
    Name: "Rishabh Dev"
  },

  side: "front",
  quality: "high"
});

img.src = image.url;
```

---

# 60. README — PDF

```javascript
const pdf = await hp.pdf({
  templateId: "tpl_123",

  data: {
    Name: "Rishabh Dev"
  },

  includeBack: true,
  quality: "ultra"
});

pdf.download("certificate.pdf");
```

Explain:

```text
includeBack: false
→ front page

includeBack: true
→ front + back pages
```

---

# 61. README — vector PDF

```javascript
const pdf = await hp.vectorPdf({
  templateId: "tpl_123",

  data: {
    Name: "Rishabh Dev"
  },

  includeBack: true
});

pdf.download("print-ready.pdf");
```

---

# 62. README — generic image render

```javascript
const image = await hp.render({
  templateId: "tpl_123",

  data: {
    Name: "Rishabh Dev"
  },

  output: {
    format: "png",
    side: "back",
    quality: "high"
  }
});
```

---

# 63. README — generic PDF render

```javascript
const pdf = await hp.render({
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

---

# 64. README — render directly to `<img>`

```html
<img id="badge">
```

```javascript
await hp.renderTo("#badge", {
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

Notice:

```javascript
side: "front"
```

must be shown in every image `renderTo()` example.

Never show an ambiguous image example.

---

# 65. Script-tag documentation

Example:

```html
<script src="https://cdn.100printswith.me/sdk/v2/100prints.min.js"></script>

<img id="badge">

<script>
  const hp = new HundredPrints({
    publishableKey: "pk_live_xxx"
  });

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

This should genuinely work against the built browser artifact.

---

# 66. TypeScript exports

Export useful developer types such as:

```typescript
HundredPrintsOptions

RenderQuality
RenderSide
RenderFormat

ImageRenderFormat
PdfRenderFormat

ImageRenderInput
PdfRenderInput
RenderInput

ImageRenderOutput
PdfRenderOutput

ImageRenderResult
PdfRenderResult

HundredPrintsError
```

Do not expose unnecessary renderer-internal types.

---

# 67. TypeScript developer experience

When typing:

```typescript
side:
```

inside an image request, IDE should suggest:

```text
front
back
```

When typing inside PDF configuration:

```typescript
includeBack:
```

should be available.

`side` should not appear as a valid PDF option.

Likewise `includeBack` should not appear as a valid PNG/JPEG option.

This is a major v2 quality requirement.

---

# 68. Tests — construction

Test:

```javascript
const hp = new HundredPrints({
  publishableKey: "pk_test_xxx"
});
```

Verify configuration is stored and reused correctly.

---

# 69. Tests — PNG front

Test:

```javascript
await hp.png({
  templateId,
  data,
  side: "front"
});
```

Verify:

```text
format = png
side = front
blob exists
url exists
width/height correct
```

---

# 70. Tests — PNG back

Test:

```javascript
await hp.png({
  templateId,
  data,
  side: "back"
});
```

Verify result identifies:

```text
side = back
```

and renderer receives the correct side.

---

# 71. Tests — missing image side

This should fail:

```javascript
await hp.png({
  templateId,
  data
});
```

At TypeScript level where possible.

Also runtime fail for JavaScript callers.

Expected error should explain that image side is required.

---

# 72. Tests — JPEG

If supported, test:

```javascript
hp.jpeg({
  templateId,
  data,
  side: "front"
})
```

and back.

Do not create fake tests for unsupported formats.

---

# 73. Tests — PDF

Test:

```javascript
hp.pdf({
  templateId,
  data,
  includeBack: false
})
```

and:

```javascript
hp.pdf({
  templateId,
  data,
  includeBack: true
})
```

Verify page behavior matches existing renderer.

---

# 74. Tests — vector PDF

Test:

```javascript
hp.vectorPdf({
  templateId,
  data,
  includeBack: true
})
```

Verify existing vector-PDF pipeline is used.

---

# 75. Tests — generic render type semantics

Test valid image:

```javascript
hp.render({
  templateId,
  data,

  output: {
    format: "png",
    side: "front"
  }
})
```

Valid PDF:

```javascript
hp.render({
  templateId,
  data,

  output: {
    format: "pdf",
    includeBack: true
  }
})
```

Invalid:

```javascript
{
  format: "png",
  includeBack: true
}
```

Invalid:

```javascript
{
  format: "pdf",
  side: "back"
}
```

Invalid:

```javascript
{
  format: "png"
}
```

Test both TypeScript behavior and runtime validation where practical.

---

# 76. Tests — result helpers

Verify:

```text
result.blob
result.url
result.download()
result.revoke()
```

Verify revoke is safe.

Verify download uses the correct extension/MIME behavior.

---

# 77. Tests — `renderTo()`

Test:

```javascript
hp.renderTo("#badge", {
  templateId,
  data,

  output: {
    format: "png",
    side: "front"
  }
})
```

Verify:

```text
target found
correct side rendered
Blob URL generated
img.src assigned
ImageRenderResult returned
```

Test back side too.

---

# 78. Tests — invalid `renderTo()`

Reject:

```text
missing selector target
invalid element
PDF output
vector-PDF output
missing image side
invalid side
```

Return predictable errors.

---

# 79. Tests — script-tag build

Create a tiny no-framework page, for example:

```text
examples/script-tag/index.html
```

Test:

```text
SDK script loads
window.HundredPrints exists
constructor works
template fetch works
front PNG works
back PNG works
<img> receives Blob URL
PDF downloads
vector PDF works if practical
errors are understandable
```

This is important.

Do not assume UMD/script compatibility from unit tests alone.

---

# 80. Legacy compatibility tests

Verify existing:

```javascript
new BrowserSDK(...)
```

continues working.

Verify existing:

```javascript
sdk.render(...)
```

continues working.

If existing:

```javascript
sdk.preview(...)
sdk.renderBulk(...)
```

already work, verify they remain functional.

Do NOT expose these as the preferred v2 examples.

---

# 81. Renderer regression tests

The v2 wrapper must not change renderer output.

Run existing renderer tests.

Verify at minimum:

```text
text unchanged
fonts unchanged
shapes unchanged
images unchanged
SVG unchanged
tables unchanged
charts unchanged
QR/barcodes unchanged
PNG unchanged
PDF unchanged
vector PDF unchanged
quality unchanged
front/back unchanged
```

If a regression appears, fix the wrapper/adaptation first.

Do not casually modify renderer algorithms to make tests pass.

---

# 82. Build verification

Run the project-appropriate equivalent of:

```text
install dependencies
TypeScript check
unit tests
renderer tests
npm/package build
browser/UMD build
script-tag integration test
```

Inspect generated files.

Report actual build success/failure.

---

# 83. Bundle size reporting

Report:

```text
ESM raw size
browser/UMD raw size
gzip size if available
brotli size if available
```

Do not optimize aggressively just because the raw bundle is around 1–1.5 MB.

Only fix bundle size if there is obvious accidental duplication.

---

# 84. Do not add premature lazy loading

Do NOT turn this task into:

```text
dynamic import architecture
separate PNG package
separate PDF package
separate vector PDF package
multiple script tags
feature-loader framework
```

Future versions can optimize loading.

The v2 API must remain compatible with future lazy loading, but lazy loading itself is not required now.

---

# 85. Final public API should remain small

Preferred v2 public surface:

```text
new HundredPrints()

hp.render()
hp.png()
hp.jpeg()
hp.pdf()
hp.vectorPdf()
hp.renderTo()
hp.download()
```

Legacy APIs remain separately for compatibility.

Do not add public methods without a clear need.

---

# 86. Final developer mental model

Developers should understand the SDK in roughly one minute.

## Image

```text
choose template
↓
provide data
↓
choose front/back
↓
get image
```

Code:

```javascript
const image = await hp.png({
  templateId,
  data,
  side: "front"
});
```

Result:

```text
blob
url
side
download()
revoke()
```

---

## PDF

```text
choose template
↓
provide data
↓
decide whether back page is included
↓
get document
```

Code:

```javascript
const pdf = await hp.pdf({
  templateId,
  data,
  includeBack: true
});
```

Result:

```text
blob
url
pages
download()
revoke()
```

That distinction should remain obvious throughout the implementation and documentation.

---

# 87. Final implementation report

After implementation provide a detailed report containing:

## Existing architecture found

Explain:

```text
current public API
renderer entry points
template-fetch flow
result generation
build setup
legacy APIs
```

briefly.

---

## Files changed

For every changed/new file:

```text
path
→ purpose
→ important behavior changed
```

---

## Final v2 public API

Show:

```text
hp.render()
hp.png()
hp.jpeg()
hp.pdf()
hp.vectorPdf()
hp.renderTo()
hp.download()
```

---

## Image semantics

Explicitly confirm:

```text
PNG/JPEG require side
side = front | back
one result = one image side
result.side always identifies rendered side
```

---

## PDF semantics

Explicitly confirm:

```text
PDF/vector PDF use includeBack
includeBack false = front only
includeBack true = front + back
```

according to actual implementation.

---

## Preview decision

Confirm:

```text
No new hp.preview() API was created.
```

Explain that:

```text
image.url
```

and:

```text
hp.renderTo()
```

cover normal browser previewing.

State whether legacy:

```text
BrowserSDK.preview()
```

was preserved.

---

## TypeScript model

Show the final discriminated union and explain how it prevents:

```text
PNG + includeBack
PDF + side
image without side
```

---

## Result semantics

Document:

```text
blob
url
format
side for images
pages for PDF if available
download()
revoke()
```

---

## npm usage

Provide a tested copy/paste example.

---

## script-tag usage

Provide a tested copy/paste example.

---

## Legacy compatibility

List exactly what remains functional:

```text
BrowserSDK
render()
preview()
renderBulk()
etc.
```

based on actual implementation.

Do not claim compatibility that was not tested.

---

## Renderer regression

Confirm whether renderer output remained unchanged.

List tests run.

---

## Build results

Report:

```text
TypeScript
tests
npm build
browser build
script-tag test
```

---

## Bundle sizes

Report:

```text
ESM raw
browser raw
gzip
brotli
```

where tooling makes them available.

---

## Breaking changes

Ideally:

```text
none for legacy BrowserSDK
```

If anything broke, explain exactly why.

---

## Deferred intentionally

List:

```text
new preview API
full Web Worker architecture
OffscreenCanvas migration
advanced lazy loading
feature bundle splitting
new bulk API redesign
framework wrappers
Instant URLs
```

---

# 88. Most important implementation rule

Do not begin by rewriting working code.

The renderer already works.

The success criterion is the public developer experience.

For images, this should feel obvious:

```javascript
const image = await hp.png({
  templateId: "tpl_123",

  data: {
    Name: "Rishabh Dev"
  },

  side: "front"
});

img.src = image.url;
```

For the back:

```javascript
const image = await hp.png({
  templateId: "tpl_123",
  data,
  side: "back"
});

img.src = image.url;
```

For PDFs:

```javascript
const pdf = await hp.pdf({
  templateId: "tpl_123",
  data,
  includeBack: true
});

pdf.download("certificate.pdf");
```

There should be no ambiguity about what is rendered.

---

# 89. Final principle

Keep the API boring in the best possible way.

A developer should immediately understand:

```text
png/jpeg
→ choose front or back
→ receive one image

pdf/vector-pdf
→ optionally include back
→ receive one document
```

Everything complicated should remain underneath the SDK.

If an ordinary developer has to understand renderer internals to render a template, the v2 API is still too complicated.

If they can install the package, configure a publishable key, choose a template, provide `data`, choose an image side or PDF page behavior, and immediately receive a useful result, the redesign has succeeded.