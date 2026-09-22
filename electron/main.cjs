const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const isDev = !app.isPackaged;
let staticServer;
let rasterProcess;
let rasterRequestId = 0;
const rasterPending = new Map();

function startRasterEngine() {
  if (rasterProcess) return;
  const engineName = process.platform === 'win32' ? 'agon-raster-engine.exe' : 'agon-raster-engine';
  // Native executables cannot run from app.asar. electron-builder places the
  // binary in app.asar.unpacked through asarUnpack below.
  const packagedCandidates = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'raster_engine', engineName),
    path.join(process.resourcesPath, 'raster_engine', engineName),
    path.join(__dirname, 'raster_engine', engineName),
  ];
  const packagedEngine = packagedCandidates.find((candidate) => fs.existsSync(candidate));
  const python = process.env.AGON_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  let command = python;
  let engineDir = path.join(__dirname, 'raster_engine');
  let args = [path.join(engineDir, 'server.py')];
  if (packagedEngine) {
    // Always execute a native binary from userData, never from app.asar.
    // This also handles installers that unpack the executable differently.
    const runtimeDir = path.join(app.getPath('userData'), 'raster-engine');
    fs.mkdirSync(runtimeDir, { recursive: true });
    const runtimeEngine = path.join(runtimeDir, engineName);
    if (!fs.existsSync(runtimeEngine) || fs.statSync(runtimeEngine).size !== fs.statSync(packagedEngine).size) {
      fs.copyFileSync(packagedEngine, runtimeEngine);
    }
    command = runtimeEngine;
    engineDir = runtimeDir;
    args = [];
  }
  rasterProcess = spawn(command, args, { cwd: engineDir, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  rasterProcess.on('error', (error) => {
    const message = `Raster Engine failed to start (${command}): ${error.message}`;
    console.error(message);
    for (const pending of rasterPending.values()) pending.reject(new Error(message));
    rasterPending.clear();
    rasterProcess = undefined;
  });
  let buffer = '';
  rasterProcess.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        const pending = rasterPending.get(message.id);
        if (!pending) continue;
        rasterPending.delete(message.id);
        message.ok ? pending.resolve(message.result) : pending.reject(new Error(message.error?.message || 'Raster Engine error'));
      } catch (error) { console.error('[Raster Engine] Invalid response', error); }
    }
  });
  rasterProcess.stderr.on('data', (chunk) => console.log('[Raster Engine]', chunk.toString().trim()));
  rasterProcess.on('exit', () => {
    for (const pending of rasterPending.values()) pending.reject(new Error('Raster Engine stopped'));
    rasterPending.clear(); rasterProcess = undefined;
  });
}

function rasterRequest(command, args) {
  startRasterEngine();
  const id = String(++rasterRequestId);
  return new Promise((resolve, reject) => {
    rasterPending.set(id, { resolve, reject });
    rasterProcess.stdin.write(JSON.stringify({ id, command, args }) + '\n');
  });
}

