import { HundredPrintsError } from './errors';
import type { ImageRenderFormat, ImageRenderResult, PdfRenderFormat, PdfRenderResult, RenderSide } from './types';

function defaultFilename(format: ImageRenderFormat | PdfRenderFormat): string {
  return format === 'vector-pdf' ? 'render.pdf' : `render.${format}`;
}

function triggerDownload(url: string, filename: string): void {
  if (typeof document === 'undefined') {
    throw new HundredPrintsError('DOWNLOAD_FAILED', 'Downloading requires a browser document.');
  }
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch (cause) {
    throw new HundredPrintsError('DOWNLOAD_FAILED', 'The browser could not start the download.', { cause });
  }
}

function resultUtilities(blob: Blob, format: ImageRenderFormat | PdfRenderFormat) {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new HundredPrintsError('RENDER_FAILED', 'Object URLs are unavailable in this environment.');
  }
  const url = URL.createObjectURL(blob);
  let revoked = false;
  return {
    url,
    download(filename = defaultFilename(format)): void {
      if (revoked) {
        throw new HundredPrintsError('DOWNLOAD_FAILED', 'This result URL has already been revoked. Render again before downloading.');
      }
      triggerDownload(url, filename);
    },
    revoke(): void {
      if (revoked) return;
      URL.revokeObjectURL(url);
      revoked = true;
    },
  };
}

export function createImageResult(
  format: ImageRenderFormat,
  blob: Blob,
  width: number,
  height: number,
  side: RenderSide,
): ImageRenderResult {
  return { format, blob, width, height, side, ...resultUtilities(blob, format) };
}

export function createPdfResult(
  format: PdfRenderFormat,
  blob: Blob,
  pages: number,
): PdfRenderResult {
  return { format, blob, pages, ...resultUtilities(blob, format) };
}
