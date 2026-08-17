const { app, BrowserWindow, dialog } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const HOST = '127.0.0.1';
const RAW_PORT = Number(process.env.DSH_PORT);
const PORT = Number.isInteger(RAW_PORT) && RAW_PORT > 0 && RAW_PORT < 65536 ? RAW_PORT : 3080;
const PROBE_INTERVAL_MS = 500;
const REQUEST_TIMEOUT_MS = 3000;
const SHORT_TIMEOUT_MS = 1500;
const STARTUP_TIMEOUT_MS = 60000;

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const PROFILE_DIR = path.join(DSH_HOME, 'profiles', 'web');
const PROFILE_PKG = path.join(PROFILE_DIR, 'package.json');
const IDE_PLUGIN = 'dsh-better-sidebar';
const SKIP_PLUGIN_INSTALL = process.env.DSH_SKIP_PLUGIN_INSTALL === '1';

const DEBUG_LOG = path.join(os.tmpdir(), 'dsh-desktop-debug.log');
function debugLog(msg) {
  try {
    fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}
process.on('uncaughtException', (err) => {
  debugLog(`UNCAUGHT: ${err && err.stack ? err.stack : err}`);
});
process.on('unhandledRejection', (reason) => {
  debugLog(`UNHANDLED REJECTION: ${reason && reason.stack ? reason.stack : reason}`);
});

const RESOURCES_DIR = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, '..', 'resources');
const BUNDLED_NODE = path.join(
  RESOURCES_DIR,
  'node',
  process.platform === 'win32' ? 'node.exe' : 'node'
);
const BUNDLED_DSH = path.join(RESOURCES_DIR, 'dsh', 'lib', 'bin.js');
const BUNDLED_PNPM = path.join(RESOURCES_DIR, 'pnpm', 'bin', 'pnpm.cjs');
const BUNDLED_BIN = path.join(RESOURCES_DIR, 'bin');

function hasBundledDsh() {
  return fs.existsSync(BUNDLED_NODE) && fs.existsSync(BUNDLED_DSH);
}

function hasBundledPnpm() {
  return fs.existsSync(BUNDLED_NODE) && fs.existsSync(BUNDLED_PNPM);
}

function runtimeEnv() {
  const env = { ...process.env, NODE_OPTIONS: '--use-system-ca' };
  if (fs.existsSync(BUNDLED_BIN)) {
    env.PATH = BUNDLED_BIN + path.delimiter + (env.PATH || '');
  }
  return env;
}

let dshProc = null;
let mainWindow = null;
let shuttingDown = false;
let restarting = false;
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
      ? path.join(__dirname, '..', 'build', 'icon.ico')
      : path.join(__dirname, '..', 'build', 'icon.png');
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
  if (hasBundledDsh()) {
    return Promise.resolve(`bundled: ${BUNDLED_NODE} ${BUNDLED_DSH}`);
  }
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
          'Neither a bundled runtime nor a `dsh` CLI on your PATH was found.\n\n' +
            'Reinstall the app, or install the CLI globally:\n\n' +
            '    npm install -g @deepseek-ai/dsh'
        );
        resolve(false);
        return;
      }
      log(`starting \`${dshCommandLine()}\` (${dshPath})`);
      if (hasBundledDsh()) {
        dshProc = execFile(BUNDLED_NODE, [BUNDLED_DSH, ...dshArgs()], {
          windowsHide: true,
          env: runtimeEnv(),
        });
        dshProc.on('error', (err) => debugLog(`dsh spawn error: ${err.message} (${err.code})`));
        dshProc = execFile(BUNDLED_NODE, [BUNDLED_DSH, ...dshArgs()], {
          windowsHide: true,
          env: runtimeEnv(),
        });
      } else if (process.platform === 'win32') {
        const comspec = process.env.ComSpec || 'cmd.exe';
        dshProc = execFile(comspec, ['/d', '/s', '/c', dshCommandLine()], {
          windowsHide: true,
          env: runtimeEnv(),
        });
      } else {
        dshProc = spawn('dsh', dshArgs(), { detached: true, env: runtimeEnv() });
      }
      const proc = dshProc;
      proc.stdout.on('data', (chunk) => log(`[dsh] ${chunk}`.trimEnd()));
      proc.stderr.on('data', (chunk) => errorLog(`[dsh] ${chunk}`.trimEnd()));
      proc.on('exit', (code, signal) => {
        const intentional = proc.intentionalKill === true;
        if (proc === dshProc) dshProc = null;
        if (shuttingDown || restarting || intentional) return;
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

async function waitForPortClosed(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await isServerUp(300))) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return !(await isServerUp(300));
}

