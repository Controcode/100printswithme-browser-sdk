import Konva from 'konva';
import { RenderOptions, RenderResult, DocumentTemplate, Layer } from '../types';
import { evaluateSmartLogic, evaluateLayerOverrides } from './logic-evaluator';
import { resolveContent } from './variable-resolver';
import { createJsPDFInstance, addDataUrlToJsPDF } from '../export/pdf-exporter';
import { dataUrlToBlob } from '../export/png-exporter';
import { loadImage } from '../assets/asset-loader';
import {
  renderShapeLayer,
  renderLineLayer,
  renderTextLayer,
  renderTextSvgLayer,
  renderTableSvgLayer,
  renderChartSvgLayer,
  renderImageLayer,
  renderQRBarcodeLayer,
} from './layer-renderers';

/**
 * Pre-warms every font used across all layers by calling document.fonts.load()
 * for each unique family+weight combination — exactly mirroring what the frontend
 * renderOrchestrator does before drawing. Without this step the Konva canvas
 * (and Canvg) silently fall back to the system font for any frame that renders
 * before the custom font is ready in the browser font engine, causing the
 * visual mismatch between SDK output and frontend output.
 */
async function preloadTemplateFonts(layers: Layer[]): Promise<void> {
  type FontKey = { family: string; weight: string | number; size: number };
  const seen = new Set<string>();
  const keys: FontKey[] = [];

  for (const layer of layers) {
    if (layer.visible === false) continue;

    // Regular text and textsvg layers
    if ((layer.type === 'text' || layer.type === 'textsvg') && layer.fontFamily) {
      const family = layer.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
      const weight = layer.fontWeight || 'normal';
      const size   = layer.fontSize || 24;
      const key    = `${family}::${weight}::${size}`;
      if (!seen.has(key)) { seen.add(key); keys.push({ family, weight, size }); }
    }

    // Table-svg cells
    if (layer.type === 'table-svg' && layer.tableData?.cells) {
      for (const row of layer.tableData.cells) {
        for (const cell of row) {
          if (cell?.fontFamily) {
            const family = cell.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
            const weight = cell.fontWeight || 'normal';
            const size   = cell.fontSize || 16;
            const key    = `${family}::${weight}::${size}`;
            if (!seen.has(key)) { seen.add(key); keys.push({ family, weight, size }); }
          }
        }
      }
    }

    // Chart-svg font
    if (layer.type === 'chart-svg' && layer.chartData?.fontFamily) {
      const family = layer.chartData.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
      const weight = 'normal';
      const size   = layer.chartData.fontSize || 11;
      const key    = `${family}::${weight}::${size}`;
      if (!seen.has(key)) { seen.add(key); keys.push({ family, weight, size }); }
    }
  }

  // Fire all load calls in parallel, never throw — mirrors frontend behaviour
  await Promise.allSettled(
    keys.map(({ family, weight, size }) =>
      document.fonts
        .load(`${weight !== 'normal' ? weight + ' ' : ''}${size}px "${family}"`, 'Ag')
        .catch(() => { /* ignore individual font errors */ })
    )
  );

  // Extra safety: wait for the font engine to finish processing any pending loads
  try { await (document.fonts as any).ready; } catch { /* ignore */ }
}

const SCALE_MAP: Record<string, number> = {
  draft: 1,     // 72 DPI
  standard: 2,  // 150 DPI
  high: 4,      // 300 DPI
  ultra: 8,     // 600 DPI
};

