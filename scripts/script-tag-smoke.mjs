import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const sdkRoot = resolve(import.meta.dirname, '..');
const frontendRoot = resolve(sdkRoot, '../100Prints');
const fixture = JSON.parse(readFileSync(resolve(frontendRoot, 'public/data/templates/clarity-student-report.json'), 'utf8'));
fixture.frontLayers = fixture.frontLayers.filter(layer => layer.id !== 'img-signature');

const fontData = new Map([
  ['Inter', readFileSync(resolve(frontendRoot, 'public/fonts/Inter.ttf')).toString('base64')],
  ['Montserrat', readFileSync(resolve(frontendRoot, 'public/fonts/Montserrat.ttf')).toString('base64')],
]);
const fontManifest = [...fontData].flatMap(([family, data]) => [400, 500, 700, 800].map(weight => ({
  family, weight, style: 'normal', url: `data:font/ttf;base64,${data}`,
})));

const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname !== '/examples/script-tag/' && pathname !== '/dist/100prints-sdk.umd.js') {
    response.writeHead(404).end();
    return;
  }
  const file = resolve(sdkRoot, pathname === '/examples/script-tag/' ? 'examples/script-tag/index.html' : 'dist/100prints-sdk.umd.js');
  response.setHeader('Content-Type', extname(file) === '.html' ? 'text/html' : 'text/javascript');
  response.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

const chromePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(path => path && existsSync(path));
if (!chromePath) throw new Error('Set CHROME_PATH to a Chromium browser executable');

const browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://api.100printswith.me/public/v1/sdk/render?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ template_data: fixture, fontManifest }),
  }));
  await page.goto(`http://127.0.0.1:${server.address().port}/examples/script-tag/`);
  await page.waitForFunction(() => document.querySelector('#status')?.textContent !== 'Preparing render…', { timeout: 30000 });
  const result = await page.locator('#badge').evaluate(image => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
    source: image.src.startsWith('blob:'),
  }));
  const status = await page.locator('#status').textContent();
  if (errors.length || !result.source || !result.width || !result.height || status !== 'Image rendered.') {
    throw new Error(JSON.stringify({ errors, result, status }));
  }

  await page.unroute('https://api.100printswith.me/public/v1/sdk/render?**');
  await page.route('https://api.100printswith.me/public/v1/sdk/render?**', route => route.fulfill({
    status: 403,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Template access denied' }),
  }));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#status')?.classList.contains('error'));
  const errorStatus = await page.locator('#status').textContent();
  if (!errorStatus?.includes('Could not render image') || !errorStatus.includes('Template access denied')) {
    throw new Error(`Render failure was not visible: ${errorStatus}`);
  }
  await page.goto(`file:///${resolve(sdkRoot, 'examples/script-tag/index.html').replaceAll('\\', '/')}`);
  const fileStatus = await page.locator('#status').textContent();
  if (!fileStatus?.includes('Serve this example over HTTP')) {
    throw new Error(`File-mode guidance was not visible: ${fileStatus}`);
  }
  console.log(JSON.stringify({ result, status, errorStatus, fileStatus }));
} finally {
  await browser.close();
  server.close();
}