async function ensureDsh() {
  if (await isServerUp(SHORT_TIMEOUT_MS)) {
    log(`existing \`dsh web\` server detected at ${serverUrl()}`);
    return true;
  }

  const profileExists = fs.existsSync(PROFILE_PKG);
  if (!SKIP_PLUGIN_INSTALL) {
    if (!profileExists) {
      log('initializing web profile (no server yet)...');
      for (let i = 0; i < 3; i++) {
        const res = await runCommand('dsh', ['--profile', 'web', '--dump-config']);
        if (res.code === 0) break;
        errorLog(`profile init attempt ${i + 1}/3 failed: ${(res.stderr || '').trim()}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    if (!checkIdePlugin().installed) {
      await installIdePlugin();
    }
  }

  let up = false;
  for (let attempt = 1; attempt <= 3 && !up; attempt++) {
    if (attempt > 1) await waitForPortClosed(10000);
    if (!(await startDsh())) return false;
    up = await waitForStartup(STARTUP_TIMEOUT_MS);
    startupAbort = null;
    if (!up && startupCrashCode !== null && attempt < 3) {
      log(
        `\`dsh web\` exited during startup (code ${startupCrashCode}) — retrying (${attempt}/3)...`
      );
    }
  }

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
  proc.intentionalKill = true;
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

function runCommand(command, args, opts = {}) {
  return new Promise((resolve) => {
    const env = runtimeEnv();
    const finish = (err, stdout, stderr) =>
      resolve({ code: err ? (err.code !== undefined ? err.code : 1) : 0, stdout, stderr });
    const execOpts = {
      windowsHide: true,
      cwd: opts.cwd,
      env,
      maxBuffer: opts.maxBuffer || 16 * 1024 * 1024,
    };
    if (command === 'dsh' && hasBundledDsh()) {
      execFile(BUNDLED_NODE, [BUNDLED_DSH, ...args], execOpts, finish);
    } else if (command === 'pnpm' && hasBundledPnpm()) {
      execFile(BUNDLED_NODE, [BUNDLED_PNPM, ...args], execOpts, finish);
    } else if (process.platform === 'win32') {
      const comspec = process.env.ComSpec || 'cmd.exe';
      execFile(
        comspec,
        ['/d', '/s', '/c', [command, ...args].join(' ')],
        execOpts,
        finish
      );
    } else {
      execFile(command, args, execOpts, finish);
    }
  });
}

function resolvePnpm() {
  if (hasBundledPnpm()) return Promise.resolve(`bundled: ${BUNDLED_NODE} ${BUNDLED_PNPM}`);
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  return new Promise((resolve) => {
    execFile(lookup, ['pnpm'], (err, stdout) => {
      resolve(err || !stdout ? null : stdout.trim().split(/\r?\n/)[0]);
    });
  });
}

function checkIdePlugin() {
  try {
    const pkg = JSON.parse(fs.readFileSync(PROFILE_PKG, 'utf8'));
    const bundles = pkg?.dsh?.profile?.bundles ?? [];
    return { installed: bundles.includes(IDE_PLUGIN) };
  } catch {
    return { installed: false };
  }
}

async function ensurePnpm() {
  if (hasBundledPnpm()) return true;
  if (await resolvePnpm()) return true;
  log('pnpm not found — installing it globally (required by the dsh plugin manager)...');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const res = await runCommand(npmCmd, ['install', '-g', 'pnpm']);
  if (res.code !== 0) {
    errorLog(`failed to install pnpm: ${res.stderr.trim()}`);
    return false;
  }
  log('pnpm installed');
  return true;
}

async function approveNodePtyBuild() {
  const wsFile = path.join(PROFILE_DIR, 'pnpm-workspace.yaml');
  let content = null;
  try {
    content = fs.readFileSync(wsFile, 'utf8');
  } catch {
    /* file missing — will be created */
  }
  if (content && content.includes('node-pty: true')) return true;
  const entry = '  node-pty: true';
  let updated;
  if (content && content.includes('allowBuilds:')) {
    updated = content.replace('allowBuilds:', `allowBuilds:\n${entry}`);
  } else {
    updated = `${content ?? ''}${content ? '\n' : ''}allowBuilds:\n${entry}\n`;
  }
  try {
    fs.writeFileSync(wsFile, updated);
    return true;
  } catch (err) {
    errorLog(`failed to update pnpm-workspace.yaml: ${err.message}`);
    return false;
  }
}

async function installIdePlugin() {
  log(`IDE plugin \`${IDE_PLUGIN}\` not found in profile — installing...`);
  if (!(await ensurePnpm())) return false;
  await approveNodePtyBuild();

  const addArgs = ['plugin', '--profile', 'web', 'add', IDE_PLUGIN];
  let res = await runCommand('dsh', addArgs);
  if (res.code !== 0) {
    errorLog(`dsh plugin add failed on first attempt: ${(res.stderr || '').trim()}`);
    res = await runCommand('dsh', addArgs);
  }

  const status = checkIdePlugin();
  if (status.installed) log(`IDE workbench installed (${IDE_PLUGIN})`);
  else errorLog(`failed to register IDE plugin: ${(res.stderr || '').trim()}`);
  return status.installed;
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
