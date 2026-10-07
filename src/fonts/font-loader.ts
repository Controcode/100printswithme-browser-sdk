import { HundredPrintsError } from '../public/errors';
import { PLATFORM_DEFAULT_FONT, platformWeightDescriptor, resolvePlatformFont } from './platform-fonts';

export interface FontMetrics {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  lineGap: number;
  xHeight: number;
  capHeight: number;
}

export type FontStyle = 'normal' | 'italic';

export interface FontManifestItem {
  family: string;
  weight: number;
  style?: FontStyle;
  url?: string;
  sampleText?: string;
}

const WOFF2_MAGIC = [0x77, 0x4F, 0x46, 0x32];

export function detectFontFormat(buffer: ArrayBuffer): 'woff2' | 'ttf' | 'otf' | 'unknown' {
  const bytes = new Uint8Array(buffer.slice(0, 4));
  if (bytes.length < 4) return 'unknown';
  if (bytes.every((b, i) => b === WOFF2_MAGIC[i])) return 'woff2';
  if (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return 'ttf';
  if (bytes[0] === 0x4F && bytes[1] === 0x54 && bytes[2] === 0x54 && bytes[3] === 0x4F) return 'otf';
  return 'unknown';
}

let brotliWasm: any = null;

export async function decompressWoff2(woff2Buffer: ArrayBuffer): Promise<ArrayBuffer> {
  if (!brotliWasm) brotliWasm = await import('brotli-dec-wasm');
  const output = brotliWasm.decompress(new Uint8Array(woff2Buffer));
  return output.buffer;
}

export async function extractFontMetrics(_buffer: ArrayBuffer): Promise<FontMetrics> {
  return { unitsPerEm: 1000, ascent: 800, descent: -200, lineGap: 0, xHeight: 500, capHeight: 700 };
}

const OPFS_FONT_DIR = 'font-cache';
const memoryFallbackCache = new Map<string, ArrayBuffer>();

async function getOpfsFontCache(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(OPFS_FONT_DIR, { create: true });
  } catch {
    return null;
  }
}

const SYSTEM_FONTS = new Set([
  'arial', 'helvetica', 'times new roman', 'times', 'courier new', 'courier',
  'verdana', 'georgia', 'comic sans ms', 'trebuchet ms', 'impact',
  'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
]);

export function cleanFontFamily(family: string): string {
  return family.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
}

