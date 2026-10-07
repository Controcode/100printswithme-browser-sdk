import { BrowserSDK } from '../browser-sdk';
import { HundredPrintsError } from '../public/errors';
import { createImageResult, createPdfResult } from '../public/results';
import type {
  HundredPrintsOptions,
  ImageRenderFormat,
  ImageRenderResult,
  PdfRenderFormat,
  PdfRenderResult,
  PublicRenderResult,
  RenderInput,
  RenderOutput,
  RenderQuality,
  RenderSide,
} from '../public/types';

const IMAGE_FORMATS = new Set<ImageRenderFormat>(['png', 'jpeg']);
const PDF_FORMATS = new Set<PdfRenderFormat>(['pdf', 'vector-pdf']);
const QUALITIES = new Set<RenderQuality>(['draft', 'standard', 'high', 'ultra']);
const SIDES = new Set<RenderSide>(['front', 'back']);

function validateBaseInput(input: unknown): asserts input is RenderInput {
  if (!input || typeof input !== 'object') {
    throw new HundredPrintsError('INVALID_INPUT', 'A render request object is required.');
  }
  const request = input as Record<string, any>;
  if (typeof request.templateId !== 'string' || !request.templateId.trim()) {
    throw new HundredPrintsError('INVALID_INPUT', 'templateId is required.');
  }
  if (request.data !== undefined && (!request.data || typeof request.data !== 'object' || Array.isArray(request.data))) {
    throw new HundredPrintsError('INVALID_INPUT', 'data must be an object whose keys match the template fields.');
  }
  if (!request.output || typeof request.output !== 'object') {
    throw new HundredPrintsError('INVALID_INPUT', 'output is required.');
  }
}

export function validateOutput(output: unknown): asserts output is RenderOutput {
  if (!output || typeof output !== 'object') {
    throw new HundredPrintsError('INVALID_INPUT', 'output is required.');
  }
  const value = output as Record<string, any>;
  const format = value.format;
  if (!IMAGE_FORMATS.has(format) && !PDF_FORMATS.has(format)) {
    throw new HundredPrintsError('UNSUPPORTED_FORMAT', 'output.format must be "png", "jpeg", "pdf", or "vector-pdf".');
  }
  if (value.quality !== undefined && !QUALITIES.has(value.quality)) {
    throw new HundredPrintsError('INVALID_INPUT', 'quality must be "draft", "standard", "high", or "ultra".');
  }

  if (IMAGE_FORMATS.has(format)) {
    if (!SIDES.has(value.side)) {
      throw new HundredPrintsError('UNSUPPORTED_SIDE', `${format.toUpperCase()} rendering requires side: "front" or "back".`);
    }
    if (value.includeBack !== undefined) {
      throw new HundredPrintsError('INVALID_INPUT', 'Image rendering uses side, not includeBack.');
    }
    return;
  }

  if (value.side !== undefined) {
    throw new HundredPrintsError('INVALID_INPUT', 'PDF rendering uses includeBack, not side.');
  }
  if (value.includeBack !== undefined && typeof value.includeBack !== 'boolean') {
    throw new HundredPrintsError('INVALID_INPUT', 'includeBack must be a boolean.');
  }
}

function mapRenderError(error: unknown): HundredPrintsError {
  if (error instanceof HundredPrintsError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/API Error:\s*(401|403)\b/i.test(message)) {
    return new HundredPrintsError('AUTH_INVALID', 'The publishable key was rejected.', { cause: error });
  }
  if (/API Error:\s*404\b/i.test(message)) {
    return new HundredPrintsError('TEMPLATE_NOT_FOUND', 'The requested template was not found or is unavailable to this key.', { cause: error });
  }
  return new HundredPrintsError('RENDER_FAILED', 'Rendering failed.', { cause: error, details: { message } });
}

export class RenderController {
  private readonly sdk: BrowserSDK;

  constructor(options: HundredPrintsOptions) {
    this.sdk = new BrowserSDK({ key: options.publishableKey, baseUrl: options.baseUrl });
  }

  async render(input: RenderInput): Promise<PublicRenderResult> {
    validateBaseInput(input);
    validateOutput(input.output);
    const { output } = input;
    try {
      if (IMAGE_FORMATS.has(output.format as ImageRenderFormat)) {
        const imageOutput = output as Extract<RenderOutput, { format: ImageRenderFormat }>;
        const rendered = await this.sdk.render({
          templateId: input.templateId,
          payload: input.data,
          format: imageOutput.format,
          side: imageOutput.side,
          quality: imageOutput.quality,
        });
        if (!rendered.width || !rendered.height) {
          throw new HundredPrintsError('RENDER_FAILED', 'The renderer did not return image dimensions.');
        }
        return createImageResult(imageOutput.format, rendered.blob, rendered.width, rendered.height, imageOutput.side);
      }

      const pdfOutput = output as Extract<RenderOutput, { format: PdfRenderFormat }>;
      const rendered = await this.sdk.render({
        templateId: input.templateId,
        payload: input.data,
        format: pdfOutput.format,
        side: pdfOutput.includeBack ? 'both' : 'front',
        quality: pdfOutput.quality,
      });
      return createPdfResult(pdfOutput.format, rendered.blob, rendered.pages ?? 1);
    } catch (error) {
      throw mapRenderError(error);
    }
  }
}
