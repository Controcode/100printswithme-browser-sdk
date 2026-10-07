/**
 * SDK vector PDF renderer, ported from 100Prints/src/services/vectorPdfRenderer.ts.
 *
 * Vector PDF export engine using PDFKit.
 *
 * Produces PDFs where:
 * - Text is REAL PDF text (selectable, copyable, searchable)
 * - Shapes are native PDF drawing commands (infinite resolution)
 * - Gradients are native PDF gradients
 * - Images are embedded as high-quality raster data
 * - QR/Barcodes are rasterized and embedded
 * - SVG shapes, curved text, tables, and charts are drawn as PDF vectors
 *
 * The SDK keeps its own record and bulk workflows; this module only draws pages.
 */

// PDFKit's package ESM entry imports `fs` for built-in AFM fonts. In Vite/browser
// builds that module is externalized, so use the standalone browser bundle where
// the standard font metrics are already inlined.
// @ts-ignore - pdfkit does not publish declarations for the standalone bundle.
import PDFDocument from 'pdfkit/js/pdfkit.standalone.js';
// @ts-ignore - svg-to-pdfkit does not publish TypeScript declarations.
import SVGtoPDF from 'svg-to-pdfkit';
import Konva from 'konva';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { DocumentTemplate, Layer } from '../types';
import { evaluateSmartLogic, evaluateLayerOverrides } from '../render/logic-evaluator';
import { resolveContent } from '../render/variable-resolver';
import { fitBrowserTextSize, isDynamicTextLayer } from '../render/smart-text-sizing';
import { fetchFontBuffer, clearFontCache, type VectorFontManifestItem } from './vector-fonts';
import {
  ShadowSilhouette,
  clearShadowCache,
  getLayerShadow,
  konvaFontShorthand,
  loadShadowImage,
  renderShadowRaster,
} from './vector-shadow';

/**
 * CSS px → PDF points. Templates are authored on a 96-dpi design canvas while
 * PDF user space is 72 dpi.
 *
 * Every layer renderer in this file works in raw design px. Instead of
 * converting each coordinate (which is how text ended up ~25% too small
 * relative to its box), we size the page in points and apply this factor once
 * per page as a CTM scale. That also makes the physical page identical to the
 * flatten export, which builds its jsPDF page as `canvasW * 0.75` points.
 */
const PX_TO_PT = 0.75;

/** Page size, in points, for a template whose dimensions are in design px. */
function pdfPageSize(canvasW: number, canvasH: number): [number, number] {
  return [canvasW * PX_TO_PT, canvasH * PX_TO_PT];
}

const ZERO_MARGINS = { top: 0, bottom: 0, left: 0, right: 0 } as const;

const imageBufferCache = new Map<string, ArrayBuffer | string>();

type Rect = { x: number; y: number; width: number; height: number };

