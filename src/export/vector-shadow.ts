/**
 * Per-object shadow / glow rendering for the vector PDF export.
 *
 * ── WHY THIS MODULE EXISTS ─────────────────────────────────────────────────
 * The editor draws shadows through Konva, which sets the canvas 2D shadow
 * attributes (`shadowColor`/`shadowBlur`/`shadowOffsetX`/`shadowOffsetY`). That
 * is a true Gaussian blur computed by the browser's rasteriser.
 *
 * PDF has no blur operator. PDFKit 0.19.1 exposes no shadow, blur, blend-mode
 * or soft-mask API either — the only transparency it offers is `opacity()` /
 * `fillOpacity()` / `strokeOpacity()`, which become an ExtGState `ca`/`CA`.
 * (It does emit an `SMask`, but only internally, to carry a PNG's alpha
 * channel.) So the effect genuinely cannot be expressed natively.
 *
 * The approach taken here is the hybrid that the format does allow: render
 * ONLY the shadow into a small transparent PNG, cropped tightly to the
 * shadow's own extent, and place it behind content that stays fully vector.
 * Text remains real selectable PDF text, shapes remain paths, the QR code is
 * untouched. Nothing is flattened, and the PNG's alpha reaches the viewer via
 * the SMask that PDFKit builds for it.
 *
 * ── MATCHING KONVA EXACTLY ─────────────────────────────────────────────────
 * Canvas shadow attributes are deliberately NOT affected by the current
 * transform, so Konva compensates by hand. From konva 9.3.22,
 * `Context._applyShadow`:
 *
 *     shadowBlur    = blur * min(|scaleX * pixelRatio|, |scaleY * pixelRatio|)
 *     shadowOffsetX = offsetX * scaleX * pixelRatio
 *     shadowOffsetY = offsetY * scaleY * pixelRatio
 *
 * In the editor the stage scale is 1, so the blur radius and offsets are plain
 * design pixels. We reproduce that below: the silhouette is scaled by `ratio`
 * via the canvas transform, and the shadow attributes are multiplied by
 * `ratio` manually — the same correction, for the same reason.
 *
 * `shadowOpacity` and `shadowEnabled` are never set anywhere in this codebase,
 * so Konva's defaults (1 and true) apply and the effective shadow alpha is
 * simply the alpha of `shadowColor`.
 */

import { Layer } from '../types';

/** A shadow, in design pixels — the same units the PDF page is drawn in. */
export interface ShadowSpec {
  blur: number;
  offsetX: number;
  offsetY: number;
  /** Any CSS colour string; its own alpha is the shadow's alpha. */
  color: string;
}

/**
 * The outline whose shadow we need. Everything is in page design-px, i.e. the
 * same coordinates the vector drawing calls use, so the raster lands exactly
 * behind the real content.
 */
