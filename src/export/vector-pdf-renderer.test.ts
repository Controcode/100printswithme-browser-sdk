import { describe, expect, it, vi } from 'vitest';
vi.mock('konva', () => ({ default: {} }));
import { renderVectorPdf } from './vector-pdf-renderer';
import type { DocumentTemplate, Layer } from '../types';

describe('vector PDF pages', () => {
  it('keeps shapes as PDF drawing commands across front and back', async () => {
    const shape: Layer = {
      id: 'rect', type: 'shape', x: 10, y: 20, width: 50, height: 30,
      color: '#ff0000', borderRadius: 5, visible: true,
    };
    const template = {
      id: 'test', name: 'Test', type: 'id-card', backgroundColor: '#ffffff', accentColor: '#000000',
      dimensions: { width: 200, height: 100, label: 'Test' },
      frontLayers: [shape], backLayers: [shape],
    } as DocumentTemplate;
    const blob = await renderVectorPdf(template, [
      { layers: template.frontLayers, rowData: {}, assetMap: {} },
      { layers: template.backLayers!, rowData: {}, assetMap: {} },
    ], 2);
    expect(blob.type).toBe('application/pdf');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.subarray(0, 8))).toContain('%PDF-');
    const pdf = new TextDecoder('latin1').decode(bytes);
    expect((pdf.match(/\/Type \/Page\b/g) || []).length).toBe(2);
    expect(pdf).toContain('/MediaBox [0 0 150 75]');
    expect(pdf).not.toContain('/Subtype /Image');
  });
});
