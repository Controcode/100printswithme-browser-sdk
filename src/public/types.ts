export type RenderQuality = 'draft' | 'standard' | 'high' | 'ultra';
export type RenderSide = 'front' | 'back';
export type ImageRenderFormat = 'png' | 'jpeg';
export type PdfRenderFormat = 'pdf' | 'vector-pdf';
export type RenderFormat = ImageRenderFormat | PdfRenderFormat;

export interface HundredPrintsOptions {
  publishableKey: string;
  /** Override the API origin for self-hosted or development environments. */
  baseUrl?: string;
}

export interface BaseRenderInput {
  templateId: string;
  data?: Record<string, unknown>;
}

export interface ImageRenderInput extends BaseRenderInput {
  side: RenderSide;
  quality?: RenderQuality;
  includeBack?: never;
}

export interface PdfRenderInput extends BaseRenderInput {
  includeBack?: boolean;
  quality?: RenderQuality;
  side?: never;
}

export interface ImageRenderOutput {
  format: ImageRenderFormat;
  side: RenderSide;
  quality?: RenderQuality;
  includeBack?: never;
}

export interface PdfRenderOutput {
  format: PdfRenderFormat;
  includeBack?: boolean;
  quality?: RenderQuality;
  side?: never;
}

export type RenderOutput = ImageRenderOutput | PdfRenderOutput;

export type RenderInput = BaseRenderInput & {
  output: RenderOutput;
};

export type ImageRenderRequest = BaseRenderInput & {
  output: ImageRenderOutput;
};

export type PdfRenderRequest = BaseRenderInput & {
  output: PdfRenderOutput;
};

export type DownloadInput = RenderInput & {
  filename?: string;
};

export interface BasePublicRenderResult {
  blob: Blob;
  url: string;
  download(filename?: string): void;
  revoke(): void;
}

export interface ImageRenderResult extends BasePublicRenderResult {
  format: ImageRenderFormat;
  width: number;
  height: number;
  side: RenderSide;
}

export interface PdfRenderResult extends BasePublicRenderResult {
  format: PdfRenderFormat;
  pages: number;
}

export type PublicRenderResult = ImageRenderResult | PdfRenderResult;

export type HundredPrintsErrorCode =
  | 'AUTH_INVALID'
  | 'TEMPLATE_NOT_FOUND'
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_FORMAT'
  | 'UNSUPPORTED_SIDE'
  | 'INVALID_TARGET'
  | 'FONT_LOAD_FAILED'
  | 'RENDER_FAILED'
  | 'DOWNLOAD_FAILED';