export type ShadowSilhouette =
  | { kind: 'rect'; x: number; y: number; width: number; height: number; radius: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'border'; x: number; y: number; width: number; height: number; radius: number; borderWidth: number; color: string }
  | {
      kind: 'text';
      /** A CSS font shorthand, built the same way Konva builds it. */
      font: string;
      fontSize: number;
      letterSpacing: number;
      lines: Array<{ text: string; x: number; baselineY: number }>;
    }
  /**
   * The alpha channel of an already-decoded image. This is what `drop-shadow`
   * follows in the DOM editor, so it is the only faithful silhouette for SVG
   * artwork, curved text, transparent logos and QR codes on a clear
   * background — a bounding box would put a soft rectangle behind them.
   */
  | {
      kind: 'image';
      /** Stands in for `image` when caching, which cannot be serialised. */
      key: string;
      image: CanvasImageSource;
      x: number;
      y: number;
      width: number;
      height: number;
      /** 'cover' mirrors the editor's object-fit for photo layers. */
      fit: 'stretch' | 'cover';
      /** The image element's own clip; >= 9999 means fully rounded corners. */
      clipRadius: number | null;
    }
  /**
   * Several outlines casting ONE combined shadow.
   *
   * This is the normal case, not an exception: the DOM editor hangs a single
   * `filter: drop-shadow()` on the layer's content wrapper, so everything
   * inside — border ring, glyphs, underline rule, artwork — is composited
   * into one alpha channel and blurred once.
   *
   * Unioning first is therefore exact by construction, and giving each part its
   * own raster is not merely wasteful (one embedded PNG per part, each with its
   * own padding) but wrong in a way that changes sign with the geometry. Alpha
   * compositing two halos of the same colour yields `a1 + a2 - a1*a2`, whereas
   * one blur over the union yields `a1 + a2` for disjoint parts, because a
   * Gaussian is linear and the union of disjoint alphas is their sum. So a
   * bordered text layer — where the ring and the glyphs never touch — comes out
   * measurably *lighter* if the parts are rasterised separately. Where parts do
   * overlap the error flips: the union saturates at the silhouette while
   * separate compositing keeps accumulating, and the overlap goes too dark.
   */
  | {
      kind: 'group';
      parts: ShadowSilhouette[];
      /**
       * The wrapper's `overflow: hidden` box, when it has one.
       *
       * CSS order matters here: `overflow` and `filter` sit on the *same*
       * element, and the element's content is clipped before the filter runs.
       * So text that overflows its box is cut off in the editor and its halo is
       * cut off with it. Applied in pass A only — see `buildShadowRaster` for
       * why clipping anywhere else would slice the halo square.
       */
      clip?: { x: number; y: number; width: number; height: number; radius: number };
    };

/** A ready-to-place shadow image, positioned in page design-px. */
export interface ShadowRaster {
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The colour the DOM editor falls back to. `EditableLayer` builds its filter as
 * `drop-shadow(ox oy blur ${layer.shadowColor || 'rgba(0,0,0,0.3)'})`, so a
 * layer that has a blur or an offset but no colour of its own still casts a
 * soft black shadow on screen.
 */
const DEFAULT_SHADOW_COLOR = 'rgba(0,0,0,0.3)';

/**
 * Reads the shadow off a layer, returning null when nothing would be visible.
 *
 * The gate is the DOM editor's: `(shadowBlur || shadowOffsetX ||
 * shadowOffsetY)`, i.e. purely geometric, with the colour defaulted. That
 * matters because it is not the Konva canvas's gate — `CanvasRenderer` passes
 * `shadowColor={layer.shadowColor || 'transparent'}`, so on the raster path a
 * layer with a blur and no colour casts nothing at all. The editing surface is
 * the reference, so a missing colour means the default, not "no shadow".
 *
 * An *explicitly* transparent colour is still nothing, of course: CSS blurs it
 * and paints zero pixels either way.
 */
export function getLayerShadow(layer: Layer): ShadowSpec | null {
  const blur = Math.max(0, layer.shadowBlur || 0);
  const offsetX = layer.shadowOffsetX || 0;
  const offsetY = layer.shadowOffsetY || 0;

  // No blur and no displacement means the shadow sits exactly under the shape
  // and is completely hidden by it — which is also the editor's own condition
  // for leaving the filter off entirely.
  if (blur === 0 && offsetX === 0 && offsetY === 0) return null;

  const raw = typeof layer.shadowColor === 'string' ? layer.shadowColor.trim() : '';
  const color = raw || DEFAULT_SHADOW_COLOR;

  const lowered = color.toLowerCase();
  if (lowered === 'transparent' || lowered === 'none') return null;
  if (colorAlpha(lowered) === 0) return null;

  return { blur, offsetX, offsetY, color };
}

/** Alpha of an `rgba()`/`hsla()` colour string; 1 for anything else. */
function colorAlpha(color: string): number {
  const m = /^(?:rgba|hsla)\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*([\d.]+)\s*\)$/.exec(color);
  if (!m) return 1;
  const a = parseFloat(m[1]);
  return Number.isFinite(a) ? a : 1;
}

/**
 * Builds the CSS font shorthand for a text layer the way Konva does
 * (`Text._getContextFont`), so the glow's glyph outlines match the editor's.
 * Passing the CSS weight through also means the browser applies its own
 * synthetic bold, exactly as it does on the editor canvas.
 */
