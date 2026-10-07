'use strict';

/**
 * Lectura de la configuración REAL del servidor SYNC (sin inventar puertos):
 * - API: SYNC_API_PORT (por defecto 8000, el de `php artisan serve` de este proyecto)
 * - LiveKit: `port` de infra/livekit/livekit.yaml
 * - server_id: `php artisan sync:server-id` (lo genera la primera vez)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..', '..');
const backendDir = path.join(root, 'backend');
const livekitYaml = path.join(root, 'infra', 'livekit', 'livekit.yaml');

const PROTOCOL_VERSION = 1;

function readLivekitPorts(file = livekitYaml) {
  const ports = { signal: 7880, rtcTcp: 7881, rtcUdp: null };
  if (!fs.existsSync(file)) return ports;
  const text = fs.readFileSync(file, 'utf8');
  const top = text.match(/^port:\s*(\d+)/m);
  if (top) ports.signal = Number(top[1]);
  const tcp = text.match(/^\s+tcp_port:\s*(\d+)/m);
  if (tcp) ports.rtcTcp = Number(tcp[1]);
  const udp = text.match(/^\s+udp_port:\s*(\d+)/m);
  if (udp) ports.rtcUdp = Number(udp[1]);
  return ports;
}

function apiPort() {
  return Number(process.env.SYNC_API_PORT || 8000);
}

function readServerId() {
  try {
    const res = spawnSync('php artisan sync:server-id', { cwd: backendDir, encoding: 'utf8', shell: true, timeout: 20000 });
    const id = String(res.stdout || '').trim().split(/\r?\n/).pop();
    if (res.status === 0 && id && id.startsWith('SYNC-')) return id;
  } catch { /* php no disponible */ }
  const file = path.join(backendDir, 'storage', 'app', 'private', 'sync-server-id');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : null;
}

module.exports = { root, backendDir, livekitYaml, PROTOCOL_VERSION, readLivekitPorts, apiPort, readServerId };
