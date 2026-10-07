import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('konva', () => ({ default: {} }));
import { RenderController } from '../runtime/render-controller';
import { HundredPrints } from './hundred-prints';
import { HundredPrintsError } from './errors';
import { createImageResult, createPdfResult } from './results';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('HundredPrints v2 API', () => {
  it('validates publishable-key configuration', () => {
    expect(() => new HundredPrints({ publishableKey: '' })).toThrowError(HundredPrintsError);
    expect(() => new HundredPrints({ publishableKey: 'sk_secret' })).toThrow(/Secret keys/);
    expect(() => new HundredPrints({ publishableKey: 'pk_test_xxx' })).not.toThrow();
  });

  it('normalizes convenience methods through the shared controller', async () => {
    const pngResult = { format: 'png', side: 'back' } as any;
    const pdfResult = { format: 'pdf', pages: 2 } as any;
    const render = vi.spyOn(RenderController.prototype, 'render')
      .mockResolvedValueOnce(pngResult)
      .mockResolvedValueOnce(pdfResult);
    const hp = new HundredPrints({ publishableKey: 'pk_test_xxx' });

    await expect(hp.png({ templateId: 'tpl', data: { Name: 'Ada' }, side: 'back', quality: 'high' })).resolves.toBe(pngResult);
    await expect(hp.pdf({ templateId: 'tpl', includeBack: true })).resolves.toBe(pdfResult);
    expect(render).toHaveBeenNthCalledWith(1, {
      templateId: 'tpl', data: { Name: 'Ada' },
      output: { format: 'png', side: 'back', quality: 'high' },
    });
    expect(render).toHaveBeenNthCalledWith(2, {
      templateId: 'tpl', data: undefined,
      output: { format: 'pdf', includeBack: true, quality: undefined },
    });
  });

  it('rejects invalid generic combinations for JavaScript callers', async () => {
    const hp = new HundredPrints({ publishableKey: 'pk_test_xxx' });
    await expect(hp.render({ templateId: 'tpl', output: { format: 'png' } } as any)).rejects.toMatchObject({ code: 'UNSUPPORTED_SIDE' });
    await expect(hp.render({ templateId: 'tpl', output: { format: 'png', side: 'front', includeBack: true } } as any)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(hp.render({ templateId: 'tpl', output: { format: 'pdf', side: 'back' } } as any)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(hp.render({ templateId: '', output: { format: 'pdf' } } as any)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('returns reusable result helpers and makes revoke idempotent', () => {
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: revoke });
    const anchors: any[] = [];
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        const anchor = { href: '', download: '', style: {}, click: vi.fn(), remove: vi.fn() };
        anchors.push(anchor);
        return anchor;
      }),
      body: { appendChild: vi.fn() },
    });
    const image = createImageResult('png', new Blob(['image']), 200, 100, 'front');
    expect(image).toMatchObject({ format: 'png', url: 'blob:test', width: 200, height: 100, side: 'front' });
    image.download();
    expect(anchors[0].download).toBe('render.png');
    expect(anchors[0].click).toHaveBeenCalledOnce();
    image.revoke();
    image.revoke();
    expect(revoke).toHaveBeenCalledTimes(1);

    const pdf = createPdfResult('vector-pdf', new Blob(['pdf']), 2);
    expect(pdf).toMatchObject({ format: 'vector-pdf', pages: 2 });
    pdf.download();
    expect(anchors[1].download).toBe('render.pdf');
  });

  it('renders an explicit image side to an img target', async () => {
    class FakeImage { src = ''; }
    const image = new FakeImage();
    vi.stubGlobal('HTMLImageElement', FakeImage);
    vi.stubGlobal('document', { querySelector: vi.fn(() => image) });
    const result = { format: 'jpeg', side: 'front', url: 'blob:image' } as any;
    vi.spyOn(RenderController.prototype, 'render').mockResolvedValue(result);
    const hp = new HundredPrints({ publishableKey: 'pk_test_xxx' });

    await expect(hp.renderTo('#badge', {
      templateId: 'tpl', output: { format: 'jpeg', side: 'front' },
    })).resolves.toBe(result);
    expect(image.src).toBe('blob:image');
  });

  it('rejects missing, non-image, and PDF renderTo targets', async () => {
    class FakeImage { src = ''; }
    vi.stubGlobal('HTMLImageElement', FakeImage);
    vi.stubGlobal('document', { querySelector: vi.fn(() => null) });
    const hp = new HundredPrints({ publishableKey: 'pk_test_xxx' });
    await expect(hp.renderTo('#missing', {
      templateId: 'tpl', output: { format: 'png', side: 'front' },
    })).rejects.toMatchObject({ code: 'INVALID_TARGET' });
    (document.querySelector as any).mockReturnValue({ tagName: 'DIV' });
    await expect(hp.renderTo('#not-an-image', {
      templateId: 'tpl', output: { format: 'png', side: 'front' },
    })).rejects.toMatchObject({ code: 'INVALID_TARGET' });
    await expect(hp.renderTo('#badge', {
      templateId: 'tpl', output: { format: 'pdf' },
    } as any)).rejects.toMatchObject({ code: 'INVALID_TARGET' });
  });
});
