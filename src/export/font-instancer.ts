/**
 * fontInstancer.ts
 *
 * Freezes an OpenType *variable* font at one concrete weight so it can be
 * embedded in a PDF as an ordinary static font.
 *
 * ── Why this module exists ────────────────────────────────────────────────
 * Most bundled families (Inter, Montserrat, Roboto, Oswald, Merriweather,
 * JetBrains Mono, Dancing Script) ship as a single *variable* .ttf that covers
 * the whole `wght` axis. The browser picks the requested weight through CSS,
 * so the canvas/flatten export has always been correct. PDF, however, has no
 * concept of a variable font: whatever bytes we embed render at the file's
 * DEFAULT instance. Montserrat's default is wght 100 (Thin) and
 * Merriweather's is 300 (Light) — which is exactly why bold text used to come
 * out thin/wrong in the vector PDF while looking fine on screen.
 *
 * fontkit (bundled inside pdfkit.standalone.js) can build a variation
 * instance, but PDFKit then crashes while subsetting it: fontkit's glyph
 * encoder calls restructure's `EncodeStream` with a number instead of a
 * buffer ("First argument to DataView constructor must be an ArrayBuffer").
 * So instead of asking fontkit, we pin the axes with HarfBuzz's subsetter and
 * hand PDFKit a genuine static font that it can embed on its normal path.
 *
 * Nothing in here is used by the canvas/flatten (jsPDF) export path.
 */

// Bundle this resource inside the npm package. Consumers do not host the
// frontend's /public/font assets or share its Vite base URL.
import harfbuzzSubsetUrl from '../assets/harfbuzz-subset.wasm?url';

/** HB_MEMORY_MODE_WRITABLE — HarfBuzz may modify/keep the buffer we pass. */
const HB_MEMORY_MODE_WRITABLE = 2;

interface HbSubsetExports {
  memory: WebAssembly.Memory;
  malloc(size: number): number;
  free(ptr: number): void;
  hb_blob_create(data: number, length: number, mode: number, userData: number, destroy: number): number;
  hb_blob_destroy(blob: number): void;
  hb_blob_get_data(blob: number, lengthPtr: number): number;
  hb_face_create(blob: number, index: number): number;
  hb_face_destroy(face: number): void;
  hb_face_reference_blob(face: number): number;
  hb_subset_input_create_or_fail(): number;
  hb_subset_input_destroy(input: number): void;
  hb_subset_input_keep_everything(input: number): void;
  hb_subset_input_pin_all_axes_to_default(input: number, face: number): number;
  hb_subset_input_pin_axis_location(input: number, face: number, tag: number, value: number): number;
  hb_subset_or_fail(face: number, input: number): number;
}

let hbPromise: Promise<HbSubsetExports | null> | null = null;