export function konvaFontShorthand(konvaFontStyle: string, fontSize: number, fontFamilyCss: string): string {
  const style = (konvaFontStyle || 'normal').trim() || 'normal';
  return `${style} ${fontSize}px ${fontFamilyCss}`;
}

// ── Raster generation ──────────────────────────────────────────────────────

/**
 * Identical inputs produce an identical data URL, and PDFKit keys its image
 * registry on the source string (`_imageRegistry[src]`), so a shadow that
 * repeats across records is embedded in the file exactly once.
 */
const shadowCache = new Map<string, ShadowRaster | null>();
const SHADOW_CACHE_LIMIT = 120;

/** Frees the cached shadow rasters. Called alongside `clearFontCache()`. */
export function clearShadowCache(): void {
  shadowCache.clear();
  imageCache.clear();
}

// ── Decoded images, for alpha-accurate silhouettes ─────────────────────────

const imageCache = new Map<string, HTMLImageElement | null>();
const IMAGE_CACHE_LIMIT = 60;

/**
 * Decodes an image so its alpha can be used as a silhouette.
 *
 * `crossOrigin = 'anonymous'` is deliberate: without it a remote image taints
 * the canvas and `toDataURL()` throws, losing the shadow anyway. With it, a
 * server that sends no CORS headers simply fails to load. The caller can still
 * shadow a visible border without inventing a box behind transparent artwork.
 */
export function loadShadowImage(src: string): Promise<HTMLImageElement | null> {
  if (!src || typeof document === 'undefined') return Promise.resolve(null);
  if (imageCache.has(src)) return Promise.resolve(imageCache.get(src) || null);

  return new Promise(resolve => {
    const done = (img: HTMLImageElement | null) => {
      if (imageCache.size >= IMAGE_CACHE_LIMIT) imageCache.clear();
      imageCache.set(src, img);
      resolve(img);
    };
    try {
      const img = new Image();
      if (!src.startsWith('data:') && !src.startsWith('blob:')) img.crossOrigin = 'anonymous';
      img.onload = () => done(img);
      img.onerror = () => done(null);
      img.src = src;
    } catch {
      done(null);
    }
  });
}

/** Keeps a pathological template from allocating a huge canvas. */
const MAX_SHADOW_PIXELS = 4096 * 4096;

/**
 * Soft ceiling on a single shadow raster. Above this the sample rate drops
 * instead of the file growing — the point at which a blur is this large is
 * exactly the point at which extra resolution stops being visible.
 */
const SHADOW_PIXEL_BUDGET = 2_500_000;

function createCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function applyTextContext(ctx: CanvasRenderingContext2D, sil: Extract<ShadowSilhouette, { kind: 'text' }>): void {
  ctx.font = sil.font;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  // Chrome supports canvas letterSpacing; where it does not, the glow is a
  // fraction of a pixel narrower than the text. Invisible under a blur.
  if (sil.letterSpacing) {
    try {
      (ctx as any).letterSpacing = `${sil.letterSpacing}px`;
    } catch {
      /* not supported — ignore */
    }
  }
}

