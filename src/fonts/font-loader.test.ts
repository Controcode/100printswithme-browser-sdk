import { afterEach, expect, it, vi } from 'vitest';
import { FontLoader, fontDescriptor } from './font-loader';

afterEach(() => {
  vi.unstubAllGlobals();
  new FontLoader().clearCache();
});

it('preserves WOFF2 bytes for browser FontFace loading', async () => {
  const bytes = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]);
  vi.stubGlobal('fetch', async () => new Response(bytes));
  const result = await new FontLoader().fetchFontBuffer('FixtureFont', 700, 'https://example.test/font.woff2');
  expect(result?.format).toBe('woff2');
  expect(new Uint8Array(result!.buffer)).toEqual(bytes);
});

it('uses a valid quoted descriptor including style and weight', () => {
  expect(fontDescriptor({ family: 'Playfair Display', weight: 700, style: 'italic' }, 32))
    .toBe('italic 700 32px "Playfair Display"');
});

it('waits for an exact face and reuses the family/weight/style/source cache entry', async () => {
  let fetches = 0;
  const added: any[] = [];
  vi.stubGlobal('fetch', async () => {
    fetches++;
    await new Promise(resolve => setTimeout(resolve, 20));
    return new Response(new Uint8Array([0, 1, 0, 0]));
  });
  class FakeFontFace {
    status = 'unloaded';
    constructor(public family: string, public source: ArrayBuffer, public descriptors: any) {}
    async load() { this.status = 'loaded'; return this; }
  }
  vi.stubGlobal('FontFace', FakeFontFace);
  vi.stubGlobal('document', {
    fonts: {
      add: (face: any) => added.push(face),
      load: async () => added,
      check: () => true,
      ready: Promise.resolve(),
    },
  });

  const loader = new FontLoader();
  const requirement = { family: 'Fixture Font', weight: 700, style: 'italic' as const, url: 'https://cdn.test/font.ttf' };
  const loading = loader.loadFonts([requirement]);
  expect(added).toHaveLength(0);
  await loading;
  await loader.loadFonts([requirement]);
  expect(fetches).toBe(1);
  expect(added[0].descriptors).toEqual({ weight: '700', style: 'italic' });
});

it('throws FONT_LOAD_FAILED instead of silently rendering a fallback', async () => {
  vi.stubGlobal('fetch', async () => new Response('', { status: 503 }));
  await expect(new FontLoader().loadFonts([
    { family: 'Missing Font', weight: 400, style: 'normal', url: 'https://cdn.test/missing.ttf' },
  ])).rejects.toMatchObject({
    code: 'FONT_LOAD_FAILED',
    details: { family: 'Missing Font', weight: 400, style: 'normal', source: 'https://cdn.test/missing.ttf' },
  });
});

function stubBrowserFonts() {
  const faces: any[] = [];
  class FakeFontFace {
    status = 'unloaded';
    constructor(public family: string, public source: ArrayBuffer, public descriptors: any) {}
    async load() { this.status = 'loaded'; return this; }
  }
  vi.stubGlobal('FontFace', FakeFontFace);
  vi.stubGlobal('document', {
    fonts: {
      add: (face: any) => faces.push(face),
      load: async () => faces,
      check: () => true,
      ready: Promise.resolve(),
    },
    getElementById: () => null,
    createElement: () => ({ remove() {} }),
    head: { appendChild(link: any) { queueMicrotask(() => link.onerror?.()); } },
  });
  return faces;
}

it('loads Bebas Neue 700 from the platform asset without touching Google Fonts', async () => {
  const faces = stubBrowserFonts();
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    urls.push(url);
    return new Response(new Uint8Array([0, 1, 0, 0]));
  });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const loader = new FontLoader();
  try {
    await loader.loadFonts([{ family: 'Bebas Neue', weight: 700, style: 'normal' }]);
    await loader.loadFonts([{ family: 'Bebas Neue', weight: 700, style: 'normal' }]);
    expect(urls).toEqual(['https://www.100printswith.me/fonts/BebasNeue.ttf']);
    expect(faces[0].family).toBe('Bebas Neue');
    expect(faces[0].descriptors).toEqual({ weight: '400', style: 'normal' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Using "Bebas Neue" 400 normal'));
  } finally { warn.mockRestore(); }
});

it('registers a variable face once for simultaneous weights', async () => {
  const faces = stubBrowserFonts();
  let fetches = 0;
  vi.stubGlobal('fetch', async () => {
    fetches++;
    await new Promise(resolve => setTimeout(resolve, 10));
    return new Response(new Uint8Array([0, 1, 0, 0]));
  });
  await new FontLoader().loadFonts([
    { family: 'Inter', weight: 400, style: 'normal' },
    { family: 'Inter', weight: 700, style: 'normal' },
  ]);
  expect(fetches).toBe(1);
  expect(faces).toHaveLength(1);
  expect(faces[0].descriptors.weight).toBe('100 900');
});

it('keeps an explicit uploaded source ahead of the platform registry', async () => {
  const faces = stubBrowserFonts();
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    urls.push(url);
    return new Response(new Uint8Array([0, 1, 0, 0]));
  });
  await new FontLoader().loadFonts([{ family: 'Inter', weight: 700, style: 'italic',
    url: 'https://uploads.test/my-font.ttf' }]);
  expect(urls).toEqual(['https://uploads.test/my-font.ttf']);
  expect(faces[0].descriptors).toEqual({ weight: '700', style: 'italic' });
});

it('uses a successful Google face for an unknown family', async () => {
  const faces = stubBrowserFonts();
  const links: string[] = [];
  (document.head as any).appendChild = (link: any) => {
    links.push(link.href);
    faces.push({ family: 'Other Family', status: 'loaded' });
    queueMicrotask(() => link.onload?.());
  };
  const loader = new FontLoader();
  const genericFallbacks = await loader.loadFonts([{ family: 'Other Family', weight: 700, style: 'italic' }]);
  expect(links).toEqual(['https://fonts.googleapis.com/css2?family=Other+Family:ital,wght@1,700&display=block']);
  expect(genericFallbacks.size).toBe(0);
});

it('tries Google only for unknown fonts, then uses Inter when Google fails', async () => {
  const faces = stubBrowserFonts();
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    urls.push(url);
    return new Response(new Uint8Array([0, 1, 0, 0]));
  });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const loader = new FontLoader();
    const genericFallbacks = await loader.loadFonts([{ family: 'Completely Unknown Family', weight: 700, style: 'italic' }]);
    expect(urls).toEqual(['https://www.100printswith.me/fonts/Inter-Italic.ttf']);
    expect(faces[0].family).toBe('Completely Unknown Family');
    expect(faces[0].descriptors).toEqual({ weight: '100 900', style: 'italic' });
    expect(genericFallbacks.size).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Using fallback "Inter"'));
  } finally { warn.mockRestore(); }
});

it('uses browser sans-serif if the platform default also fails, and retries later', async () => {
  stubBrowserFonts();
  let requests = 0;
  vi.stubGlobal('fetch', async () => { requests++; return new Response('', { status: 404 }); });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const loader = new FontLoader();
    const request = { family: 'Bebas Neue', weight: 700, style: 'normal' as const };
    expect(await loader.loadFonts([request])).toEqual(new Set(['bebas neue']));
    expect(await loader.loadFonts([request])).toEqual(new Set(['bebas neue']));
    expect(requests).toBe(4); // Bebas and Inter on both attempts.
  } finally { warn.mockRestore(); }
});
