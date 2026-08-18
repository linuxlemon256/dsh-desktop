const { app, BrowserWindow, dialog, ipcMain, Menu, Tray, nativeImage } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 3080;
const MIN_PORT = 1024;
const MAX_PORT = 65535;
let PORT = DEFAULT_PORT;
let PORT_SOURCE = 'default';
const PROBE_INTERVAL_MS = 500;
const REQUEST_TIMEOUT_MS = 3000;
const SHORT_TIMEOUT_MS = 1500;
const STARTUP_TIMEOUT_MS = 60000;

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const PROFILE_DIR = path.join(DSH_HOME, 'profiles', 'web');
const PROFILE_PKG = path.join(PROFILE_DIR, 'package.json');
const IDE_PLUGIN = 'dsh-better-sidebar';
const DESKTOP_SETTINGS_PLUGIN = 'dsh-desktop-settings';
const SKIP_PLUGIN_INSTALL = process.env.DSH_SKIP_PLUGIN_INSTALL === '1';

const DEBUG_LOG = path.join(os.tmpdir(), 'dsh-desktop-debug.log');
const DEBUG_LOG_MAX_BYTES = 1024 * 1024;
function debugLog(msg) {
  try {
    try {
      if (fs.existsSync(DEBUG_LOG) && fs.statSync(DEBUG_LOG).size > DEBUG_LOG_MAX_BYTES) {
        fs.writeFileSync(DEBUG_LOG, '');
      }
    } catch {}
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

function settingsPluginDir() {
  return app.isPackaged
    ? path.join(RESOURCES_DIR, 'dsh-desktop-settings')
    : path.join(__dirname, '..', 'dsh-desktop-settings');
}

function hasSettingsPlugin() {
  return fs.existsSync(path.join(settingsPluginDir(), 'package.json')) &&
    fs.existsSync(path.join(settingsPluginDir(), 'lib', 'client.js'));
}

function runtimeEnv() {
  const env = { ...process.env };
  const userNodeOptions = process.env.NODE_OPTIONS || '';
  const caFlag = '--use-system-ca';
  env.NODE_OPTIONS = userNodeOptions.includes(caFlag)
    ? userNodeOptions
    : userNodeOptions + (userNodeOptions ? ' ' : '') + caFlag;
  if (fs.existsSync(BUNDLED_BIN)) {
    env.PATH = BUNDLED_BIN + path.delimiter + (env.PATH || '');
  }
  return env;
}

let dshProc = null;
let mainWindow = null;
let settingsWindow = null;
let tray = null;
let serverRunning = false;
let pendingConflict = false;
let shuttingDown = false;
let restarting = false;
let starting = false;
let startupAbort = null;
let startupCrashCode = null;
let restartCount = 0;
const MAX_RESTARTS = 5;

function log(...args) {
  console.log('[dsh-desktop]', ...args);
}

function errorLog(...args) {
  console.error('[dsh-desktop]', ...args);
}

function configPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
    return true;
  } catch (err) {
    errorLog(`failed to save config: ${err.message}`);
    return false;
  }
}

function resolvePort() {
  if (process.env.DSH_PORT !== undefined) {
    const n = Number(process.env.DSH_PORT);
    if (Number.isInteger(n) && n >= MIN_PORT && n <= MAX_PORT) {
      PORT = n;
      PORT_SOURCE = 'env';
      return;
    }
    console.warn(
      `[dsh-desktop] ignoring invalid DSH_PORT="${process.env.DSH_PORT}", using configured/default port`
    );
  }
  const cfgPort = Number(loadConfig().port);
  if (Number.isInteger(cfgPort) && cfgPort >= MIN_PORT && cfgPort <= MAX_PORT) {
    PORT = cfgPort;
    PORT_SOURCE = 'config';
    return;
  }
  PORT = DEFAULT_PORT;
  PORT_SOURCE = 'default';
}

function serverUrl() {
  return `http://${HOST}:${PORT}`;
}

function dshArgs() {
  return ['web', '--port', String(PORT)];
}

function dshCommandLine() {
  return `dsh ${dshArgs().join(' ')}`;
}