/** Ink bounds of the silhouette in page design-px. */
function silhouetteBounds(
  sil: ShadowSilhouette,
  measure: CanvasRenderingContext2D | null,
): { x: number; y: number; width: number; height: number } | null {
  if (sil.kind === 'rect') {
    return { x: sil.x, y: sil.y, width: sil.width, height: sil.height };
  }
  if (sil.kind === 'circle') {
    return { x: sil.cx - sil.r, y: sil.cy - sil.r, width: sil.r * 2, height: sil.r * 2 };
  }
  if (sil.kind === 'ellipse') {
    return { x: sil.cx - sil.rx, y: sil.cy - sil.ry, width: sil.rx * 2, height: sil.ry * 2 };
  }
  if (sil.kind === 'border') {
    return { x: sil.x, y: sil.y, width: sil.width, height: sil.height };
  }
  if (sil.kind === 'image') {
    // The wrapper's overflow clip bounds it, so the box is the whole extent
    // even under 'cover'.
    return { x: sil.x, y: sil.y, width: sil.width, height: sil.height };
  }
  if (sil.kind === 'group') {
    let box: { x: number; y: number; width: number; height: number } | null = null;
    for (const part of sil.parts) {
      const b = silhouetteBounds(part, measure);
      if (!b) continue;
      if (!box) {
        box = { ...b };
        continue;
      }
      const right = Math.max(box.x + box.width, b.x + b.width);
      const bottom = Math.max(box.y + box.height, b.y + b.height);
      box.x = Math.min(box.x, b.x);
      box.y = Math.min(box.y, b.y);
      box.width = right - box.x;
      box.height = bottom - box.y;
    }
    // Whatever the wrapper clips away casts no shadow, so it must not enlarge
    // the raster either — an overflowing headline would otherwise pad a canvas
    // far bigger than the visible halo.
    if (box && sil.clip) {
      const left = Math.max(box.x, sil.clip.x);
      const top = Math.max(box.y, sil.clip.y);
      const right = Math.min(box.x + box.width, sil.clip.x + sil.clip.width);
      const bottom = Math.min(box.y + box.height, sil.clip.y + sil.clip.height);
      if (right <= left || bottom <= top) return null;
      box = { x: left, y: top, width: right - left, height: bottom - top };
    }
    return box;
  }

  if (measure) applyTextContext(measure, sil);

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const line of sil.lines) {
    if (!line.text) continue;
    let ascent = sil.fontSize;
    let descent = sil.fontSize * 0.25;
    let lineLeft = line.x;
    let lineRight = line.x + sil.fontSize * line.text.length;

    if (measure) {
      const m = measure.measureText(line.text);
      const boxLeft = (m as any).actualBoundingBoxLeft;
      const boxRight = (m as any).actualBoundingBoxRight;
      const boxAscent = (m as any).actualBoundingBoxAscent;
      const boxDescent = (m as any).actualBoundingBoxDescent;
      lineLeft = line.x - (Number.isFinite(boxLeft) ? boxLeft : 0);
      lineRight = line.x + (Number.isFinite(boxRight) ? boxRight : m.width);
      if (Number.isFinite(boxAscent)) ascent = boxAscent;
      if (Number.isFinite(boxDescent)) descent = boxDescent;
    }

    left = Math.min(left, lineLeft);
    right = Math.max(right, lineRight);
    top = Math.min(top, line.baselineY - ascent);
    bottom = Math.max(bottom, line.baselineY + descent);
  }

  if (!Number.isFinite(left) || right <= left) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Paths a box the way the editor's content wrapper is shaped and clips to it.
 * `radius >= 9999` is this codebase's convention for fully rounded corners.
 */
function clipBox(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number, radius: number,
): void {
  ctx.beginPath();
  if (radius >= 9999) {
    ctx.ellipse(x + width / 2, y + height / 2, Math.max(0.01, width / 2), Math.max(0.01, height / 2), 0, 0, Math.PI * 2);
  } else if (radius > 0 && typeof (ctx as any).roundRect === 'function') {
    (ctx as any).roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
  } else {
    ctx.rect(x, y, width, height);
  }
  ctx.clip();
}

/**
 * Draws the silhouette's alpha onto `ctx`. Called only for pass A, so `ctx`
 * carries no shadow attributes — clipping here is safe and cannot slice the
 * halo. A group's parts union into one alpha and therefore cast a single
 * shadow, which is what both a CSS filter and Konva do; see the `group` variant
 * for why compositing per-part halos instead is measurably wrong.
 */
