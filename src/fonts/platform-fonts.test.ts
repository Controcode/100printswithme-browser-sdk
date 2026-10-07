import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_FONTS, platformWeightDescriptor, resolvePlatformFont } from './platform-fonts';

describe('platform font registry', () => {
  it('matches every frontend @font-face declaration and asset', () => {
    const frontend = resolve(process.cwd(), '../100Prints');
    const css = readFileSync(resolve(frontend, 'src/index.css'), 'utf8');
    const declared = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(([, rule]) => ({
      family: /font-family:\s*'([^']+)'/.exec(rule)?.[1],
      file: /src:\s*url\('\/fonts\/([^']+)'\)/.exec(rule)?.[1],
      weight: /font-weight:\s*([^;]+);/.exec(rule)?.[1].trim(),
      style: /font-style:\s*([^;]+);/.exec(rule)?.[1].trim(),
    }));
    const registered = Object.entries(PLATFORM_FONTS).flatMap(([family, variants]) => variants.map(variant => ({
      family, file: variant.file, weight: platformWeightDescriptor(variant), style: variant.style,
    })));
    expect(registered).toEqual(declared);
    for (const { file } of registered) expect(existsSync(resolve(frontend, 'public/fonts', file!))).toBe(true);
  });

  it('selects exact and same-family variants without inventing files', () => {
    for (const [family, stem] of [
      ['Inter', 'Inter'], ['Montserrat', 'Montserrat'],
      ['Merriweather', 'Merriweather'], ['JetBrains Mono', 'JetBrainsMono'],
    ]) {
      expect(resolvePlatformFont(family, 400, 'normal')).toMatchObject({
        url: `https://www.100printswith.me/fonts/${stem}.ttf`, exact: true,
      });
      expect(resolvePlatformFont(family, 700, 'italic')).toMatchObject({
        url: `https://www.100printswith.me/fonts/${stem}-Italic.ttf`,
        exact: family !== 'Merriweather',
      });
    }
    expect(resolvePlatformFont('Bebas Neue', 700, 'normal')).toMatchObject({
      url: 'https://www.100printswith.me/fonts/BebasNeue.ttf', exact: false,
      variant: { weight: 400, style: 'normal' },
    });
    expect(resolvePlatformFont('Bebas Neue', 400, 'italic')).toMatchObject({
      variant: { weight: 400, style: 'normal' }, exact: false,
    });
    for (const [weight, style, file] of [
      [400, 'normal', 'PlayfairDisplay.ttf'],
      [700, 'normal', 'PlayfairDisplay-Bold.ttf'],
      [400, 'italic', 'PlayfairDisplay-Italic.ttf'],
      [700, 'italic', 'PlayfairDisplay-BoldItalic.ttf'],
    ] as const) {
      expect(resolvePlatformFont('Playfair Display', weight, style)).toMatchObject({
        url: `https://www.100printswith.me/fonts/${file}`, exact: true,
      });
    }
    expect(resolvePlatformFont('Playfair Display', 600, 'normal')).toMatchObject({
      variant: { weight: 700, style: 'normal' }, exact: false,
    });
    expect(resolvePlatformFont('Completely Unknown Family', 400, 'normal')).toBeNull();
  });
});
