import { ApiClient } from './api/sdk-client';
import { TemplateCache } from './templates/template-cache';
import { RenderEngine } from './render/render-engine';
import { BulkRenderer } from './render/bulk-renderer';

import { FontLoader } from './fonts/font-loader';
import { collectTemplateFonts } from './fonts/template-fonts';
import { cleanFontFamily } from './fonts/font-loader';
import { 
  BrowserSDKOptions, 
  RenderOptions, 
  RenderResult, 
  BulkRenderOptions, 
  BulkRenderResult, 
  PreviewOptions,
  DocumentTemplate,
  Layer
} from './types';

async function scanAndLoadTemplateFonts(template: DocumentTemplate, fontLoader: FontLoader, backendManifest: any[] = []): Promise<void> {
  await fontLoader.loadFonts(collectTemplateFonts(template, Array.isArray(backendManifest) ? backendManifest : []));
  if (!fontLoader.hasGenericFallbacks()) return;

  // An unknown family with no usable web/default font needs an explicit CSS
  // generic in the existing layer stack. Clone changed layers so the cached API
  // template remains intact for a later render that can retry the font source.
  const familyWithGeneric = (value: string | undefined): string | undefined =>
    value && fontLoader.usesGenericFallback(cleanFontFamily(value)) && !/\b(sans-serif|serif|monospace)\b/i.test(value)
      ? `${value}, sans-serif` : value;
  const patchLayers = (layers: Layer[]): Layer[] => layers.map(layer => {
    const fontFamily = familyWithGeneric(layer.fontFamily);
    const children = (layer as Layer & { layers?: Layer[] }).layers;
    const tableData = layer.tableData?.cells ? {
      ...layer.tableData,
      cells: layer.tableData.cells.map(row => row.map(cell => cell && {
        ...cell, fontFamily: familyWithGeneric(cell.fontFamily) || cell.fontFamily,
      })),
    } : layer.tableData;
    const chartData = layer.chartData?.fontFamily ? {
      ...layer.chartData, fontFamily: familyWithGeneric(layer.chartData.fontFamily),
    } : layer.chartData;
    return { ...layer, fontFamily, tableData, chartData,
      ...(Array.isArray(children) ? { layers: patchLayers(children) } : {}),
    };
  });
  template.frontLayers = patchLayers(template.frontLayers || []);
  template.backLayers = patchLayers(template.backLayers || []);
}

/** @deprecated Use HundredPrints for new integrations. */
export class BrowserSDK {
  private apiClient: ApiClient;
  private templateCache: TemplateCache;
  private fontLoader: FontLoader;

  constructor(options: BrowserSDKOptions) {
    if (!options.key) {
      throw new Error('BrowserSDK requires a valid key');
    }
    
    this.apiClient = new ApiClient({
      key: options.key,
      baseUrl: options.baseUrl
    });
    
    this.templateCache = new TemplateCache();
    this.fontLoader = new FontLoader();
  }

  private async fetchTemplateData(templateId: string) {
    let data = this.templateCache.get(templateId);
    if (!data) {
      data = await this.apiClient.getTemplate(templateId);
      this.templateCache.set(templateId, data);
    }
    return data;
  }

  private getTemplateFromResponse(data: any): DocumentTemplate {
    const templateData = data.template_data || {};
    return {
      id: templateData.id || '',
      name: templateData.name || '100Prints',
      description: templateData.description,
      type: templateData.type || 'id-card',
      category: templateData.category,
      backgroundColor: data.backgroundColor || templateData.backgroundColor || '#ffffff',
      accentColor: templateData.accentColor || '#000000',
      frontLayers: data.frontLayers || templateData.frontLayers || [],
      backLayers: data.backLayers || templateData.backLayers || [],
      dimensions: data.dimensions || templateData.dimensions || { width: 856, height: 540, label: 'Custom' },
      showCropMarks: templateData.showCropMarks || false,
    } as DocumentTemplate;
  }

  async render(options: RenderOptions): Promise<RenderResult> {
    const response = await this.fetchTemplateData(options.templateId);
    const template = this.getTemplateFromResponse(response);
    
    await scanAndLoadTemplateFonts(template, this.fontLoader, response.fontManifest);
    
    const engine = new RenderEngine();
    return engine.renderSingle(template, options, response.fontManifest);
  }

  async renderBulk(options: BulkRenderOptions): Promise<BulkRenderResult> {
    const response = await this.fetchTemplateData(options.templateId);
    const template = this.getTemplateFromResponse(response);
    
    await scanAndLoadTemplateFonts(template, this.fontLoader, response.fontManifest);

    const renderer = new BulkRenderer();
    return renderer.renderBulk(template, options, response.fontManifest);
  }

  async preview(options: PreviewOptions): Promise<HTMLCanvasElement> {
    const response = await this.fetchTemplateData(options.templateId);
    const template = this.getTemplateFromResponse(response);
    
    await scanAndLoadTemplateFonts(template, this.fontLoader, response.fontManifest);

    const engine = new RenderEngine();
    return engine.renderPreview(template, options);
  }

  destroy(): void {
    this.templateCache.clear();
    this.fontLoader.clearCache();
  }
}
