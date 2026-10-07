import { RenderController, validateOutput } from '../runtime/render-controller';
import { HundredPrintsError } from './errors';
import type {
  DownloadInput,
  HundredPrintsOptions,
  ImageRenderInput,
  ImageRenderRequest,
  ImageRenderResult,
  PdfRenderInput,
  PdfRenderRequest,
  PdfRenderResult,
  PublicRenderResult,
  RenderInput,
} from './types';

export class HundredPrints {
  private readonly controller: RenderController;

  constructor(options: HundredPrintsOptions) {
    if (!options || typeof options.publishableKey !== 'string' || !options.publishableKey.trim()) {
      throw new HundredPrintsError('AUTH_INVALID', 'publishableKey is required.');
    }
    if (/^sk_/i.test(options.publishableKey)) {
      throw new HundredPrintsError('AUTH_INVALID', 'Secret keys must not be used in the browser SDK. Use a publishable key.');
    }
    this.controller = new RenderController(options);
  }

  render(input: ImageRenderRequest): Promise<ImageRenderResult>;
  render(input: PdfRenderRequest): Promise<PdfRenderResult>;
  render(input: RenderInput): Promise<PublicRenderResult> {
    return this.controller.render(input);
  }

  png(input: ImageRenderInput): Promise<ImageRenderResult> {
    return this.render({
      templateId: input.templateId,
      data: input.data,
      output: { format: 'png', side: input.side, quality: input.quality },
    });
  }

  jpeg(input: ImageRenderInput): Promise<ImageRenderResult> {
    return this.render({
      templateId: input.templateId,
      data: input.data,
      output: { format: 'jpeg', side: input.side, quality: input.quality },
    });
  }

  pdf(input: PdfRenderInput): Promise<PdfRenderResult> {
    return this.render({
      templateId: input.templateId,
      data: input.data,
      output: { format: 'pdf', includeBack: input.includeBack, quality: input.quality },
    });
  }

  vectorPdf(input: PdfRenderInput): Promise<PdfRenderResult> {
    return this.render({
      templateId: input.templateId,
      data: input.data,
      output: { format: 'vector-pdf', includeBack: input.includeBack, quality: input.quality },
    });
  }

  async renderTo(target: string | HTMLImageElement, input: ImageRenderRequest): Promise<ImageRenderResult> {
    validateOutput(input?.output);
    if (input.output.format !== 'png' && input.output.format !== 'jpeg') {
      throw new HundredPrintsError('INVALID_TARGET', 'renderTo() supports PNG and JPEG output only.');
    }
    const element = this.resolveImageTarget(target);
    const result = await this.render(input);
    element.src = result.url;
    return result;
  }

  async download(input: DownloadInput): Promise<void> {
    const { filename, ...renderInput } = input;
    const result = await this.controller.render(renderInput);
    try {
      result.download(filename);
    } finally {
      // The one-shot helper owns its temporary URL. Delay cleanup until the
      // browser has consumed the synthetic anchor click.
      setTimeout(() => result.revoke(), 0);
    }
  }

  private resolveImageTarget(target: string | HTMLImageElement): HTMLImageElement {
    if (typeof document === 'undefined') {
      throw new HundredPrintsError('INVALID_TARGET', 'renderTo() requires a browser document.');
    }
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element) {
      throw new HundredPrintsError('INVALID_TARGET', `No element matches ${JSON.stringify(target)}.`);
    }
    if (typeof HTMLImageElement === 'undefined' || !(element instanceof HTMLImageElement)) {
      throw new HundredPrintsError('INVALID_TARGET', 'renderTo() target must be an <img> element.');
    }
    return element;
  }
}
