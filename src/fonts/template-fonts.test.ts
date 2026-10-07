import { describe, expect, it } from 'vitest';
import { collectTemplateFonts } from './template-fonts';

describe('collectTemplateFonts', () => {
  it('keeps family, weight, style, and source distinct while deduplicating layers', () => {
    const template = {
      frontLayers: [
        { id: 'a', type: 'text', visible: true, fontFamily: 'Playfair Display, serif', fontWeight: '400', fontStyle: 'normal', content: 'Roman' },
        { id: 'b', type: 'text', visible: true, fontFamily: 'Playfair Display', fontWeight: 'bold', fontStyle: 'italic', content: 'Italic' },
        { id: 'c', type: 'text', visible: true, fontFamily: 'Playfair Display', fontWeight: 400, content: 'Duplicate' },
        { id: 'd', type: 'text', visible: true, fontFamily: 'Uploaded Face', fontWeight: 500, fontUrl: 'https://cdn.test/custom.woff2' },
        { id: 'table', type: 'table-svg', visible: true, tableData: { cells: [[
          { fontFamily: 'Inter', fontWeight: 'normal', fontStyle: 'normal', content: 'Regular' },
          { fontFamily: 'Inter', fontWeight: '700', fontStyle: 'normal', content: 'Bold' },
        ]] } },
      ],
      backLayers: [],
    } as any;
    const manifest = [
      { family: 'Playfair Display', weight: 400, style: 'normal' as const, url: 'roman.ttf' },
      { family: 'Playfair Display', weight: 700, style: 'italic' as const, url: 'bold-italic.ttf' },
    ];

    expect(collectTemplateFonts(template, manifest).map(({ family, weight, style, url }) => ({ family, weight, style, url })))
      .toEqual([
        { family: 'Playfair Display', weight: 400, style: 'normal', url: 'roman.ttf' },
        { family: 'Playfair Display', weight: 700, style: 'italic', url: 'bold-italic.ttf' },
        { family: 'Uploaded Face', weight: 500, style: 'normal', url: 'https://cdn.test/custom.woff2' },
        { family: 'Inter', weight: 400, style: 'normal', url: undefined },
        { family: 'Inter', weight: 700, style: 'normal', url: undefined },
      ]);
  });

  it('keeps an explicit manifest source for a requested italic face', () => {
    const template = { frontLayers: [{ id: 'custom', type: 'text', fontFamily: 'Uploaded Face',
      fontWeight: 700, fontStyle: 'italic', content: 'Custom' }], backLayers: [] } as any;
    expect(collectTemplateFonts(template, [{ family: 'Uploaded Face', weight: 400,
      url: 'https://cdn.test/uploaded.ttf' }])[0]).toMatchObject({
      family: 'Uploaded Face', weight: 700, style: 'italic', url: 'https://cdn.test/uploaded.ttf',
    });
  });
});
