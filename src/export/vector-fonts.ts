import { getUsWeightClass, instanceFontAtWeight } from './font-instancer';
import { PLATFORM_DEFAULT_FONT, resolvePlatformFont } from '../fonts/platform-fonts';

export interface VectorFontManifestItem {
  family: string;
  weight: number;
  style?: 'normal' | 'italic';
  url?: string;
}

const cache = new Map<string, ArrayBuffer>();
const preparedCache = new Map<string, { buffer: ArrayBuffer; instanced: boolean }>();
const webFontUrls = new Map<string, Promise<string | null>>();

async function resolveWebFontUrl(family: string, weight: string | number, style: string): Promise<string | null> {
  const cleanFamily = family.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  if (!cleanFamily || /^(arial|helvetica|times|times new roman|courier|courier new|serif|sans-serif|monospace)$/i.test(cleanFamily)) return null;
  const numericWeight = Number(weight) || (String(weight).toLowerCase() === 'bold' ? 700 : 400);
  const key = `${cleanFamily}::${numericWeight}::${style}`;
  let request = webFontUrls.get(key);
  if (!request) {
    request = (async () => {
      try {
        const familyQuery = encodeURIComponent(cleanFamily).replace(/%20/g, '+');
        const axis = style === 'italic' ? `ital,wght@1,${numericWeight}` : `wght@${numericWeight}`;
        const response = await fetch(`https://fonts.googleapis.com/css2?family=${familyQuery}:${axis}&display=swap`, { mode: 'cors' });
        if (!response.ok) return null;
        const css = await response.text();
        const urls = [...css.matchAll(/url\(([^)]+)\)\s*format\(['"]?(?:woff2|truetype|opentype)/gi)];
        return urls.length ? urls[urls.length - 1][1].replace(/^['"]|['"]$/g, '') : null;
      } catch {
        return null;
      }
    })();
    webFontUrls.set(key, request);
    void request.then(url => {
      if (!url && webFontUrls.get(key) === request) webFontUrls.delete(key);
    });
  }
  return request;
}

export async function fetchFontBuffer(
  family: string,
  weight: string | number,
  style: string,
  fontUrl?: string | null,
  options?: { instanceVariableFonts?: boolean },
): Promise<{ buffer: ArrayBuffer; embedKey: string; syntheticOblique: boolean; syntheticBold: boolean } | null> {
  const numericWeight = Number(weight) || (String(weight).toLowerCase() === 'bold' ? 700 : 400);
  const platform = fontUrl ? null : resolvePlatformFont(family.split(',')[0].trim().replace(/^['"]|['"]$/g, ''),
    numericWeight, style === 'italic' ? 'italic' : 'normal');
  let sourceUrl = fontUrl || platform?.url || await resolveWebFontUrl(family, weight, style);
  const loadSource = async (url: string): Promise<ArrayBuffer | null> => {
    const cached = cache.get(url);
    if (cached) return cached;
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) return null;
      const buffer = await response.arrayBuffer();
      // PDFKit's fontkit accepts WOFF2 directly. Keep its table structure intact.
      cache.set(url, buffer);
      return buffer;
    } catch {
      return null;
    }
  };
  let buffer = sourceUrl ? await loadSource(sourceUrl) : null;
  if (!buffer && !fontUrl) {
    const fallback = resolvePlatformFont(PLATFORM_DEFAULT_FONT, numericWeight,
      style === 'italic' ? 'italic' : 'normal');
    if (fallback && fallback.url !== sourceUrl) {
      buffer = await loadSource(fallback.url);
      if (buffer) {
        console.warn(`[100Prints] Could not embed "${family}". Using fallback "${PLATFORM_DEFAULT_FONT}" in vector PDF.`);
        sourceUrl = fallback.url;
      }
    }
  }
  if (!buffer || !sourceUrl) return null;
  const embedKey = `${sourceUrl}::${numericWeight}::${options?.instanceVariableFonts ? 'pin' : 'raw'}`;
  let preparedEntry = preparedCache.get(embedKey);
  if (!preparedEntry) {
    const pinned = options?.instanceVariableFonts ? await instanceFontAtWeight(buffer, numericWeight) : null;
    preparedEntry = { buffer: pinned || buffer, instanced: !!pinned };
    preparedCache.set(embedKey, preparedEntry);
  }
  const { buffer: prepared, instanced } = preparedEntry;
  const actualWeight = getUsWeightClass(prepared);
  // A regular static face may need browser-like synthetic bold and italic.
  return {
    buffer: prepared.slice(0), embedKey,
    syntheticOblique: style === 'italic' && !/italic|oblique|ital,wght@1/i.test(sourceUrl),
    syntheticBold: numericWeight >= 600 && !instanced && actualWeight !== null && actualWeight < 600,
  };
}

export function clearFontCache(): void {
  cache.clear();
  preparedCache.clear();
  webFontUrls.clear();
}
