import Konva from 'konva';
import { Layer } from '../types';
import { applyKonvaFill, applyCommonProps } from './konva-helpers';
import { loadImage } from '../assets/asset-loader';
import { generateQRDataUrl } from '../assets/qr-generator';
import { generateBarcodeDataUrl } from '../assets/barcode-generator';
import { generateTextSvgString } from '../utils/text-svg-generator';
import { generateTableSvg } from '../utils/generate-table-svg';
import { generateChartSvg } from '../utils/generate-chart-svg';

export async function renderShapeLayer(konvaLayer: Konva.Layer, layer: Layer): Promise<void> {
  const w = layer.width || 100;
  const h = layer.height || 100;
  const bw = layer.borderWidth || 0;
  const innerW = Math.max(1, w - bw);
  const innerH = Math.max(1, h - bw);

  const isSvg = layer.content?.trim().startsWith('<svg');

  if (isSvg && layer.content) {
    let processedSvg = layer.content.trim();

    if (layer.fillType === 'linear' || layer.fillType === 'radial') {
      const c1 = layer.color || '#000000';
      const c2 = layer.gradientColors?.[1] || '#ffffff';
      const gradId = `grad-export-${layer.id.replace(/[^a-zA-Z0-9]/g, '')}`;

      let defs = '';
      if (layer.fillType === 'linear') {
        const r = ((layer.gradientAngle || 90) * Math.PI) / 180;
        const x1 = `${Math.round(50 - Math.sin(r) * 50)}%`;
        const y1 = `${Math.round(50 + Math.cos(r) * 50)}%`;
        const x2 = `${Math.round(50 + Math.sin(r) * 50)}%`;
        const y2 = `${Math.round(50 - Math.cos(r) * 50)}%`;
        defs = `<defs><linearGradient id="${gradId}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0%" stop-color="${c1}" /><stop offset="100%" stop-color="${c2}" /></linearGradient></defs>`;
      } else {
        defs = `<defs><radialGradient id="${gradId}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${c1}" /><stop offset="100%" stop-color="${c2}" /></radialGradient></defs>`;
      }

      if (!processedSvg.includes('<defs>')) {
        processedSvg = processedSvg.replace(/<svg[^>]*>/, `$&${defs}`);
      } else {
        processedSvg = processedSvg.replace('<defs>', `<defs>${defs}`);
      }
      processedSvg = processedSvg.replace(/currentColor/g, `url(#${gradId})`);
    } else {
      processedSvg = processedSvg.replace(/currentColor/g, layer.color || '#000000');
    }

    if (!processedSvg.includes('xmlns=')) {
      processedSvg = processedSvg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    processedSvg = processedSvg.replace(/<svg([^>]*)>/i, (_match, attrs) => {
      const hasViewBox = /viewBox/i.test(attrs);
      let newAttrs = attrs
        .replace(/\bwidth=["'][^"']*["']/gi, '')
        .replace(/\bheight=["'][^"']*["']/gi, '')
        .replace(/\bpreserveAspectRatio=["'][^"']*["']/gi, '');
      if (!hasViewBox) newAttrs += ` viewBox="0 0 ${w} ${h}"`;
      return `<svg${newAttrs} width="${w}" height="${h}" preserveAspectRatio="none">`;
    });

    try {
      const blob = new Blob([processedSvg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = await loadImage(url);
      URL.revokeObjectURL(url);

      const kImg = new Konva.Image({ image: img, width: innerW, height: innerH, listening: false });
      applyCommonProps(kImg, layer, innerW, innerH);
      if (bw) { kImg.stroke(layer.borderColor || '#000000'); kImg.strokeWidth(bw); }
      konvaLayer.add(kImg);
    } catch { /* SVG parse error — skip */ }
  } else {
    const rect = new Konva.Rect({
      width: innerW,
      height: innerH,
      cornerRadius: layer.borderRadius || 0,
      listening: false,
    });
    applyKonvaFill(rect, layer, innerW, innerH);
    applyCommonProps(rect, layer, innerW, innerH);
    if (bw) { rect.stroke(layer.borderColor || '#000000'); rect.strokeWidth(bw); }
    konvaLayer.add(rect);
  }
}

export function renderLineLayer(konvaLayer: Konva.Layer, layer: Layer): void {
  const w = layer.width || 200;
  const h = layer.borderWidth || 2;
  const isDashed = layer.textDecoration === 'dashed';
  const isDotted = layer.textDecoration === 'dotted';

  if (isDashed || isDotted) {
    const dashArray = isDotted ? [h, h] : [h * 3, h * 3];
    const line = new Konva.Line({
      points: [0, h / 2, w, h / 2],
      stroke: layer.color || '#000000',
      strokeWidth: h,
      dash: dashArray,
      listening: false,
    });
    line.x(layer.x + w / 2);
    line.y(layer.y + h / 2);
    line.offsetX(w / 2);
    line.offsetY(h / 2);
    line.rotation(layer.rotation || 0);
    line.opacity(layer.opacity ?? 1);
    line.shadowColor(layer.shadowColor || 'transparent');
    line.shadowBlur(layer.shadowBlur || 0);
    line.shadowOffsetX(layer.shadowOffsetX || 0);
    line.shadowOffsetY(layer.shadowOffsetY || 0);
    konvaLayer.add(line);
  } else {
    const rect = new Konva.Rect({ width: w, height: h, listening: false });
    applyKonvaFill(rect, layer, w, h);
    rect.x(layer.x + w / 2);
    rect.y(layer.y + h / 2);
    rect.offsetX(w / 2);
    rect.offsetY(h / 2);
    rect.rotation(layer.rotation || 0);
    rect.opacity(layer.opacity ?? 1);
    rect.shadowColor(layer.shadowColor || 'transparent');
    rect.shadowBlur(layer.shadowBlur || 0);
    rect.shadowOffsetX(layer.shadowOffsetX || 0);
    rect.shadowOffsetY(layer.shadowOffsetY || 0);
    konvaLayer.add(rect);
  }
}

export async function renderTextLayer(konvaLayer: Konva.Layer, layer: Layer): Promise<void> {
  const w = layer.width || 200;
  const h = layer.height || 40;
  const bw = layer.borderWidth || 0;
  const innerW = Math.max(1, w - bw);
  const innerH = Math.max(1, h - bw);

  const isItalic = layer.fontStyle === 'italic';
  const rawWeight = layer.fontWeight ?? 'normal';
  const fontStyle = `${isItalic ? 'italic ' : ''}${rawWeight}`.trim();

  // ── Mirror CanvasRenderer.tsx: wait for the exact font+weight before drawing ──
  // Konva.Text draws on the canvas synchronously. If the FontFace bytes haven't
  // been decoded yet the browser substitutes a system font, causing the mismatch.
  const fontFamily = (layer.fontFamily || 'Inter').split(',')[0].trim().replace(/['\"]/g, '');
  const fontDescriptor = `${fontStyle} ${layer.fontSize || 24}px "${fontFamily}"`;
  try {
    await document.fonts.load(fontDescriptor, layer.content || 'Ag');
  } catch { /* proceed — fall back to whatever the browser has */ }

  const text = new Konva.Text({
    width: innerW,
    height: innerH,
    text: layer.content || '',
    fontSize: layer.fontSize,
    fontFamily: layer.fontFamily || 'Inter, Arial, sans-serif',
    fontStyle: fontStyle,
    textDecoration: layer.textDecoration === 'underline' ? 'underline' : 'empty',
    align: layer.textAlign || 'center',
    verticalAlign: 'middle',
    lineHeight: layer.lineHeight || 1.2,
    letterSpacing: layer.letterSpacing || 0,
    wrap: 'word',
    listening: false,
  });

  applyKonvaFill(text, layer, innerW, innerH);
  applyCommonProps(text, layer, innerW, innerH);
  konvaLayer.add(text);
}

export async function renderTextSvgLayer(konvaLayer: Konva.Layer, layer: Layer, exportScale: number): Promise<void> {
  const w = layer.width || 200;
  const h = layer.height || 40;
  const bw = layer.borderWidth || 0;
  const innerW = Math.max(1, w - bw * 2);
  const innerH = Math.max(1, h - bw * 2);

  const { Canvg } = await import('canvg');

  const fontFamily = layer.fontFamily || 'Inter';
  try {
    await document.fonts.load(`${layer.fontSize || 24}px "${fontFamily}"`, layer.content || 'Ag');
  } catch { /* font load timeout — proceed anyway */ }

  const svgString = generateTextSvgString(layer, layer.content || '', innerW, innerH);

  const canvas = document.createElement('canvas');
  canvas.width = innerW * exportScale;
  canvas.height = innerH * exportScale;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(exportScale, exportScale);
  const v = await Canvg.fromString(ctx, svgString, {
    ignoreMouse: true,
    ignoreAnimation: true,
    ignoreDimensions: true,
  });
  await v.render();

  const kImg = new Konva.Image({
    image: canvas,
    width: innerW,
    height: innerH,
    listening: false,
  });
  applyCommonProps(kImg, layer, innerW, innerH);
  konvaLayer.add(kImg);
}

export async function renderTableSvgLayer(konvaLayer: Konva.Layer, layer: Layer, exportScale: number = 1): Promise<void> {
  const w = layer.width || 400;
  const h = layer.height || 200;

  const { Canvg } = await import('canvg');

  // ── Pre-load all unique fonts used across table cells ──────────────────────
  if (layer.tableData?.cells) {
    const fontFamilies = new Set<string>();
    const fontSize = 16; // generic size for font loading
    for (const row of layer.tableData.cells) {
      for (const cell of row) {
        if (cell?.fontFamily) {
          const primary = cell.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
          fontFamilies.add(primary);
        }
      }
    }
    await Promise.allSettled(
      [...fontFamilies].map(f =>
        document.fonts.load(`${fontSize}px "${f}"`, 'Ag').catch(() => { /* ignore */ })
      )
    );
  }

  const svgString = generateTableSvg(layer);
  if (!svgString) return;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = w * exportScale;
    canvas.height = h * exportScale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(exportScale, exportScale);

    const v = await Canvg.fromString(ctx, svgString, {
      ignoreMouse: true,
      ignoreAnimation: true,
      ignoreDimensions: true,
    });
    await v.render();

    const kImg = new Konva.Image({
      image: canvas,
      width: w,
      height: h,
      listening: false,
    });

    applyCommonProps(kImg, layer, w, h);
    konvaLayer.add(kImg);
  } catch (err) {
    console.warn('[RenderOrchestrator] Failed to render table SVG:', err);
  }
}

export async function renderChartSvgLayer(konvaLayer: Konva.Layer, layer: Layer, exportScale: number = 1): Promise<void> {
  const w = layer.width || 300;
  const h = layer.height || 250;

  const { Canvg } = await import('canvg');

  // Pre-load font if applicable
  if (layer.chartData?.fontFamily) {
    const primary = layer.chartData.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
    await document.fonts.load(`${layer.chartData.fontSize || 11}px "${primary}"`, 'Ag').catch(() => { /* ignore */ });
  }

  const svgString = generateChartSvg(layer);
  if (!svgString) return;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = w * exportScale;
    canvas.height = h * exportScale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(exportScale, exportScale);

    const v = await Canvg.fromString(ctx, svgString, {
      ignoreMouse: true,
      ignoreAnimation: true,
      ignoreDimensions: true,
    });
    await v.render();

    const kImg = new Konva.Image({
      image: canvas,
      width: w,
      height: h,
      listening: false,
    });

    applyCommonProps(kImg, layer, w, h);
    konvaLayer.add(kImg);
  } catch (err) {
    console.warn('[RenderOrchestrator] Failed to render chart SVG:', err);
  }
}

export async function renderImageLayer(
  konvaLayer: Konva.Layer,
  layer: Layer,
  assetMap: Record<string, string | HTMLImageElement | ImageBitmap> = {},
): Promise<void> {
  const w = layer.width || 100;
  const h = layer.height || 100;
  const bw = layer.borderWidth || 0;
  const innerW = Math.max(1, w - bw);
  const innerH = Math.max(1, h - bw);

  let src: string | HTMLImageElement | ImageBitmap | undefined = layer.content || '';

  if (typeof src === 'string' && assetMap[src]) {
    src = assetMap[src];
  }

  if (!src) return;

  let image: HTMLImageElement | ImageBitmap;

  if (typeof src === 'object' && src !== null) {
    image = src;
  } else if (typeof src === 'string') {
    try {
      image = await loadImage(src);
    } catch {
      return;
    }
  } else {
    return;
  }

  const isSvgData = typeof layer.content === 'string' && layer.content.startsWith('data:image/svg');
  const shouldCrop = layer.type === 'image' && !isSvgData;

  let crop: { x: number; y: number; width: number; height: number } | undefined;
  if (shouldCrop) {
    const imageRatio = image.width / image.height;
    const layerRatio = innerW / (innerH || 1);
    crop = { x: 0, y: 0, width: image.width, height: image.height };
    if (imageRatio > layerRatio) {
      crop.width = image.height * layerRatio;
      crop.x = (image.width - crop.width) / 2;
    } else {
      crop.height = image.width / layerRatio;
      crop.y = (image.height - crop.height) / 2;
    }
  }

  const kImg = new Konva.Image({
    image: image,
    width: innerW,
    height: innerH,
    crop: crop,
    cornerRadius: layer.type === 'frame' ? 9999 : (layer.borderRadius || 0),
    listening: false,
  });

  applyCommonProps(kImg, layer, innerW, innerH);
  if (bw) { kImg.stroke(layer.borderColor || '#000000'); kImg.strokeWidth(bw); }
  konvaLayer.add(kImg);
}

export async function renderQRBarcodeLayer(konvaLayer: Konva.Layer, layer: Layer): Promise<void> {
  const text = layer.content || (layer.type === 'barcode' ? '123456789' : 'https://example.com');
  const fgColor = layer.color || '#000000';
  const isTransparent = !layer.backgroundColor || layer.backgroundColor === 'transparent';
  const bgColor = isTransparent ? (layer.type === 'barcode' ? 'transparent' : '#ffffff00') : layer.backgroundColor!;

  let dataUrl: string;
  if (layer.type === 'barcode') {
    dataUrl = await generateBarcodeDataUrl(text, fgColor, bgColor);
  } else {
    dataUrl = await generateQRDataUrl(text, fgColor, isTransparent ? '#ffffff00' : bgColor);
  }

  try {
    const img = await loadImage(dataUrl);
    const w = layer.width || 100;
    const h = layer.height || 100;
    const bw = layer.borderWidth || 0;
    const innerW = Math.max(1, w - bw);
    const innerH = Math.max(1, h - bw);

    const imageRatio = img.width / img.height;
    const layerRatio = innerW / (innerH || 1);
    let crop: { x: number; y: number; width: number; height: number } | undefined;
    crop = { x: 0, y: 0, width: img.width, height: img.height };
    if (imageRatio > layerRatio) {
      crop.width = img.height * layerRatio;
      crop.x = (img.width - crop.width) / 2;
    } else {
      crop.height = img.width / layerRatio;
      crop.y = (img.height - crop.height) / 2;
    }

    const kImg = new Konva.Image({
      image: img,
      width: innerW,
      height: innerH,
      crop: crop,
      cornerRadius: layer.type === 'frame' ? 9999 : (layer.borderRadius || 0),
      listening: false,
    });
    applyCommonProps(kImg, layer, innerW, innerH);
    if (bw) { kImg.stroke(layer.borderColor || '#000000'); kImg.strokeWidth(bw); }
    konvaLayer.add(kImg);
  } catch { /* QR/barcode generation failed */ }
}
