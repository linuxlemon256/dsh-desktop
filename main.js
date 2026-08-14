const { app, BrowserWindow, dialog } = require('electron');
const { spawn, execFile } = require('child_process');
const http = require('http');

const HOST = '127.0.0.1';
const PORT = Number(process.env.DSH_PORT) || 3080;
const PROBE_INTERVAL_MS = 500;
const SHORT_TIMEOUT_MS = 1500;
const STARTUP_TIMEOUT_MS = 60000;

let dshProc = null;
let mainWindow = null;
let shuttingDown = false;

function log(...args) {
  console.log('[dsh-desktop]', ...args);
}

function errorLog(...args) {
  console.error('[dsh-desktop]', ...args);
}

function serverUrl() {
  return `http://${HOST}:${PORT}`;
}

function isServerUp(timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const probe = () => {
      const req = http.get(serverUrl(), (res) => {
        res.destroy();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) resolve(false);
        else setTimeout(probe, PROBE_INTERVAL_MS);
      });
    };
    probe();
  });
}

function resolveDshPath() {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  return new Promise((resolve) => {
    execFile(lookup, ['dsh'], (err, stdout) => {
      if (err || !stdout) resolve(null);
      else resolve(stdout.trim().split(/\r?\n/)[0]);
    });
  });
}

function startDsh() {
  return new Promise((resolve) => {
    resolveDshPath().then((dshPath) => {
      if (!dshPath) {
        dialog.showErrorBox(
          'dsh not found',
          'The `dsh` CLI was not found on your PATH.\n\n' +
            'Install it globally and try again:\n\n' +
            '    npm install -g @deepseek-ai/dsh'
        );
        resolve(false);
        return;
      }
      log(`starting \`dsh web\` (${dshPath})`);
      if (process.platform === 'win32') {
        const comspec = process.env.ComSpec || 'cmd.exe';
        dshProc = execFile(comspec, ['/d', '/s', '/c', 'dsh web'], { windowsHide: true });
      } else {
        dshProc = spawn('dsh', ['web']);
      }
      dshProc.stdout.on('data', (chunk) => log(`[dsh] ${chunk}`.trimEnd()));
      dshProc.stderr.on('data', (chunk) => errorLog(`[dsh] ${chunk}`.trimEnd()));
      dshProc.on('exit', (code, signal) => {
        dshProc = null;
        if (shuttingDown) return;
        errorLog(`\`dsh web\` exited unexpectedly (code=${code}, signal=${signal})`);
        dialog.showErrorBox(
          'DeepSeek Harness stopped',
          `The \`dsh web\` server exited unexpectedly (code ${code}).`
        );
        app.quit();
      });
      resolve(true);
    });
  });
}

async function ensureDsh() {
  if (await isServerUp(SHORT_TIMEOUT_MS)) {
    log(`existing \`dsh web\` server detected at ${serverUrl()}`);
    return true;
  }
  if (!(await startDsh())) return false;
  if (await isServerUp(STARTUP_TIMEOUT_MS)) {
    log(`\`dsh web\` is ready at ${serverUrl()}`);
    return true;
  }
  errorLog(`timed out waiting for \`dsh web\` at ${serverUrl()}`);
  killDsh();
  dialog.showErrorBox(
    'DeepSeek Harness failed to start',
    `Timed out waiting for the \`dsh web\` server at ${serverUrl()}.`
  );
  return false;
}

function killDsh() {
  if (!dshProc) return;
  const proc = dshProc;
  dshProc = null;
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], () => {});
  } else {
    proc.kill('SIGTERM');
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    const ok = await ensureDsh();
    if (!ok) {
      app.quit();
      return;
    }
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 850,
      title: 'DeepSeek Harness',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
    mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
      errorLog(`failed to load ${serverUrl()}: ${desc} (${code})`);
    });
    mainWindow.loadURL(serverUrl());
  });

  app.on('window-all-closed', () => {
    shuttingDown = true;
    killDsh();
    app.quit();
  });

  app.on('before-quit', () => {
    shuttingDown = true;
    killDsh();
  });
}
