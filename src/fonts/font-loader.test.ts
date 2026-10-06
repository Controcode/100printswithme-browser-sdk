import { afterEach, expect, it, vi } from 'vitest';
import { FontLoader } from './font-loader';

afterEach(() => vi.unstubAllGlobals());

it('preserves WOFF2 bytes for browser FontFace loading', async () => {
  const bytes = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]);
  vi.stubGlobal('fetch', async () => new Response(bytes));
  const result = await new FontLoader().fetchFontBuffer('FixtureFont', 700, 'https://example.test/font.woff2');
  expect(result?.format).toBe('woff2');
  expect(new Uint8Array(result!.buffer)).toEqual(bytes);
});