export function getCropMarkLayers(w: number, h: number): Layer[] {
  const size = 24, t = 3, c = '#0f172a';
  return [
    { id: 'cm-tl-h', type: 'shape', x: 0, y: 0, width: size, height: t, color: c, opacity: 1, rotation: 0, locked: true, visible: true },
    { id: 'cm-tl-v', type: 'shape', x: 0, y: 0, width: t, height: size, color: c, opacity: 1, rotation: 0, locked: true, visible: true },
    { id: 'cm-tr-h', type: 'shape', x: w - size, y: 0, width: size, height: t, color: c, opacity: 1, rotation: 0, locked: true, visible: true },
    { id: 'cm-tr-v', type: 'shape', x: w - t, y: 0, width: t, height: size, color: c, opacity: 1, rotation: 0, locked: true, visible: true },
    { id: 'cm-bl-h', type: 'shape', x: 0, y: h - t, width: size, height: t, color: c, opacity: 1, rotation: 0, locked: true, visible: true },
    { id: 'cm-bl-v', type: 'shape', x: 0, y: h - size, width: t, height: size, color: c, opacity: 1, rotation: 0, locked: true, visible: true },
    { id: 'cm-br-h', type: 'shape', x: w - size, y: h - t, width: size, height: t, color: c, opacity: 1, rotation: 0, locked: true, visible: true },
    { id: 'cm-br-v', type: 'shape', x: w - t, y: h - size, width: t, height: size, color: c, opacity: 1, rotation: 0, locked: true, visible: true },
  ] as Layer[];
}

export async function renderSingleRecord(
  stage: Konva.Stage,
  konvaLayer: Konva.Layer,
  template: DocumentTemplate,
  layers: Layer[],
  rowData: Record<string, any>,
  assetMap: Record<string, string | HTMLImageElement | ImageBitmap>,
  exportScale: number,
  includeCropMarks: boolean,
  useJpeg: boolean,
): Promise<string> {
  konvaLayer.destroyChildren();

  const canvasW = template.dimensions?.width || 856;
  const canvasH = template.dimensions?.height || 540;

  // Always fill background — required for JPEG (no transparency)
  const bg = new Konva.Rect({
    x: 0, y: 0,
    width: canvasW,
    height: canvasH,
    fill: template.backgroundColor || '#ffffff',
    listening: false,
  });
  konvaLayer.add(bg);

  for (const layer of layers) {
    if (layer.visible === false) continue;

    const propOverrides = evaluateLayerOverrides(layer.logic, rowData);
    const resolvedLayer = Object.keys(propOverrides).length > 0 ? { ...layer, ...propOverrides } : { ...layer };
    if (layer.chartData && propOverrides.chartData) {
      resolvedLayer.chartData = { ...layer.chartData, ...propOverrides.chartData };
    }

    let content = evaluateSmartLogic(resolvedLayer.content || '', rowData, resolvedLayer.logic);
    content = resolveContent(content);

    if (content && typeof content === 'string' && assetMap[content]) {
      content = assetMap[content] as string;
    }
    resolvedLayer.content = content;

    const tableData = resolvedLayer.tableData;
    if (tableData && tableData.cells) {
      const clonedTableData = JSON.parse(JSON.stringify(tableData));
      resolvedLayer.tableData = clonedTableData;
      for (const row of clonedTableData.cells) {
        for (const cell of row) {
          if (cell && cell.content) {
            let cellContent = evaluateSmartLogic(cell.content, rowData, undefined);
            cellContent = resolveContent(cellContent);
            if (cellContent && typeof cellContent === 'string' && assetMap[cellContent]) {
              cellContent = assetMap[cellContent] as string;
            }
            cell.content = cellContent;
          }
        }
      }
    }

    const chartData = resolvedLayer.chartData;
    if (chartData) {
      const clonedChart = JSON.parse(JSON.stringify(chartData));
      resolvedLayer.chartData = clonedChart;
      let finalPercentageStr = clonedChart.percentage || '';
      if (layer.logic?.rules?.length && layer.logic.rules.length > 0) {
        const out = evaluateSmartLogic('', rowData, layer.logic);
        if (out !== undefined && out !== null && out !== '') {
           finalPercentageStr = String(out);
        } else {
           finalPercentageStr = evaluateSmartLogic(finalPercentageStr, rowData, undefined);
        }
      } else {
        finalPercentageStr = evaluateSmartLogic(finalPercentageStr, rowData, undefined);
      }
      clonedChart.percentage = resolveContent(finalPercentageStr);
      
      if (clonedChart.categories) {
        clonedChart.categories = clonedChart.categories.map((cat: string) => {
          let cContent = evaluateSmartLogic(cat, rowData, undefined);
          return resolveContent(cContent);
        });
      }

      for (const series of clonedChart.series) {
        if (series.label) {
          let lContent = evaluateSmartLogic(series.label, rowData, undefined);
          series.label = resolveContent(lContent);
        }
        series.values = series.values.map((v: string) => {
          let vContent = evaluateSmartLogic(v, rowData, undefined);
          return resolveContent(vContent);
        });
      }
    }

    try {
      switch (resolvedLayer.type) {
        case 'shape': await renderShapeLayer(konvaLayer, resolvedLayer); break;
        case 'line': renderLineLayer(konvaLayer, resolvedLayer); break;
        case 'text': await renderTextLayer(konvaLayer, resolvedLayer); break;
        case 'textsvg': await renderTextSvgLayer(konvaLayer, resolvedLayer, exportScale); break;
        case 'table-svg': await renderTableSvgLayer(konvaLayer, resolvedLayer, exportScale); break;
        case 'chart-svg': await renderChartSvgLayer(konvaLayer, resolvedLayer, exportScale); break;
        case 'image':
        case 'background':
        case 'frame': await renderImageLayer(konvaLayer, resolvedLayer, assetMap); break;
        case 'qr':
        case 'barcode': await renderQRBarcodeLayer(konvaLayer, resolvedLayer); break;
      }
    } catch (err) {
      console.warn(`Failed to render layer ${layer.id}:`, err);
    }
  }

  if (includeCropMarks) {
    const cropLayers = getCropMarkLayers(canvasW, canvasH);
    for (const cl of cropLayers) await renderShapeLayer(konvaLayer, cl);
  }

  konvaLayer.draw();

  const mimeType = useJpeg ? 'image/jpeg' : 'image/png';
  const dataUrl = stage.toDataURL({
    pixelRatio: exportScale,
    mimeType,
    quality: useJpeg ? 0.92 : undefined,
  } as any);

  return dataUrl;
}

