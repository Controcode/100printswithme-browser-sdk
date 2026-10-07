import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const sdkRoot = resolve(import.meta.dirname, '..');
const frontendRoot = resolve(sdkRoot, '../100Prints');
const fixture = JSON.parse(readFileSync(resolve(frontendRoot, 'public/data/templates/clarity-student-report.json'), 'utf8'));
fixture.frontLayers = fixture.frontLayers.filter(layer => layer.id !== 'img-signature');
fixture.frontLayers.push(
  { id: 'bebas-probe', type: 'text', x: 40, y: 765, width: 200, height: 32,
    content: 'BEBAS NEUE', fontFamily: 'Bebas Neue', fontWeight: 700, fontSize: 24, visible: true },
  { id: 'playfair-probe', type: 'text', x: 250, y: 765, width: 300, height: 32,
    content: 'Playfair Display', fontFamily: 'Playfair Display', fontWeight: 700,
    fontStyle: 'italic', fontSize: 20, visible: true },
  { id: 'bebas-italic-probe', type: 'text', x: 40, y: 800, width: 200, height: 25,
    content: 'ITALIC', fontFamily: 'Bebas Neue', fontWeight: 400,
    fontStyle: 'italic', fontSize: 18, visible: true },
);

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
  const requestedFonts = [];
  const googleRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route => {
    googleRequests.push(route.request().url());
    return route.abort();
  });
  await page.route('https://www.100printswith.me/fonts/**', route => {
    const url = new URL(route.request().url());
    const file = url.pathname.split('/').pop();
    if (!/^[A-Za-z0-9-]+\.(ttf|otf)$/.test(file)) throw new Error(`Unexpected font file: ${file}`);
    requestedFonts.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: file.endsWith('.otf') ? 'font/otf' : 'font/ttf',
      headers: { 'access-control-allow-origin': '*' },
      body: readFileSync(resolve(frontendRoot, 'public/fonts', file)),
    });
  });
  await page.route('https://api.100printswith.me/public/v1/sdk/render?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ template_data: fixture, fontManifest: [] }),
  }));
  await page.goto(`http://127.0.0.1:${server.address().port}/examples/script-tag/`);
  await page.waitForFunction(() => document.querySelector('#status')?.textContent !== 'Preparing render…', { timeout: 30000 });
  const result = await page.locator('#badge').evaluate(image => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
    source: image.src.startsWith('blob:'),
  }));
  const status = await page.locator('#status').textContent();
  const faces = await page.evaluate(() => [...document.fonts].map(face => ({
    family: face.family, weight: face.weight, style: face.style, status: face.status,
  })));
  if (errors.length || !result.source || !result.width || !result.height || status !== 'Image rendered.') {
    throw new Error(JSON.stringify({ errors, result, status }));
  }
  for (const file of ['Inter.ttf', 'Montserrat.ttf', 'BebasNeue.ttf', 'PlayfairDisplay-BoldItalic.ttf']) {
    if (!requestedFonts.includes(`https://www.100printswith.me/fonts/${file}`)) {
      throw new Error(`Platform font was not requested: ${file}`);
    }
  }
  if (googleRequests.length || !faces.some(face => face.family === 'Bebas Neue' && face.weight === '400' && face.status === 'loaded')) {
    throw new Error(JSON.stringify({ googleRequests, faces }));
  }

  const unknownFixture = { ...fixture, frontLayers: [...fixture.frontLayers, {
    id: 'unknown-probe', type: 'text', x: 250, y: 800, width: 300, height: 25,
    content: 'Unknown font fallback', fontFamily: 'Completely Unknown Family',
    fontWeight: 700, fontStyle: 'italic', fontSize: 18, visible: true,
  }] };
  await page.unroute('https://api.100printswith.me/public/v1/sdk/render?**');
  await page.route('https://api.100printswith.me/public/v1/sdk/render?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ template_data: unknownFixture, fontManifest: [] }),
  }));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Image rendered.');
  const fallbackFace = await page.evaluate(() => [...document.fonts].some(face =>
    face.family === 'Completely Unknown Family' && face.style === 'italic' && face.status === 'loaded'));
  if (!fallbackFace || !googleRequests.some(url => url.includes('Completely+Unknown+Family'))) {
    throw new Error(JSON.stringify({ fallbackFace, googleRequests }));
  }
  if (errors.length) throw new Error(`Browser error during fallback render: ${errors.join(' | ')}`);

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
  console.log(JSON.stringify({ result, status, requestedFonts, googleRequests, fallbackFace, errorStatus, fileStatus }));
} finally {
  await browser.close();
  server.close();
}