export function fontDescriptor(item: Pick<FontManifestItem, 'family' | 'weight' | 'style'>, size = 16): string {
  const escaped = cleanFontFamily(item.family).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${item.style || 'normal'} ${item.weight} ${size}px "${escaped}"`;
}

function loadError(item: FontManifestItem, cause: unknown): HundredPrintsError {
  const source = item.url?.startsWith('data:') ? 'inline font data' : item.url || 'Google Fonts';
  return new HundredPrintsError('FONT_LOAD_FAILED', `Failed to load font "${cleanFontFamily(item.family)}".`, {
    cause,
    details: {
      family: cleanFontFamily(item.family),
      weight: item.weight,
      style: item.style || 'normal',
      source,
    },
  });
}

export class FontLoader {
  private loadedFonts = new Set<string>();
  private loadingFonts = new Map<string, Promise<void>>();
  private registeredFaces = new Map<string, Promise<FontFace>>();
  private genericFallbacks = new Set<string>();

  async loadFonts(manifest: FontManifestItem[]): Promise<void> {
    this.genericFallbacks.clear();
    await Promise.all(manifest.map(item => this.loadFont(item)));
  }

  hasGenericFallbacks(): boolean {
    return this.genericFallbacks.size > 0;
  }

  usesGenericFallback(family: string): boolean {
    return this.genericFallbacks.has(cleanFontFamily(family).toLowerCase());
  }

  private loadFont(item: FontManifestItem): Promise<void> {
    const normalized: FontManifestItem = {
      ...item,
      family: cleanFontFamily(item.family),
      weight: Number.isFinite(Number(item.weight)) ? Number(item.weight) : 400,
      style: item.style === 'italic' ? 'italic' : 'normal',
    };
    const key = `${normalized.family.toLowerCase()}|${normalized.weight}|${normalized.style}|${normalized.url || 'resolved'}`;
    if (this.loadedFonts.has(key)) return Promise.resolve();
    const pending = this.loadingFonts.get(key);
    if (pending) return pending;

    const loading = this.performLoad(normalized)
      .then(cacheable => { if (cacheable) this.loadedFonts.add(key); })
      .catch(error => { throw error instanceof HundredPrintsError ? error : loadError(normalized, error); })
      .finally(() => { this.loadingFonts.delete(key); });
    this.loadingFonts.set(key, loading);
    return loading;
  }

  private async performLoad(item: FontManifestItem): Promise<boolean> {
    const family = cleanFontFamily(item.family);
    // Explicit template/upload sources retain their existing fail-on-error policy.
    if (item.url) {
      const face = await this.registerSource(family, item.url, String(item.weight), item.style || 'normal');
      await this.verify(item, face);
      return true;
    }

    if (SYSTEM_FONTS.has(family.toLowerCase())) return true;

    const platform = resolvePlatformFont(family, item.weight, item.style || 'normal');
    if (platform) {
      try {
        const face = await this.registerSource(platform.family, platform.url,
          platformWeightDescriptor(platform.variant), platform.variant.style);
        await this.verify(item, face);
        if (!platform.exact) {
          console.warn(`[100Prints] "${family}" ${item.weight} ${item.style} is unavailable. Using "${platform.family}" ${platformWeightDescriptor(platform.variant)} ${platform.variant.style}.`);
        }
        return true;
      } catch (error) {
        console.warn(`[100Prints] Could not load platform font "${family}" from ${platform.url}.`, error);
        await this.loadDefaultOrGeneric(item);
        return false;
      }
    }

    try {
      await this.loadFromGoogleFonts(item);
      await this.verify(item);
      return true;
    } catch (error) {
      document.getElementById(this.googleLinkId(item))?.remove();
      console.warn(`[100Prints] Could not load "${family}" from Google Fonts.`, error);
      await this.loadDefaultOrGeneric(item);
      return false;
    }
  }

  private async loadDefaultOrGeneric(item: FontManifestItem): Promise<void> {
    const fallback = resolvePlatformFont(PLATFORM_DEFAULT_FONT, item.weight, item.style || 'normal');
    if (fallback) {
      try {
        // Register under the requested family so existing Konva/Canvas font strings
        // select Inter without changing any layer coordinates or text measurements.
        const face = await this.registerSource(item.family, fallback.url,
          platformWeightDescriptor(fallback.variant), fallback.variant.style);
        await this.verify(item, face);
        console.warn(`[100Prints] Using fallback "${PLATFORM_DEFAULT_FONT}" for "${item.family}".`);
        return;
      } catch (error) {
        console.warn(`[100Prints] Could not load default font "${PLATFORM_DEFAULT_FONT}". Using browser sans-serif.`, error);
      }
    }
    this.genericFallbacks.add(cleanFontFamily(item.family).toLowerCase());
  }

  private registerSource(family: string, url: string, weight: string, style: FontStyle): Promise<FontFace> {
    const key = `${family.toLowerCase()}|${weight}|${style}|${url}`;
    const existing = this.registeredFaces.get(key);
    if (existing) return existing;
    const loading = (async () => {
      const fetchWeight = Number.parseInt(weight, 10) || 400;
      const result = await this.fetchFontBuffer(family, fetchWeight, url, style);
      if (!result) throw new Error(`Font source could not be fetched: ${url}`);
      const face = await new FontFace(family, result.buffer, { weight, style }).load();
      document.fonts.add(face);
      return face;
    })().catch(error => {
      this.registeredFaces.delete(key);
      throw error;
    });
    this.registeredFaces.set(key, loading);
    return loading;
  }

  private async verify(item: FontManifestItem, registeredFace?: FontFace): Promise<void> {
    const descriptor = fontDescriptor(item);
    const faces = await document.fonts.load(descriptor, item.sampleText || 'Ag');
    await document.fonts.ready;
    const ready = document.fonts.check(descriptor, item.sampleText || 'Ag');
    if (!ready || (registeredFace && registeredFace.status !== 'loaded') || (!registeredFace && faces.length === 0)) {
      throw new Error(`Browser did not register ${descriptor}`);
    }
  }

  private async loadFromGoogleFonts(item: FontManifestItem): Promise<void> {
    const family = cleanFontFamily(item.family);
    const id = this.googleLinkId(item);
    if (document.getElementById(id)) return;

    await new Promise<void>((resolve, reject) => {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      const axis = item.style === 'italic' ? `ital,wght@1,${item.weight}` : `wght@${item.weight}`;
      const familyQuery = encodeURIComponent(family).replace(/%20/g, '+');
      link.href = `https://fonts.googleapis.com/css2?family=${familyQuery}:${axis}&display=block`;
      link.onload = () => resolve();
      link.onerror = () => {
        link.remove();
        reject(new Error(`Google Fonts stylesheet failed: ${link.href}`));
      };
      document.head.appendChild(link);
    });
  }

  private googleLinkId(item: FontManifestItem): string {
    return `100prints-font-${cleanFontFamily(item.family).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${item.weight}-${item.style}`;
  }

  async fetchFontBuffer(fontFamily: string, weight: number, url: string, style: FontStyle = 'normal'):
    Promise<{ buffer: ArrayBuffer; format: string } | null> {
    const cacheKey = `${fontFamily}::${weight}::${style}::${url}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const opfs = await getOpfsFontCache();
    if (opfs) {
      try {
        const file = await (await opfs.getFileHandle(cacheKey)).getFile();
        const buffer = await file.arrayBuffer();
        const format = detectFontFormat(buffer);
        if (format !== 'unknown') return { buffer, format };
      } catch { /* cache miss */ }
    } else if (memoryFallbackCache.has(cacheKey)) {
      const buffer = memoryFallbackCache.get(cacheKey)!;
      const format = detectFontFormat(buffer);
      if (format !== 'unknown') return { buffer, format };
    }

    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      if (opfs) {
        try {
          const writable = await (await opfs.getFileHandle(cacheKey, { create: true })).createWritable();
          await writable.write(buffer);
          await writable.close();
        } catch { /* persistent cache is optional */ }
      } else {
        memoryFallbackCache.set(cacheKey, buffer.slice(0));
      }
      return { buffer, format: detectFontFormat(buffer) };
    } catch {
      return null;
    }
  }

  clearCache(): void {
    memoryFallbackCache.clear();
    this.loadedFonts.clear();
    this.loadingFonts.clear();
    this.registeredFaces.clear();
    this.genericFallbacks.clear();
  }
}
