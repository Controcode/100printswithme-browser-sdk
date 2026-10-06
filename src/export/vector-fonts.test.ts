import { afterEach, expect, it, vi } from 'vitest';
import { clearFontCache, fetchFontBuffer } from './vector-fonts';

afterEach(() => {
  clearFontCache();
  vi.unstubAllGlobals();
});

it('resolves a web font when the SDK template has no direct font URL', async () => {
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (input: string) => {
    urls.push(String(input));
    if (String(input).startsWith('https://fonts.googleapis.com/')) {
      return new Response('@font-face { src: url(https://fonts.gstatic.com/inter.ttf) format("truetype"); }');
    }
    return new Response(new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0]));
  });

  const font = await fetchFontBuffer('Inter', 700, 'normal');
  expect(font?.buffer.byteLength).toBe(8);
  expect(urls).toEqual([
    'https://fonts.googleapis.com/css2?family=Inter:wght@700&display=swap',
    'https://fonts.gstatic.com/inter.ttf',
  ]);
});
