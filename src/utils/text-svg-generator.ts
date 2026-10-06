// shared/textSvgGenerator.ts
import { Layer } from '../types';
import { fitBrowserTextSize } from '../render/smart-text-sizing';

// Helper to generate the specific SVG 'd' string based on the path type
const generatePathString = (type: string, w: number, h: number, curvature: number, fontSize: number): { d: string, trueHeight: number, yOffset: number } => {
  const c = curvature / 100; // Normalized -1 to 1 
  const arcMidY = h / 2;
  // Keep the baseline and the visible bend inside the editable layer. The old
  // width-based arcs put a 200px-wide curve far outside a 40px-high text box.
  const top = Math.min(h / 2, fontSize * 0.85);
  // A textPath positions the glyph baseline on the curve. Descenders and
  // rotated letters extend well below it, especially at the trough of a
  // downward arc. Keep that ink inside the SVG's own viewport even when the
  // layer has a CSS drop-shadow filter.
  const bottom = Math.max(top, h - fontSize * 0.55);
  const bend = Math.max(0, bottom - top);

  let d = '';
  let trueHeight = fontSize;
  let yOffset = arcMidY;

  switch (type) {
    case 'none':
    case 'normal':
      d = `M 0,${arcMidY} L ${w},${arcMidY}`;
      trueHeight = fontSize;
      yOffset = arcMidY;
      break;

    case 'arc-up': 
      {
        trueHeight = fontSize + bend;
        yOffset = bottom;
        d = `M 0,${bottom} Q ${w / 2},${2 * top - bottom} ${w},${bottom}`;
      }
      break;

    case 'arc-down': 
      {
        trueHeight = fontSize + bend;
        yOffset = top;
        d = `M 0,${top} Q ${w / 2},${2 * bottom - top} ${w},${top}`;
      }
      break;

    case 'circle-upper': 
      {
        trueHeight = bend + fontSize;
        yOffset = bottom;
        d = `M 0,${bottom} A ${w / 2},${Math.max(1, bend)} 0 0,1 ${w},${bottom}`;
      }
      break;

    case 'circle-lower': 
      {
        trueHeight = bend + fontSize;
        yOffset = top;
        d = `M 0,${top} A ${w / 2},${Math.max(1, bend)} 0 0,0 ${w},${top}`;
      }
      break;

    case 'full-circle': 
      {
        const r = Math.max(1, Math.min(w, h) / 2 - Math.min(fontSize * 0.55, Math.min(w, h) * 0.2));
        trueHeight = r * 2 + fontSize;
        yOffset = arcMidY;
        d = `M ${w/2 - r},${yOffset} A ${r},${r} 0 1,1 ${w/2 + r},${yOffset} A ${r},${r} 0 1,1 ${w/2 - r},${yOffset}`;
      }
      break;

    case 'wave': 
      {
        const amplitude = bend / 2;
        trueHeight = (amplitude * 2) + fontSize;
        yOffset = arcMidY;
        d = `M 0,${yOffset} C ${w * 0.25},${Math.max(top, yOffset - amplitude * 2)} ${w * 0.75},${Math.min(bottom, yOffset + amplitude * 2)} ${w},${yOffset}`;
      }
      break;

    case 's-curve': 
      {
        const intensity = bend;
        trueHeight = intensity + fontSize;
        yOffset = arcMidY;
        d = `M 0,${bottom} C ${w/3},${top} ${(w/3)*2},${bottom} ${w},${top}`;
      }
      break;

    case 'diagonal-up':
      {
        trueHeight = h;
        yOffset = arcMidY;
        d = `M 0,${bottom} L ${w},${top}`;
      }
      break;

    case 'parabola':
      {
        const dip = bend;
        trueHeight = dip + fontSize;
        yOffset = top;
        d = `M 0,${top} Q ${w/2},${2 * bottom - top} ${w},${top}`;
      }
      break;

    case 'dynamic-arc':
    default:
      {
        const intensity = Math.abs(c) * bend;
        trueHeight = fontSize + intensity;
        yOffset = arcMidY;
        if (c === 0) {
          d = `M 0,${arcMidY} L ${w},${arcMidY}`;
        } else if (c > 0) {
          d = `M 0,${top} Q ${w / 2},${top + intensity * 2} ${w},${top}`;
        } else {
          d = `M 0,${bottom} Q ${w / 2},${bottom - intensity * 2} ${w},${bottom}`;
        }
      }
      break;
  }

  return { d, trueHeight, yOffset };
};

export const generateTextSvgString = (layer: Layer, textStr: string, w: number, h: number): string => {
  const fontSize = layer.smartSizing ? fitBrowserTextSize(layer, textStr, w, h) : layer.fontSize || 24;
  const offset = layer.pathOffset ?? 50; 

  const { d } = generatePathString(layer.pathType || 'dynamic-arc', w, h, layer.curvature || 0, fontSize);

  const isGradient = layer.fillType === 'linear' || layer.fillType === 'radial';
  const c1 = layer.color || '#000000';
  const c2 = layer.gradientColors?.[1] || '#ffffff';
  const gradId = `svg-grad-${layer.id}`;
  let defs = '';
  
  if (isGradient) {
    if (layer.fillType === 'linear') {
      const angleRad = ((layer.gradientAngle || 90) - 90) * (Math.PI / 180);
      const diagonal = Math.sqrt(w * w + h * h) / 2;
      const cx = w / 2, cy = h / 2;
      const x1 = cx - Math.cos(angleRad) * diagonal;
      const y1 = cy - Math.sin(angleRad) * diagonal;
      const x2 = cx + Math.cos(angleRad) * diagonal;
      const y2 = cy + Math.sin(angleRad) * diagonal;
      
      defs = `<defs><linearGradient id="${gradId}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${c1}" /><stop offset="100%" stop-color="${c2}" /></linearGradient></defs>`;
    } else {
      defs = `<defs><radialGradient id="${gradId}" cx="${w/2}" cy="${h/2}" r="${Math.max(w, h)/2}" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${c1}" /><stop offset="100%" stop-color="${c2}" /></radialGradient></defs>`;
    }
  }

  const fill = isGradient ? `url(#${gradId})` : c1;
  const isBold = layer.fontWeight?.toString() === 'bold' || Number(layer.fontWeight) > 600;
  const isItalic = layer.fontStyle === 'italic';
  const fontFamily = layer.fontFamily || 'Inter';

  // 🚨 THE FIX: 
  // 1. text-anchor="middle" is moved to the <text> tag
  // 2. dominant-baseline="middle" is also on the <text> tag
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow: visible;">
      ${defs}
      <path id="path-${layer.id}" d="${d}" fill="none" stroke="none" />
      <text
        fill="${fill}"
        text-anchor="middle"
        dominant-baseline="middle"
        style="
          font-family: '${fontFamily}', sans-serif;
          font-size: ${fontSize}px;
          font-weight: ${isBold ? 'bold' : 'normal'};
          font-style: ${isItalic ? 'italic' : 'normal'};
          letter-spacing: ${layer.letterSpacing || 0}px;
          text-decoration: ${layer.textDecoration === 'underline' ? 'underline' : 'none'};
        "
      >
        <textPath href="#path-${layer.id}" startOffset="${offset}%">
          ${textStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
        </textPath>
      </text>
    </svg>
  `.trim();
};
