import { Layer, TableCell, TableData } from '../types';

/**
 * Builds a complete SVG string for a table-svg layer.
 * Uses native SVG <text> elements (NOT foreignObject) so it renders
 * correctly in both the browser Image API and canvas export.
 * Returns an empty string if tableData is missing.
 */
export function generateTableSvg(layer: Layer, resolver?: (text: string) => string): string {
  const td: TableData | undefined = layer.tableData;
  if (!td) return '';

  const W = layer.width ?? 400;
  const H = layer.height ?? 200;
  const bw = td.borderWidth ?? 1;

  // ── Resolve column x-positions ──────────────────────────────────────────────
  const totalColW = td.colWidths.reduce((a, b) => a + b, 0) || W;
  const colX: number[] = [];
  let cx = 0;
  for (let c = 0; c < td.cols; c++) {
    colX.push(cx);
    cx += (td.colWidths[c] / totalColW) * W;
  }
  const colActual = colX.map((x, i) =>
    i < td.cols - 1 ? colX[i + 1] - x : W - x
  );

  // ── Resolve row y-positions ──────────────────────────────────────────────────
  const totalRowH = td.rowHeights.reduce((a, b) => a + b, 0) || H;
  const rowY: number[] = [];
  let ry = 0;
  for (let r = 0; r < td.rows; r++) {
    rowY.push(ry);
    ry += (td.rowHeights[r] / totalRowH) * H;
  }
  const rowActual = rowY.map((y, i) =>
    i < td.rows - 1 ? rowY[i + 1] - y : H - y
  );

  // ── Build SVG ────────────────────────────────────────────────────────────────
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;

  // 1. Cell backgrounds
  for (let r = 0; r < td.rows; r++) {
    for (let c = 0; c < td.cols; c++) {
      const cell: TableCell = td.cells[r]?.[c] ?? defaultCell();

      let cx = colX[c];
      let cy = rowY[r];
      let cw = colActual[c];
      let ch = rowActual[r];

      if (c > 0) { cx += bw / 2; cw -= bw / 2; }
      if (c < td.cols - 1) { cw -= bw / 2; }

      if (r > 0) { cy += bw / 2; ch -= bw / 2; }
      if (r < td.rows - 1) { ch -= bw / 2; }

      svg += `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="${cell.bg}" />`;
    }
  }

  // 2. Cell text via native SVG <text>
  for (let r = 0; r < td.rows; r++) {
    for (let c = 0; c < td.cols; c++) {
      const cell: TableCell = td.cells[r]?.[c] ?? defaultCell();
      if (!cell.content) continue;

      let cx = colX[c];
      let cy = rowY[r];
      let cw = colActual[c];
      let ch = rowActual[r];

      if (c > 0) { cx += bw / 2; cw -= bw / 2; }
      if (c < td.cols - 1) { cw -= bw / 2; }
      if (r > 0) { cy += bw / 2; ch -= bw / 2; }
      if (r < td.rows - 1) { ch -= bw / 2; }

      const pad = cell.padding ?? 6;
      const fs = cell.fontSize ?? 12;
      const fontStyle = cell.fontStyle === 'italic' ? 'italic' : 'normal';
      const fontWeight = cell.fontWeight ?? 'normal';

      // Horizontal position + anchor
      let textX: number;
      let textAnchor: string;
      if (cell.textAlign === 'right') {
        textX = cx + cw - pad;
        textAnchor = 'end';
      } else if (cell.textAlign === 'center') {
        textX = cx + cw / 2;
        textAnchor = 'middle';
      } else {
        textX = cx + pad;
        textAnchor = 'start';
      }

      // Vertical position
      let textY: number;
      if (cell.verticalAlign === 'top') {
        textY = cy + pad + fs / 2;
      } else if (cell.verticalAlign === 'bottom') {
        textY = cy + ch - pad - fs / 2;
      } else {
        textY = cy + ch / 2;
      }

      // Clip text to cell bounds
      const clipId = `clip-${layer.id}-${r}-${c}`;
      svg += `<clipPath id="${clipId}"><rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" /></clipPath>`;

      const cleanFontFamily = (cell.fontFamily ?? 'Arial, sans-serif').split(',')[0].trim().replace(/['"]/g, '');
      svg += `<text
        x="${textX}"
        y="${textY}"
        font-family="${cleanFontFamily}"
        font-size="${fs}"
        font-weight="${fontWeight}"
        font-style="${fontStyle}"
        fill="${cell.color ?? '#000000'}"
        text-anchor="${textAnchor}"
        dominant-baseline="central"
        clip-path="url(#${clipId})"
      >${escapeXml(resolver ? resolver(cell.content) : cell.content)}</text>`;
    }
  }

  // 3. Internal vertical dividers
  for (let c = 1; c < td.cols; c++) {
    const x = colX[c];
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${td.borderColor}" stroke-width="${bw}" />`;
  }

  // 4. Internal horizontal dividers
  for (let r = 1; r < td.rows; r++) {
    const y = rowY[r];
    svg += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${td.borderColor}" stroke-width="${bw}" />`;
  }

  // 5. Outer border (on top)
  if (td.borderColor !== 'transparent' && bw > 0) {
    const half = bw / 2;
    svg += `<rect x="${half}" y="${half}" width="${W - bw}" height="${H - bw}" fill="none" stroke="${td.borderColor}" stroke-width="${bw}" />`;
  }

  svg += `</svg>`;
  return svg;
}

// ── Default cell factory ──────────────────────────────────────────────────────
export function defaultCell(): TableCell {
  return {
    bg: '#FFFFFF',
    content: '',
    fontSize: 12,
    fontFamily: 'Arial, sans-serif',
    fontWeight: 'normal',
    fontStyle: 'normal',
    color: '#1E293B',
    textAlign: 'left',
    verticalAlign: 'middle',
    padding: 8,
  };
}

/**
 * Creates a blank TableData for a given preset style and dimensions.
 */
export function createTableData(
  rows: number,
  cols: number,
  width: number,
  height: number,
  borderColor: string,
  headerBg: string,
  headerText: string,
  cellBg: string,
  stripedRows: boolean,
  stripeColor: string,
  borderWidth = 1
): TableData {
  const colW = width / cols;
  const rowH = height / rows;

  const cells: TableCell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: TableCell[] = [];
    for (let c = 0; c < cols; c++) {
      let bg = cellBg;
      if (r === 0) bg = headerBg;
      else if (stripedRows && r % 2 === 0) bg = stripeColor;

      row.push({
        ...defaultCell(),
        bg,
        color: r === 0 ? headerText : '#1E293B',
        fontWeight: r === 0 ? 'bold' : 'normal',
        content: r === 0 ? `Header ${c + 1}` : '',
      });
    }
    cells.push(row);
  }

  return {
    rows,
    cols,
    colWidths: Array(cols).fill(colW),
    rowHeights: Array(rows).fill(rowH),
    cells,
    borderColor,
    borderWidth,
  };
}

// ── XML escape for SVG text safety ────────────────────────────────────────────
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
