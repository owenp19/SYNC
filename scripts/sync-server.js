#!/usr/bin/env node
'use strict';

/**
 * npm run sync:server
 *
 * Arranca en este PC Windows todo el servidor SYNC para la LAN:
 *   - Laravel API         php artisan serve --host=0.0.0.0 --port=8000
 *   - Scheduler           php artisan schedule:work (expiración de Floor)
 *   - LiveKit             infra/livekit/bin/livekit-server.exe + livekit.yaml
 *   - Discovery mDNS      SYNC-SERVER (_sync._tcp.local)
 *
 * LiveKit fija las IPs de sus candidatos ICE al arrancar; por eso, cuando el PC
 * cambia de red (Wi-Fi A → Wi-Fi B), este supervisor REINICIA LiveKit
 * automáticamente para que anuncie la nueva IP. Laravel escucha en 0.0.0.0 y
 * no necesita reinicio.
 *
 * Opciones: --no-livekit (si LiveKit corre en Docker u otro proceso),
 *           --no-scheduler.
 */
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { startDiscovery } = require('./sync-discover');
const { root, backendDir, livekitYaml, apiPort } = require('./lib/server-config');

const args = new Set(process.argv.slice(2));
const withLivekit = !args.has('--no-livekit');
const withScheduler = !args.has('--no-scheduler');
const livekitBin = path.join(root, 'infra', 'livekit', 'bin', process.platform === 'win32' ? 'livekit-server.exe' : 'livekit-server');

const children = new Map();
let shuttingDown = false;

function prefix(name) {
  return chunk => String(chunk).split(/\r?\n/).filter(Boolean).forEach(l => console.log(`[${name}] ${l}`));
}

function start(name, cmd, cmdArgs, opts = {}) {
  // Con shell (php en el PATH) se pasa una sola línea de comando; sin shell, argv separado.
  const child = opts.shell
    ? spawn([cmd, ...cmdArgs].join(' '), { cwd: opts.cwd || root, shell: true, windowsHide: true })
    : spawn(cmd, cmdArgs, { cwd: opts.cwd || root, windowsHide: true });
  child.stdout.on('data', prefix(name));
  child.stderr.on('data', prefix(name));
  child.on('exit', code => {
    if (children.get(name) === child) children.delete(name);
    if (!shuttingDown && !child.syncRestarting) console.log(`[${name}] terminó (código ${code}).`);
  });
  children.set(name, child);
  return child;
}

/** Mata el proceso y sus hijos (php artisan serve lanza un php hijo en Windows). */
function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

function startLivekit() {
  if (!fs.existsSync(livekitBin)) {
    console.log(`[livekit] No existe ${livekitBin}. Arráncalo aparte (Docker: npm run dev:infra) y usa --no-livekit.`);
    return;
  }
  start('livekit', livekitBin, ['--config', livekitYaml]);
}

let restartTimer = null;
function restartLivekit() {
  // Debounce: al cambiar de Wi-Fi Windows puede reportar varias IPs seguidas.
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    const old = children.get('livekit');
    console.log('[livekit] La IP LAN cambió → reiniciando LiveKit para anunciar la nueva dirección…');
    if (old) {
      old.syncRestarting = true;
      killTree(old);
    }
    setTimeout(startLivekit, 1000);
  }, 3000);
}

start('laravel', 'php', ['artisan', 'serve', '--host=0.0.0.0', `--port=${apiPort()}`], { cwd: backendDir, shell: true });
if (withScheduler) start('schedulr', 'php', ['artisan', 'schedule:work'], { cwd: backendDir, shell: true });
if (withLivekit) startLivekit();

const announcer = startDiscovery({
  log: line => console.log(line),
  onAddressesChanged: (ifaces, previous) => {
    if (previous && ifaces.length && withLivekit) restartLivekit();
  },
});

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\nDeteniendo SYNC server…');
  announcer.stop();
  for (const child of children.values()) killTree(child);
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
