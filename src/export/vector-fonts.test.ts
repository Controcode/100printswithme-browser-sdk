import { afterEach, expect, it, vi } from 'vitest';
import { clearFontCache, fetchFontBuffer } from './vector-fonts';

afterEach(() => {
  clearFontCache();
  vi.unstubAllGlobals();
});

it('resolves a platform font without requesting Google Fonts', async () => {
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (input: string) => {
    urls.push(String(input));
    return new Response(new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0]));
  });

  const font = await fetchFontBuffer('Inter', 700, 'normal');
  expect(font?.buffer.byteLength).toBe(8);
  expect(urls).toEqual(['https://www.100printswith.me/fonts/Inter.ttf']);
});

it('uses Google Fonts for a family outside the platform registry', async () => {
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (input: string) => {
    urls.push(String(input));
    if (String(input).startsWith('https://fonts.googleapis.com/')) {
      return new Response('@font-face { src: url(https://fonts.gstatic.com/other.ttf) format("truetype"); }');
    }
    return new Response(new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0]));
  });
  const font = await fetchFontBuffer('Other Family', 700, 'normal');
  expect(font?.buffer.byteLength).toBe(8);
  expect(urls).toEqual([
    'https://fonts.googleapis.com/css2?family=Other+Family:wght@700&display=swap',
    'https://fonts.gstatic.com/other.ttf',
  ]);
});

it('embeds the platform default when an unknown web font cannot be resolved', async () => {
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (input: string) => {
    urls.push(String(input));
    if (String(input).startsWith('https://fonts.googleapis.com/')) return new Response('', { status: 404 });
    return new Response(new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0]));
  });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const font = await fetchFontBuffer('Completely Unknown Family', 700, 'normal');
    expect(font?.buffer.byteLength).toBe(8);
    expect(urls).toEqual([
      'https://fonts.googleapis.com/css2?family=Completely+Unknown+Family:wght@700&display=swap',
      'https://www.100printswith.me/fonts/Inter.ttf',
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Using fallback "Inter"'));
  } finally { warn.mockRestore(); }
});

it('retries a failed Google lookup on a later vector render', async () => {
  let googleAttempts = 0;
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (input: string) => {
    const url = String(input);
    urls.push(url);
    if (url.startsWith('https://fonts.googleapis.com/')) {
      googleAttempts++;
      return googleAttempts === 1
        ? new Response('', { status: 503 })
        : new Response('@font-face { src: url(https://fonts.gstatic.com/retry.ttf) format("truetype"); }');
    }
    return new Response(new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0]));
  });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await fetchFontBuffer('Retry Family', 700, 'normal');
    await fetchFontBuffer('Retry Family', 700, 'normal');
    expect(googleAttempts).toBe(2);
    expect(urls).toContain('https://fonts.gstatic.com/retry.ttf');
  } finally { warn.mockRestore(); }
});
