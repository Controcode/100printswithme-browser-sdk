import Konva from 'konva';
import { Layer } from '../types';

export function applyKonvaFill(node: Konva.Shape, layer: Layer, w: number, h: number) {
  if (!layer.fillType || layer.fillType === 'solid') {
    node.fill(layer.color || '#000000');
    return;
  }

  const c1 = layer.color || '#000000';
  const c2 = layer.gradientColors?.[1] || '#ffffff';

  if (layer.fillType === 'linear') {
    const angleRad = ((layer.gradientAngle || 90) - 90) * (Math.PI / 180);
    const diagonal = Math.sqrt(w * w + h * h) / 2;
    const cx = w / 2, cy = h / 2;
    node.fillPriority('linear-gradient');
    node.fillLinearGradientStartPoint({ x: cx - Math.cos(angleRad) * diagonal, y: cy - Math.sin(angleRad) * diagonal });
    node.fillLinearGradientEndPoint({ x: cx + Math.cos(angleRad) * diagonal, y: cy + Math.sin(angleRad) * diagonal });
    node.fillLinearGradientColorStops([0, c1, 1, c2]);
  } else if (layer.fillType === 'radial') {
    node.fillPriority('radial-gradient');
    node.fillRadialGradientStartPoint({ x: w / 2, y: h / 2 });
    node.fillRadialGradientStartRadius(0);
    node.fillRadialGradientEndPoint({ x: w / 2, y: h / 2 });
    node.fillRadialGradientEndRadius(Math.max(w, h) / 2);
    node.fillRadialGradientColorStops([0, c1, 1, c2]);
  } else {
    node.fill(layer.color || '#000000');
  }
}

export function applyCommonProps(node: Konva.Shape, layer: Layer, innerW: number, innerH: number) {
  const w = layer.width || 100;
  const h = layer.height || 100;
  node.x(layer.x + w / 2);
  node.y(layer.y + h / 2);
  node.offsetX(innerW / 2);
  node.offsetY(innerH / 2);
  node.rotation(layer.rotation || 0);
  node.opacity(layer.opacity ?? 1);
  node.shadowColor(layer.shadowColor || 'transparent');
  node.shadowBlur(layer.shadowBlur || 0);
  node.shadowOffsetX(layer.shadowOffsetX || 0);
  node.shadowOffsetY(layer.shadowOffsetY || 0);
}
