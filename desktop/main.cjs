'use strict';

const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const fs = require('node:fs');
const path = require('node:path');

const APP_VERSION = require('./package.json').version;
let backend = null;
let mainWindow = null;
let logStream = null;
let spawnError = null;
let quitting = false;

app.setName('Reage');
app.setAppUserModelId('org.reage.pdfeditor');

function chooseCacheDirectory() {
  const candidates = [];
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    candidates.push(path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'ReageData', 'cache'));
  }
  candidates.push(path.join(app.getPath('userData'), 'cache'));

  for (const candidate of candidates) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      const probe = path.join(candidate, '.write-test-' + process.pid);
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      return candidate;
    } catch {
      // The portable executable may be on a read-only drive; try user data next.
    }
  }
  throw new Error('Reage cannot create a writable cache directory.');
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

function startBackend(port) {
  const executable = app.isPackaged
    ? path.join(process.resourcesPath, 'reage-server.exe')
    : path.join(__dirname, 'build', 'backend', 'reage-server.exe');

  if (!fs.existsSync(executable)) {
    throw new Error('The bundled PDF service was not found: ' + executable);
  }

  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  const logPath = path.join(userData, 'reage-server.log');
  logStream = fs.createWriteStream(logPath, { flags: 'a' });
  logStream.write('\n--- Reage startup ' + new Date().toISOString() + ' ---\n');

  backend = spawn(executable, ['--port', String(port), '--no-browser'], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      REAGE_CACHE_DIR: chooseCacheDirectory()
    }
  });
  backend.stdout.pipe(logStream, { end: false });
  backend.stderr.pipe(logStream, { end: false });
  backend.once('error', error => { spawnError = error; });
  backend.once('exit', (code, signal) => {
    if (logStream) logStream.write('\nPDF service exited: ' + (signal || code) + '\n');
    if (!quitting && mainWindow) {
      dialog.showErrorBox(
        'Reage PDF service stopped',
        'The local PDF service stopped unexpectedly. Restart Reage to continue.\n\nLog: ' + logPath
      );
      app.quit();
    }
  });
}

async function waitForBackend(baseUrl) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (spawnError) {
      throw new Error('Could not start the bundled PDF service: ' + spawnError.message);
    }
    if (backend && (backend.exitCode !== null || backend.signalCode !== null)) {
      throw new Error('The bundled PDF service exited during startup. Check the Reage server log.');
    }

    try {
      const response = await fetch(baseUrl + '/api/health', {
        signal: AbortSignal.timeout(1800),
        cache: 'no-store'
      });
      if (response.ok) {
        const body = await response.json();
        if (body.service !== 'reage' || body.status !== 'ok') {
          throw new Error('The local PDF service returned an unexpected health response.');
        }
        if (body.version !== APP_VERSION) {
          throw new Error('The Reage interface and PDF service versions do not match.');
        }
        return;
      }
    } catch (error) {
      if (error instanceof Error && (
        error.message.includes('unexpected health response') ||
        error.message.includes('versions do not match')
      )) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('The local PDF service did not become ready within 90 seconds. Check the Reage server log.');
}

function isLocalUrl(url, baseUrl) {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function openExternal(url) {
  try {
    const parsed = new URL(url);
    if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      void shell.openExternal(url).catch(() => {});
    }
  } catch {
    // Ignore malformed or unsupported navigation targets.
  }
}

function createWindow(baseUrl) {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'reage.ico')
    : path.join(__dirname, 'resources', 'reage.ico');

  mainWindow = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 920,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f7f7f3',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocalUrl(url, baseUrl)) openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isLocalUrl(url, baseUrl)) return;
    event.preventDefault();
    openExternal(url);
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  void mainWindow.loadURL(baseUrl);
}

async function start() {
  const port = await findAvailablePort();
  const baseUrl = 'http://127.0.0.1:' + port;
  startBackend(port);
  await waitForBackend(baseUrl);
  createWindow(baseUrl);
}

const hasSingleInstance = app.requestSingleInstanceLock();
if (!hasSingleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(start).catch(error => {
    const logPath = path.join(app.getPath('userData'), 'reage-server.log');
    let detail = '';
    try {
      detail = fs.readFileSync(logPath, 'utf8').slice(-4000);
    } catch { /* The log may not exist if startup failed before process launch. */ }
    dialog.showErrorBox(
      'Could not start Reage',
      error.message + '\n\nLog: ' + logPath + (detail ? '\n\nRecent log output:\n' + detail : '')
    );
    app.quit();
  });
}

app.on('before-quit', () => {
  quitting = true;
  if (backend && backend.exitCode === null && backend.signalCode === null) {
    backend.kill();
  }
  if (logStream) logStream.end();
});

app.on('window-all-closed', () => app.quit());