function httpProbe(port, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get(`http://${HOST}:${port}/`, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ up: true, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', () => resolve({ up: false, body: '' }));
    });
    req.setTimeout(timeoutMs || REQUEST_TIMEOUT_MS, () => req.destroy());
    req.on('error', () => resolve({ up: false, body: '' }));
  });
}

async function isDshServer(port) {
  const { up, body } = await httpProbe(port, REQUEST_TIMEOUT_MS);
  return up && body.includes('__DSH_BOOT__');
}

function listeningPids() {
  return new Promise((resolve) => {
    execFile('netstat', ['-ano', '-p', 'tcp'], { windowsHide: true }, (err, stdout) => {
      if (err) {
        resolve(new Map());
        return;
      }
      const map = new Map();
      for (const line of stdout.split(/\r?\n/)) {
        const m = line.match(/TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
        if (m) map.set(Number(m[2]), Number(m[3]));
      }
      resolve(map);
    });
  });
}

function pidsToNames(pids) {
  return new Promise((resolve) => {
    const set = new Set(pids);
    if (set.size === 0) {
      resolve(new Map());
      return;
    }
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true }, (err, stdout) => {
      const nameByPid = new Map();
      if (!err) {
        for (const line of stdout.split(/\r?\n/)) {
          const m = line.match(/"([^"]*)","(\d+)"/);
          if (m) nameByPid.set(Number(m[2]), m[1]);
        }
      }
      const out = new Map();
      for (const pid of set) out.set(pid, nameByPid.get(pid) || '未知');
      resolve(out);
    });
  });
}

async function identifyPort(port) {
  const listening = await listeningPids();
  const pid = listening.get(port);
  if (!pid) return { kind: 'free', pid: null, name: null };
  const names = await pidsToNames([pid]);
  if (await isDshServer(port)) {
    return { kind: 'dsh', pid, name: names.get(pid) };
  }
  return { kind: 'other', pid, name: names.get(pid) };
}

async function findFreePort(from, maxProbe) {
  const limit = from + (maxProbe || 500);
  for (let p = from; p <= limit && p <= MAX_PORT; p++) {
    if (p < MIN_PORT) continue;
    const ident = await identifyPort(p);
    if (ident.kind === 'free') return p;
  }
  return null;
}

