import { describe, expect, it } from 'vitest';
import { getBorderBox } from './konva-helpers';
import { fitTextSize, isDynamicTextLayer } from './smart-text-sizing';
import { generateTextSvgString } from '../utils/text-svg-generator';
import { generateTableSvg } from '../utils/generate-table-svg';
import { generateChartSvg } from '../utils/generate-chart-svg';
import type { Layer } from '../types';

const base = { id: 'layer-1', x: 0, y: 0, width: 200, height: 40 } as const;

describe('frontend renderer math in the SDK', () => {
  it('places centered strokes inside the editor border box', () => {
    const box = getBorderBox({ ...base, type: 'shape', borderWidth: 10, borderRadius: 20 }, 200, 40);
    expect(box).toEqual({ borderWidth: 10, width: 190, height: 30, cornerRadius: 15 });
    expect(getBorderBox({ ...base, type: 'frame' }, 200, 40).cornerRadius).toBe(9999);
  });

  it('fits resolved multiline dynamic text within both dimensions', () => {
    const layer = { ...base, type: 'text', content: '{{name}}', smartSizing: true,
      fontSize: 32, minFontSize: 8, lineHeight: 1.2 } as Layer;
    expect(isDynamicTextLayer(layer)).toBe(true);
    const size = fitTextSize(layer, 'Long name\nSecond line', (value, fontSize) => value.length * fontSize * 0.5);
    expect(size).toBeLessThan(32);
    expect(size).toBeGreaterThanOrEqual(8);
    expect(fitTextSize({ ...layer, smartSizing: false }, 'Long name', () => 10000)).toBe(32);
  });

  it('keeps curved SVG text geometry within a short layer', () => {
    const layer = { ...base, type: 'textsvg', content: 'Curved', pathType: 'arc-up',
      curvature: 80, fontSize: 18, fontFamily: 'Arial' } as Layer;
    const svg = generateTextSvgString(layer, 'Curved', 200, 40);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Curved');
    expect(svg).not.toContain('Q 100,-');
  });

  it('preserves table and chart font stacks in generated SVG', () => {
    const table = { ...base, type: 'table-svg', tableData: {
      rows: 1, cols: 1, colWidths: [200], rowHeights: [40], borderColor: '#000', borderWidth: 1,
      cells: [[{ content: 'A', bg: '#fff', fontSize: 14, fontFamily: 'Arial, sans-serif',
        fontWeight: 'normal', color: '#000', textAlign: 'left', verticalAlign: 'middle', padding: 2 }]],
    } } as Layer;
    expect(generateTableSvg(table)).toContain('font-family="Arial, sans-serif"');

    const chart = { ...base, type: 'chart-svg', chartData: {
      subtype: 'bar', categories: ['A'], series: [{ label: 'Sales', values: ['5'], color: '#f00' }],
      colors: ['#f00'], showLabels: true, showLegend: false, showGrid: false, showValues: true,
      fontFamily: 'Arial, sans-serif',
    } } as Layer;
    expect(generateChartSvg(chart)).toContain('Arial, sans-serif');
  });
});
