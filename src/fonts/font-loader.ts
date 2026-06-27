export interface FontMetrics {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  lineGap: number;
  xHeight: number;
  capHeight: number;
}

export interface FontManifestItem {
  family: string;
  weight: number;
  url?: string;
}

const WOFF2_MAGIC = [0x77, 0x4F, 0x46, 0x32]; // "wOF2"

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
  if (!brotliWasm) {
    brotliWasm = await import('brotli-dec-wasm');
  }
  const input = new Uint8Array(woff2Buffer);
  const output = brotliWasm.decompress(input);
  return output.buffer;
}

export async function extractFontMetrics(buffer: ArrayBuffer): Promise<FontMetrics> {
  return { unitsPerEm: 1000, ascent: 800, descent: -200, lineGap: 0, xHeight: 500, capHeight: 700 };
}

const OPFS_FONT_DIR = 'font-cache';

async function getOpfsFontCache(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(OPFS_FONT_DIR, { create: true });
  } catch (err) {
    return null;
  }
}

const memoryFallbackCache = new Map<string, ArrayBuffer>();

export class FontLoader {
  private loadedFonts = new Set<string>();
  private manifest: FontManifestItem[] = [];

  setManifest(manifest: FontManifestItem[]) {
    this.manifest = manifest;
  }

  async loadFonts(manifest: FontManifestItem[]) {
    this.setManifest(manifest);
    const promises = manifest.map(item => this.loadFont(item));
    await Promise.all(promises);
  }

  private async loadFont(item: FontManifestItem) {
    const cleanFamily = item.family.split(',')[0].trim().replace(/['"]/g, '');
    const fontId = `${cleanFamily}-${item.weight}`;
    if (this.loadedFonts.has(fontId)) return;

    if (!item.url) {
      const systemFonts = ['arial', 'helvetica', 'sans-serif', 'serif', 'monospace', 'times new roman', 'times', 'courier new', 'courier', 'verdana', 'georgia', 'comic sans ms', 'trebuchet ms', 'impact'];
      if (systemFonts.includes(cleanFamily.toLowerCase())) {
        this.loadedFonts.add(fontId);
        return;
      }
      try {
        await this.loadFromGoogleFonts(cleanFamily, item.weight);
        this.loadedFonts.add(fontId);
      } catch (err) {
        console.warn(`Failed to dynamically load Google Font ${fontId}`, err);
      }
      return;
    }

    const result = await this.fetchFontBuffer(cleanFamily, item.weight, item.url);
    if (!result) return;
    const { buffer } = result;
    if (!buffer) return;

    // Inject into document
    try {
      const fontFace = new FontFace(cleanFamily, buffer, { weight: String(item.weight) });
      const loadedFace = await fontFace.load();
      (document.fonts as any).add(loadedFace);
      this.loadedFonts.add(fontId);
    } catch (e) {
      console.warn(`Failed to inject FontFace for ${fontId}`, e);
    }
  }

  private async loadFromGoogleFonts(family: string, weight: number): Promise<void> {
    if (!document.getElementById('gfonts-preconnect')) {
      const preconnect1 = document.createElement('link');
      preconnect1.id = 'gfonts-preconnect';
      preconnect1.rel = 'preconnect';
      preconnect1.href = 'https://fonts.googleapis.com';
      document.head.appendChild(preconnect1);

      const preconnect2 = document.createElement('link');
      preconnect2.rel = 'preconnect';
      preconnect2.href = 'https://fonts.gstatic.com';
      preconnect2.setAttribute('crossorigin', 'anonymous');
      document.head.appendChild(preconnect2);
    }

    const fontId = `gfont-${family.replace(/\s+/g, '-').toLowerCase()}-${weight}`;
    if (document.getElementById(fontId)) return;

    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.id = fontId;
      link.rel = 'stylesheet';
      const formattedFamily = family.replace(/\s+/g, '+');
      link.href = `https://fonts.googleapis.com/css2?family=${formattedFamily}:wght@${weight}&display=swap`;
      
      link.onload = () => {
        document.fonts.load(`${weight} 16px "${family}"`)
          .then(() => resolve())
          .catch(() => resolve());
      };
      link.onerror = () => {
        resolve();
      };
      document.head.appendChild(link);
    });
  }

  async fetchFontBuffer(
    fontFamily: string,
    weight: number,
    url: string,
  ): Promise<{ buffer: ArrayBuffer; format: string } | null> {
    
    const cacheKey = `${fontFamily}::${weight}::${url}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    const opfs = await getOpfsFontCache();
    if (opfs) {
      try {
        const fileHandle = await opfs.getFileHandle(cacheKey);
        const file = await fileHandle.getFile();
        const buffer = await file.arrayBuffer();
        return { buffer, format: detectFontFormat(buffer) };
      } catch {}
    } else if (memoryFallbackCache.has(cacheKey)) {
      const buffer = memoryFallbackCache.get(cacheKey)!;
      return { buffer, format: detectFontFormat(buffer) };
    }

    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let buffer = await response.arrayBuffer();

      const format = detectFontFormat(buffer);
      if (format === 'woff2') {
        try {
          buffer = await decompressWoff2(buffer);
        } catch (err) {
          console.error(`Failed to decompress WOFF2 for ${fontFamily}:`, err);
          return null;
        }
      }

      if (opfs) {
        try {
          const fileHandle = await opfs.getFileHandle(cacheKey, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(buffer);
          await writable.close();
        } catch (err) {}
      } else {
        memoryFallbackCache.set(cacheKey, buffer.slice(0));
      }

      return { buffer, format: detectFontFormat(buffer) };
    } catch (err) {
      console.warn(`Failed to fetch font "${fontFamily}" from ${url}:`, err);
      return null;
    }
  }

  clearCache(): void {
    memoryFallbackCache.clear();
    this.loadedFonts.clear();
  }
}