function traceSilhouette(ctx: CanvasRenderingContext2D, sil: ShadowSilhouette): void {
  if (sil.kind === 'group') {
    // Reproduces `overflow: hidden` on the wrapper the filter is attached to.
    // Safe here and only here: this canvas carries no shadow attributes.
    if (sil.clip) {
      ctx.save();
      clipBox(ctx, sil.clip.x, sil.clip.y, sil.clip.width, sil.clip.height, sil.clip.radius);
    }
    for (const part of sil.parts) traceSilhouette(ctx, part);
    if (sil.clip) ctx.restore();
    return;
  }

  if (sil.kind === 'text') {
    // save/restore keeps the font from leaking into sibling parts of a group.
    ctx.save();
    applyTextContext(ctx, sil);
    for (const line of sil.lines) {
      if (line.text) ctx.fillText(line.text, line.x, line.baselineY);
    }
    ctx.restore();
    return;
  }

  if (sil.kind === 'image') {
    ctx.save();
    // Reproduces `overflow: hidden` on the editor's content wrapper. Safe to
    // clip because this canvas has no shadow set — see buildShadowRaster.
    if (sil.clipRadius !== null) {
      clipBox(ctx, sil.x, sil.y, sil.width, sil.height, sil.clipRadius);
    }
    let dx = sil.x;
    let dy = sil.y;
    let dw = sil.width;
    let dh = sil.height;
    if (sil.fit === 'cover') {
      const iw = (sil.image as any).width || sil.width;
      const ih = (sil.image as any).height || sil.height;
      if (iw > 0 && ih > 0) {
        const scale = Math.max(sil.width / iw, sil.height / ih);
        dw = iw * scale;
        dh = ih * scale;
        dx = sil.x + (sil.width - dw) / 2;
        dy = sil.y + (sil.height - dh) / 2;
      }
    }
    ctx.drawImage(sil.image, dx, dy, dw, dh);
    ctx.restore();
    return;
  }

  if (sil.kind === 'border') {
    const bw = Math.min(sil.borderWidth, sil.width, sil.height);
    if (bw <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = bw;
    ctx.strokeStyle = sil.color;
    const x = sil.x + bw / 2;
    const y = sil.y + bw / 2;
    const width = Math.max(0.01, sil.width - bw);
    const height = Math.max(0.01, sil.height - bw);
    if (sil.radius >= 9999) {
      ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    } else if (sil.radius > 0 && typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(x, y, width, height, Math.max(0, Math.min(sil.radius - bw / 2, width / 2, height / 2)));
    } else {
      ctx.rect(x, y, width, height);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  if (sil.kind === 'ellipse') {
    ctx.ellipse(sil.cx, sil.cy, Math.max(0.01, sil.rx), Math.max(0.01, sil.ry), 0, 0, Math.PI * 2);
  } else if (sil.kind === 'circle') {
    ctx.arc(sil.cx, sil.cy, Math.max(0.01, sil.r), 0, Math.PI * 2);
  } else if (sil.radius > 0 && typeof (ctx as any).roundRect === 'function') {
    const r = Math.min(sil.radius, sil.width / 2, sil.height / 2);
    (ctx as any).roundRect(sil.x, sil.y, sil.width, sil.height, r);
  } else {
    ctx.rect(sil.x, sil.y, sil.width, sil.height);
  }
  ctx.fill();
}

/**
 * Renders the shadow of `sil` — and only the shadow — to a transparent PNG.
 *
 * Done in three passes over two canvases:
 *
 *   A. Trace the silhouette on its own canvas, applying whatever clipping the
 *      editor's wrapper would apply. Clipping has to happen here and nowhere
 *      else: a canvas clip also clips the shadow a drawing casts, which would
 *      slice the halo off square at the layer box — the exact rectangular
 *      artifact this whole approach exists to avoid. CSS `drop-shadow` clips
 *      the *content* and then blurs the result, so the halo spills freely.
 *   B. Draw that canvas into the output with the shadow attributes set and no
 *      clip, so the blur spreads as far as it wants.
 *   C. Erase it again with `destination-out`, leaving the halo and a hole
 *      exactly where the shape was. The caller paints the real vector content
 *      into that hole, so the seam is covered and no rasterised copy of the
 *      shape survives.
 *
 * Pass C is the one deliberate approximation. CSS composites the content over
 * an *unpunched* shadow, so on a partially-covered pixel it keeps `a_s`, while
 * punching leaves `a_s(1 - a_c)`; the residual works out to
 * `a_s * a_c * (1 - a_c)^2 * (bg - shadow)`, which is zero wherever the content
 * is fully opaque or fully absent and peaks around half coverage. Measured
 * against a reference implementation of the CSS pipeline it stays under
 * 14/255 and is always in the *lighter* direction, confined to the
 * antialiasing band of glyph edges — where the glyph itself is painted on top.
 * Removing it would mean drawing the silhouette off-canvas and adding the
 * displacement back into `shadowOffset`, which relies on the rasteriser not
 * culling a draw whose ink lands outside the bitmap; that is not worth trading
 * a sub-visible fringe for a silent no-shadow failure on some browser.
 */
export function renderShadowRaster(sil: ShadowSilhouette, spec: ShadowSpec): ShadowRaster | null {
  // `image` holds a decoded bitmap, which cannot be serialised — its `key`
  // carries the identity instead.
  const cacheKey = JSON.stringify([sil, spec], (k, v) => (k === 'image' ? undefined : v));
  if (shadowCache.has(cacheKey)) return shadowCache.get(cacheKey) || null;

  const result = buildShadowRaster(sil, spec);
  if (shadowCache.size >= SHADOW_CACHE_LIMIT) shadowCache.clear();
  shadowCache.set(cacheKey, result);
  return result;
}

function buildShadowRaster(sil: ShadowSilhouette, spec: ShadowSpec): ShadowRaster | null {
  try {
    // A scratch context is needed to measure glyphs before the real canvas can
    // be sized.
    const scratch = createCanvas(8, 8);
    const measureCtx = scratch ? scratch.getContext('2d') : null;

    const bounds = silhouetteBounds(sil, measureCtx);
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;

    // A canvas Gaussian has sigma = blur/2, so it is visually spent by ~1.5x
    // blur. 2x plus the offset plus a pixel of slack guarantees the raster's
    // own edge is fully transparent — that is what keeps a soft glow from
    // showing a rectangular boundary.
    const pad = Math.ceil(spec.blur * 2 + Math.max(Math.abs(spec.offsetX), Math.abs(spec.offsetY)) + 2);

    const boxX = bounds.x - pad;
    const boxY = bounds.y - pad;
    const boxW = bounds.width + pad * 2;
    const boxH = bounds.height + pad * 2;

    // Sharper shadows need more samples; big soft ones need fewer. A Gaussian
    // is low-frequency by nature, so dropping the sample rate on a large blur
    // costs nothing visible while keeping the embedded PNG small.
    let ratio = spec.blur <= 4 ? 4 : spec.blur <= 12 ? 3 : 2;
    while (ratio > 1 && boxW * ratio * boxH * ratio > SHADOW_PIXEL_BUDGET) ratio -= 1;

    const pxW = Math.max(1, Math.ceil(boxW * ratio));
    const pxH = Math.max(1, Math.ceil(boxH * ratio));
    if (pxW * pxH > MAX_SHADOW_PIXELS) return null;

    // ── Pass A: the silhouette, clipped, on its own canvas ────────────────
    const silCanvas = createCanvas(pxW, pxH);
    if (!silCanvas) return null;
    const silCtx = silCanvas.getContext('2d');
    if (!silCtx) return null;
    silCtx.scale(ratio, ratio);
    silCtx.translate(-boxX, -boxY);
    // The colour is irrelevant — this is erased in pass C, and whatever
    // fringe survives is covered by the real content — but it must be fully
    // opaque so the shadow reaches its intended strength.
    silCtx.fillStyle = '#000000';
    traceSilhouette(silCtx, sil);

    const canvas = createCanvas(pxW, pxH);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // ── Pass B: shadow it, unclipped ──────────────────────────────────────
    // Konva's own correction: canvas shadow attributes ignore the CTM, so the
    // blur and offsets are pre-multiplied by the sample rate by hand. Drawn
    // 1:1 at the identity transform, so the silhouette is never resampled.
    ctx.shadowColor = spec.color;
    ctx.shadowBlur = spec.blur * ratio;
    ctx.shadowOffsetX = spec.offsetX * ratio;
    ctx.shadowOffsetY = spec.offsetY * ratio;
    ctx.drawImage(silCanvas, 0, 0);

    // ── Pass C: erase the silhouette, keeping only its shadow ─────────────
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(silCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    return { dataUrl: canvas.toDataURL('image/png'), x: boxX, y: boxY, width: boxW, height: boxH };
  } catch (err) {
    console.warn('[VectorPDF] Shadow rasterization failed:', err);
    return null;
  }
}