async function scanPorts(start, end) {
  const listening = await listeningPids();
  const found = [];
  for (const [port, pid] of listening.entries()) {
    if (port >= start && port <= end) found.push([port, pid]);
  }
  found.sort((a, b) => a[0] - b[0]);
  const names = await pidsToNames(found.map(([, pid]) => pid));
  const out = [];
  for (const [port, pid] of found) {
    let kind = 'other';
    if (await isDshServer(port)) kind = 'dsh';
    out.push({ port, pid, name: names.get(pid), kind });
  }
  return out;
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
      proc.on('error', (err) => debugLog(`dsh spawn error: ${err.message} (${err.code})`));
      proc.stdout.on('data', (chunk) => log(`[dsh] ${chunk}`.trimEnd()));
      proc.stderr.on('data', (chunk) => errorLog(`[dsh] ${chunk}`.trimEnd()));
      proc.on('exit', (code, signal) => {
        const intentional = proc.intentionalKill === true;
        if (proc === dshProc) {
          dshProc = null;
          serverRunning = false;
        }
        if (shuttingDown || restarting || intentional) return;
        errorLog(`\`dsh web\` exited unexpectedly (code=${code}, signal=${signal})`);
        if (starting) {
          startupCrashCode = code;
          if (startupAbort) startupAbort();
          return;
        }
        scheduleRestart(code);
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
  const ident = await identifyPort(PORT);
  if (ident.kind === 'dsh') {
    log(`existing \`dsh web\` server detected at ${serverUrl()} — attaching`);
    serverRunning = true;
    return true;
  }
  if (ident.kind === 'other') {
    pendingConflict = true;
    errorLog(`port ${PORT} is occupied by ${ident.name} (pid ${ident.pid})`);
    const free = await findFreePort(PORT + 1);
    const detail =
      `进程：${ident.name || '未知'} (PID ${ident.pid})\n\n` +
      (free !== null
        ? `可改用空闲端口 ${free}。`
        : '未找到空闲端口，请先释放该端口后重试。');
    const buttons = free !== null ? ['改用 ' + free, '退出'] : ['退出'];
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      title: '端口被占用',
      message: `端口 ${PORT} 已被其他程序占用`,
      detail,
      buttons,
      defaultId: 0,
      cancelId: 1,
    });
    if (choice === 0 && free !== null) {
      saveConfig({ port: free });
      PORT = free;
      PORT_SOURCE = 'config';
      pendingConflict = false;
      log(`switched to free port ${free}`);
      return ensureDsh();
    }
    app.quit();
    return false;
  }

  serverRunning = false;
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
    if (!checkDesktopSettingsPlugin().installed) {
      await installDesktopSettingsPlugin();
    }
  }

  let up = false;
  let lastCode = null;
  for (let attempt = 1; attempt <= 3 && !up; attempt++) {
    if (attempt > 1) {
      killDsh();
      await waitForPortClosed(10000);
    }
    startupCrashCode = null;
    if (!(await startDsh())) return false;
    starting = true;
    up = await waitForStartup(STARTUP_TIMEOUT_MS);
    starting = false;
    startupAbort = null;
    lastCode = startupCrashCode;
    if (!up) {
      killDsh();
      errorLog(
        lastCode !== null
          ? `\`dsh web\` exited during startup (code ${lastCode})`
          : `\`dsh web\` did not come up within ${STARTUP_TIMEOUT_MS}ms`
      );
      if (attempt < 3) log(`retrying (${attempt}/3)...`);
    }
  }

  if (up) {
    serverRunning = true;
    log(`\`dsh web\` is ready at ${serverUrl()}`);
    return true;
  }
  errorLog(`\`dsh web\` failed to start at ${serverUrl()}`);
  killDsh();
  const detail =
    lastCode !== null
      ? `The \`dsh web\` server exited during startup (code ${lastCode}).`
      : `Timed out waiting for the \`dsh web\` server at ${serverUrl()}.`;
  dialog.showErrorBox('DeepSeek Harness failed to start', detail);
  return false;
}

