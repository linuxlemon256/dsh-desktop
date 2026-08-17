// Prepares the bundled runtime resources (node + @deepseek-ai/dsh + pnpm)
// that make dsh-desktop run with zero environment dependencies.
//
// Output layout (resources/):
//   node/  — portable Node.js runtime (node.exe on Windows, node on POSIX)
//   dsh/   — the @deepseek-ai/dsh package incl. its full dependency tree
//   pnpm/  — the pnpm CLI package
//   bin/   — launcher shims that resolve the bundled runtime via relative paths
//
// Run from any platform before `electron-builder` (locally or in CI).
import { execSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(ROOT, 'resources');
const TMP = path.join(ROOT, '.tmp-resources');
const NODE_VERSION = 'v24.18.0';

const platform = process.platform;
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const isWin = platform === 'win32';
const NODE_BIN = isWin ? 'node.exe' : 'node';

function sh(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: '--use-system-ca' },
    ...opts,
  });
}

async function download(url, dest) {
  console.log(`download ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText} ${url}`);
  await pipeline(res.body, createWriteStream(dest));
}

function findNodeBinary(dir) {
  const targets = isWin ? ['node.exe'] : ['node'];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (targets.includes(entry.name)) {
        if (!isWin && !full.includes(`${path.sep}bin${path.sep}`)) continue;
        return full;
      }
    }
  }
  return null;
}

async function prepareNode() {
  const osName = { win32: 'win', darwin: 'darwin', linux: 'linux' }[platform];
  const ext = isWin ? 'zip' : 'tar.gz';
  const url = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${osName}-${arch}.${ext}`;
  const archive = path.join(TMP, `node.${ext}`);
  await download(url, archive);
  const extract = path.join(TMP, 'node-extract');
  mkdirSync(extract, { recursive: true });
  sh(`tar -xf "${archive}" -C "${extract}"`);
  const src = findNodeBinary(extract);
  if (!src) throw new Error('node binary not found after extraction');
  const nodeDir = path.join(RES, 'node');
  mkdirSync(nodeDir, { recursive: true });
  cpSync(src, path.join(nodeDir, NODE_BIN));
  if (!isWin) chmodSync(path.join(nodeDir, NODE_BIN), 0o755);
  console.log(`node runtime: ${path.join(nodeDir, NODE_BIN)}`);
}

function prepareDsh() {
  const prefix = path.join(TMP, 'dsh');
  sh(`npm install --prefix "${prefix}" --omit=dev --no-audit --no-fund @deepseek-ai/dsh`);
  const pkg = path.join(prefix, 'node_modules', '@deepseek-ai', 'dsh');
  if (!existsSync(path.join(pkg, 'lib', 'bin.js'))) throw new Error('dsh lib/bin.js missing after install');
  const target = path.join(RES, 'dsh');
  cpSync(pkg, target, { recursive: true });
  cpSync(path.join(prefix, 'node_modules'), path.join(target, 'node_modules'), { recursive: true });
  console.log('dsh CLI tree: resources/dsh');
}

function preparePnpm() {
  const prefix = path.join(TMP, 'pnpm');
  sh(`npm install --prefix "${prefix}" --omit=dev --no-audit --no-fund pnpm`);
  const pkg = path.join(prefix, 'node_modules', 'pnpm');
  if (!existsSync(path.join(pkg, 'bin', 'pnpm.cjs'))) throw new Error('pnpm bin/pnpm.cjs missing after install');
  const target = path.join(RES, 'pnpm');
  cpSync(pkg, target, { recursive: true });
  cpSync(path.join(prefix, 'node_modules'), path.join(target, 'node_modules'), { recursive: true });
  console.log('pnpm: resources/pnpm');
}

function prepareShims() {
  const binDir = path.join(RES, 'bin');
  mkdirSync(binDir, { recursive: true });
  if (isWin) {
    const cmd = [
      '@echo off',
      'set "DIR=%~dp0"',
      '"%DIR%..\\node\\node.exe" "%DIR%..\\pnpm\\bin\\pnpm.cjs" %*',
    ].join('\r\n');
    writeFileSync(path.join(binDir, 'pnpm.cmd'), cmd);
  } else {
    const shContent = [
      '#!/bin/sh',
      'DIR="$(dirname "$(readlink -f "$0")")"',
      'exec "$DIR/../node/node" "$DIR/../pnpm/bin/pnpm.cjs" "$@"',
    ].join('\n');
    const p = path.join(binDir, 'pnpm');
    writeFileSync(p, shContent);
    chmodSync(p, 0o755);
  }
  console.log('launcher shims: resources/bin');
}

rmSync(RES, { recursive: true, force: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(RES, { recursive: true });
mkdirSync(TMP, { recursive: true });

await prepareNode();
prepareDsh();
preparePnpm();
prepareShims();

rmSync(TMP, { recursive: true, force: true });
console.log(`\ndone — bundled runtime ready in ${RES}`);
