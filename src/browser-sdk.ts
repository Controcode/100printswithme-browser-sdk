import { ApiClient } from './api/sdk-client';
import { TemplateCache } from './templates/template-cache';
import { RenderEngine } from './render/render-engine';
import { BulkRenderer } from './render/bulk-renderer';

import { FontLoader } from './fonts/font-loader';
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
  const fontsToLoad = new Map<string, { family: string; weight: number; url?: string }>();

  // Add backend manifest first to preserve custom URLs
  if (Array.isArray(backendManifest)) {
    for (const item of backendManifest) {
      if (item && item.family) {
        const cleanFamily = item.family.split(',')[0].trim().replace(/['"]/g, '');
        const weight = parseInt(String(item.weight)) || 400;
        const key = `${cleanFamily.toLowerCase()}::${weight}`;
        fontsToLoad.set(key, { family: cleanFamily, weight, url: item.url });
      }
    }
  }

  function addFont(family: string | undefined, weight: string | number | undefined) {
    if (!family) return;
    const cleanFamily = family.split(',')[0].trim().replace(/['"]/g, '');
    let w = 400;
    const wStr = String(weight).toLowerCase();
    if (wStr === 'bold') w = 700;
    else if (wStr === 'normal') w = 400;
    else {
      w = parseInt(wStr) || 400;
    }
    
    const key = `${cleanFamily.toLowerCase()}::${w}`;
    if (!fontsToLoad.has(key)) {
      fontsToLoad.set(key, { family: cleanFamily, weight: w });
    }
  }

  function processLayers(layers: Layer[]) {
    for (const layer of layers) {
      if (layer.visible === false) continue;
      if (layer.type === 'text' || layer.type === 'textsvg') {
        addFont(layer.fontFamily, layer.fontWeight);
      }
      if (layer.type === 'table-svg' && layer.tableData?.cells) {
        for (const row of layer.tableData.cells) {
          for (const cell of row) {
            if (cell) addFont(cell.fontFamily, cell.fontWeight);
          }
        }
      }
      if (layer.type === 'chart-svg' && layer.chartData) {
        addFont(layer.chartData.fontFamily, 'normal');
      }
      if ('layers' in layer && Array.isArray((layer as any).layers)) {
        processLayers((layer as any).layers);
      }
    }
  }

  processLayers(template.frontLayers || []);
  processLayers(template.backLayers || []);

  const manifest = Array.from(fontsToLoad.values());
  await fontLoader.loadFonts(manifest);
}

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
    return engine.renderSingle(template, options);
  }

  async renderBulk(options: BulkRenderOptions): Promise<BulkRenderResult> {
    const response = await this.fetchTemplateData(options.templateId);
    const template = this.getTemplateFromResponse(response);
    
    await scanAndLoadTemplateFonts(template, this.fontLoader, response.fontManifest);

    const renderer = new BulkRenderer();
    return renderer.renderBulk(template, options);
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
