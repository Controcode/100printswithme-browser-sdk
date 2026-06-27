// shared/textSvgGenerator.ts
import { Layer } from '../types';

// Helper to generate the specific SVG 'd' string based on the path type
const generatePathString = (type: string, w: number, h: number, curvature: number, fontSize: number): { d: string, trueHeight: number, yOffset: number } => {
  const c = curvature / 100; // Normalized -1 to 1 
  const arcMidY = h / 2;
  const padding = fontSize * 1.5; // Safe padding for all paths

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
        const intensity = w / 2;
        trueHeight = fontSize + intensity;
        yOffset = arcMidY + (intensity / 2);
        d = `M 0,${yOffset} Q ${w / 2},${yOffset - intensity * 2} ${w},${yOffset}`;
      }
      break;

    case 'arc-down': 
      {
        const intensity = w / 2;
        trueHeight = fontSize + intensity;
        yOffset = arcMidY - (intensity / 2);
        d = `M 0,${yOffset} Q ${w / 2},${yOffset + intensity * 2} ${w},${yOffset}`;
      }
      break;

    case 'circle-upper': 
      {
        const r = w / 2;
        trueHeight = r + fontSize;
        yOffset = arcMidY + (r / 2);
        d = `M 0,${yOffset} A ${r},${r} 0 0,1 ${w},${yOffset}`;
      }
      break;

    case 'circle-lower': 
      {
        const r = w / 2;
        trueHeight = r + fontSize;
        yOffset = arcMidY - (r / 2);
        d = `M 0,${yOffset} A ${r},${r} 0 0,0 ${w},${yOffset}`;
      }
      break;

    case 'full-circle': 
      {
        const r = Math.min(w, h) / 2 - padding;
        trueHeight = r * 2 + fontSize;
        yOffset = arcMidY;
        d = `M ${w/2 - r},${yOffset} A ${r},${r} 0 1,1 ${w/2 + r},${yOffset} A ${r},${r} 0 1,1 ${w/2 - r},${yOffset}`;
      }
      break;

    case 'wave': 
      {
        const amplitude = h / 3;
        trueHeight = (amplitude * 2) + fontSize;
        yOffset = arcMidY;
        d = `M 0,${yOffset} C ${w * 0.25},${yOffset - amplitude * 2} ${w * 0.75},${yOffset + amplitude * 2} ${w},${yOffset}`;
      }
      break;

    case 's-curve': 
      {
        const intensity = h / 2;
        trueHeight = intensity * 2 + fontSize;
        yOffset = arcMidY;
        d = `M 0,${yOffset + intensity} C ${w/3},${yOffset - intensity} ${(w/3)*2},${yOffset + intensity*2} ${w},${yOffset - intensity}`;
      }
      break;

    case 'diagonal-up':
      {
        trueHeight = h;
        yOffset = arcMidY;
        d = `M 0,${h - padding} L ${w},${padding}`;
      }
      break;

    case 'parabola':
      {
        const dip = h / 2 - padding;
        trueHeight = dip + fontSize;
        yOffset = padding;
        d = `M 0,${yOffset} Q ${w/2},${h} ${w},${yOffset}`;
      }
      break;

    case 'dynamic-arc':
    default:
      {
        const intensity = Math.abs(c) * (w / 1.5);
        trueHeight = fontSize + intensity;
        yOffset = arcMidY - trueHeight / 2 + fontSize;
        if (c === 0) {
          d = `M 0,${yOffset} L ${w},${yOffset}`;
        } else if (c > 0) {
          d = `M 0,${yOffset} Q ${w / 2},${yOffset + intensity * 2} ${w},${yOffset}`;
        } else {
          const startY = yOffset + intensity;
          d = `M 0,${startY} Q ${w / 2},${startY - intensity * 2} ${w},${startY}`;
        }
      }
      break;
  }

  return { d, trueHeight, yOffset };
};

export const generateTextSvgString = (layer: Layer, textStr: string, w: number, h: number): string => {
  const fontSize = layer.fontSize || 24;
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
  const cleanFontFamily = fontFamily.split(',')[0].trim().replace(/['"]/g, '');

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
          font-family: '${cleanFontFamily}', sans-serif;
          font-size: ${fontSize}px;
          font-weight: ${isBold ? 'bold' : 'normal'};
          font-style: ${isItalic ? 'italic' : 'normal'};
          letter-spacing: ${layer.letterSpacing || 0}px;
          text-decoration: ${layer.textDecoration === 'underline' ? 'underline' : 'none'};
        "
      >
        <textPath href="#path-${layer.id}" startOffset="${offset}%">
          ${textStr}
        </textPath>
      </text>
    </svg>
  `.trim();
};