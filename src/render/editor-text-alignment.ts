import Konva from 'konva';
import { Layer } from '../types';

// Konva centers canvas text on the em baseline; the editor centers a CSS line box.
// For custom fonts these baselines can differ even with identical x/y/fontSize.
export function getEditorTextVerticalOffset(layer: Layer, text: Konva.Text, width: number, height: number): number {
  const content = layer.content || '';
  if (!layer.fontUrl || !content || /\r|\n/.test(content)) return 0;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  ctx.font = text._getContextFont();
  ctx.textBaseline = 'alphabetic';
  const alphabetic = ctx.measureText(content);
  const borderWidth = layer.borderWidth || 0;
  const inset = borderWidth + (borderWidth ? 4 : 0);
  if (alphabetic.width + (layer.letterSpacing || 0) * Math.max(0, Array.from(content).length - 1) > width - inset * 2) return 0;

  const probe = document.createElement('div');
  Object.assign(probe.style, {
    position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden', pointerEvents: 'none',
    width: `${width}px`, height: `${height}px`, boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    border: borderWidth ? `${borderWidth}px solid transparent` : 'none',
    padding: borderWidth ? '4px' : '0',
    fontFamily: layer.fontFamily || 'Inter', fontSize: `${text.fontSize()}px`,
    fontWeight: String(layer.fontWeight || 'normal'), fontStyle: layer.fontStyle || 'normal',
    lineHeight: String(layer.lineHeight || 1.2), letterSpacing: `${layer.letterSpacing || 0}px`,
    textAlign: layer.textAlign || 'center', whiteSpace: layer.smartSizing ? 'pre' : 'pre-wrap',
    wordBreak: layer.smartSizing ? 'normal' : 'break-word',
  } satisfies Partial<CSSStyleDeclaration>);
  const line = document.createElement('span');
  line.style.width = '100%';
  line.textContent = content;
  const baselineMarker = document.createElement('span');
  baselineMarker.style.cssText = 'display:inline-block;width:0;height:0;padding:0;margin:0;vertical-align:baseline';
  line.appendChild(baselineMarker);
  probe.appendChild(line);
  document.body.appendChild(probe);

  try {
    const domBaseline = baselineMarker.getBoundingClientRect().top - probe.getBoundingClientRect().top;
    ctx.textBaseline = 'middle';
    const middle = ctx.measureText(content);
    const offset = domBaseline - alphabetic.actualBoundingBoxAscent -
      (height / 2 - middle.actualBoundingBoxAscent);
    return Number.isFinite(offset) ? offset : 0;
  } finally {
    probe.remove();
  }
}