/** Lazily download + instantiate harfbuzz-subset.wasm (once per page). */
function loadHarfBuzzSubset(): Promise<HbSubsetExports | null> {
  if (hbPromise) return hbPromise;

  hbPromise = (async () => {
    try {
      const response = await fetch(harfbuzzSubsetUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      // harfbuzz-subset.wasm is a standalone module with no imports.
      const { instance } = await WebAssembly.instantiate(bytes, {});
      const exports = instance.exports as unknown as HbSubsetExports;

      const required: Array<keyof HbSubsetExports> = [
        'memory', 'malloc', 'free',
        'hb_blob_create', 'hb_blob_destroy', 'hb_blob_get_data',
        'hb_face_create', 'hb_face_destroy', 'hb_face_reference_blob',
        'hb_subset_input_create_or_fail', 'hb_subset_input_destroy',
        'hb_subset_input_keep_everything', 'hb_subset_input_pin_axis_location',
        'hb_subset_or_fail',
      ];
      for (const fn of required) {
        if (typeof (exports as any)[fn] === 'undefined') {
          throw new Error(`missing export "${String(fn)}"`);
        }
      }
      return exports;
    } catch (err) {
      console.warn('[FontInstancer] HarfBuzz subset module unavailable — variable fonts will embed at their default weight.', err);
      return null;
    }
  })();

  return hbPromise;
}

// ═══════════════════════════════════════════════════════════════════════
// Minimal sfnt / fvar reader
// ═══════════════════════════════════════════════════════════════════════

const SFNT_TRUETYPE = 0x00010000;
const SFNT_OTTO     = 0x4f54544f; // 'OTTO' (CFF outlines)
const SFNT_TRUE     = 0x74727565; // 'true' (legacy Apple)

function findTable(buffer: ArrayBuffer, tag: string): { offset: number; length: number } | null {
  if (buffer.byteLength < 12) return null;
  const view = new DataView(buffer);
  const sfntVersion = view.getUint32(0);
  if (sfntVersion !== SFNT_TRUETYPE && sfntVersion !== SFNT_OTTO && sfntVersion !== SFNT_TRUE) {
    return null; // WOFF/WOFF2/TTC — caller decompresses before reaching us
  }

  const numTables = view.getUint16(4);
  const wanted =
    (tag.charCodeAt(0) << 24) | (tag.charCodeAt(1) << 16) | (tag.charCodeAt(2) << 8) | tag.charCodeAt(3);

  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    if (record + 16 > buffer.byteLength) break;
    if (view.getUint32(record) >>> 0 === (wanted >>> 0)) {
      return { offset: view.getUint32(record + 8), length: view.getUint32(record + 12) };
    }
  }
  return null;
}

export interface VariationAxis {
  tag: string;
  min: number;
  default: number;
  max: number;
}

export interface FontVariationInfo {
  /** true when the file carries an `fvar` table (i.e. it is a variable font) */
  isVariable: boolean;
  axes: VariationAxis[];
  /** convenience pointer at the `wght` axis, when present */
  weightAxis: VariationAxis | null;
}

const NO_VARIATIONS: FontVariationInfo = { isVariable: false, axes: [], weightAxis: null };

/** Reads the `fvar` table to discover which axes a font exposes. */
export function getFontVariationInfo(buffer: ArrayBuffer): FontVariationInfo {
  try {
    const fvar = findTable(buffer, 'fvar');
    if (!fvar) return NO_VARIATIONS;

    const view = new DataView(buffer);
    const base = fvar.offset;
    if (base + 16 > buffer.byteLength) return NO_VARIATIONS;

    const axesArrayOffset = view.getUint16(base + 4);
    const axisCount = view.getUint16(base + 8);
    const axisSize = view.getUint16(base + 10);
    if (!axisCount || axisSize < 20) return NO_VARIATIONS;

    const axes: VariationAxis[] = [];
    for (let i = 0; i < axisCount; i++) {
      const rec = base + axesArrayOffset + i * axisSize;
      if (rec + 20 > buffer.byteLength) break;
      const tag = String.fromCharCode(
        view.getUint8(rec), view.getUint8(rec + 1), view.getUint8(rec + 2), view.getUint8(rec + 3),
      );
      axes.push({
        tag,
        min: view.getInt32(rec + 4) / 65536,
        default: view.getInt32(rec + 8) / 65536,
        max: view.getInt32(rec + 12) / 65536,
      });
    }

    return {
      isVariable: axes.length > 0,
      axes,
      weightAxis: axes.find(a => a.tag === 'wght') || null,
    };
  } catch {
    return NO_VARIATIONS;
  }
}

/**
 * Reads `OS/2.usWeightClass` — the weight the font itself claims to be.
 *
 * Used to decide whether a *static* face already covers the requested weight
 * or whether the browser would have had to fake-bold it (Bebas Neue, Great
 * Vibes and Embolism Spark ship a single upright regular face, so CSS
 * `font-weight: 700` is synthesised on canvas). Returns null when the table
 * cannot be read.
 */
