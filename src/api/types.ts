export interface ApiClientOptions {
  key: string;
  baseUrl?: string;
}

export interface SdkRenderRequest {
  template_id: string;
}

export interface SdkRenderResponse {
  template_data: any;
  dimensions: { width: number; height: number; label: string };
  backgroundColor: string;
  frontLayers: any[];
  backLayers?: any[];
  fontManifest: { family: string; weight: number; url?: string }[];
  sample_data?: any;
}
