import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const fontDataUrl = process.env.FONT_FIXTURE
  ? `data:font/ttf;base64,${readFileSync(process.env.FONT_FIXTURE).toString('base64')}`
  : null;

const chromePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(path => path && existsSync(path));
if (!chromePath) throw new Error('Set CHROME_PATH to a Chromium browser executable');

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  const browserWarnings = [];
  page.on('console', message => { if (message.type() === 'warning' || message.type() === 'error') browserWarnings.push(message.text()); });
  await page.goto('about:blank');
  await page.addScriptTag({ path: resolve('dist/100prints-sdk.umd.js') });
  const result = await page.evaluate(async (fontDataUrl) => {
    const canvas = document.createElement('canvas');
    canvas.width = 40; canvas.height = 20;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f00'; ctx.fillRect(0, 0, 20, 20);
    ctx.fillStyle = '#00f'; ctx.fillRect(20, 0, 20, 20);
    const photo = canvas.toDataURL('image/png');
    const frontLayers = [
      { id: 'text', type: 'text', x: 5, y: 5, width: 100, height: 25, content: 'A\nB',
        fontFamily: fontDataUrl ? 'Inter' : 'Arial', fontWeight: fontDataUrl ? 700 : 400,
        fontUrl: fontDataUrl, fontSize: 14, color: '#111', visible: true },
      { id: 'shape', type: 'shape', x: 110, y: 5, width: 35, height: 25, color: '#0a0',
        borderWidth: 2, borderColor: '#000', borderRadius: 8, visible: true },
      { id: 'image', type: 'image', x: 5, y: 35, width: 45, height: 35, content: photo,
        borderWidth: 3, borderColor: '#333', borderRadius: 5, visible: true },
      { id: 'svg', type: 'shape', x: 55, y: 35, width: 35, height: 35,
        content: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="currentColor"/></svg>',
        color: '#f0f', visible: true },
      { id: 'qr', type: 'qr', x: 95, y: 35, width: 35, height: 35, content: 'hello', visible: true },
      { id: 'barcode', type: 'barcode', x: 135, y: 35, width: 55, height: 35, content: '123456', visible: true },
      { id: 'textsvg', type: 'textsvg', x: 5, y: 72, width: 45, height: 22,
        content: 'Arc', fontSize: 10, fontFamily: 'Arial', color: '#111', pathType: 'arc-up',
        curvature: 30, shadowColor: '#000000', shadowBlur: 2, visible: true },
      { id: 'table', type: 'table-svg', x: 55, y: 72, width: 55, height: 22, visible: true,
        tableData: { rows: 1, cols: 1, colWidths: [55], rowHeights: [22],
          borderColor: '#000', borderWidth: 1, cells: [[{ bg: '#fff', content: 'Cell',
            fontSize: 10, fontFamily: 'Arial', fontWeight: 'normal', color: '#111',
            textAlign: 'center', verticalAlign: 'middle', padding: 1 }]] } },
      { id: 'chart', type: 'chart-svg', x: 115, y: 72, width: 75, height: 22, visible: true,
        chartData: { subtype: 'progress-bar', categories: [], series: [], percentage: '60',
          colors: ['#0a0'], showLabels: false, showLegend: false, showGrid: false,
          showValues: false, fontFamily: 'Arial' } },
    ];
    const response = { template_data: { id: 'fixture', name: 'Fixture', type: 'id-card',
      backgroundColor: '#ffffff', dimensions: { width: 200, height: 100, label: 'Test' },
      frontLayers, backLayers: [{ id: 'back-shape', type: 'shape', x: 20, y: 20,
        width: 100, height: 50, color: '#abc', visible: true }] },
      fontManifest: fontDataUrl ? [{ family: 'Inter', weight: 700, url: fontDataUrl }] : [] };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => String(input).startsWith('https://example.test/')
      ? new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } })
      : originalFetch(input, init);
    const sdk = new window.BrowserSDK.BrowserSDK({ key: 'pk_test', baseUrl: 'https://example.test' });
    const png = await sdk.render({ templateId: 'fixture', format: 'png', quality: 'draft' });
    const pngStandard = await sdk.render({ templateId: 'fixture', format: 'png', quality: 'standard' });
    const pngHigh = await sdk.render({ templateId: 'fixture', format: 'png', quality: 'high' });
    const pngUltra = await sdk.render({ templateId: 'fixture', format: 'png', quality: 'ultra' });
    const raster = await sdk.render({ templateId: 'fixture', format: 'pdf', quality: 'draft' });
    const vector = await sdk.render({ templateId: 'fixture', format: 'vector-pdf', quality: 'draft' });
    const back = await sdk.render({ templateId: 'fixture', format: 'png', side: 'back', quality: 'draft' });
    const host = document.createElement('div'); document.body.appendChild(host);
    const preview = await sdk.preview({ templateId: 'fixture', container: host });
    const bulk = await sdk.renderBulk({ templateId: 'fixture', rows: [{ name: 'One' }],
      format: 'vector-pdf', mode: 'merged', quality: 'draft' });
    const zipped = await sdk.renderBulk({ templateId: 'fixture', rows: [{ name: 'One' }],
      format: 'vector-pdf', mode: 'zip', quality: 'draft' });
    const pngBitmap = await createImageBitmap(png.blob);
    const standardBitmap = await createImageBitmap(pngStandard.blob);
    const highBitmap = await createImageBitmap(pngHigh.blob);
    const ultraBitmap = await createImageBitmap(pngUltra.blob);
    const pdfHeader = async blob => new TextDecoder().decode(new Uint8Array(await blob.slice(0, 5).arrayBuffer()));
    return {
      png: { type: png.blob.type, width: pngBitmap.width, height: pngBitmap.height, bytes: png.blob.size },
      pngStandard: { width: standardBitmap.width, height: standardBitmap.height },
      pngHigh: { width: highBitmap.width, height: highBitmap.height, bytes: pngHigh.blob.size },
      pngUltra: { width: ultraBitmap.width, height: ultraBitmap.height },
      raster: { header: await pdfHeader(raster.blob), bytes: raster.blob.size },
      vector: { header: await pdfHeader(vector.blob), bytes: vector.blob.size,
        pages: ((await vector.blob.text()).match(/\/Type \/Page\b/g) || []).length,
        fonts: [...(await vector.blob.text()).matchAll(/\/BaseFont\s+\/([^\s/]+)/g)].map(match => match[1]) },
      back: { type: back.blob.type, bytes: back.blob.size },
      preview: { width: preview.width, height: preview.height },
      bulk: { header: await pdfHeader(bulk.blob), bytes: bulk.blob.size },
      zipped: { header: await pdfHeader(zipped.blob), bytes: zipped.blob.size },
      fontFixture: !!fontDataUrl,
    };
  }, fontDataUrl);
  if (result.png.width !== 200 || result.png.height !== 100 || result.pngStandard.width !== 400 || result.pngStandard.height !== 200 || result.pngHigh.width !== 800 || result.pngHigh.height !== 400 || result.pngUltra.width !== 1600 || result.pngUltra.height !== 800) throw new Error('PNG dimensions differ from quality settings');
  if (result.raster.header !== '%PDF-' || result.vector.header !== '%PDF-' || result.bulk.header !== '%PDF-') throw new Error('Invalid PDF output');
  if (result.vector.pages !== 2) throw new Error('Vector PDF did not contain front and back pages');
  if (!result.zipped.header.startsWith('PK\u0003\u0004')) throw new Error('Bulk ZIP is invalid');
  if (result.preview.width !== 200 || result.preview.height !== 100 || result.back.type !== 'image/png') throw new Error('Preview or back render failed');
  if (fontDataUrl && !result.vector.fonts.some(font => font.includes('Inter'))) throw new Error('Custom font was not embedded in vector PDF');
  if (browserWarnings.some(warning => /Failed to render layer|Failed to render (?:table|chart) SVG|Curved text shadow skipped/i.test(warning))) throw new Error(`Renderer warning: ${browserWarnings.join(' | ')}`);
  result.browserWarnings = browserWarnings;
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
