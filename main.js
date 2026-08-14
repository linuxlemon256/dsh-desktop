const { app, BrowserWindow, dialog } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const HOST = '127.0.0.1';
const RAW_PORT = Number(process.env.DSH_PORT);
const PORT = Number.isInteger(RAW_PORT) && RAW_PORT > 0 && RAW_PORT < 65536 ? RAW_PORT : 3080;
const PROBE_INTERVAL_MS = 500;
const REQUEST_TIMEOUT_MS = 3000;
const SHORT_TIMEOUT_MS = 1500;
const STARTUP_TIMEOUT_MS = 60000;

let dshProc = null;
let mainWindow = null;
let shuttingDown = false;
let startupAbort = null;
let startupCrashCode = null;

if (process.env.DSH_PORT !== undefined && RAW_PORT !== PORT) {
  console.warn(
    `[dsh-desktop] ignoring invalid DSH_PORT="${process.env.DSH_PORT}", using ${PORT}`
  );
}

function windowIcon() {
  const candidate =
    process.platform === 'win32'
      ? path.join(__dirname, 'build', 'icon.ico')
      : path.join(__dirname, 'build', 'icon.png');
  return fs.existsSync(candidate) ? candidate : undefined;
}

function log(...args) {
  console.log('[dsh-desktop]', ...args);
}

function errorLog(...args) {
  console.error('[dsh-desktop]', ...args);
}

function serverUrl() {
  return `http://${HOST}:${PORT}`;
}

function dshArgs() {
  return process.env.DSH_PORT !== undefined ? ['web', '--port', String(PORT)] : ['web'];
}

function dshCommandLine() {
  return `dsh ${dshArgs().join(' ')}`;
}

function isServerUp(timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const probe = () => {
      const req = http.get(serverUrl(), (res) => {
        res.destroy();
        resolve(true);
      });
      req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy());
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) resolve(false);
        else setTimeout(probe, PROBE_INTERVAL_MS);
      });
    };
    probe();
  });
}

function waitForStartup(timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (up) => {
      if (!settled) {
        settled = true;
        resolve(up);
      }
    };
    startupAbort = () => finish(false);
    const start = Date.now();
    const probe = () => {
      const req = http.get(serverUrl(), (res) => {
        res.destroy();
        finish(true);
      });
      req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy());
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) finish(false);
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
      log(`starting \`${dshCommandLine()}\` (${dshPath})`);
      if (process.platform === 'win32') {
        const comspec = process.env.ComSpec || 'cmd.exe';
        dshProc = execFile(comspec, ['/d', '/s', '/c', dshCommandLine()], {
          windowsHide: true,
        });
      } else {
        dshProc = spawn('dsh', dshArgs(), { detached: true });
      }
      dshProc.stdout.on('data', (chunk) => log(`[dsh] ${chunk}`.trimEnd()));
      dshProc.stderr.on('data', (chunk) => errorLog(`[dsh] ${chunk}`.trimEnd()));
      dshProc.on('exit', (code, signal) => {
        dshProc = null;
        if (shuttingDown) return;
        errorLog(`\`dsh web\` exited unexpectedly (code=${code}, signal=${signal})`);
        if (startupAbort) {
          startupCrashCode = code;
          startupAbort();
          return;
        }
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
  const up = await waitForStartup(STARTUP_TIMEOUT_MS);
  startupAbort = null;
  if (up) {
    log(`\`dsh web\` is ready at ${serverUrl()}`);
    return true;
  }
  errorLog(`\`dsh web\` failed to start at ${serverUrl()}`);
  killDsh();
  const detail =
    startupCrashCode !== null
      ? `The \`dsh web\` server exited during startup (code ${startupCrashCode}).`
      : `Timed out waiting for the \`dsh web\` server at ${serverUrl()}.`;
  dialog.showErrorBox('DeepSeek Harness failed to start', detail);
  return false;
}

function killDsh() {
  if (!dshProc) return;
  const proc = dshProc;
  dshProc = null;
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], () => {});
  } else {
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch {
      proc.kill('SIGTERM');
    }
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
      icon: windowIcon(),
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
    mainWindow.webContents.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
      if (!isMainFrame) return;
      errorLog(`failed to load ${serverUrl()}: ${desc} (${code})`);
      dialog.showErrorBox(
        'Connection failed',
        `Could not load ${serverUrl()}.\n\n${desc} (${code})`
      );
      app.quit();
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