function scheduleRestart(code) {
  if (shuttingDown) return;
  if (restartCount >= MAX_RESTARTS) {
    errorLog(`\`dsh web\` crashed ${restartCount} times — quitting`);
    dialog.showErrorBox(
      'DeepSeek Harness stopped',
      `The \`dsh web\` server kept crashing (last exit code ${code}).`
    );
    app.quit();
    return;
  }
  restartCount++;
  const delay = Math.min(1000 * restartCount, 5000);
  errorLog(
    `\`dsh web\` exited unexpectedly (code ${code}) — restarting (${restartCount}/${MAX_RESTARTS}) in ${delay}ms`
  );
  restarting = true;
  setTimeout(async () => {
    restarting = false;
    if (shuttingDown) return;
    if (!(await startDsh())) return;
    starting = true;
    const up = await waitForStartup(STARTUP_TIMEOUT_MS);
    starting = false;
    startupAbort = null;
    if (up) {
      restartCount = 0;
      serverRunning = true;
      log(`\`dsh web\` restarted at ${serverUrl()}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(serverUrl());
      }
      return;
    }
    killDsh();
    errorLog('`dsh web` failed to come back up');
    scheduleRestart(startupCrashCode ?? code);
  }, delay);
}

function killDsh() {
  if (!dshProc) return;
  const proc = dshProc;
  proc.intentionalKill = true;
  dshProc = null;
  serverRunning = false;
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

function openMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    title: 'DeepSeek Harness',
    icon: path.join(__dirname, 'icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'web-bridge.js'),
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
}

function trayIcon() {
  const p = path.join(__dirname, 'icon.png');
  if (fs.existsSync(p)) {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) return img.resize({ width: 32, height: 32 });
  }
  return nativeImage.createEmpty();
}

function setupTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('DeepSeek Harness Desktop');
  tray.on('click', () => {
    openMainWindow();
  });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => openMainWindow() },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ])
  );
}

function setupMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '显示主窗口', click: () => openMainWindow() },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  ipcMain.handle('settings:get', () => ({
    port: PORT,
    portSource: PORT_SOURCE,
    configPort: loadConfig().port ?? null,
    running: serverRunning,
    appVersion: app.getVersion(),
  }));

  ipcMain.handle('settings:set', (_e, raw) => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < MIN_PORT || n > MAX_PORT) {
      return { ok: false, error: `端口必须是 ${MIN_PORT}–${MAX_PORT} 之间的整数` };
    }
    if (saveConfig({ port: n })) {
      return { ok: true, port: n };
    }
    return { ok: false, error: '写入配置文件失败' };
  });

  ipcMain.handle('ports:identify', async (_e, port) => {
    const n = Number(port);
    if (!Number.isInteger(n) || n < 1 || n > 65535) return { kind: 'unknown' };
    return identifyPort(n);
  });

  ipcMain.handle('ports:scan', async (_e, start, end) => {
    const s = Number(start);
    const e = Number(end);
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 1 || e > 65535 || s > e) {
      return { error: '扫描范围无效' };
    }
    if (e - s + 1 > 2000) return { error: '单次最多扫描 2000 个端口' };
    return { list: await scanPorts(s, e) };
  });

  ipcMain.handle('dsh:restart', async () => {
    resolvePort();
    const ident = await identifyPort(PORT);
    if (ident.kind === 'other') {
      return { ok: false, error: `端口 ${PORT} 被 ${ident.name || '其他程序'} 占用` };
    }
    if (ident.kind === 'dsh') {
      serverRunning = true;
      pendingConflict = false;
      openMainWindow();
      return { ok: true, port: PORT, attached: true };
    }
    killDsh();
    pendingConflict = false;
    const ok = await ensureDsh();
    if (!ok) return { ok: false, error: '服务启动失败' };
    openMainWindow();
    return { ok: true, port: PORT };
  });
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
    const installedOnDisk = fs.existsSync(path.join(PROFILE_DIR, 'node_modules', IDE_PLUGIN));
    return { installed: bundles.includes(IDE_PLUGIN) && installedOnDisk };
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
  if (content && /\bnode-pty\s*:\s*true\b/.test(content)) return true;
  if (content) {
    content = content.replace(/node-pty\s*:\s*false\b/, 'node-pty: true');
  }
  let updated;
  if (content && content.includes('allowBuilds:')) {
    if (/\bnode-pty\s*:/.test(content)) {
      updated = content;
    } else {
      updated = content.replace(/(allowBuilds:)/, `$1\n  node-pty: true`);
    }
  } else {
    updated = `${content ?? ''}${content ? '\n' : ''}allowBuilds:\n  node-pty: true\n`;
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

function checkDesktopSettingsPlugin() {
  try {
    const pkg = JSON.parse(fs.readFileSync(PROFILE_PKG, 'utf8'));
    const bundles = pkg?.dsh?.profile?.bundles ?? [];
    const onDisk = fs.existsSync(path.join(PROFILE_DIR, 'node_modules', DESKTOP_SETTINGS_PLUGIN));
    return { installed: bundles.includes(DESKTOP_SETTINGS_PLUGIN) && onDisk };
  } catch {
    return { installed: false };
  }
}

async function installDesktopSettingsPlugin() {
  if (!hasSettingsPlugin()) {
    log(`desktop settings plugin bundle not shipped — skipping install`);
    return false;
  }
  log(`installing \`${DESKTOP_SETTINGS_PLUGIN}\` into profile...`);
  if (!(await ensurePnpm())) return false;
  const link = 'link:' + settingsPluginDir().replace(/\\/g, '/');
  const addArgs = ['plugin', '--profile', 'web', 'add', link];
  let res = await runCommand('dsh', addArgs);
  if (res.code !== 0) {
    errorLog(`dsh plugin add failed on first attempt: ${(res.stderr || '').trim()}`);
    res = await runCommand('dsh', addArgs);
  }
  const status = checkDesktopSettingsPlugin();
  if (status.installed) log(`desktop settings plugin installed`);
  else errorLog(`failed to register desktop settings plugin: ${(res.stderr || '').trim()}`);
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
    resolvePort();
    setupMenu();
    registerIpc();
    setupTray();
    const ok = await ensureDsh();
    if (ok) {
      openMainWindow();
    } else {
      app.quit();
    }
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
