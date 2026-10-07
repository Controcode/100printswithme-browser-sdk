import type { DocumentTemplate, Layer, TableCell } from '../types';
import type { FontManifestItem, FontStyle } from './font-loader';
import { cleanFontFamily } from './font-loader';

export interface BackendFontManifestItem {
  family: string;
  weight?: string | number;
  style?: FontStyle;
  url?: string;
}

export function normalizeFontWeight(value: string | number | undefined): number {
  const normalized = String(value ?? '400').toLowerCase();
  if (normalized === 'normal') return 400;
  if (normalized === 'bold') return 700;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : 400;
}

function manifestSource(manifest: BackendFontManifestItem[], family: string, weight: number, style: FontStyle): string | undefined {
  const candidates = manifest.filter(item => cleanFontFamily(item.family).toLowerCase() === family.toLowerCase());
  const exact = candidates.find(item => normalizeFontWeight(item.weight) === weight && (item.style || 'normal') === style);
  if (exact?.url) return exact.url;
  const sameStyle = candidates.find(item => item.style === style);
  if (sameStyle?.url) return sameStyle.url;
  const legacy = candidates.find(item => normalizeFontWeight(item.weight) === weight && item.style === undefined && style === 'normal');
  if (legacy?.url) return legacy.url;
  return style === 'normal' ? candidates.find(item => item.style === undefined)?.url : undefined;
}

export function collectTemplateFonts(template: DocumentTemplate, backendManifest: BackendFontManifestItem[] = []): FontManifestItem[] {
  const requirements = new Map<string, FontManifestItem>();

  const add = (familyValue: string | undefined, weightValue: string | number | undefined, styleValue: string | undefined,
    url?: string | null, sampleText?: string) => {
    if (!familyValue) return;
    const family = cleanFontFamily(familyValue);
    if (!family) return;
    const weight = normalizeFontWeight(weightValue);
    const style: FontStyle = styleValue === 'italic' ? 'italic' : 'normal';
    const source = url || manifestSource(backendManifest, family, weight, style);
    const key = `${family.toLowerCase()}|${weight}|${style}|${source || 'google'}`;
    if (!requirements.has(key)) requirements.set(key, { family, weight, style, url: source, sampleText: sampleText || 'Ag' });
  };

  const addCell = (cell: TableCell | undefined) => {
    if (cell) add(cell.fontFamily, cell.fontWeight, cell.fontStyle, undefined, cell.content);
  };

  const scan = (layers: Layer[]) => {
    for (const layer of layers) {
      if (layer.visible === false) continue;
      if (layer.type === 'text' || layer.type === 'textsvg') {
        add(layer.fontFamily || 'Inter', layer.fontWeight, layer.fontStyle, layer.fontUrl, layer.content);
      } else if (layer.type === 'table-svg') {
        for (const row of layer.tableData?.cells || []) for (const cell of row) addCell(cell);
      } else if (layer.type === 'chart-svg' && layer.chartData?.fontFamily) {
        add(layer.chartData.fontFamily, 400, 'normal', undefined, 'Ag');
      }
      const children = (layer as Layer & { layers?: Layer[] }).layers;
      if (Array.isArray(children)) scan(children);
    }
  };

  scan(template.frontLayers || []);
  scan(template.backLayers || []);
  return [...requirements.values()];
}
