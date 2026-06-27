import { Layer, ChartData, ChartSubtype, ChartDataSeries } from '../types';

// ── XML escape ────────────────────────────────────────────────────────────────
// ── Text resolver ─────────────────────────────────────────────────────────────
function resolveText(val: string, resolver?: (t: string) => string): string {
  return resolver ? resolver(val) : val;
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ── Numeric resolver ──────────────────────────────────────────────────────────
function toNum(val: string, resolver?: (t: string) => string): number {
  const resolved = resolver ? resolver(val) : val;
  const n = parseFloat(resolved);
  return isNaN(n) ? 0 : n;
}

// ── Polar to cartesian ────────────────────────────────────────────────────────
function polarToCart(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// ── Arc path for pie/donut/ring ───────────────────────────────────────────────
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCart(cx, cy, r, endAngle);
  const end = polarToCart(cx, cy, r, startAngle);
  const large = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

// ── Default color palettes ────────────────────────────────────────────────────
const DEFAULT_COLORS = ['#4F86F7', '#7C5CFC', '#F59E0B', '#10B981', '#EF4444', '#EC4899', '#06B6D4', '#8B5CF6'];

// ── Default chart data factory ────────────────────────────────────────────────
export function createDefaultChartData(subtype: ChartSubtype): ChartData {
  const base: ChartData = {
    subtype,
    categories: [],
    series: [],
    colors: [...DEFAULT_COLORS],
    showLabels: true,
    showLegend: false,
    showGrid: true,
    showValues: false,
    fontSize: 11,
    fontFamily: 'Inter, Arial, sans-serif',
    labelColor: '#64748b',
    axisColor: '#cbd5e1',
    gridColor: '#f1f5f9',
  };

  switch (subtype) {
    case 'bar':
    case 'row':
      return { ...base, categories: ['Jan', 'Feb', 'Mar', 'Apr'], series: [{ label: 'Sales', values: ['65', '80', '45', '90'], color: '#4F86F7' }], barWidth: 0.6, barGap: 8, barRadius: 4 };
    case 'categorical-bar':
    case 'categorical-row':
      return { ...base, categories: ['Q1', 'Q2', 'Q3'], series: [{ label: 'A', values: ['40', '65', '50'], color: '#4F86F7' }, { label: 'B', values: ['55', '40', '70'], color: '#F59E0B' }], barWidth: 0.7, barGap: 4, barRadius: 3 };
    case 'grouped-bar':
    case 'grouped-row':
      return { ...base, categories: ['Mon', 'Tue', 'Wed'], series: [{ label: 'Team A', values: ['30', '50', '70'], color: '#4F86F7' }, { label: 'Team B', values: ['45', '35', '60'], color: '#7C5CFC' }], barWidth: 0.8, barGap: 2, barRadius: 3 };
    case 'stacked-bar':
    case 'stacked-row':
    case 'stacked-proportional':
      return { ...base, categories: ['2023', '2024', '2025'], series: [{ label: 'Product', values: ['30', '40', '50'], color: '#4F86F7' }, { label: 'Service', values: ['20', '35', '25'], color: '#7C5CFC' }, { label: 'Other', values: ['10', '15', '20'], color: '#F59E0B' }], barWidth: 0.6, barRadius: 0 };
    case 'line':
      return { ...base, categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May'], series: [{ label: 'Revenue', values: ['30', '45', '35', '60', '50'], color: '#4F86F7' }], lineWidth: 2.5, lineSmooth: true, showDots: true, dotRadius: 4 };
    case 'multi-line':
      return { ...base, categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May'], series: [{ label: 'Revenue', values: ['30', '45', '35', '60', '50'], color: '#4F86F7' }, { label: 'Cost', values: ['20', '25', '40', '30', '35'], color: '#7C5CFC' }], lineWidth: 2.5, lineSmooth: true, showDots: true, dotRadius: 4 };
    case 'pie':
      return { ...base, categories: ['Desktop', 'Mobile', 'Tablet'], series: [{ label: 'Usage', values: ['55', '35', '10'], color: '#4F86F7' }], startAngle: 0, showLabels: true, showValues: true };
    case 'donut':
      return { ...base, categories: ['Desktop', 'Mobile', 'Tablet'], series: [{ label: 'Usage', values: ['55', '35', '10'], color: '#4F86F7' }], startAngle: 0, donutWidth: 0.55, showLabels: true, showValues: true };
    case 'progress-ring':
      return { ...base, percentage: '72', trackColor: '#e2e8f0', fillColor: '#4F86F7', strokeWidth: 12, roundedEnds: true, showPercentageLabel: true };
    case 'radial-progress':
      return { ...base, percentage: '65', trackColor: '#e2e8f0', fillColor: '#4F86F7', strokeWidth: 14, roundedEnds: true, showPercentageLabel: true };
    case 'progress-bar':
      return { ...base, percentage: '60', trackColor: '#e2e8f0', fillColor: '#4F86F7', strokeWidth: 20, roundedEnds: true, showPercentageLabel: true };
    case 'progress-dial':
      return { ...base, percentage: '70', trackColor: '#e2e8f0', fillColor: '#4F86F7', strokeWidth: 10, roundedEnds: true, showPercentageLabel: true };
    default:
      return base;
  }
}

// ── Default sizes per chart type ──────────────────────────────────────────────
export function getDefaultChartSize(subtype: ChartSubtype): { width: number; height: number } {
  switch (subtype) {
    case 'bar': case 'categorical-bar': case 'grouped-bar': case 'stacked-bar': case 'stacked-proportional':
      return { width: 360, height: 260 };
    case 'row': case 'categorical-row': case 'grouped-row': case 'stacked-row':
      return { width: 360, height: 240 };
    case 'line': case 'multi-line':
      return { width: 380, height: 240 };
    case 'pie': case 'donut':
      return { width: 240, height: 240 };
    case 'progress-ring':
      return { width: 150, height: 150 };
    case 'radial-progress':
      return { width: 160, height: 110 };
    case 'progress-bar':
      return { width: 220, height: 50 };
    case 'progress-dial':
      return { width: 160, height: 120 };
    default:
      return { width: 300, height: 250 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════
export function generateChartSvg(layer: Layer, resolver?: (text: string) => string): string {
  const cd = layer.chartData;
  if (!cd) return '';

  const W = layer.width ?? 300;
  const H = layer.height ?? 250;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;

  switch (cd.subtype) {
    case 'bar': svg += renderBarChart(cd, W, H, false, resolver); break;
    case 'row': svg += renderBarChart(cd, W, H, true, resolver); break;
    case 'categorical-bar': svg += renderGroupedBar(cd, W, H, false, resolver); break;
    case 'categorical-row': svg += renderGroupedBar(cd, W, H, true, resolver); break;
    case 'grouped-bar': svg += renderGroupedBar(cd, W, H, false, resolver); break;
    case 'grouped-row': svg += renderGroupedBar(cd, W, H, true, resolver); break;
    case 'stacked-bar': svg += renderStackedBar(cd, W, H, false, false, resolver); break;
    case 'stacked-row': svg += renderStackedBar(cd, W, H, true, false, resolver); break;
    case 'stacked-proportional': svg += renderStackedBar(cd, W, H, false, true, resolver); break;
    case 'line': svg += renderLineChart(cd, W, H, resolver); break;
    case 'multi-line': svg += renderLineChart(cd, W, H, resolver); break;
    case 'pie': svg += renderPieDonut(cd, W, H, false, resolver); break;
    case 'donut': svg += renderPieDonut(cd, W, H, true, resolver); break;
    case 'progress-ring': svg += renderProgressRing(cd, W, H, resolver); break;
    case 'radial-progress': svg += renderRadialProgress(cd, W, H, resolver); break;
    case 'progress-bar': svg += renderProgressBarChart(cd, W, H, resolver); break;
    case 'progress-dial': svg += renderProgressDial(cd, W, H, resolver); break;
  }

  svg += '</svg>';
  return svg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BAR / ROW CHART (single series)
// ═══════════════════════════════════════════════════════════════════════════════
function renderBarChart(cd: ChartData, W: number, H: number, horizontal: boolean, resolver?: (t: string) => string): string {
  let s = '';
  let maxCatLen = 0;
  (cd.categories || []).forEach(c => {
    const len = resolveText(c || "", resolver).length;
    if (len > maxCatLen) maxCatLen = len;
  });
  const isHorizontal = typeof horizontal !== "undefined" ? horizontal : false;
  const PAD = { top: 20, right: 20, bottom: 35, left: isHorizontal ? Math.max(40, maxCatLen * 6.5 + 15) : 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const vals = (cd.series[0]?.values || []).map(v => toNum(v, resolver));
  const cats = cd.categories;
  const maxVal = Math.max(...vals, 1);
  const n = cats.length;
  const barRatio = cd.barWidth ?? 0.6;
  const radius = cd.barRadius ?? 4;
  const color = cd.series[0]?.color || cd.colors[0] || '#4F86F7';
  const rawFont = cd.fontFamily || 'Inter';
  const font = rawFont.split(',')[0].trim().replace(/['"]/g, '');
  const labelClr = cd.labelColor || '#64748b';
  const fs = cd.fontSize || 11;

  if (!horizontal) {
    // Vertical bars
    const slotW = plotW / n;
    const bw = slotW * barRatio;

    // Grid lines
    if (cd.showGrid) {
      for (let i = 0; i <= 4; i++) {
        const y = PAD.top + plotH - (plotH * i) / 4;
        s += `<line x1="${PAD.left}" y1="${y}" x2="${PAD.left + plotW}" y2="${y}" stroke="${cd.gridColor || '#f1f5f9'}" stroke-width="1"/>`;
      }
    }

    // Bars
    for (let i = 0; i < n; i++) {
      const x = PAD.left + slotW * i + (slotW - bw) / 2;
      const barH = (vals[i] / maxVal) * plotH;
      const y = PAD.top + plotH - barH;
      s += `<rect x="${x}" y="${y}" width="${bw}" height="${barH}" fill="${color}" rx="${radius}" ry="${radius}"/>`;

      // Value label
      if (cd.showValues) {
        s += `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" font-size="${fs - 1}" font-family="${font}" fill="${labelClr}" font-weight="600">${esc(String(vals[i]))}</text>`;
      }

      // Category label
      if (cd.showLabels) {
        s += `<text x="${x + bw / 2}" y="${PAD.top + plotH + 16}" text-anchor="middle" font-size="${fs - 1}" font-family="${font}" fill="${labelClr}">${esc(resolveText(cats[i] || '', resolver))}</text>`;
      }
    }

    // Axis
    s += `<line x1="${PAD.left}" y1="${PAD.top + plotH}" x2="${PAD.left + plotW}" y2="${PAD.top + plotH}" stroke="${cd.axisColor || '#cbd5e1'}" stroke-width="1"/>`;
    s += `<line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + plotH}" stroke="${cd.axisColor || '#cbd5e1'}" stroke-width="1"/>`;
  } else {
    // Horizontal bars (row chart)
    const slotH = plotH / n;
    const bh = slotH * barRatio;

    if (cd.showGrid) {
      for (let i = 0; i <= 4; i++) {
        const x = PAD.left + (plotW * i) / 4;
        s += `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + plotH}" stroke="${cd.gridColor || '#f1f5f9'}" stroke-width="1"/>`;
      }
    }

    for (let i = 0; i < n; i++) {
      const y = PAD.top + slotH * i + (slotH - bh) / 2;
      const bw = (vals[i] / maxVal) * plotW;
      s += `<rect x="${PAD.left}" y="${y}" width="${bw}" height="${bh}" fill="${color}" rx="${radius}" ry="${radius}"/>`;

      if (cd.showValues) {
        s += `<text x="${PAD.left + bw + 5}" y="${y + bh / 2}" dominant-baseline="central" font-size="${fs - 1}" font-family="${font}" fill="${labelClr}" font-weight="600">${esc(String(vals[i]))}</text>`;
      }
      if (cd.showLabels) {
        s += `<text x="${PAD.left - 5}" y="${y + bh / 2}" text-anchor="end" dominant-baseline="central" font-size="${fs - 1}" font-family="${font}" fill="${labelClr}">${esc(resolveText(cats[i] || '', resolver))}</text>`;
      }
    }

    s += `<line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + plotH}" stroke="${cd.axisColor || '#cbd5e1'}" stroke-width="1"/>`;
    s += `<line x1="${PAD.left}" y1="${PAD.top + plotH}" x2="${PAD.left + plotW}" y2="${PAD.top + plotH}" stroke="${cd.axisColor || '#cbd5e1'}" stroke-width="1"/>`;
  }

  return s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROUPED / CATEGORICAL BAR CHART
// ═══════════════════════════════════════════════════════════════════════════════
function renderGroupedBar(cd: ChartData, W: number, H: number, horizontal: boolean, resolver?: (t: string) => string): string {
  let s = '';
  let maxCatLen = 0;
  (cd.categories || []).forEach(c => {
    const len = resolveText(c || "", resolver).length;
    if (len > maxCatLen) maxCatLen = len;
  });
  const isHorizontal = typeof horizontal !== "undefined" ? horizontal : false;
  const PAD = { top: 20, right: 20, bottom: 35, left: isHorizontal ? Math.max(40, maxCatLen * 6.5 + 15) : 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const cats = cd.categories;
  const n = cats.length;
  const numSeries = cd.series.length;
  const radius = cd.barRadius ?? 3;
  const rawFont = cd.fontFamily || 'Inter';
  const font = rawFont.split(',')[0].trim().replace(/['"]/g, '');
  const labelClr = cd.labelColor || '#64748b';
  const fs = cd.fontSize || 11;

  const allVals = cd.series.flatMap(s => s.values.map(v => toNum(v, resolver)));
  const maxVal = Math.max(...allVals, 1);

  if (!horizontal) {
    const slotW = plotW / n;
    const groupW = slotW * (cd.barWidth ?? 0.8);
    const singleBarW = groupW / numSeries;
    const gap = cd.barGap ?? 2;

    if (cd.showGrid) {
      for (let i = 0; i <= 4; i++) {
        const y = PAD.top + plotH - (plotH * i) / 4;
        s += `<line x1="${PAD.left}" y1="${y}" x2="${PAD.left + plotW}" y2="${y}" stroke="${cd.gridColor || '#f1f5f9'}" stroke-width="1"/>`;
      }
    }

    for (let i = 0; i < n; i++) {
      const groupX = PAD.left + slotW * i + (slotW - groupW) / 2;
      for (let si = 0; si < numSeries; si++) {
        const val = toNum(cd.series[si].values[i] || '0', resolver);
        const barH = (val / maxVal) * plotH;
        const x = groupX + si * singleBarW + gap / 2;
        const bw = singleBarW - gap;
        const y = PAD.top + plotH - barH;
        s += `<rect x="${x}" y="${y}" width="${bw}" height="${barH}" fill="${cd.series[si].color || cd.colors[si] || '#4F86F7'}" rx="${radius}" ry="${radius}"/>`;
        if (cd.showValues) {
          s += `<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" font-size="${fs - 2}" font-family="${font}" fill="${labelClr}" font-weight="600">${val}</text>`;
        }
      }
      if (cd.showLabels) {
        s += `<text x="${PAD.left + slotW * i + slotW / 2}" y="${PAD.top + plotH + 16}" text-anchor="middle" font-size="${fs - 1}" font-family="${font}" fill="${labelClr}">${esc(resolveText(cats[i] || '', resolver))}</text>`;
      }
    }

    s += `<line x1="${PAD.left}" y1="${PAD.top + plotH}" x2="${PAD.left + plotW}" y2="${PAD.top + plotH}" stroke="${cd.axisColor || '#cbd5e1'}" stroke-width="1"/>`;
    s += `<line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + plotH}" stroke="${cd.axisColor || '#cbd5e1'}" stroke-width="1"/>`;
  } else {
    const slotH = plotH / n;
    const groupH = slotH * (cd.barWidth ?? 0.8);
    const singleBarH = groupH / numSeries;
    const gap = cd.barGap ?? 2;

    if (cd.showGrid) {
      for (let i = 0; i <= 4; i++) {
        const x = PAD.left + (plotW * i) / 4;
        s += `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + plotH}" stroke="${cd.gridColor || '#f1f5f9'}" stroke-width="1"/>`;
      }
    }

    for (let i = 0; i < n; i++) {
      const groupY = PAD.top + slotH * i + (slotH - groupH) / 2;
      for (let si = 0; si < numSeries; si++) {
        const val = toNum(cd.series[si].values[i] || '0', resolver);
        const barW = (val / maxVal) * plotW;
        const y = groupY + si * singleBarH + gap / 2;
        const bh = singleBarH - gap;
        s += `<rect x="${PAD.left}" y="${y}" width="${barW}" height="${bh}" fill="${cd.series[si].color || cd.colors[si] || '#4F86F7'}" rx="${radius}" ry="${radius}"/>`;
      }
      if (cd.showLabels) {
        s += `<text x="${PAD.left - 5}" y="${PAD.top + slotH * i + slotH / 2}" text-anchor="end" dominant-baseline="central" font-size="${fs - 1}" font-family="${font}" fill="${labelClr}">${esc(resolveText(cats[i] || '', resolver))}</text>`;
      }
    }

    s += `<line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + plotH}" stroke="${cd.axisColor || '#cbd5e1'}" stroke-width="1"/>`;
    s += `<line x1="${PAD.left}" y1="${PAD.top + plotH}" x2="${PAD.left + plotW}" y2="${PAD.top + plotH}" stroke="${cd.axisColor || '#cbd5e1'}" stroke-width="1"/>`;
  }

  return s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STACKED BAR CHART
// ═══════════════════════════════════════════════════════════════════════════════
function renderStackedBar(cd: ChartData, W: number, H: number, horizontal: boolean, proportional: boolean, resolver?: (t: string) => string): string {
  let s = '';
  let maxCatLen = 0;
  (cd.categories || []).forEach(c => {
    const len = resolveText(c || "", resolver).length;
    if (len > maxCatLen) maxCatLen = len;
  });
  const isHorizontal = typeof horizontal !== "undefined" ? horizontal : false;
  const PAD = { top: 20, right: 20, bottom: 35, left: isHorizontal ? Math.max(40, maxCatLen * 6.5 + 15) : 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const cats = cd.categories;
  const n = cats.length;
  const radius = cd.barRadius ?? 0;
  const rawFont = cd.fontFamily || 'Inter';
  const font = rawFont.split(',')[0].trim().replace(/['"]/g, '');
  const labelClr = cd.labelColor || '#64748b';
  const fs = cd.fontSize || 11;
  const barRatio = cd.barWidth ?? 0.6;

  // Compute totals per category
  const totals = cats.map((_, ci) => cd.series.reduce((sum, s) => sum + toNum(s.values[ci] || '0', resolver), 0));
  const maxTotal = proportional ? 1 : Math.max(...totals, 1);

  if (!horizontal) {
    const slotW = plotW / n;
    const bw = slotW * barRatio;

    if (cd.showGrid) {
      for (let i = 0; i <= 4; i++) {
        const y = PAD.top + plotH - (plotH * i) / 4;
        s += `<line x1="${PAD.left}" y1="${y}" x2="${PAD.left + plotW}" y2="${y}" stroke="${cd.gridColor || '#f1f5f9'}" stroke-width="1"/>`;
      }
    }

    for (let ci = 0; ci < n; ci++) {
      const x = PAD.left + slotW * ci + (slotW - bw) / 2;
      let yOffset = 0;
      for (let si = 0; si < cd.series.length; si++) {
        const raw = toNum(cd.series[si].values[ci] || '0', resolver);
        const val = proportional ? (totals[ci] > 0 ? raw / totals[ci] : 0) : raw;
        const barH = (val / maxTotal) * plotH;
        const y = PAD.top + plotH - yOffset - barH;
        s += `<rect x="${x}" y="${y}" width="${bw}" height="${barH}" fill="${cd.series[si].color || cd.colors[si] || '#4F86F7'}" rx="${radius}" ry="${radius}"/>`;
        yOffset += barH;
      }
      if (cd.showLabels) {
        s += `<text x="${x + bw / 2}" y="${PAD.top + plotH + 16}" text-anchor="middle" font-size="${fs - 1}" font-family="${font}" fill="${labelClr}">${esc(resolveText(cats[ci] || '', resolver))}</text>`;
      }
    }

    s += `<line x1="${PAD.left}" y1="${PAD.top + plotH}" x2="${PAD.left + plotW}" y2="${PAD.top + plotH}" stroke="${cd.axisColor || '#cbd5e1'}" stroke-width="1"/>`;
    s += `<line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + plotH}" stroke="${cd.axisColor || '#cbd5e1'}" stroke-width="1"/>`;
  } else {
    const slotH = plotH / n;
    const bh = slotH * barRatio;

    for (let ci = 0; ci < n; ci++) {
      const y = PAD.top + slotH * ci + (slotH - bh) / 2;
      let xOff = 0;
      for (let si = 0; si < cd.series.length; si++) {
        const raw = toNum(cd.series[si].values[ci] || '0', resolver);
        const val = proportional ? (totals[ci] > 0 ? raw / totals[ci] : 0) : raw;
        const barW = (val / maxTotal) * plotW;
        s += `<rect x="${PAD.left + xOff}" y="${y}" width="${barW}" height="${bh}" fill="${cd.series[si].color || cd.colors[si] || '#4F86F7'}" rx="${radius}" ry="${radius}"/>`;
        xOff += barW;
      }
      if (cd.showLabels) {
        s += `<text x="${PAD.left - 5}" y="${y + bh / 2}" text-anchor="end" dominant-baseline="central" font-size="${fs - 1}" font-family="${font}" fill="${labelClr}">${esc(resolveText(cats[ci] || '', resolver))}</text>`;
      }
    }

    s += `<line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + plotH}" stroke="${cd.axisColor || '#cbd5e1'}" stroke-width="1"/>`;
  }

  return s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LINE CHART (single + multi-line)
// ═══════════════════════════════════════════════════════════════════════════════
function renderLineChart(cd: ChartData, W: number, H: number, resolver?: (t: string) => string): string {
  let s = '';
  let maxCatLen = 0;
  (cd.categories || []).forEach(c => {
    const len = resolveText(c || "", resolver).length;
    if (len > maxCatLen) maxCatLen = len;
  });
  const isHorizontal = false;
  const PAD = { top: 20, right: 20, bottom: 35, left: isHorizontal ? Math.max(40, maxCatLen * 6.5 + 15) : 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const cats = cd.categories;
  const n = cats.length;
  const rawFont = cd.fontFamily || 'Inter';
  const font = rawFont.split(',')[0].trim().replace(/['"]/g, '');
  const labelClr = cd.labelColor || '#64748b';
  const fs = cd.fontSize || 11;
  const lw = cd.lineWidth ?? 2.5;
  const dotR = cd.dotRadius ?? 4;

  const allVals = cd.series.flatMap(ser => ser.values.map(v => toNum(v, resolver)));
  const maxVal = Math.max(...allVals, 1);

  // Grid
  if (cd.showGrid) {
    for (let i = 0; i <= 4; i++) {
      const y = PAD.top + plotH - (plotH * i) / 4;
      s += `<line x1="${PAD.left}" y1="${y}" x2="${PAD.left + plotW}" y2="${y}" stroke="${cd.gridColor || '#f1f5f9'}" stroke-width="1"/>`;
    }
  }

  // Lines
  for (const ser of cd.series) {
    const vals = ser.values.map(v => toNum(v, resolver));
    const points: { x: number; y: number }[] = [];

    for (let i = 0; i < n; i++) {
      const x = PAD.left + (i / Math.max(n - 1, 1)) * plotW;
      const y = PAD.top + plotH - (vals[i] / maxVal) * plotH;
      points.push({ x, y });
    }

    const color = ser.color || cd.colors[0] || '#4F86F7';

    // Draw area fill (subtle)
    if (points.length > 1) {
      let areaPath = `M ${points[0].x} ${PAD.top + plotH}`;
      if (cd.lineSmooth && points.length > 2) {
        areaPath += ` L ${points[0].x} ${points[0].y}`;
        areaPath += smoothPath(points);
        areaPath += ` L ${points[points.length - 1].x} ${PAD.top + plotH} Z`;
      } else {
        for (const p of points) areaPath += ` L ${p.x} ${p.y}`;
        areaPath += ` L ${points[points.length - 1].x} ${PAD.top + plotH} Z`;
      }
      s += `<path d="${areaPath}" fill="${color}" fill-opacity="0.08"/>`;
    }

    // Draw line
    if (points.length > 1) {
      let linePath = `M ${points[0].x} ${points[0].y}`;
      if (cd.lineSmooth && points.length > 2) {
        linePath += smoothPath(points);
      } else {
        for (let i = 1; i < points.length; i++) linePath += ` L ${points[i].x} ${points[i].y}`;
      }
      s += `<path d="${linePath}" fill="none" stroke="${color}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }

    // Dots
    if (cd.showDots) {
      for (const p of points) {
        s += `<circle cx="${p.x}" cy="${p.y}" r="${dotR}" fill="white" stroke="${color}" stroke-width="${lw}"/>`;
      }
    }
  }

  // Category labels
  if (cd.showLabels) {
    for (let i = 0; i < n; i++) {
      const x = PAD.left + (i / Math.max(n - 1, 1)) * plotW;
      s += `<text x="${x}" y="${PAD.top + plotH + 16}" text-anchor="middle" font-size="${fs - 1}" font-family="${font}" fill="${labelClr}">${esc(resolveText(cats[i] || '', resolver))}</text>`;
    }
  }

  // Axes
  s += `<line x1="${PAD.left}" y1="${PAD.top + plotH}" x2="${PAD.left + plotW}" y2="${PAD.top + plotH}" stroke="${cd.axisColor || '#cbd5e1'}" stroke-width="1"/>`;
  s += `<line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + plotH}" stroke="${cd.axisColor || '#cbd5e1'}" stroke-width="1"/>`;

  return s;
}

// Smooth line helper (cubic bezier)
function smoothPath(points: { x: number; y: number }[]): string {
  let d = '';
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
    const cpy1 = prev.y;
    const cpx2 = curr.x - (curr.x - prev.x) * 0.4;
    const cpy2 = curr.y;
    d += ` C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${curr.x} ${curr.y}`;
  }
  return d;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PIE / DONUT CHART
// ═══════════════════════════════════════════════════════════════════════════════
function renderPieDonut(cd: ChartData, W: number, H: number, isDonut: boolean, resolver?: (t: string) => string): string {
  let s = '';
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) / 2 - 20;
  const innerR = isDonut ? r * (cd.donutWidth ?? 0.55) : 0;
  const vals = (cd.series[0]?.values || []).map(v => toNum(v, resolver));
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  const cats = cd.categories;
  const rawFont = cd.fontFamily || 'Inter';
  const font = rawFont.split(',')[0].trim().replace(/['"]/g, '');
  const labelClr = cd.labelColor || '#64748b';
  const fs = cd.fontSize || 11;

  let currentAngle = cd.startAngle || 0;

  for (let i = 0; i < vals.length; i++) {
    const sliceAngle = (vals[i] / total) * 360;
    if (sliceAngle <= 0) { currentAngle += sliceAngle; continue; }

    const color = cd.colors[i % cd.colors.length] || '#4F86F7';
    const startA = currentAngle;
    const endA = currentAngle + sliceAngle;

    // Slice path
    if (isDonut) {
      const outerStart = polarToCart(cx, cy, r, startA);
      const outerEnd = polarToCart(cx, cy, r, endA);
      const innerStart = polarToCart(cx, cy, innerR, startA);
      const innerEnd = polarToCart(cx, cy, innerR, endA);
      const large = sliceAngle > 180 ? '1' : '0';

      s += `<path d="M ${outerStart.x} ${outerStart.y} A ${r} ${r} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A ${innerR} ${innerR} 0 ${large} 0 ${innerStart.x} ${innerStart.y} Z" fill="${color}"/>`;
    } else {
      if (sliceAngle >= 359.99) {
        // Full circle
        s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;
      } else {
        const start = polarToCart(cx, cy, r, startA);
        const end = polarToCart(cx, cy, r, endA);
        const large = sliceAngle > 180 ? '1' : '0';
        s += `<path d="M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y} Z" fill="${color}"/>`;
      }
    }

    // Label
    if (cd.showLabels && cats[i]) {
      const midAngle = startA + sliceAngle / 2;
      const labelR = isDonut ? (r + innerR) / 2 : r * 0.65;
      const lp = polarToCart(cx, cy, labelR, midAngle);
      const pct = Math.round((vals[i] / total) * 100);
      const label = cd.showValues ? `${pct}%` : esc(resolveText(cats[i] || '', resolver));
      s += `<text x="${lp.x}" y="${lp.y}" text-anchor="middle" dominant-baseline="central" font-size="${fs - 1}" font-family="${font}" fill="white" font-weight="700">${label}</text>`;
    }

    currentAngle = endA;
  }

  return s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS RING (full circle)
// ═══════════════════════════════════════════════════════════════════════════════
function renderProgressRing(cd: ChartData, W: number, H: number, resolver?: (t: string) => string): string {
  let s = '';
  const cx = W / 2;
  const cy = H / 2;
  const sw = cd.strokeWidth || 12;
  const r = Math.min(W, H) / 2 - sw / 2 - 6;
  const pct = Math.min(100, Math.max(0, toNum(cd.percentage || '0', resolver)));
  const trackColor = cd.trackColor || '#e2e8f0';
  const fillColor = cd.fillColor || '#4F86F7';
  const rawFont = cd.fontFamily || 'Inter';
  const font = rawFont.split(',')[0].trim().replace(/['"]/g, '');
  const linecap = cd.roundedEnds ? 'round' : 'butt';

  // Track
  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${trackColor}" stroke-width="${sw}"/>`;

  // Progress arc
  if (pct > 0) {
    const circumference = 2 * Math.PI * r;
    const dashLen = (pct / 100) * circumference;
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${fillColor}" stroke-width="${sw}" stroke-linecap="${linecap}" stroke-dasharray="${dashLen} ${circumference}" transform="rotate(-90 ${cx} ${cy})"/>`;
  }

  // Label
  if (cd.showPercentageLabel) {
    s += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(r * 0.55)}" font-family="${font}" fill="${fillColor}" font-weight="800">${Math.round(pct)}%</text>`;
  }

  return s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RADIAL PROGRESS (semi-circle / half-arc)
// ═══════════════════════════════════════════════════════════════════════════════
function renderRadialProgress(cd: ChartData, W: number, H: number, resolver?: (t: string) => string): string {
  let s = '';
  const cx = W / 2;
  const sw = cd.strokeWidth || 14;
  const r = Math.min(W / 2, H) - sw / 2 - 8;
  const cy = H - 10;
  const pct = Math.min(100, Math.max(0, toNum(cd.percentage || '0', resolver)));
  const trackColor = cd.trackColor || '#e2e8f0';
  const fillColor = cd.fillColor || '#4F86F7';
  const rawFont = cd.fontFamily || 'Inter';
  const font = rawFont.split(',')[0].trim().replace(/['"]/g, '');
  const linecap = cd.roundedEnds ? 'round' : 'butt';

  // Track arc (180°)
  const trackPath = arcPath(cx, cy, r, 180, 360);
  s += `<path d="${trackPath}" fill="none" stroke="${trackColor}" stroke-width="${sw}" stroke-linecap="${linecap}"/>`;

  // Progress arc
  if (pct > 0) {
    const endAngle = 180 + (pct / 100) * 180;
    const progressPath = arcPath(cx, cy, r, 180, endAngle);
    s += `<path d="${progressPath}" fill="none" stroke="${fillColor}" stroke-width="${sw}" stroke-linecap="${linecap}"/>`;
  }

  // Label
  if (cd.showPercentageLabel) {
    s += `<text x="${cx}" y="${cy - r * 0.3}" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(r * 0.45)}" font-family="${font}" fill="${fillColor}" font-weight="800">${Math.round(pct)}%</text>`;
  }

  return s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS BAR (horizontal capsule)
// ═══════════════════════════════════════════════════════════════════════════════
function renderProgressBarChart(cd: ChartData, W: number, H: number, resolver?: (t: string) => string): string {
  let s = '';
  const sw = cd.strokeWidth || 20;
  const pad = 10;
  const barY = H / 2 - sw / 2;
  const barW = W - pad * 2;
  const pct = Math.min(100, Math.max(0, toNum(cd.percentage || '0', resolver)));
  const trackColor = cd.trackColor || '#e2e8f0';
  const fillColor = cd.fillColor || '#4F86F7';
  const rawFont = cd.fontFamily || 'Inter';
  const font = rawFont.split(',')[0].trim().replace(/['"]/g, '');
  const rx = cd.roundedEnds ? sw / 2 : 4;

  // Track
  s += `<rect x="${pad}" y="${barY}" width="${barW}" height="${sw}" rx="${rx}" ry="${rx}" fill="${trackColor}"/>`;

  // Fill
  if (pct > 0) {
    const fillW = (pct / 100) * barW;
    s += `<rect x="${pad}" y="${barY}" width="${fillW}" height="${sw}" rx="${rx}" ry="${rx}" fill="${fillColor}"/>`;
  }

  // Label
  if (cd.showPercentageLabel) {
    const labelX = pad + (pct / 100) * barW;
    s += `<text x="${Math.max(labelX, pad + 20)}" y="${H / 2}" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(sw * 0.55)}" font-family="${font}" fill="white" font-weight="800">${Math.round(pct)}%</text>`;
  }

  return s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS DIAL (speedometer / gauge)
// ═══════════════════════════════════════════════════════════════════════════════
function renderProgressDial(cd: ChartData, W: number, H: number, resolver?: (t: string) => string): string {
  let s = '';
  const cx = W / 2;
  const sw = cd.strokeWidth || 12;
  const r = Math.min(W / 2, H * 0.8) - sw / 2 - 10;
  const cy = H - 24;
  const pct = Math.min(100, Math.max(0, toNum(cd.percentage || '0', resolver)));
  const trackColor = cd.trackColor || '#e2e8f0';
  const fillColor = cd.fillColor || '#4F86F7';
  const rawFont = cd.fontFamily || 'Inter';
  const font = rawFont.split(',')[0].trim().replace(/['"]/g, '');
  const linecap = cd.roundedEnds ? 'round' : 'butt';

  // Sweep: 180° arc (from 270° to 450°) - perfect semi-circle over the top
  const startA = 270;
  const totalSweep = 180;
  const endA = startA + totalSweep;

  // Track
  const trackPathStr = arcPath(cx, cy, r, startA, endA);
  s += `<path d="${trackPathStr}" fill="none" stroke="${trackColor}" stroke-width="${sw}" stroke-linecap="${linecap}"/>`;

  // Progress
  if (pct > 0) {
    const progressEnd = startA + (pct / 100) * totalSweep;
    const progressPath = arcPath(cx, cy, r, startA, progressEnd);
    s += `<path d="${progressPath}" fill="none" stroke="${fillColor}" stroke-width="${sw}" stroke-linecap="${linecap}"/>`;
  }

  // Ticks
  const numTicks = 4;
  for (let i = 0; i <= numTicks; i++) {
    const tickA = startA + (i / numTicks) * totalSweep;
    const innerT = polarToCart(cx, cy, r - sw / 2 - 6, tickA);
    const outerT = polarToCart(cx, cy, r - sw / 2 - 1, tickA);
    s += `<line x1="${innerT.x}" y1="${innerT.y}" x2="${outerT.x}" y2="${outerT.y}" stroke="${trackColor}" stroke-width="2" stroke-linecap="round"/>`;
  }

  // Needle (Polygon wedge)
  const needleAngle = startA + (pct / 100) * totalSweep;
  const needleLen = r - sw / 2 - 12;
  const tip = polarToCart(cx, cy, needleLen, needleAngle);

  // Base width of the needle
  const baseLeft = polarToCart(cx, cy, 6, needleAngle - 90);
  const baseRight = polarToCart(cx, cy, 6, needleAngle + 90);

  const needleColor = cd.labelColor || '#334155';
  s += `<polygon points="${tip.x},${tip.y} ${baseRight.x},${baseRight.y} ${baseLeft.x},${baseLeft.y}" fill="${needleColor}"/>`;

  // Center Hub
  s += `<circle cx="${cx}" cy="${cy}" r="10" fill="white" stroke="${needleColor}" stroke-width="3"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="3" fill="${needleColor}"/>`;

  // Label
  if (cd.showPercentageLabel) {
    s += `<text x="${cx}" y="${cy + 24}" text-anchor="middle" dominant-baseline="hanging" font-size="${Math.round(r * 0.35)}" font-family="${font}" fill="${fillColor}" font-weight="800">${Math.round(pct)}%</text>`;
  }

  return s;
}