function normalizeFontFamily(fontFamily?: string | null): string {
  const firstFamily = (fontFamily || 'Inter')
    .split(',')[0]
    .trim()
    .replace(/^['"]|['"]$/g, '');
  return firstFamily || 'Inter';
}

/**
 * The three classes of face the PDF base-14 set can express. Everything that
 * falls back has to land in one of them.
 */
type Base14Class = 'sans' | 'serif' | 'mono';

/**
 * CSS font stacks that make a *browser canvas* resolve to the same shapes
 * PDFKit's base-14 faces draw, so a shadow traced on canvas lines up with the
 * glyphs in the PDF. The families listed are the metric-compatible ones each
 * platform actually ships (Arial for Helvetica, Liberation/Nimbus on Linux).
 */
const BASE14_SHADOW_STACK: Record<Base14Class, string> = {
  sans: 'Helvetica, Arial, "Liberation Sans", "Nimbus Sans", sans-serif',
  serif: '"Times New Roman", Times, "Liberation Serif", "Nimbus Roman", serif',
  mono: '"Courier New", Courier, "Liberation Mono", "Nimbus Mono PS", monospace',
};

/** The base-14 face names, by class and style. */
function base14FontName(cls: Base14Class, isBold: boolean, isItalic: boolean): string {
  if (cls === 'mono') {
    if (isBold && isItalic) return 'Courier-BoldOblique';
    if (isBold) return 'Courier-Bold';
    if (isItalic) return 'Courier-Oblique';
    return 'Courier';
  }
  if (cls === 'serif') {
    if (isBold && isItalic) return 'Times-BoldItalic';
    if (isBold) return 'Times-Bold';
    if (isItalic) return 'Times-Italic';
    return 'Times-Roman';
  }
  if (isBold && isItalic) return 'Helvetica-BoldOblique';
  if (isBold) return 'Helvetica-Bold';
  if (isItalic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

/**
 * The CSS generic keywords, mapped to the base-14 class the browser's own
 * default settings land on. `cursive` and `fantasy` have no base-14 analogue at
 * all; Chrome's defaults for them (a script face, Impact) are closer in feel to
 * a serif and a sans respectively.
 */
const GENERIC_FAMILY_CLASS: Record<string, Base14Class> = {
  'serif': 'serif',
  'sans-serif': 'sans',
  'monospace': 'mono',
  'cursive': 'serif',
  'fantasy': 'sans',
  'system-ui': 'sans',
  'ui-sans-serif': 'sans',
  'ui-serif': 'serif',
  'ui-monospace': 'mono',
  'ui-rounded': 'sans',
  'math': 'serif',
  'emoji': 'sans',
  'fangsong': 'serif',
};

/**
 * Concrete families that a desktop browser really does have AND that are
 * metric-compatible with a base-14 face, so naming one is an exact match
 * rather than a guess.
 */
const SYSTEM_FAMILY_CLASS: Record<string, Base14Class> = {
  'arial': 'sans', 'helvetica': 'sans', 'helvetica neue': 'sans',
  'liberation sans': 'sans', 'nimbus sans': 'sans', 'arimo': 'sans',
  'times': 'serif', 'times new roman': 'serif', 'times-roman': 'serif',
  'liberation serif': 'serif', 'nimbus roman': 'serif', 'tinos': 'serif',
  'courier': 'mono', 'courier new': 'mono',
  'liberation mono': 'mono', 'nimbus mono ps': 'mono', 'cousine': 'mono',
};

/**
 * The bundled families, by class. Reached only when a family index.css *does*
 * declare fails to embed (a network error, say) — the browser still has the
 * @font-face rule and renders the real font, so classifying by what that font
 * looks like is the closest we can get.
 */
const BUILTIN_FAMILY_CLASS: Record<string, Base14Class> = {
  'inter': 'sans', 'montserrat': 'sans', 'roboto': 'sans',
  'oswald': 'sans', 'bebas neue': 'sans',
  'playfair display': 'serif', 'merriweather': 'serif', 'colitez serif': 'serif',
  'jetbrains mono': 'mono',
  // Script faces: high-contrast and connected, so a serif is the nearest of
  // the three classes on offer.
  'dancing script': 'serif', 'great vibes': 'serif', 'embolism spark': 'serif',
};

/**
 * Chrome's default "standard font" — what an element gets when every family in
 * its list is unavailable and no generic keyword was named. On Windows and
 * macOS that is Times New Roman / Times, which is why an unresolvable family
 * renders as a serif in the editor and must render as one here too.
 */
const BROWSER_DEFAULT_CLASS: Base14Class = 'serif';

/** Splits a CSS font-family list into unquoted, trimmed family names. */
function splitFontStack(fontFamilyCss?: string | null): string[] {
  return (fontFamilyCss || '')
    .split(',')
    .map(part => part.trim().replace(/^['"]|['"]$/g, '').trim())
    .filter(Boolean);
}

/**
 * Picks the base-14 class for a font stack the way the browser picks a face:
 * walk the list in order, take the first entry that resolves to something, and
 * fall back to the default standard font if none does. Deliberately *not* a
 * name heuristic — an unavailable family called "Space Mono" gets Times in the
 * editor, not a monospace, and the editor is the reference.
 */
function classifyFontStack(fontFamilyCss?: string | null): { cls: Base14Class; matched: string | null } {
  for (const family of splitFontStack(fontFamilyCss)) {
    const key = family.toLowerCase();
    const cls = GENERIC_FAMILY_CLASS[key] || SYSTEM_FAMILY_CLASS[key] || BUILTIN_FAMILY_CLASS[key];
    if (cls) return { cls, matched: family };
  }
  return { cls: BROWSER_DEFAULT_CLASS, matched: null };
}

function normalizeFontWeight(fontWeight?: string | number | null): number {
  if (fontWeight === 'bold') return 700;
  if (fontWeight === 'normal') return 400;
  if (typeof fontWeight === 'number' && Number.isFinite(fontWeight)) return fontWeight;
  const parsed = Number(fontWeight);
  return Number.isFinite(parsed) ? parsed : 400;
}

/**
 * Chooses the base-14 face to stand in for a font that could not be embedded,
 * mirroring how the browser resolves the very same stack.
 *
 * The old version classified any unrecognised family as sans and returned
 * Helvetica. That is what made a template whose families are not installed
 * (e.g. "Outfit") come out in Helvetica while the editor showed Times — and,
 * worse, made the shadow silhouette (traced with the browser's Times) a ghost
 * of a completely different shape from the glyphs.
 *
 * Returns the PDFKit font name plus the CSS stack a canvas needs in order to
 * trace the *same* shapes, and never falls back silently.
 */
function fallbackPdfKitFont(
  fontFamilyCss: string,
  fontWeight?: string | number | null,
  fontStyle?: string | null,
): { name: string; shadowFontCss: string; cls: Base14Class; matched: string | null } {
  const weight = normalizeFontWeight(fontWeight);
  const { cls, matched } = classifyFontStack(fontFamilyCss);
  return {
    name: base14FontName(cls, weight >= 600, fontStyle === 'italic'),
    shadowFontCss: BASE14_SHADOW_STACK[cls],
    cls,
    matched,
  };
}

function getLayerBox(layer: Layer): Rect {
  return {
    x: layer.x || 0,
    y: layer.y || 0,
    width: layer.width || 100,
    height: layer.height || 100,
  };
}

function withLayerTransform(doc: PDFKit.PDFDocument, layer: Layer, box: Rect): void {
  const rotation = layer.rotation || 0;
  if (rotation !== 0) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    doc.translate(cx, cy);
    doc.rotate(rotation, { origin: [0, 0] });
    doc.translate(-cx, -cy);
  }
}

/**
 * The outline the editor casts a shadow from, for any box-shaped layer: its
 * content wrapper. A fully rounded non-square box is an ellipse in CSS.
 */
function boxSilhouette(
  layer: Layer,
  x: number,
  y: number,
  width: number,
  height: number,
): ShadowSilhouette {
  const br = layer.type === 'frame' ? 9999 : (layer.borderRadius || 0);
  if (br >= 9999) {
    return { kind: 'ellipse', cx: x + width / 2, cy: y + height / 2, rx: width / 2, ry: height / 2 };
  }
  return { kind: 'rect', x, y, width, height, radius: br };
}

/**
 * Places a layer's shadow as a tightly-cropped transparent PNG.
 *
 * Call this after the layer's transform is applied and before its own content,
 * so the halo ends up behind it. Deliberately swallows every error: a missing
 * shadow is a cosmetic loss, but an exception here would cost the whole layer.
 */
function drawLayerShadow(
  doc: PDFKit.PDFDocument,
  layer: Layer,
  silhouette: ShadowSilhouette,
  fallback?: ShadowSilhouette,
): void {
  try {
    const spec = getLayerShadow(layer);
    if (!spec) return;
    const raster = renderShadowRaster(silhouette, spec)
      || (fallback ? renderShadowRaster(fallback, spec) : null);
    if (!raster) return;
    // save/restore so nothing about the image call can leak into the fill
    // colour, line width or clip that the caller has already set up.
    doc.save();
    doc.image(raster.dataUrl, raster.x, raster.y, { width: raster.width, height: raster.height });
    doc.restore();
  } catch (err) {
    console.warn(`[VectorPDF] Shadow skipped for layer ${layer.id}:`, err);
  }
}

/**
 * Shadow for a layer whose artwork is a bitmap — SVG shapes, curved text,
 * tables, charts, QR codes, photos.
 *
 * The editor shadows these with a CSS `drop-shadow` filter, which follows the
 * element's real alpha channel, so a bounding box would put a soft rectangle
 * behind a transparent logo or an SVG flourish. Reading the alpha back gives
 * the true outline. The editor filters the whole content wrapper, including
 * its border, so the artwork and border must form one silhouette.
 */
async function drawImageLayerShadow(
  doc: PDFKit.PDFDocument,
  layer: Layer,
  src: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fit: 'stretch' | 'cover' = 'stretch',
): Promise<void> {
  try {
    if (!getLayerShadow(layer)) return;
    const outer = getLayerBox(layer);
    const radius = layer.type === 'frame' ? 9999 : (layer.borderRadius || 0);
    const borderWidth = layer.borderWidth || 0;
    const hasBorder = borderWidth > 0
      && ['image', 'background', 'frame', 'qr', 'barcode', 'verification_id', 'shape', 'text'].includes(layer.type);
    const clipsWrapper = ['image', 'background', 'frame', 'qr', 'barcode', 'verification_id', 'text', 'textsvg'].includes(layer.type);
    const clipsImage = ['image', 'background', 'frame', 'qr', 'barcode', 'verification_id'].includes(layer.type);
    const parts: ShadowSilhouette[] = [];
    const image = await loadShadowImage(src);
    if (image) {
      parts.push({
        kind: 'image', key: src, image, x, y, width, height, fit,
        clipRadius: clipsImage ? (radius >= 9999 ? 9999 : Math.max(0, radius - borderWidth)) : null,
      });
    }
    if (hasBorder) {
      parts.push({ kind: 'border', x: outer.x, y: outer.y, width: outer.width, height: outer.height, radius, borderWidth, color: layer.borderColor || '#000000' });
    }
    if (parts.length === 0) return;
    drawLayerShadow(doc, layer, {
      kind: 'group', parts,
      clip: clipsWrapper ? { ...outer, radius } : undefined,
    });
  } catch (err) {
    console.warn(`[VectorPDF] Image shadow skipped for layer ${layer.id}:`, err);
  }
}

function applyPdfFill(
  doc: PDFKit.PDFDocument,
  layer: Layer,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (!layer.fillType || layer.fillType === 'solid' || !layer.gradientColors) {
    return layer.color || '#000000';
  }

  const c1 = layer.color || '#000000';
  const c2 = layer.gradientColors?.[1] || '#ffffff';

  if (layer.fillType === 'linear') {
    const angleRad = ((layer.gradientAngle || 90) - 90) * (Math.PI / 180);
    const diagonal = Math.sqrt(width * width + height * height) / 2;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const grad = doc.linearGradient(
      cx - Math.cos(angleRad) * diagonal,
      cy - Math.sin(angleRad) * diagonal,
      cx + Math.cos(angleRad) * diagonal,
      cy + Math.sin(angleRad) * diagonal,
    );
    grad.stop(0, c1).stop(1, c2);
    return grad;
  }

  if (layer.fillType === 'radial') {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const r = Math.max(width, height) / 2;
    const grad = doc.radialGradient(cx, cy, 0, cx, cy, r);
    grad.stop(0, c1).stop(1, c2);
    return grad;
  }

  return layer.color || '#000000';
}

function drawLayerBorder(doc: PDFKit.PDFDocument, layer: Layer, x: number, y: number, width: number, height: number): void {
  const bw = layer.borderWidth || 0;
  if (bw <= 0) return;

  const borderColor = layer.borderColor || '#000000';
  // Arguments are the editor's outer CSS border-box. PDFKit centres strokes,
  // so inset the path by half the stroke to keep the outer bounds exact.
  const pathX = x + bw / 2;
  const pathY = y + bw / 2;
  const pathW = Math.max(1, width - bw);
  const pathH = Math.max(1, height - bw);
  const br = layer.type === 'frame' ? 9999 : Math.max(0, (layer.borderRadius || 0) - bw / 2);
  doc.lineWidth(bw).strokeColor(borderColor);
  if (br >= 9999) {
    doc.ellipse(pathX + pathW / 2, pathY + pathH / 2, pathW / 2, pathH / 2).stroke();
  } else if (br > 0) {
    doc.roundedRect(pathX, pathY, pathW, pathH, br).stroke();
  } else {
    doc.rect(pathX, pathY, pathW, pathH).stroke();
  }
}

function clipLayerBounds(doc: PDFKit.PDFDocument, layer: Layer, x: number, y: number, width: number, height: number): void {
  const br = layer.type === 'frame' ? 9999 : (layer.borderRadius || 0);
  if (br >= 9999) {
    doc.ellipse(x + width / 2, y + height / 2, width / 2, height / 2).clip();
  } else if (br > 0) {
    doc.roundedRect(x, y, width, height, br).clip();
  }
}

/**
 * Clips to a layer's box unconditionally — the `overflow: hidden` the editor
 * puts on the content wrapper of every type in its `needsClipping` list.
 *
 * Distinct from `clipLayerBounds`, which only clips when there is a corner
 * radius to enforce and is therefore a no-op for a plain rectangle.
 */
function clipToBox(
  doc: PDFKit.PDFDocument,
  x: number, y: number, width: number, height: number, radius: number,
): void {
  if (radius >= 9999) {
    doc.ellipse(x + width / 2, y + height / 2, width / 2, height / 2).clip();
  } else if (radius > 0) {
    doc.roundedRect(x, y, width, height, radius).clip();
  } else {
    doc.rect(x, y, width, height).clip();
  }
}

// ── Helper: fetch image as buffer for PDFKit embedding ──
async function fetchImageBuffer(src: string): Promise<ArrayBuffer | string | null> {
  if (!src) return null;

  // Data URLs (if not SVG) can be passed directly to PDFKit
  if (src.startsWith('data:') && !src.startsWith('data:image/svg')) return src;

  if (imageBufferCache.has(src)) {
    const cached = imageBufferCache.get(src)!;
    return typeof cached === 'string' ? cached : cached.slice(0);
  }

  try {
    const response = await fetch(src, { mode: 'cors' });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    imageBufferCache.set(src, buffer);
    return buffer.slice(0);
  } catch {
    return null;
  }
}

// ── Helper: Generate QR as data URL ──
async function generateQRDataUrl(text: string, fgColor: string, bgColor: string): Promise<string> {
  return QRCode.toDataURL(text, {
    color: { dark: fgColor, light: bgColor },
    margin: 1,
    width: 250,
  });
}

// ── Helper: Generate Barcode as data URL ──
function generateBarcodeDataUrl(text: string, fgColor: string, bgColor: string): string {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, text, {
    format: 'CODE128',
    lineColor: fgColor,
    background: bgColor === 'transparent' ? 'rgba(0,0,0,0)' : bgColor,
    displayValue: true,
    margin: 10,
    width: 3,
    height: 100,
  });
  return canvas.toDataURL('image/png');
}

// ── Helper: Rasterize SVG string to PNG data URL via Canvg ──
async function rasterizeSvgToDataUrl(
  svgString: string,
  width: number,
  height: number,
  scale: number = 4,
): Promise<string | null> {
  try {
    const { Canvg } = await import('canvg');
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.scale(scale, scale);
    const v = await Canvg.fromString(ctx, svgString, {
      ignoreMouse: true,
      ignoreAnimation: true,
      ignoreDimensions: true,
    });
    await v.render();
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('[VectorPDF] SVG rasterization failed:', err);
    return null;
  }
}

/** Draw editor SVG markup into the current PDF page without flattening it. */
async function drawSvgVector(
  doc: PDFKit.PDFDocument,
  svg: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontManager: FontManager,
  layer: Layer,
  preserveAspectRatio?: string,
): Promise<void> {
  // The converter cannot represent these features. Failing the export is safer
  // than silently producing a PDF with missing artwork.
  if (/<(?:foreignObject|filter)\b|\bfilter\s*[:=]/i.test(svg)) {
    throw new Error(`SVG layer ${layer.id} uses a filter or foreignObject, which vector PDF cannot draw.`);
  }

  const fontNames = new Map<string, string>();
  const fontTags = svg.match(/<text\b[^>]*>/gi) || [];
  for (const tag of fontTags) {
    const family = /font-family\s*[:=]\s*["']?([^;"'>]+)/i.exec(tag)?.[1]?.trim()
      || layer.fontFamily || 'Inter';
    const weight = /font-weight\s*[:=]\s*["']?([^;"'>]+)/i.exec(tag)?.[1]?.trim()
      || layer.fontWeight || 400;
    const style = /font-style\s*[:=]\s*["']?([^;"'>]+)/i.exec(tag)?.[1]?.trim()
      || layer.fontStyle || 'normal';
    const key = `${normalizeFontFamily(family).toLowerCase()}|${normalizeFontWeight(weight) >= 600}|${style === 'italic'}`;
    if (!fontNames.has(key)) {
      const font = await fontManager.ensureFont(family, weight, style, layer.fontUrl);
      fontNames.set(key, font.name);
    }
  }

  const warnings: string[] = [];
  doc.save();
  try {
    SVGtoPDF(doc, svg, x, y, {
      width,
      height,
      assumePt: true, // The page already has the design-px-to-PDF-pt transform.
      preserveAspectRatio,
      fontCallback: (family: string, bold: boolean, italic: boolean) => {
        const key = `${normalizeFontFamily(family).toLowerCase()}|${bold}|${italic}`;
        const registered = fontNames.get(key);
        if (registered) return registered;
        warnings.push(`Font ${family} was not prepared; using a PDF fallback.`);
        return base14FontName('sans', bold, italic);
      },
      warningCallback: (message: string) => warnings.push(message),
    });
  } finally {
    doc.restore();
  }
  if (warnings.some(message => /parseXml: parsing error|does not look like a valid SVG|failed to open (?:image|font)/i.test(message))) {
    throw new Error(`SVG layer ${layer.id} could not be drawn completely: ${[...new Set(warnings)].join(' | ')}`);
  }
  if (warnings.length) console.warn(`[VectorPDF] SVG layer ${layer.id}: ${[...new Set(warnings)].join(' | ')}`);
}

// ── Font Registration Manager ──
// Tracks which fonts have been registered with the current PDFKit doc.

/** What `FontManager.ensureFont` hands back to the text renderers. */
interface ResolvedPdfFont {
  /** Name to pass to `doc.font()`. */
  name: string;
  /**
   * The family has no italic file, so we have to slant it ourselves — the
   * browser does the same thing on canvas, and PDFKit does not synthesise.
   */
  syntheticOblique: boolean;
  /** Only a regular-weight static face exists, so emulate bold by stroking. */
  syntheticBold: boolean;
  /**
   * The CSS font-family stack to trace this layer's shadow with.
   *
   * It has to name the face that will actually be *drawn*, not the one the
   * layer asked for. When a font embeds successfully the two are the same, so
   * this is just the layer's own stack. When it falls back to a base-14 face,
   * tracing the layer's stack would blur the browser's idea of the font while
   * PDFKit draws something else — the halo and the glyphs would be different
   * shapes, which reads as a ghost behind the text.
   */
  shadowFontCss: string;
}

class FontManager {
  private registeredFonts = new Map<string, ResolvedPdfFont>();
  /** fontMap `embedKey` → the PDFKit font name those bytes were registered under. */
  private embeddedFonts = new Map<string, string>();
  /** Keeps a substitution warning to one line per family, not one per record. */
  private warnedFallbacks = new Set<string>();
  private doc: PDFKit.PDFDocument;
  private manifest: VectorFontManifestItem[];

  constructor(doc: PDFKit.PDFDocument, manifest: VectorFontManifestItem[] = []) {
    this.doc = doc;
    this.manifest = manifest;
  }

  /**
   * Ensures a font is registered with the PDFKit document.
   * Returns the font name to use with doc.font() plus any synthetic styling
   * the caller must apply to match how the browser renders the same layer.
   * Falls back to a PDFKit built-in if the font can't be loaded.
   */
  async ensureFont(fontFamily: string, fontWeight: string | number, fontStyle: string, fontUrl?: string | null): Promise<ResolvedPdfFont> {
    const normalizedFamily = normalizeFontFamily(fontFamily);
    const normalizedWeight = normalizeFontWeight(fontWeight);

    // PDFKit built-in fonts already come in styled variants.
    const builtins = [
      'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique',
      'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
      'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
      'Symbol', 'ZapfDingbats',
    ];
    if (builtins.includes(normalizedFamily)) {
      return {
        name: normalizedFamily,
        syntheticOblique: false,
        syntheticBold: false,
        shadowFontCss: BASE14_SHADOW_STACK[
          /^Courier/.test(normalizedFamily) ? 'mono' : /^Times/.test(normalizedFamily) ? 'serif' : 'sans'
        ],
      };
    }

    // Already registered on this document
    const registrationKey = `${normalizedFamily}::${normalizedWeight}::${fontStyle}::${fontUrl || 'default'}`;
    const cached = this.registeredFonts.get(registrationKey);
    if (cached) return cached;

    // Fetch and register.
    //
    // `instanceVariableFonts` is what keeps weights honest: nearly every
    // bundled family is a single variable .ttf, and a PDF always renders such a
    // file at its *default* instance (Montserrat = Thin, Merriweather = Light).
    // fontMap pins the axis to the requested weight before we embed it.
    try {
      const normalizedStyle = fontStyle === 'italic' ? 'italic' : 'normal';
      const familyFonts = this.manifest.filter(item => item.family.toLowerCase() === normalizedFamily.toLowerCase());
      const manifestFont = familyFonts.find(item =>
        item.weight === normalizedWeight && (item.style || 'normal') === normalizedStyle
      ) || familyFonts.find(item => item.style === normalizedStyle)
        || familyFonts.find(item => item.url);
      const result = await fetchFontBuffer(normalizedFamily, normalizedWeight, fontStyle, fontUrl || manifestFont?.url, {
        instanceVariableFonts: true,
      });
      if (result && result.buffer) {
        const fontData = result.buffer instanceof ArrayBuffer ? new Uint8Array(result.buffer.slice(0)) : result.buffer;
        // Several requests can resolve to identical bytes (Playfair Display 700
        // and 900 share PlayfairDisplay-Bold.ttf). Embed them once per document.
        let embedName = this.embeddedFonts.get(result.embedKey);
        if (!embedName) {
          embedName = registrationKey;
          this.doc.registerFont(embedName, fontData as any);
          this.embeddedFonts.set(result.embedKey, embedName);
        }
        const resolved: ResolvedPdfFont = {
          name: embedName,
          syntheticOblique: result.syntheticOblique,
          syntheticBold: result.syntheticBold,
          // The real font went in, so the browser and PDFKit agree and the
          // layer's own stack traces the right shapes.
          shadowFontCss: fontFamily || normalizedFamily,
        };
        this.registeredFonts.set(registrationKey, resolved);
        return resolved;
      }
    } catch (err) {
      console.warn(`[VectorPDF] Font registration failed for "${normalizedFamily}":`, err);
    }

    // ── Fallback ──────────────────────────────────────────────────────────
    // Never silent: say which family could not be embedded, and which face is
    // standing in for it, because a substituted face changes both the metrics
    // and the shadow.
    const fallback = fallbackPdfKitFont(fontFamily, normalizedWeight, fontStyle);
    if (!this.warnedFallbacks.has(registrationKey)) {
      this.warnedFallbacks.add(registrationKey);
      const because = fallback.matched
        ? `nearest available match is "${fallback.matched}"`
        : 'no family in the stack is available, so the browser uses its default standard font';
      console.warn(
        `[VectorPDF] "${normalizedFamily}" ${normalizedWeight}${fontStyle === 'italic' ? ' italic' : ''} `
        + `could not be embedded — substituting the built-in ${fallback.name} (${because}). `
        + `Set the layer's fontUrl or include a URL in the SDK font manifest to embed it properly.`,
      );
    }

    // The built-in already encodes bold/italic, so no synthesis is needed.
    const resolved: ResolvedPdfFont = {
      name: fallback.name,
      syntheticOblique: false,
      syntheticBold: false,
      shadowFontCss: fallback.shadowFontCss,
    };
    this.registeredFonts.set(registrationKey, resolved);
    return resolved;
  }

  reset(): void {
    this.registeredFonts.clear();
    this.embeddedFonts.clear();
    this.warnedFallbacks.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TEXT LAYOUT
//
// The canvas/flatten export lays text out with Konva. To guarantee the vector
// PDF breaks lines in exactly the same places, we ask Konva itself — a throw-
// away `Konva.Text` node measures the string with the same CSS font the editor
// uses — and then place each resulting line individually with PDFKit. That
// sidesteps PDFKit's own line wrapper (which measures with the font's advance
// widths and would drift from the canvas) entirely.
// ═══════════════════════════════════════════════════════════════════════

interface MeasuredLine {
  text: string;
  /** Width in design px as Konva measured it (includes letterSpacing). */
  width: number;
  lastInParagraph: boolean;
}

interface TextStyle {
  text: string;
  fontSize: number;
  /** The full CSS family list, exactly as the Konva node receives it. */
  fontFamilyCss: string;
  /** Konva's combined style string, e.g. "italic 700". */
  konvaFontStyle: string;
  align: 'left' | 'center' | 'right' | 'justify';
  lineHeight: number;
  letterSpacing: number;
  innerW: number;
  innerH: number;
  noWrap?: boolean;
}

interface TextLayout {
  lines: MeasuredLine[];
  /** Font bounding box ascent at this size (px, positive above baseline). */
  ascent: number;
  /** Font bounding box descent at this size (px, positive below baseline). */
  descent: number;
}

/** Faces already handed to the browser's font loader, keyed by CSS shorthand. */
const cssFontLoads = new Map<string, Promise<void>>();

/**
 * Waits for the webfont to be usable by the measuring canvas.
 *
 * Without this, `measureText` silently falls back to a system face and the
 * wrap points (and therefore the whole layout) diverge from the editor.
 */
async function ensureCssFontLoaded(
  fontFamilyCss: string,
  fontWeight: string | number | null | undefined,
  fontStyle: string | null | undefined,
  sample: string,
): Promise<void> {
  const fonts: any = typeof document !== 'undefined' ? (document as any).fonts : null;
  if (!fonts || typeof fonts.load !== 'function') return;

  const family = normalizeFontFamily(fontFamilyCss);
  const weight = normalizeFontWeight(fontWeight);
  const italic = fontStyle === 'italic' ? 'italic ' : '';
  const spec = `${italic}${weight} 16px "${family}"`;

  let pending = cssFontLoads.get(spec);
  if (!pending) {
    pending = Promise.resolve(fonts.load(spec, sample || 'Ag'))
      .then(() => undefined)
      .catch(() => undefined);
    cssFontLoads.set(spec, pending);
  }
  await pending;
}

/**
 * Lays text out with Konva. Returns null if Konva can't measure (e.g. no DOM).
 *
 * `height` is deliberately NOT passed. Konva's `_setTextData` breaks out of its
 * wrapping loop as soon as the next line would exceed a fixed height, silently
 * dropping the rest of the string — so a two-line headline in a box sized for
 * one came out of the PDF as "ADVANCED AI" while the editor showed all of
 * "ADVANCED AI ARCHITECTURE". The DOM never truncates: `justifyContent: center`
 * lets the block overflow symmetrically and `overflow: hidden` on the wrapper
 * trims whatever sticks out. The caller reproduces that by clipping instead.
 */
function measureTextLayout(style: TextStyle): TextLayout | null {
  try {
    const node = new Konva.Text({
      width: style.innerW,
      text: style.text,
      fontSize: style.fontSize,
      fontFamily: style.fontFamilyCss,
      fontStyle: style.konvaFontStyle,
      align: style.align,
      verticalAlign: 'middle',
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      wrap: style.noWrap ? 'none' : 'word',
      listening: false,
    });
    const rawLines = (node as any).textArr as MeasuredLine[] | undefined;
    const metrics = node.measureSize('M');
    if (style.noWrap) {
      const lines = style.text.split('\n').map(text => ({
        text,
        width: node.measureSize(text).width + style.letterSpacing * Math.max(0, Array.from(text).length - 1),
        lastInParagraph: true,
      }));
      node.destroy();
      return { lines, ascent: metrics.fontBoundingBoxAscent, descent: metrics.fontBoundingBoxDescent };
    }
    const lines = (rawLines || []).map(line => ({
      text: line.text,
      width: line.width,
      lastInParagraph: !!line.lastInParagraph,
    }));
    node.destroy();

    if (!lines.length) return null;
    return {
      lines,
      ascent: metrics.fontBoundingBoxAscent,
      descent: metrics.fontBoundingBoxDescent,
    };
  } catch (err) {
    console.warn('[VectorPDF] Konva text measurement unavailable, using PDFKit metrics:', err);
    return null;
  }
}

/** Greedy word wrap using PDFKit's own metrics — only used if Konva failed. */
function fallbackTextLayout(doc: PDFKit.PDFDocument, style: TextStyle): TextLayout {
  const measure = (s: string): number =>
    s ? doc.widthOfString(s, { characterSpacing: style.letterSpacing }) + style.letterSpacing : 0;

  const collected: MeasuredLine[] = [];
  if (style.noWrap) {
    for (const text of style.text.split('\n')) collected.push({ text, width: measure(text), lastInParagraph: true });
  } else {
    for (const paragraph of style.text.split('\n')) {
    const words = paragraph.split(' ');
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && measure(candidate) > style.innerW) {
        collected.push({ text: current, width: measure(current), lastInParagraph: false });
        current = word;
      } else {
        current = candidate;
      }
    }
      collected.push({ text: current, width: measure(current), lastInParagraph: true });
    }
  }

  // No line limit, for the same reason `measureTextLayout` passes no height:
  // the DOM overflows and clips rather than dropping lines.
  return {
    lines: collected,
    // Konva's own fallbacks when the browser reports no font bounding box.
    ascent: style.fontSize * 0.91,
    descent: style.fontSize * 0.21,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// LAYER RENDERERS — Each function draws a single layer type into the PDF
// ═══════════════════════════════════════════════════════════════════════

/**
 * Renders a text layer as REAL PDF text (selectable/copyable).
 *
 * Mirrors Konva's <Text> geometry, in design px (the page carries the px→pt
 * scale, see PX_TO_PT):
 * - the node's top-left is `x + w/2 - innerW/2`, `y + h/2 - innerH/2`
 * - verticalAlign="middle" → `alignY = (innerH - lineCount * lineHeightPx) / 2`
 * - each line's anchor sits at `alignY + lineHeightPx / 2 + n * lineHeightPx`
 *   with canvas `textBaseline: 'middle'`, which is `(ascent - descent) / 2`
 *   above the alphabetic baseline PDFKit wants
 * - rotation is about the centre of the *outer* box
 */
async function renderTextToPdf(
  doc: PDFKit.PDFDocument,
  layer: Layer,
  fontManager: FontManager,
): Promise<void> {
  const box = getLayerBox(layer);
  const w = box.width || 200;
  const h = box.height || 40;
  const bw = layer.borderWidth || 0;
  // The editor's text has a border-box border plus 4px padding on every side.
  const innerW = Math.max(1, w - bw * 2 - (bw ? 8 : 0));
  const innerH = Math.max(1, h - bw * 2 - (bw ? 8 : 0));
  const innerX = box.x + bw + (bw ? 4 : 0);
  const innerY = box.y + bw + (bw ? 4 : 0);

  const text = layer.content || '';
  if (!text.trim()) return;

  const fontFamilyCss = layer.fontFamily || 'Inter, Arial, sans-serif';
  const rawWeight = layer.fontWeight ?? 'normal';
  const isItalic = layer.fontStyle === 'italic';

  // Measure with the real webfont, not a system fallback.
  await ensureCssFontLoaded(fontFamilyCss, rawWeight, layer.fontStyle, text);
  const fittedSize = fitBrowserTextSize(layer, text, w, h);

  // PDFKit cannot embed the browser's color emoji fallback. Keep the complete
  // editor text by rasterizing only layers containing pictographs. Ordinary
  // text below remains selectable PDF text.
  if (/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(text)) {
    const node = new Konva.Text({
      width: innerW,
      text,
      fontSize: Math.max(1, fittedSize),
      fontFamily: fontFamilyCss,
      fontStyle: `${layer.fontStyle === 'italic' ? 'italic ' : ''}${rawWeight}`.trim(),
      align: (layer.textAlign || 'center') as any,
      lineHeight: layer.lineHeight || 1.2,
      letterSpacing: layer.letterSpacing || 0,
      textDecoration: layer.textDecoration || 'none',
      fill: layer.color || '#000000',
      wrap: layer.smartSizing ? 'none' : 'word',
      listening: false,
    });
    try {
      const raster = node.toDataURL({ pixelRatio: 4 });
      const textY = innerY + (innerH - node.height()) / 2;
      doc.save();
      try {
        doc.opacity(layer.opacity ?? 1);
        withLayerTransform(doc, layer, box);
        await drawImageLayerShadow(doc, layer, raster, innerX, textY, innerW, node.height());
        doc.save();
        try {
          clipToBox(doc, box.x, box.y, w, h, layer.borderRadius || 0);
          doc.image(raster, innerX, textY, { width: innerW, height: node.height() });
        } finally {
          doc.restore();
        }
        drawLayerBorder(doc, layer, box.x, box.y, w, h);
      } finally {
        doc.restore();
      }
      return;
    } finally {
      node.destroy();
    }
  }

  const font = await fontManager.ensureFont(
    fontFamilyCss,
    rawWeight,
    layer.fontStyle || 'normal',
    layer.fontUrl,
  );

  const fontSize = Math.max(1, fittedSize);
  const opacity = layer.opacity ?? 1;
  const rotation = layer.rotation || 0;
  const align = (layer.textAlign || 'center') as TextStyle['align'];
  const lineHeight = layer.lineHeight || 1.2;
  const letterSpacing = layer.letterSpacing || 0;

  doc.save();
  doc.opacity(opacity);

  // Rotation around the center of the full bounding box (matches Konva)
  if (rotation !== 0) {
    const cx = box.x + w / 2;
    const cy = box.y + h / 2;
    doc.translate(cx, cy);
    doc.rotate(rotation, { origin: [0, 0] });
    doc.translate(-cx, -cy);
  }

  // ── Shadow geometry, gathered now and drawn once after layout ───────────
  // The editor hangs a single `filter: drop-shadow()` on the content wrapper
  // (EditableLayer, "Content wrapper"), so the border ring, the glyphs and the
  // underline rule composite together and are blurred ONCE. Rendering them as
  // separate halos double-darkens every overlap, which reads as a dirty seam
  // around bordered text.
  //
  // Note what is deliberately absent: a box. The DOM text div sets `border`,
  // `borderRadius`, `padding` and `color` — and no `backgroundColor` at all —
  // so a text layer never casts a rectangular halo, however its
  // `backgroundColor` field happens to be set. The old code read that field and
  // invented a soft rectangle the editor never shows, then suppressed the glyph
  // halo to compensate.
  //
  // `overflow: hidden` sits on the very same wrapper as the filter, and CSS
  // clips the element's content before the filter runs, so anything outside the
  // box casts no shadow either.
  const shadowClip = {
    x: box.x,
    y: box.y,
    width: w,
    height: h,
    radius: layer.borderRadius || 0,
  };

  // The CSS border contributes its own alpha to the wrapper's shadow.
  const shadowParts: ShadowSilhouette[] = [];
  if (bw > 0) {
    shadowParts.push({
      kind: 'border', x: box.x, y: box.y, width: w, height: h,
      radius: layer.borderRadius || 0, borderWidth: bw, color: layer.borderColor || '#000000',
    });
  }

  // Font size is in design px — the page-level scale converts it to points.
  doc.font(font.name);
  doc.fontSize(fontSize);

  const fillColor = applyPdfFill(doc, layer, innerX, innerY, innerW, innerH);
  doc.fillColor(fillColor as any);

  const style: TextStyle = {
    text,
    fontSize,
    fontFamilyCss,
    konvaFontStyle: `${isItalic ? 'italic ' : ''}${rawWeight}`.trim(),
    align,
    lineHeight,
    letterSpacing,
    innerW,
    innerH,
    noWrap: !!layer.smartSizing,
  };

  try {
    const layout = measureTextLayout(style) || fallbackTextLayout(doc, style);
    const lineHeightPx = fontSize * lineHeight;
    // Konva's verticalAlign: 'middle'. Deliberately not clamped to 0 — when the
    // text is taller than its box Konva lets it overflow symmetrically.
    const alignY = (innerH - layout.lines.length * lineHeightPx) / 2;
    // canvas textBaseline 'middle' → alphabetic baseline
    const baselineShift = (layout.ascent - layout.descent) / 2;

    // Resolve every line's position up front. The glow and the glyphs have to
    // be placed from the same numbers or the halo sits visibly off-centre.
    const placed: Array<{
      text: string;
      width: number;
      x: number;
      anchorY: number;
      baselineY: number;
      wordSpacing: number;
    }> = [];

    for (let n = 0; n < layout.lines.length; n++) {
      const line = layout.lines[n];
      if (!line.text) continue;

      const anchorY = alignY + lineHeightPx / 2 + n * lineHeightPx;
      const baselineY = innerY + anchorY + baselineShift;

      let x = innerX;
      let wordSpacing = 0;
      if (align === 'right') {
        x += innerW - line.width;
      } else if (align === 'center') {
        x += (innerW - line.width) / 2;
      } else if (align === 'justify' && !line.lastInParagraph) {
        const gaps = line.text.split(' ').length - 1;
        if (gaps > 0) wordSpacing = Math.max(0, (innerW - line.width) / gaps);
      }

      placed.push({ text: line.text, width: line.width, x, anchorY, baselineY, wordSpacing });
    }

    // ── Shadow: one raster for the whole wrapper ────────────────────────
    // `font.shadowFontCss` names the face PDFKit is about to draw, not the one
    // the layer asked for. Those differ whenever a family could not be
    // embedded, and tracing the wrong one puts a halo of one alphabet behind
    // the letters of another — a ghost, offset and mis-shaped, which is the
    // artifact this replaces. The weight still goes through the CSS shorthand,
    // so the browser applies the same synthetic bold it does on the editor
    // canvas.
    const glyphSilhouette: ShadowSilhouette = {
      kind: 'text',
      font: konvaFontShorthand(style.konvaFontStyle, fontSize, font.shadowFontCss),
      fontSize,
      letterSpacing,
      lines: placed.map(p => ({ text: p.text, x: p.x, baselineY: p.baselineY })),
    };
    shadowParts.push(glyphSilhouette);

    if (layer.textDecoration === 'underline') {
      // The rule is part of the element, so it is part of the same blur.
      const ruleH = fontSize / 15;
      for (const p of placed) {
        shadowParts.push({
          kind: 'rect',
          x: p.x,
          y: innerY + p.anchorY + Math.round(fontSize / 2) - ruleH / 2,
          width: Math.round(p.width),
          height: ruleH,
          radius: 0,
        });
      }
    }

    drawLayerShadow(doc, layer, { kind: 'group', parts: shadowParts, clip: shadowClip });

    if (font.syntheticBold) {
      // No bold face exists for this family, so emulate the browser's fake
      // bold by outlining the glyphs (Skia uses roughly size/28).
      doc.strokeColor(fillColor as any);
      doc.lineWidth(fontSize / 28);
    }

    // `overflow: hidden` on the wrapper, for the content this time. Text that
    // does not fit is cut off at the box edge — the editor neither shrinks it
    // nor drops a line, it just clips.
    doc.save();
    clipToBox(doc, box.x, box.y, w, h, layer.borderRadius || 0);

    for (const line of placed) {
      doc.text(line.text, line.x, line.baselineY, {
        // `lineBreak: false` keeps PDFKit from inventing a width and routing
        // this through its own wrapper — we place every line ourselves.
        lineBreak: false,
        baseline: 'alphabetic',
        characterSpacing: letterSpacing,
        ...(line.wordSpacing > 0 ? { wordSpacing: line.wordSpacing } : {}),
        ...(font.syntheticOblique ? { oblique: true } : {}),
        fill: true,
        stroke: font.syntheticBold,
      } as PDFKit.Mixins.TextOptions);

      if (layer.textDecoration === 'underline') {
        // Konva draws the rule at `anchor + round(fontSize / 2)`, size/15 thick.
        const underlineY = innerY + line.anchorY + Math.round(fontSize / 2);
        doc.save();
        doc.lineWidth(fontSize / 15);
        doc.strokeColor(fillColor as any);
        doc.moveTo(line.x, underlineY).lineTo(line.x + Math.round(line.width), underlineY).stroke();
        doc.restore();
      }
    }

    doc.restore();
  } catch (err) {
    console.warn(`[VectorPDF] Text render failed for layer ${layer.id}:`, (err as Error).message);
    // Last-resort fallback: render without any options
    try {
      doc.text(text, innerX, innerY, { lineBreak: false } as PDFKit.Mixins.TextOptions);
    } catch {
      // Silently skip — font is likely incompatible
    }
  }

  // Draw border if needed
  drawLayerBorder(doc, layer, box.x, box.y, w, h);

  doc.restore();
}

/**
 * Renders a shape layer as a native PDF vector.
 * Handles both SVG shapes and simple rectangles.
 */
async function renderShapeToPdf(
  doc: PDFKit.PDFDocument,
  layer: Layer,
  exportScale: number,
  fontManager: FontManager,
): Promise<void> {
  const box = getLayerBox(layer);
  const w = box.width;
  const h = box.height;
  const bw = layer.borderWidth || 0;
  const innerW = Math.max(1, w - bw);
  const innerH = Math.max(1, h - bw);
  const opacity = layer.opacity ?? 1;

  const isSvg = layer.content?.trim().startsWith('<svg');

  doc.save();
  doc.opacity(opacity);

  // Apply rotation
  withLayerTransform(doc, layer, box);

  if (isSvg && layer.content) {
    // SVG shape: rasterize and embed as image (SVG path parsing is complex)
    let processedSvg = layer.content.trim();

    // Apply color replacement
    if (layer.fillType === 'linear' || layer.fillType === 'radial') {
      const c1 = layer.color || '#000000';
      const c2 = layer.gradientColors?.[1] || '#ffffff';
      const gradId = `grad-vec-${layer.id.replace(/[^a-zA-Z0-9]/g, '')}`;

      let defs = '';
      if (layer.fillType === 'linear') {
        const r = ((layer.gradientAngle || 90) * Math.PI) / 180;
        const x1 = `${Math.round(50 - Math.sin(r) * 50)}%`;
        const y1 = `${Math.round(50 + Math.cos(r) * 50)}%`;
        const x2 = `${Math.round(50 + Math.sin(r) * 50)}%`;
        const y2 = `${Math.round(50 - Math.cos(r) * 50)}%`;
        defs = `<defs><linearGradient id="${gradId}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0%" stop-color="${c1}" /><stop offset="100%" stop-color="${c2}" /></linearGradient></defs>`;
      } else {
        defs = `<defs><radialGradient id="${gradId}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${c1}" /><stop offset="100%" stop-color="${c2}" /></radialGradient></defs>`;
      }

      if (!processedSvg.includes('<defs>')) {
        processedSvg = processedSvg.replace(/<svg[^>]*>/, `$&${defs}`);
      } else {
        processedSvg = processedSvg.replace('<defs>', `<defs>${defs}`);
      }
      processedSvg = processedSvg.replace(/currentColor/g, `url(#${gradId})`);
    } else {
      processedSvg = processedSvg.replace(/currentColor/g, layer.color || '#000000');
    }

    if (!processedSvg.includes('xmlns=')) {
      processedSvg = processedSvg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    processedSvg = processedSvg.replace(/<svg([^>]*)>/i, (_match, attrs) => {
      const hasViewBox = /viewBox/i.test(attrs);
      let newAttrs = attrs
        .replace(/\bwidth=["'][^"']*["']/gi, '')
        .replace(/\bheight=["'][^"']*["']/gi, '')
        .replace(/\bpreserveAspectRatio=["'][^"']*["']/gi, '');
      if (!hasViewBox) newAttrs += ` viewBox="0 0 ${w} ${h}"`;
      return `<svg${newAttrs} width="${w}" height="${h}" preserveAspectRatio="none">`;
    });

    // Konva center-based positioning. Only the optional blurred shadow needs
    // pixels; the visible SVG artwork remains native PDF paths.
    const imgX = box.x + w / 2 - innerW / 2;
    const imgY = box.y + h / 2 - innerH / 2;
    if (getLayerShadow(layer)) {
      const shadowSource = await rasterizeSvgToDataUrl(processedSvg, w, h, exportScale);
      if (shadowSource) await drawImageLayerShadow(doc, layer, shadowSource, imgX, imgY, innerW, innerH);
    }
    await drawSvgVector(doc, processedSvg, imgX, imgY, innerW, innerH, fontManager, layer, 'none');
  } else {
    // Konva center-based positioning
    const x = box.x + w / 2 - innerW / 2;
    const y = box.y + h / 2 - innerH / 2;
    const br = layer.type === 'frame' ? 9999 : Math.max(0, (layer.borderRadius || 0) - bw / 2);

    const hasVisibleFill = layer.color !== 'transparent' || layer.fillType === 'linear' || layer.fillType === 'radial';
    const shapeParts: ShadowSilhouette[] = [];
    if (hasVisibleFill) shapeParts.push(boxSilhouette(layer, x, y, innerW, innerH));
    if (bw > 0) {
      shapeParts.push({
        kind: 'border', x: box.x, y: box.y, width: w, height: h,
        radius: layer.borderRadius || 0, borderWidth: bw, color: layer.borderColor || '#000000',
      });
    }
    if (shapeParts.length > 0) {
      drawLayerShadow(doc, layer, { kind: 'group', parts: shapeParts });
    }

    const fill = applyPdfFill(doc, layer, x, y, innerW, innerH);
    if (br > 0) {
      doc.roundedRect(x, y, innerW, innerH, br).fill(fill as any);
    } else {
      doc.rect(x, y, innerW, innerH).fill(fill as any);
    }

  }

  // SVG and native shapes share the editor's same CSS border-box border.
  drawLayerBorder(doc, layer, box.x, box.y, w, h);

  doc.restore();
}

/**
 * Renders a line layer as a native PDF line.
 */
function renderLineToPdf(doc: PDFKit.PDFDocument, layer: Layer): void {
  const w = layer.width || 200;
  const h = layer.borderWidth || 2;
  const color = layer.color || '#000000';
  const opacity = layer.opacity ?? 1;
  const rotation = layer.rotation || 0;

  doc.save();
  doc.opacity(opacity);

  if (rotation !== 0) {
    const cx = layer.x + w / 2;
    const cy = layer.y + h / 2;
    doc.translate(cx, cy);
    doc.rotate(rotation, { origin: [0, 0] });
    doc.translate(-cx, -cy);
  }

  doc.lineWidth(h);
  doc.strokeColor(color);

  const isDashed = layer.textDecoration === 'dashed';
  const isDotted = layer.textDecoration === 'dotted';

  // Konva shadows the dashes themselves, not the full run, so mirror the dash
  // pattern here rather than glowing a solid bar behind a dotted rule.
  if (isDashed || isDotted) {
    const seg = isDotted ? h : h * 3;
    const parts: ShadowSilhouette[] = [];
    for (let dx = 0; dx < w && parts.length < 400; dx += seg * 2) {
      parts.push({
        kind: 'rect',
        x: layer.x + dx,
        y: layer.y,
        width: Math.min(seg, w - dx),
        height: h,
        radius: 0,
      });
    }
    if (parts.length) drawLayerShadow(doc, layer, { kind: 'group', parts });
  } else {
    // The DOM draws a solid line as a `borderRadius: 999` pill at the TOP of
    // the layer box (height = thickness), which is where a stroke of width `h`
    // centred on `y + h/2` lands too. The rounded ends only pull the corners
    // inward, so the pill's extent is the rect's — hence a rounded rect here
    // and butt caps on the stroke, not round ones, which would overhang.
    drawLayerShadow(doc, layer, { kind: 'rect', x: layer.x, y: layer.y, width: w, height: h, radius: h / 2 });
  }

  if (isDashed) {
    doc.dash(h * 3, { space: h * 3 });
  } else if (isDotted) {
    doc.dash(h, { space: h });
  }

  doc.moveTo(layer.x, layer.y + h / 2)
     .lineTo(layer.x + w, layer.y + h / 2)
     .stroke();

  if (isDashed || isDotted) {
    doc.undash();
  }

  doc.restore();
}

/**
 * Renders an image layer by fetching and embedding the image data.
 */
async function renderImageToPdf(
  doc: PDFKit.PDFDocument,
  layer: Layer,
  assetMap: Record<string, any>,
  fontManager: FontManager,
): Promise<void> {
  const box = getLayerBox(layer);
  const w = box.width;
  const h = box.height;
  const bw = layer.borderWidth || 0;
  // CSS object-fit works inside the full border inset, not on the border's
  // centreline. This mirrors CanvasRenderer and the editor's <img> box.
  const innerW = Math.max(1, w - bw * 2);
  const innerH = Math.max(1, h - bw * 2);
  const innerX = box.x + bw;
  const innerY = box.y + bw;
  const innerRadius = layer.type === 'frame' ? 9999 : Math.max(0, (layer.borderRadius || 0) - bw);
  const opacity = layer.opacity ?? 1;

  let src = layer.content || '';

  // If the content maps to an asset, try to get a usable URL string
  if (typeof src === 'string' && assetMap[src]) {
    const mapped = assetMap[src];
    if (typeof mapped === 'string') {
      src = mapped;
    }
    // ImageBitmap objects can't be used by PDFKit — keep original URL
  }

  if (!src || typeof src !== 'string') return;

  doc.save();
  doc.opacity(opacity);

  withLayerTransform(doc, layer, box);

  // SVG image assets use the same vector drawing path as editor SVG shapes.
  if (/\.svg(?:$|\?)/i.test(src) || src.startsWith('data:image/svg+xml')) {
    try {
      let svgText = '';
      if (src.startsWith('data:')) {
        const base64Data = src.split(',')[1];
        if (src.includes('base64,')) {
          svgText = atob(base64Data);
        } else {
          svgText = decodeURIComponent(base64Data);
        }
      } else {
        const res = await fetch(src, { mode: 'cors' });
        if (res.ok) svgText = await res.text();
      }
      if (!svgText) throw new Error(`SVG image ${src} could not be loaded.`);
      // Keep the SVG's intrinsic aspect ratio before applying the same
      // object-fit: cover crop that the editor uses for every image layer.
        const viewBox = svgText.match(/\bviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i);
        const sourceW = Number(viewBox?.[1]) || Number(svgText.match(/<svg\b[^>]*\bwidth\s*=\s*["']([\d.]+)/i)?.[1]) || w;
        const sourceH = Number(viewBox?.[2]) || Number(svgText.match(/<svg\b[^>]*\bheight\s*=\s*["']([\d.]+)/i)?.[1]) || h;
        const aspect = sourceW / sourceH;
        const rasterW = Math.max(w, h * aspect);
        const rasterH = rasterW / aspect;
        if (getLayerShadow(layer)) {
          const shadowSource = await rasterizeSvgToDataUrl(svgText, rasterW, rasterH, 4);
          if (shadowSource) await drawImageLayerShadow(doc, layer, shadowSource, innerX, innerY, innerW, innerH, 'cover');
        }
        const drawW = Math.max(innerW, innerH * aspect);
        const drawH = drawW / aspect;
        const drawX = innerX + (innerW - drawW) / 2;
        const drawY = innerY + (innerH - drawH) / 2;
        doc.save();
        try {
          clipToBox(doc, innerX, innerY, innerW, innerH, innerRadius);
          await drawSvgVector(doc, svgText, drawX, drawY, drawW, drawH, fontManager, layer);
        } finally {
          doc.restore();
        }
    } catch (err) {
      doc.restore();
      throw err;
    }
  } else {
    // Normal JPEG/PNG image handling
    const imgData = await fetchImageBuffer(src);
    if (imgData) {
      try {
        // The editor uses object-fit: cover for image, background, and frame.
        //
        // The shadow reads the same bitmap's alpha under the same fit, so a
        // transparent logo casts a logo-shaped halo, not a box.
        await drawImageLayerShadow(
          doc, layer, src, innerX, innerY, innerW, innerH,
          'cover',
        );
        if (layer.type === 'image' || layer.type === 'background' || layer.type === 'frame') {
          // Always clip the image bounds to prevent cover overflow
          doc.save();
          const br = innerRadius;
          if (br >= 9999) {
            doc.ellipse(innerX + innerW / 2, innerY + innerH / 2, innerW / 2, innerH / 2).clip();
          } else if (br > 0) {
            doc.roundedRect(innerX, innerY, innerW, innerH, br).clip();
          } else {
            doc.rect(innerX, innerY, innerW, innerH).clip();
          }
          doc.image(imgData as any, innerX, innerY, {
            cover: [innerW, innerH],
            align: 'center',
            valign: 'center',
          } as any);
          doc.restore();
        } else {
          doc.save();
          clipToBox(doc, innerX, innerY, innerW, innerH, innerRadius);
          doc.image(imgData as any, innerX, innerY, {
            width: innerW,
            height: innerH,
          });
          doc.restore();
        }
      } catch (err) {
        console.warn(`[VectorPDF] Image embedding failed for layer ${layer.id}:`, err);
      }
    }
  }

  // Border
  drawLayerBorder(doc, layer, box.x, box.y, w, h);

  doc.restore();
}

/**
 * Renders QR code or barcode by generating a raster image and embedding it.
 */
async function renderQrBarcodeToPdf(
  doc: PDFKit.PDFDocument,
  layer: Layer,
): Promise<void> {
  const text = layer.content || (layer.type === 'barcode' ? '123456789' : 'https://example.com');
  const fgColor = layer.color || '#000000';
  const isTransparent = !layer.backgroundColor || layer.backgroundColor === 'transparent';
  const bgColor = isTransparent ? (layer.type === 'barcode' ? 'transparent' : '#ffffff00') : layer.backgroundColor!;

  let dataUrl: string;
  if (layer.type === 'barcode') {
    dataUrl = generateBarcodeDataUrl(text, fgColor, bgColor);
  } else {
    dataUrl = await generateQRDataUrl(text, fgColor, isTransparent ? '#ffffff00' : bgColor);
  }

  const box = getLayerBox(layer);
  const w = box.width;
  const h = box.height;
  const bw = layer.borderWidth || 0;
  const innerW = Math.max(1, w - bw * 2);
  const innerH = Math.max(1, h - bw * 2);
  const innerX = box.x + bw;
  const innerY = box.y + bw;
  const innerRadius = layer.type === 'frame' ? 9999 : Math.max(0, (layer.borderRadius || 0) - bw);
  const opacity = layer.opacity ?? 1;

  doc.save();
  doc.opacity(opacity);

  withLayerTransform(doc, layer, box);

  // A QR/barcode on a transparent background must cast a shadow shaped like
  // its own modules, not a soft rectangle — so the silhouette reads the
  // generated bitmap's alpha. The code itself is still embedded at full
  // resolution below; only the halo behind it comes from the raster.
  await drawImageLayerShadow(doc, layer, dataUrl, innerX, innerY, innerW, innerH);

  try {
    doc.save();
    clipToBox(doc, innerX, innerY, innerW, innerH, innerRadius);
    // Use stretch (width/height) to match objectFit:'fill' in the editor
    doc.image(dataUrl, innerX, innerY, {
      width: innerW,
      height: innerH,
    });
    doc.restore();
  } catch (err) {
    console.warn(`[VectorPDF] QR/Barcode embedding failed:`, err);
  }

  drawLayerBorder(doc, layer, box.x, box.y, w, h);

  doc.restore();
}

const curvedShadowMaskCache = new Map<string, Promise<HTMLCanvasElement>>();

/** Rasterize only the curved text shadow mask on the main thread. */
function rasterizeVectorTextForShadow(
  svg: string,
  width: number,
  height: number,
  pad: number,
  layer: Layer,
): Promise<HTMLCanvasElement> {
  const key = `${svg}:${layer.fontUrl || ''}:${pad}`;
  const cached = curvedShadowMaskCache.get(key);
  if (cached) return cached;

  const render = (async () => {
    const outerW = width + pad * 2;
    const outerH = height + pad * 2;
    const scale = 3;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(outerW * scale);
    canvas.height = Math.ceil(outerH * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create curved text shadow canvas');
    context.scale(scale, scale);
    context.translate(pad, pad);
    const { Canvg } = await import('canvg');
    const renderer = await Canvg.fromString(context, svg, {
      ignoreMouse: true,
      ignoreAnimation: true,
      ignoreDimensions: true,
    });
    await renderer.render();
    return canvas;
  })();

  if (curvedShadowMaskCache.size >= 8) curvedShadowMaskCache.clear();
  curvedShadowMaskCache.set(key, render);
  void render.catch(() => curvedShadowMaskCache.delete(key));
  return render;
}

/** Draws the editor's textPath into the PDF as positioned vector glyphs. */
async function renderTextSvgToPdf(
  doc: PDFKit.PDFDocument,
  layer: Layer,
  fontManager: FontManager,
): Promise<void> {
  const w = layer.width || 200;
  const h = layer.height || 40;
  const bw = layer.borderWidth || 0;
  const innerW = Math.max(1, w - bw * 2);
  const innerH = Math.max(1, h - bw * 2);
  const opacity = layer.opacity ?? 1;
  const rotation = layer.rotation || 0;

  const { generateTextSvgString } = await import('../utils/text-svg-generator');

  // Wait for font to load
  const fontFamily = layer.fontFamily || 'Inter';
  try {
    await document.fonts.load(`${layer.fontSize || 24}px "${fontFamily}"`, layer.content || 'Ag');
  } catch { /* font load timeout — proceed anyway */ }

  const svgString = generateTextSvgString(layer, layer.content || '', innerW, innerH);

  doc.save();
  doc.opacity(opacity);

  if (rotation !== 0) {
    const cx = layer.x + w / 2;
    const cy = layer.y + h / 2;
    doc.translate(cx, cy);
    doc.rotate(rotation, { origin: [0, 0] });
    doc.translate(-cx, -cy);
  }

  try {
    // CENTER-BASED positioning (matches Konva) — NO border offset needed
    const centerX = layer.x + w / 2;
    const centerY = layer.y + h / 2;
    const imgX = centerX - innerW / 2;
    const imgY = centerY - innerH / 2;
    // Only the shadow is rasterized; visible lettering stays as PDF vectors.
    const shadow = getLayerShadow(layer);
    if (shadow) {
      const pad = Math.ceil(Math.max(layer.fontSize || 24, shadow.blur * 2) + 2);
      try {
        const shadowImage = await rasterizeVectorTextForShadow(svgString, innerW, innerH, pad, layer);
        drawLayerShadow(doc, layer, {
          kind: 'image', key: `${svgString}:${layer.fontUrl || ''}:${pad}`, image: shadowImage,
          x: imgX - pad, y: imgY - pad,
          width: innerW + pad * 2, height: innerH + pad * 2,
          fit: 'stretch', clipRadius: null,
        });
      } catch (err) {
        console.warn(`[VectorPDF] Curved text shadow skipped for layer ${layer.id}:`, err);
      }
    }
    await drawSvgVector(doc, svgString, imgX, imgY, innerW, innerH, fontManager, layer);
  } catch (err) {
    doc.restore();
    throw err;
  }

  doc.restore();
}

/**
 * Draws a generated table as PDF vectors and embedded PDF text.
 */
async function renderTableSvgToPdf(
  doc: PDFKit.PDFDocument,
  layer: Layer,
  exportScale: number,
  fontManager: FontManager,
): Promise<void> {
  const w = layer.width || 400;
  const h = layer.height || 200;
  const opacity = layer.opacity ?? 1;
  const rotation = layer.rotation || 0;

  const { generateTableSvg } = await import('../utils/generate-table-svg');
  let svgString = generateTableSvg(layer);
  if (!svgString) return;

  // The editor leaves table rules invisible when borderColor is unset (the
  // generated SVG has stroke="undefined") or transparent. svg-to-pdfkit can
  // turn these into PDF hairlines, especially when borderWidth is zero.
  const ruleColor = layer.tableData?.borderColor?.trim().toLowerCase();
  const hasVisibleRules = (layer.tableData?.borderWidth ?? 1) > 0
    && !!ruleColor && !['transparent', 'none', 'undefined', 'null'].includes(ruleColor);
  if (!hasVisibleRules) {
    svgString = svgString
      .replace(/<line\b[^>]*\/>/gi, '')
      .replace(/<rect\b(?=[^>]*\bfill="none")(?=[^>]*\bstroke=)[^>]*\/>/gi, '');
  }

  // Pre-load table fonts
  if (layer.tableData?.cells) {
    const fontFamilies = new Set<string>();
    for (const row of layer.tableData.cells) {
      for (const cell of row) {
        if (cell?.fontFamily) {
          const primary = cell.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
          fontFamilies.add(primary);
        }
      }
    }
    await Promise.allSettled(
      [...fontFamilies].map(f =>
        document.fonts.load(`16px "${f}"`, 'Ag').catch(() => {})
      )
    );
  }

  doc.save();
  doc.opacity(opacity);

  if (rotation !== 0) {
    const cx = layer.x + w / 2;
    const cy = layer.y + h / 2;
    doc.translate(cx, cy);
    doc.rotate(rotation, { origin: [0, 0] });
    doc.translate(-cx, -cy);
  }

  try {
    // CENTER-BASED positioning (matches Konva)
    const centerX = layer.x + w / 2;
    const centerY = layer.y + h / 2;
    const imgX = centerX - w / 2;
    const imgY = centerY - h / 2;
    // A table's cells and rules leave large transparent gaps; the alpha
    // silhouette keeps the halo out of them.
    if (getLayerShadow(layer)) {
      const shadowSource = await rasterizeSvgToDataUrl(svgString, w, h, exportScale);
      if (shadowSource) await drawImageLayerShadow(doc, layer, shadowSource, imgX, imgY, w, h);
    }
    await drawSvgVector(doc, svgString, imgX, imgY, w, h, fontManager, layer);
  } catch (err) {
    doc.restore();
    throw err;
  }

  doc.restore();
}

/**
 * Draws a generated chart as PDF vectors and embedded PDF text.
 */
async function renderChartSvgToPdf(
  doc: PDFKit.PDFDocument,
  layer: Layer,
  exportScale: number,
  fontManager: FontManager,
): Promise<void> {
  const w = layer.width || 300;
  const h = layer.height || 250;
  const opacity = layer.opacity ?? 1;
  const rotation = layer.rotation || 0;

  const { generateChartSvg } = await import('../utils/generate-chart-svg');
  const svgString = generateChartSvg(layer);
  if (!svgString) return;

  // Pre-load chart font
  if (layer.chartData?.fontFamily) {
    const primary = layer.chartData.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
    await document.fonts.load(`${layer.chartData.fontSize || 11}px "${primary}"`, 'Ag').catch(() => {});
  }

  doc.save();
  doc.opacity(opacity);

  if (rotation !== 0) {
    const cx = layer.x + w / 2;
    const cy = layer.y + h / 2;
    doc.translate(cx, cy);
    doc.rotate(rotation, { origin: [0, 0] });
    doc.translate(-cx, -cy);
  }

  try {
    // CENTER-BASED positioning (matches Konva)
    const centerX = layer.x + w / 2;
    const centerY = layer.y + h / 2;
    const imgX = centerX - w / 2;
    const imgY = centerY - h / 2;
    // Bars, lines and labels each get their own halo, exactly as the DOM
    // editor's drop-shadow filter does.
    if (getLayerShadow(layer)) {
      const shadowSource = await rasterizeSvgToDataUrl(svgString, w, h, exportScale);
      if (shadowSource) await drawImageLayerShadow(doc, layer, shadowSource, imgX, imgY, w, h);
    }
    await drawSvgVector(doc, svgString, imgX, imgY, w, h, fontManager, layer);
  } catch (err) {
    doc.restore();
    throw err;
  }

  doc.restore();
}

// ── Crop Marks ──
function renderCropMarksToPdf(doc: PDFKit.PDFDocument, w: number, h: number): void {
  const size = 24;
  const t = 3;
  const c = '#0f172a';

  doc.save();
  doc.fillColor(c);
  // Top-left
  doc.rect(0, 0, size, t).fill();
  doc.rect(0, 0, t, size).fill();
  // Top-right
  doc.rect(w - size, 0, size, t).fill();
  doc.rect(w - t, 0, t, size).fill();
  // Bottom-left
  doc.rect(0, h - t, size, t).fill();
  doc.rect(0, h - size, t, size).fill();
  // Bottom-right
  doc.rect(w - size, h - t, size, t).fill();
  doc.rect(w - t, h - size, t, size).fill();
  doc.restore();
}

// ═══════════════════════════════════════════════════════════════════════
// SINGLE RECORD RENDERER
// ═══════════════════════════════════════════════════════════════════════

async function renderSingleRecordToVectorPdf(
  doc: PDFKit.PDFDocument,
  template: DocumentTemplate,
  layers: Layer[],
  rowData: Record<string, any>,
  assetMap: Record<string, any>,
  fontManager: FontManager,
  exportScale: number,
  includeCropMarks: boolean,
): Promise<void> {
  const canvasW = template.dimensions?.width || 856;
  const canvasH = template.dimensions?.height || 540;
  const resolvedLayers: Array<{ original: Layer; resolved: Layer }> = [];

  // Work in design px for the whole page; the page itself is sized in points.
  // (Set once per page — PDFKit resets the CTM on every addPage.)
  doc.scale(PX_TO_PT);

  // Background
  doc.rect(0, 0, canvasW, canvasH).fill(template.backgroundColor || '#ffffff');

  for (const layer of layers) {
    if (layer.visible === false) continue;

    // Resolve dynamic content (same logic as renderOrchestrator)
    const propOverrides = evaluateLayerOverrides(layer.logic, rowData);
    const resolvedLayer = Object.keys(propOverrides).length > 0
      ? { ...layer, ...propOverrides }
      : { ...layer };

    if (layer.chartData && propOverrides.chartData) {
      resolvedLayer.chartData = { ...layer.chartData, ...propOverrides.chartData };
    }

    let content = evaluateSmartLogic(resolvedLayer.content || '', rowData, resolvedLayer.logic);
    content = resolveContent(content);
    if (content && typeof content === 'string' && assetMap[content]) {
      const mapped = assetMap[content];
      if (typeof mapped === 'string') content = mapped;
    }
    resolvedLayer.content = content;
    resolvedLayer.smartSizing = !!layer.smartSizing && isDynamicTextLayer(layer);

    // Resolve table data
    if (resolvedLayer.tableData && resolvedLayer.tableData.cells) {
      const tableData = JSON.parse(JSON.stringify(resolvedLayer.tableData));
      resolvedLayer.tableData = tableData;
      for (const row of tableData.cells) {
        for (const cell of row) {
          if (cell && cell.content) {
            let cellContent = evaluateSmartLogic(cell.content, rowData, undefined);
            cellContent = resolveContent(cellContent);
            if (cellContent && typeof cellContent === 'string' && assetMap[cellContent]) {
              const m = assetMap[cellContent];
              if (typeof m === 'string') cellContent = m;
            }
            cell.content = cellContent;
          }
        }
      }
    }

    // Resolve chart data
    if (resolvedLayer.chartData) {
      const chartData = JSON.parse(JSON.stringify(resolvedLayer.chartData));
      resolvedLayer.chartData = chartData;
      let finalPercentageStr = chartData.percentage || '';
      if (layer.logic?.rules?.length && layer.logic.rules.length > 0) {
        const out = evaluateSmartLogic('', rowData, layer.logic);
        if (out !== undefined && out !== null && out !== '') {
          finalPercentageStr = String(out);
        } else {
          finalPercentageStr = evaluateSmartLogic(finalPercentageStr, rowData, undefined);
        }
      } else {
        finalPercentageStr = evaluateSmartLogic(finalPercentageStr, rowData, undefined);
      }
      chartData.percentage = resolveContent(finalPercentageStr);

      if (chartData.categories) {
        chartData.categories = chartData.categories.map((cat: string) => {
          let cContent = evaluateSmartLogic(cat, rowData, undefined);
          return resolveContent(cContent);
        });
      }

      if (chartData.series) {
        for (const series of chartData.series) {
          if (series.label) {
            let lContent = evaluateSmartLogic(series.label, rowData, undefined);
            series.label = resolveContent(lContent);
          }
          if (series.values) {
            series.values = series.values.map((v: string) => {
              let vContent = evaluateSmartLogic(v, rowData, undefined);
              return resolveContent(vContent);
            });
          }
        }
      }
    }

    resolvedLayers.push({ original: layer, resolved: resolvedLayer });
  }

  const renderResolvedLayer = async (original: Layer, resolvedLayer: Layer): Promise<void> => {
    try {
      // `verification_id` is a real layer type at runtime — `CertificateEditor`
      // creates it via addLayer('verification_id', …) and `EditableLayer` renders
      // it — but it is missing from the `LayerType` union, which is why the
      // editor's own two comparisons for it (EditableLayer.tsx:177 and :825) sit
      // there as pre-existing TS2367s. Without this branch the switch below fell
      // through and the verification badge was silently absent from the vector
      // PDF while appearing in every other export.
      //
      // The editor treats it as a QR code in every respect: same generator, same
      // colours, same 'https://example.com' placeholder, and it is listed
      // alongside 'qr' for clipping. So the QR renderer is the correct target.
      //
      // Compared through a widened value rather than a `case`, which TS rejects
      // outright (TS2678) for a literal outside the union. Adding
      // 'verification_id' to `LayerType` is the better fix, but that union is
      // consumed across the whole app and this file must not be the place that
      // risks breaking the raster exports.
      if ((resolvedLayer.type as string) === 'verification_id') {
        await renderQrBarcodeToPdf(doc, resolvedLayer);
        return;
      }

      switch (resolvedLayer.type) {
        case 'shape':
          await renderShapeToPdf(doc, resolvedLayer, exportScale, fontManager);
          break;
        case 'line':
          renderLineToPdf(doc, resolvedLayer);
          break;
        case 'textsvg':
          await renderTextSvgToPdf(doc, resolvedLayer, fontManager);
          break;
        case 'table-svg':
          await renderTableSvgToPdf(doc, resolvedLayer, exportScale, fontManager);
          break;
        case 'chart-svg':
          await renderChartSvgToPdf(doc, resolvedLayer, exportScale, fontManager);
          break;
        case 'image':
        case 'background':
        case 'frame':
          await renderImageToPdf(doc, resolvedLayer, assetMap, fontManager);
          break;
        case 'qr':
        case 'barcode':
          await renderQrBarcodeToPdf(doc, resolvedLayer);
          break;
        case 'text':
          await renderTextToPdf(doc, resolvedLayer, fontManager);
          break;
      }
    } catch (err) {
      if (['textsvg', 'table-svg', 'chart-svg'].includes(resolvedLayer.type)
        || (resolvedLayer.type === 'shape' && resolvedLayer.content?.trim().startsWith('<svg'))
        || (['image', 'background', 'frame'].includes(resolvedLayer.type)
          && /(?:\.svg(?:$|\?)|^data:image\/svg\+xml)/i.test(resolvedLayer.content || ''))) {
        throw err;
      }
      console.warn(`[VectorPDF] Failed to render layer ${original.id} (${original.type}):`, err);
    }
  };

  // Render all layers in their natural Z-order (matches Konva's array order)
  for (const entry of resolvedLayers) {
    await renderResolvedLayer(entry.original, entry.resolved);
  }

  // Crop marks
  if (includeCropMarks) {
    renderCropMarksToPdf(doc, canvasW, canvasH);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// HELPER: Convert PDFKit document stream to Blob
// ═══════════════════════════════════════════════════════════════════════

function createPdfDocument(options: any) {
  const doc = new PDFDocument(options) as unknown as PDFKit.PDFDocument;
  return {
    doc,
    getBlob: (): Promise<Blob> => new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      doc.on('data', (chunk: Uint8Array) => chunks.push(new Uint8Array(chunk)));
      doc.on('end', () => resolve(new Blob(chunks as BlobPart[], { type: 'application/pdf' })));
      doc.on('error', reject);
      doc.end();
    })
  };
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN EXPORT FUNCTION
// ═══════════════════════════════════════════════════════════════════════


export async function renderVectorPdf(
  template: DocumentTemplate,
  pages: Array<{ layers: Layer[]; rowData: Record<string, any>; assetMap: Record<string, any> }>,
  scale: number,
  fontManifest: VectorFontManifestItem[] = [],
): Promise<Blob> {
  const width = template.dimensions?.width || 856;
  const height = template.dimensions?.height || 540;
  const instance = createPdfDocument({
    size: pdfPageSize(width, height), margins: { ...ZERO_MARGINS },
    autoFirstPage: false, bufferPages: true,
  });
  const fontManager = new FontManager(instance.doc, fontManifest);
  try {
    for (const page of pages) {
      instance.doc.addPage({ size: pdfPageSize(width, height), margins: { ...ZERO_MARGINS } });
      await renderSingleRecordToVectorPdf(
        instance.doc, template, page.layers, page.rowData, page.assetMap, fontManager, scale, !!template.showCropMarks,
      );
    }
    return await instance.getBlob();
  } finally {
    fontManager.reset();
    clearFontCache();
    clearShadowCache();
    curvedShadowMaskCache.clear();
  }
}
