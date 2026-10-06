import type { Layer } from '../types';

export function isDynamicTextLayer(layer: Layer): boolean {
  return (layer.type === 'text' || layer.type === 'textsvg') &&
    (Boolean(layer.content?.includes('{{')) || Boolean(layer.logic?.rules?.length));
}

/** Compute a font size for a resolved value without changing the template's design size. */
export function fitTextSize(
  layer: Layer,
  text: string,
  measure: (value: string, size: number) => number,
  boxWidth = layer.width || 200,
  boxHeight = layer.height || 40,
): number {
  const maximum = Math.max(1, layer.fontSize || (layer.type === 'textsvg' ? 24 : 16));
  if (!layer.smartSizing || !text) return maximum;
  const minimum = Math.min(maximum, Math.max(1, layer.minFontSize || 8));
  const inset = (layer.borderWidth || 0) + (layer.borderWidth ? 4 : 0);
  const safe = Math.max(0, layer.textFitPadding ?? 4);
  const availableWidth = Math.max(1, boxWidth - 2 * (inset + safe));
  const availableHeight = Math.max(1, boxHeight - 2 * inset);
  const lines = text.split(/\r?\n/);
  const spacing = layer.letterSpacing || 0;
  const lineHeight = layer.lineHeight || 1.2;
  const fits = (size: number) =>
    lines.length * size * lineHeight <= availableHeight &&
    lines.every(line => measure(line, size) + spacing * Math.max(0, Array.from(line).length - 1) <= availableWidth);
  if (fits(maximum)) return maximum;
  if (!fits(minimum)) return minimum;
  let low = minimum;
  let high = maximum;
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return Math.floor(low * 10) / 10;
}

let measureCanvas: HTMLCanvasElement | undefined;

export function fitBrowserTextSize(layer: Layer, text: string, width?: number, height?: number): number {
  if (!layer.smartSizing || !text) return layer.fontSize || (layer.type === 'textsvg' ? 24 : 16);
  if (!measureCanvas) {
    if (typeof document !== 'undefined') measureCanvas = document.createElement('canvas');
  }
  const ctx = measureCanvas?.getContext('2d');
  if (!ctx) return layer.fontSize || (layer.type === 'textsvg' ? 24 : 16);
  return fitTextSize(layer, text, (value, size) => {
    ctx.font = `${layer.fontStyle === 'italic' ? 'italic ' : ''}${layer.fontWeight || 'normal'} ${size}px ${layer.fontFamily || 'Inter'}`;
    return ctx.measureText(value).width;
  }, width, height);
}

