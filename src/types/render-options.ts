export interface RenderOptions {
  templateId: string;
  payload?: Record<string, any>;
  format?: 'pdf' | 'png';
  quality?: 'draft' | 'standard' | 'high' | 'ultra';
  side?: 'front' | 'back' | 'both';
}

export interface RenderResult {
  blob: Blob;
  mimeType: string;
  sizeKB: number;
}

export interface BulkRenderOptions {
  templateId: string;
  rows: Record<string, any>[];
  format?: 'pdf' | 'png';
  quality?: 'draft' | 'standard' | 'high' | 'ultra';
  mode?: 'merged' | 'zip';
  onProgress?: (current: number, total: number, recordName: string) => void;
}

export interface BulkRenderResult {
  blob: Blob;
  filename: string;
  sizeKB: number;
}

export interface PreviewOptions {
  templateId: string;
  payload?: Record<string, any>;
  container: HTMLElement;
  scale?: number;
}