export function getUsWeightClass(buffer: ArrayBuffer): number | null {
  try {
    const os2 = findTable(buffer, 'OS/2');
    if (!os2 || os2.offset + 6 > buffer.byteLength) return null;
    const view = new DataView(buffer);
    const usWeightClass = view.getUint16(os2.offset + 4);
    return usWeightClass > 0 ? usWeightClass : null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Instancing
// ═══════════════════════════════════════════════════════════════════════

function tagToNumber(tag: string): number {
  return (
    ((tag.charCodeAt(0) << 24) | (tag.charCodeAt(1) << 16) | (tag.charCodeAt(2) << 8) | tag.charCodeAt(3)) >>> 0
  );
}

/**
 * Pins a variable font's axes so the result is a plain static font whose
 * `wght` sits at `weight` (clamped to the axis range). All other axes are
 * pinned to their own defaults, matching what a browser does when CSS only
 * specifies `font-weight`.
 *
 * Returns `null` when the font is not variable, has no `wght` axis, or when
 * HarfBuzz is unavailable — callers should then embed the original bytes.
 */
export async function instanceFontAtWeight(
  buffer: ArrayBuffer,
  weight: number,
): Promise<ArrayBuffer | null> {
  const info = getFontVariationInfo(buffer);
  if (!info.isVariable || !info.weightAxis) return null;

  const hb = await loadHarfBuzzSubset();
  if (!hb) return null;

  const target = Math.min(info.weightAxis.max, Math.max(info.weightAxis.min, weight));

  const source = new Uint8Array(buffer);
  let dataPtr = 0;
  let blob = 0;
  let face = 0;
  let input = 0;
  let result = 0;
  let outBlob = 0;
  let lengthPtr = 0;

  try {
    dataPtr = hb.malloc(source.length);
    if (!dataPtr) return null;
    new Uint8Array(hb.memory.buffer, dataPtr, source.length).set(source);

    blob = hb.hb_blob_create(dataPtr, source.length, HB_MEMORY_MODE_WRITABLE, 0, 0);
    if (!blob) return null;

    face = hb.hb_face_create(blob, 0);
    if (!face) return null;

    input = hb.hb_subset_input_create_or_fail();
    if (!input) return null;

    // Keep every glyph, table and name record — we only want to drop the
    // variation machinery, not slim the font down. PDFKit subsets on embed.
    hb.hb_subset_input_keep_everything(input);

    if (typeof hb.hb_subset_input_pin_all_axes_to_default === 'function') {
      hb.hb_subset_input_pin_all_axes_to_default(input, face);
    }
    const pinned = hb.hb_subset_input_pin_axis_location(input, face, tagToNumber('wght'), target);
    if (!pinned) return null;

    result = hb.hb_subset_or_fail(face, input);
    if (!result) return null;

    outBlob = hb.hb_face_reference_blob(result);
    if (!outBlob) return null;

    lengthPtr = hb.malloc(4);
    if (!lengthPtr) return null;
    const outPtr = hb.hb_blob_get_data(outBlob, lengthPtr);
    const outLength = new Uint32Array(hb.memory.buffer, lengthPtr, 1)[0];
    if (!outPtr || !outLength) return null;

    // Copy out of WASM memory before anything can grow/detach the heap.
    const out = new Uint8Array(outLength);
    out.set(new Uint8Array(hb.memory.buffer, outPtr, outLength));

    // Sanity check: the result must still be a parseable sfnt with no `fvar`.
    if (getFontVariationInfo(out.buffer).isVariable) return null;

    return out.buffer;
  } catch (err) {
    console.warn(`[FontInstancer] Failed to pin wght=${weight}:`, err);
    return null;
  } finally {
    try { if (lengthPtr) hb.free(lengthPtr); } catch { /* ignore */ }
    try { if (outBlob) hb.hb_blob_destroy(outBlob); } catch { /* ignore */ }
    try { if (result) hb.hb_face_destroy(result); } catch { /* ignore */ }
    try { if (input) hb.hb_subset_input_destroy(input); } catch { /* ignore */ }
    try { if (face) hb.hb_face_destroy(face); } catch { /* ignore */ }
    try { if (blob) hb.hb_blob_destroy(blob); } catch { /* ignore */ }
    try { if (dataPtr) hb.free(dataPtr); } catch { /* ignore */ }
  }
}