export async function preloadTemplateImages(
  layers: Layer[],
  rowData: Record<string, any>,
  assetMap: Record<string, string | HTMLImageElement | ImageBitmap> = {}
): Promise<Record<string, string | HTMLImageElement | ImageBitmap>> {
  const map: Record<string, string | HTMLImageElement | ImageBitmap> = { ...assetMap };
  const loadPromises: Promise<any>[] = [];

  for (const layer of layers) {
    if (layer.visible === false) continue;
    if (layer.type === 'image' || layer.type === 'background' || layer.type === 'frame') {
      const propOverrides = evaluateLayerOverrides(layer.logic, rowData);
      const resolvedLayer = Object.keys(propOverrides).length > 0 ? { ...layer, ...propOverrides } : { ...layer };
      
      let content = evaluateSmartLogic(resolvedLayer.content || '', rowData, resolvedLayer.logic);
      content = resolveContent(content);

      if (content && typeof content === 'string' && !content.startsWith('data:') && !map[content]) {
        loadPromises.push(
          loadImage(content)
            .then(img => {
              map[content] = img;
            })
            .catch(() => {
              console.warn(`Failed to preload image: ${content}`);
            })
        );
      }
    }
  }

  await Promise.all(loadPromises);
  return map;
}

export class RenderEngine {
  async renderSingle(template: DocumentTemplate, options: RenderOptions): Promise<RenderResult> {
    const format = options.format || 'pdf';
    const quality = options.quality || 'high';
    const side = options.side || 'both';
    const scale = SCALE_MAP[quality] || 4;
    
    const canvasW = template.dimensions?.width || 856;
    const canvasH = template.dimensions?.height || 540;
    const wPt = canvasW * 0.75;
    const hPt = canvasH * 0.75;
    const pdfOrientation = wPt > hPt ? 'l' : 'p';
    
    const rowData = options.payload || {};
    
    // Hidden container
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:10px;height:10px;overflow:hidden;';
    document.body.appendChild(container);

    const stage = new Konva.Stage({
      container,
      width: canvasW,
      height: canvasH,
      listening: false,
    });
    const konvaLayer = new Konva.Layer({ listening: false });
    stage.add(konvaLayer);

    const useJpeg = format === 'pdf';
    const imgFormat = useJpeg ? 'JPEG' : 'PNG';

    try {
      const allLayers = [
        ...(template.frontLayers || []),
        ...(template.backLayers || [])
      ];

      // ── Font pre-warming (mirrors frontend renderOrchestrator) ──────────────
      // Must happen AFTER fontLoader.loadFonts() has injected FontFace objects
      // and BEFORE any Konva / Canvg draw calls. Without this the canvas engine
      // can start drawing before the font bytes are available and falls back to
      // the system font, producing a different weight/metrics than the frontend.
      await preloadTemplateFonts(allLayers);

      const assetMap = await preloadTemplateImages(allLayers, rowData);

      let frontDataUrl: string | null = null;
      let backDataUrl: string | null = null;

      if (side === 'front' || side === 'both') {
        frontDataUrl = await renderSingleRecord(
          stage, konvaLayer, template, template.frontLayers || [],
          rowData, assetMap, scale, !!template.showCropMarks, useJpeg
        );
      }

      if ((side === 'back' || side === 'both') && template.backLayers && template.backLayers.length > 0) {
        backDataUrl = await renderSingleRecord(
          stage, konvaLayer, template, template.backLayers || [],
          rowData, assetMap, scale, !!template.showCropMarks, useJpeg
        );
      }

      if (format === 'png') {
        // Return front or back or combined? Standard behavior is to return front if 'both' is requested for PNG,
        // or the specific side if specified.
        const urlToUse = side === 'back' ? backDataUrl : frontDataUrl;
        if (!urlToUse) throw new Error('No renderable side found');
        const blob = dataUrlToBlob(urlToUse);
        return {
          blob,
          mimeType: 'image/png',
          sizeKB: Math.round(blob.size / 1024)
        };
      } else {
        const pdf = await createJsPDFInstance({ orientation: pdfOrientation, format: [wPt, hPt] });
        let firstPage = true;

        if (frontDataUrl) {
          addDataUrlToJsPDF(pdf, frontDataUrl, wPt, hPt, false, imgFormat);
          firstPage = false;
        }

        if (backDataUrl) {
          addDataUrlToJsPDF(pdf, backDataUrl, wPt, hPt, !firstPage, imgFormat);
        }

        const blob = pdf.output('blob');
        return {
          blob,
          mimeType: 'application/pdf',
          sizeKB: Math.round(blob.size / 1024)
        };
      }
    } finally {
      konvaLayer.destroy();
      stage.destroy();
      document.body.removeChild(container);
    }
  }

  async renderPreview(template: DocumentTemplate, options: any): Promise<HTMLCanvasElement> {
    const scale = options.scale || 1;
    const rowData = options.payload || {};

    const canvasW = template.dimensions?.width || 856;
    const canvasH = template.dimensions?.height || 540;

    // Clear container
    options.container.innerHTML = '';

    const stage = new Konva.Stage({
      container: options.container,
      width: canvasW * scale,
      height: canvasH * scale,
    });
    
    // Scale stage to fit
    stage.scale({ x: scale, y: scale });

    const konvaLayer = new Konva.Layer({ listening: false });
    stage.add(konvaLayer);

    const allLayers = [
      ...(template.frontLayers || []),
      ...(template.backLayers || [])
    ];

    // ── Font pre-warming (same as renderSingle) ─────────────────────────────
    await preloadTemplateFonts(allLayers);

    const assetMap = await preloadTemplateImages(allLayers, rowData);

    // Renders front layers as default preview
    await renderSingleRecord(
      stage, konvaLayer, template, template.frontLayers || [],
      rowData, assetMap, 1, false, false
    );

    // Return the actual canvas element
    const canvas = konvaLayer.getCanvas()._canvas;
    return canvas;
  }
}