function startStaticServer() {
  const webRoot = path.join(__dirname, 'dist-web');
  const tileCache = path.join(app.getPath('userData'), 'tile-cache');
  fs.mkdirSync(tileCache, { recursive: true });
  const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };

  return new Promise((resolve, reject) => {
    staticServer = http.createServer((request, response) => {
      if ((request.url || '').startsWith('/tile-proxy?')) {
        const requested = new URL(request.url, 'http://127.0.0.1');
        const tileUrl = requested.searchParams.get('url');
        const allowed = tileUrl && /^(https:\/\/server\.arcgisonline\.com|https:\/\/[a-d]\.tile\.openstreetmap\.org|https:\/\/[a-d]\.basemaps\.cartocdn\.com)/i.test(tileUrl);
        if (!allowed) {
          response.writeHead(400).end('Unsupported tile source');
          return;
        }
        const cacheFile = path.join(tileCache, crypto.createHash('sha256').update(tileUrl).digest('hex') + '.tile');
        const sendCached = () => fs.readFile(cacheFile, (error, data) => {
          if (error) return response.writeHead(503).end('Tile unavailable offline');
          response.writeHead(200, { 'Cache-Control': 'public, max-age=31536000', 'Content-Type': 'image/png', 'X-Agon-Cache': 'hit' });
          response.end(data);
        });
        fetch(tileUrl).then(async (tileResponse) => {
          if (!tileResponse.ok) throw new Error(`Tile request failed: ${tileResponse.status}`);
          const buffer = Buffer.from(await tileResponse.arrayBuffer());
          fs.writeFile(cacheFile, buffer, () => {});
          response.writeHead(200, { 'Cache-Control': 'public, max-age=31536000', 'Content-Type': tileResponse.headers.get('content-type') || 'image/png', 'X-Agon-Cache': 'miss' });
          response.end(buffer);
        }).catch(sendCached);
        return;
      }
      if ((request.url || '').startsWith('/service-tile-proxy?')) {
        const requested = new URL(request.url, 'http://127.0.0.1');
        const tileUrl = requested.searchParams.get('url');
        if (!tileUrl || !/^https?:\/\//i.test(tileUrl)) {
          response.writeHead(400).end('Unsupported service source');
          return;
        }
        const cacheFile = path.join(tileCache, crypto.createHash('sha256').update(`service:${tileUrl}`).digest('hex') + '.tile');
        const sendCached = () => fs.readFile(cacheFile, (error, data) => {
          if (error) return response.writeHead(503).end('Service tile unavailable offline');
          response.writeHead(200, { 'Cache-Control': 'public, max-age=31536000', 'Content-Type': 'image/png', 'X-Agon-Cache': 'hit' });
          response.end(data);
        });
        fetch(tileUrl).then(async (tileResponse) => {
          if (!tileResponse.ok) throw new Error(`Service tile request failed: ${tileResponse.status}`);
          const buffer = Buffer.from(await tileResponse.arrayBuffer());
          fs.writeFile(cacheFile, buffer, () => {});
          response.writeHead(200, { 'Cache-Control': 'public, max-age=31536000', 'Content-Type': tileResponse.headers.get('content-type') || 'image/png', 'X-Agon-Cache': 'miss' });
          response.end(buffer);
        }).catch(sendCached);
        return;
      }
      let requestPath = decodeURIComponent((request.url || '/').split('?')[0]);
      if (requestPath === '/') requestPath = '/index.html';
      if (!path.extname(requestPath)) requestPath += '.html';

      const filePath = path.resolve(webRoot, `.${requestPath}`);
      if (!filePath.startsWith(`${webRoot}${path.sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }

      fs.readFile(filePath, (error, data) => {
        if (error) {
          response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
          return;
        }
        response.writeHead(200, {
          'Cache-Control': 'no-cache',
          'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        });
        response.end(data);
      });
    });
    staticServer.once('error', reject);
    staticServer.listen(0, '127.0.0.1', () => {
      staticServer.removeListener('error', reject);
      resolve(staticServer.address().port);
    });
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0D1726',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL(process.env.AGON_DEV_URL || 'http://localhost:8081');
  } else {
    const port = await startStaticServer();
    win.loadURL(`http://127.0.0.1:${port}/`);
  }
}

ipcMain.handle('save-report-pdf', async (_event, { html, suggestedName }) => {
  if (typeof html !== 'string' || html.length > 2_000_000) throw new Error('تقرير PDF غير صالح.');
  const pdfWindow = new BrowserWindow({ show: false, width: 1200, height: 900, webPreferences: { sandbox: true } });
  try {
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.35, bottom: 0.35, left: 0.35, right: 0.35 },
    });
    const result = await dialog.showSaveDialog({
      title: 'حفظ التقرير المساحي PDF',
      defaultPath: suggestedName || 'survey-report.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, pdf);
    return { canceled: false, filePath: result.filePath };
  } finally {
    if (!pdfWindow.isDestroyed()) pdfWindow.close();
  }
});

ipcMain.handle('raster-open-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Raster imagery', extensions: ['tif', 'tiff', 'geotiff', 'jp2', 'j2k', 'jpg', 'jpeg', 'png', 'bmp', 'webp'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('raster-inspect', (_event, args) => rasterRequest('inspect', args));
ipcMain.handle('raster-preview', (_event, args) => rasterRequest('preview', args));
ipcMain.handle('raster-georeference', (_event, args) => rasterRequest('georeference', args));
ipcMain.handle('raster-reproject', (_event, args) => rasterRequest('reproject', args));
ipcMain.handle('raster-health', () => rasterRequest('health', {}));

app.whenReady().then(() => {
  createWindow().catch((error) => {
    console.error('Failed to start Agon Surveyor:', error);
    app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (staticServer) staticServer.close();
  if (rasterProcess) rasterProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (isDev && url.startsWith('http://localhost:8081')) return;
    if (!isDev && url.startsWith('http://127.0.0.1:')) return;
    if (!url.startsWith('file://')) event.preventDefault();
  });
});
