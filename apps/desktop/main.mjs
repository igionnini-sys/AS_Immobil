import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { fileDriver } from './file-driver.mjs';
import { parseArchive, serializeArchive, MAX_BYTES, FISCAL_SOURCES } from './dist/repository.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const uiPath = app.isPackaged ? join(here, 'web', 'index.html') : join(here, '..', 'web', 'dist', 'index.html');
const trustedUrl = pathToFileURL(uiPath).href;
const smoke = process.argv.includes('--smoke-test');
let smokeWatchdog;
let smokeCompleted = false;
// L'interfaccia è 2D: il rendering software evita incompatibilità con driver GPU Windows.
if (process.platform === 'win32') app.disableHardwareAcceleration();
if (smoke) {
  console.log('Desktop smoke: main loaded');
  smokeWatchdog = setTimeout(() => { console.error('Desktop smoke: startup timeout'); app.exit(1); }, 30000);
  smokeWatchdog.unref();
}
app.setName('Immobiliare');
const originalUserData = app.getPath('userData');
if (smoke) app.setPath('userData', join(app.getPath('temp'), `immobiliare-smoke-${process.pid}`));
let window;
let pendingWrites = Promise.resolve();
let closing = false;
let closeRequested = false;
let closeTimer;
let startupTimer;
let rendererReady = false;
let startupFailureVisible = false;
let language = 'it';
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else void start().catch(error => {
  console.error('Avvio non riuscito:', error);
  if (!smoke) dialog.showErrorBox('Immobiliare', 'Impossibile avviare l’applicazione. Riavvia avvia.bat e controlla i messaggi nella finestra del terminale.');
  app.exit(1);
});
async function start() {
  app.on('second-instance', () => { window?.restore(); window?.focus(); });
  await app.whenReady();
  if (smoke && process.argv.includes('--smoke-copy-user-data')) {
    const destination = join(app.getPath('userData'), 'data');
    await mkdir(destination, { recursive: true });
    for (const name of ['archive.json', 'backup.json']) {
      try { await copyFile(join(originalUserData, 'data', name), join(destination, name)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  const driver = fileDriver(join(app.getPath('userData'), 'data'));
  function authorize(event) {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
      || event.senderFrame.url.split('#')[0] !== trustedUrl) throw new Error('UNTRUSTED_ORIGIN');
  }
  ipcMain.handle('archive:read', async (event, slot) => { authorize(event); await pendingWrites; return driver.read(slot); });
  ipcMain.handle('archive:write', (event, slot, contents) => {
    authorize(event);
    if (typeof contents !== 'string' || Buffer.byteLength(contents, 'utf8') > MAX_BYTES) throw new Error('INVALID_ARCHIVE');
    const archive = parseArchive(contents);
    language = archive.preferences.language;
    const valid = serializeArchive(archive);
    const task = pendingWrites.then(() => driver.write(slot, valid));
    if (smoke && slot === 'archive' && !smokeCompleted) {
      smokeCompleted = true;
      void task.then(async () => {
      if (process.env.IMMOBIL_SMOKE_SCREENSHOT) {
        const screenshot = await window.webContents.capturePage();
        if (screenshot.isEmpty()) throw new Error('EMPTY_SCREENSHOT');
        await writeFile(process.env.IMMOBIL_SMOKE_SCREENSHOT, screenshot.toPNG());
      }
      if (process.argv.includes('--smoke-show') && !window.isVisible()) throw new Error('WINDOW_NOT_VISIBLE');
      console.log(JSON.stringify({ smoke: 'passed', processId: process.pid, renderer: 'loaded', persistence: 'written', windowVisible: window.isVisible(), title: window.getTitle(),
        gpuCompositing: app.getGPUFeatureStatus().gpu_compositing,
        nodeIntegration: window.webContents.getLastWebPreferences().nodeIntegration,
        contextIsolation: window.webContents.getLastWebPreferences().contextIsolation, sandbox: window.webContents.getLastWebPreferences().sandbox }));
      clearTimeout(smokeWatchdog);
      closing = true; app.quit();
      }).catch(error => { console.error('Desktop smoke:', error.message); app.exit(1); });
    }
    pendingWrites = task.catch(() => {});
    return task;
  });
  ipcMain.handle('archive:export', async (event, contents) => {
    authorize(event);
    const valid = serializeArchive(parseArchive(contents));
    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      defaultPath: 'immobiliare-backup.json', filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!canceled && filePath) await writeFile(filePath, valid, 'utf8');
  });
  window = new BrowserWindow({
    width: 1320, height: 920, minWidth: 380, minHeight: 600,
    backgroundColor: '#f5f6f2', title: 'Immobiliare', autoHideMenuBar: true, show: false,
    webPreferences: { preload: join(here, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  const sourceUrls = new Set(Object.values(FISCAL_SOURCES).flat().map(s => s.url));
  window.webContents.setWindowOpenHandler(({ url }) => { if (sourceUrls.has(url)) void shell.openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (url.split('#')[0] !== trustedUrl) event.preventDefault(); });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  function armStartupTimer() {
    clearTimeout(startupTimer);
    rendererReady = false;
    startupTimer = setTimeout(() => { void showStartupFailure(); }, 15000);
  }
  async function showStartupFailure() {
    if (rendererReady || startupFailureVisible || closing || window.isDestroyed()) return;
    clearTimeout(startupTimer);
    if (smoke) { console.error('Desktop smoke: interfaccia non pronta'); app.exit(1); return; }
    startupFailureVisible = true;
    window.show();
    const answer = await dialog.showMessageBox(window, {
      type: 'error', title: 'Immobiliare',
      message: 'Impossibile caricare l’interfaccia.',
      detail: 'Puoi riprovare. Se il problema continua, chiudi l’app e avviala nuovamente con avvia.bat.',
      buttons: ['Riprova', 'Chiudi'], defaultId: 0, cancelId: 1,
    });
    startupFailureVisible = false;
    if (window.isDestroyed() || closing) return;
    if (answer.response === 0) { armStartupTimer(); window.webContents.reload(); }
    else { closing = true; window.close(); }
  }
  ipcMain.on('app:renderer-ready', event => {
    authorize(event);
    rendererReady = true;
    clearTimeout(startupTimer);
    if (!smoke) window.show();
    else if (process.argv.includes('--smoke-show')) window.show();
  });
  async function finishClose(saved) {
    clearTimeout(closeTimer);
    if (!closeRequested || closing) return;
    if (!saved) {
      const italian = language === 'it';
      const answer = await dialog.showMessageBox(window, { type: 'warning',
        message: italian ? 'Impossibile salvare le ultime modifiche.' : 'Could not save your latest changes.',
        buttons: italian ? ['Torna all’app', 'Chiudi senza salvare'] : ['Return to app', 'Close without saving'], defaultId: 0, cancelId: 0 });
      if (answer.response === 0) { closeRequested = false; return; }
    }
    await pendingWrites;
    closing = true; window.close();
  }
  ipcMain.on('archive:close-ready', (event, saved) => { authorize(event); void finishClose(saved === true); });
  window.on('close', event => {
    if (closing) return;
    event.preventDefault();
    if (closeRequested) return;
    closeRequested = true;
    window.webContents.send('archive:before-close');
    closeTimer = setTimeout(() => { void finishClose(false); }, 10000);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer exited:', details.reason);
    rendererReady = false;
    void showStartupFailure();
  });
  window.webContents.on('did-fail-load', (_event, errorCode, description, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    console.error('Caricamento interfaccia:', description);
    rendererReady = false;
    void showStartupFailure();
  });
  armStartupTimer();
  await window.loadFile(uiPath);
  app.on('window-all-closed', () => app.quit());
}
