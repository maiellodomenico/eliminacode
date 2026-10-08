const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

let win;
let logFile;

const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

function log(...parts) {
  try {
    const line = `[${new Date().toISOString()}] ${parts.map(x => x instanceof Error ? (x.stack || x.message) : String(x)).join(' ')}\n`;
    if (logFile) fs.appendFileSync(logFile, line, 'utf8');
  } catch {}
}

process.on('uncaughtException', err => {
  log('uncaughtException', err);
});
process.on('unhandledRejection', err => {
  log('unhandledRejection', err);
});

if (primaryInstance) app.whenReady().then(async () => {
  const dataDir = app.getPath('userData');
  fs.mkdirSync(dataDir, { recursive: true });
  logFile = path.join(dataDir, 'bootstrap.log');
  log('APP READY');
  log('userData=', dataDir);

  try {
    process.env.ELIMINACODE_DATA_DIR = dataDir;
    process.env.ELIMINACODE_HOST = '127.0.0.1';

    const { startServer } = require('./server.cjs');
    log('server module loaded');

    const info = await startServer();
    log('server started on port', info.port);

    win = new BrowserWindow({
      width: 1280,
      height: 820,
      show: true,
      backgroundColor: '#f3f7f4',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    win.on('closed', () => { win = null; });
    win.webContents.on('did-fail-load', (_event, code, desc, url) => {
      log('did-fail-load', code, desc, url);
    });

    const url = `http://127.0.0.1:${info.port}/admin`;
    log('loading', url);
    await win.loadURL(url);
    log('admin loaded');

    app.setLoginItemSettings({ openAtLogin: true });
  } catch (err) {
    log('STARTUP ERROR', err);
    dialog.showErrorBox(
      'Eliminacode Server - errore di avvio',
      `${err?.message || err}\n\nLog:\n${logFile || 'non disponibile'}`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
