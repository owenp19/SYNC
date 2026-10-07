#!/usr/bin/env node
'use strict';

/**
 * npm run sync:discover
 *
 * Anuncia este PC como "SYNC-SERVER" en la red local (mDNS/DNS-SD, UDP 5353,
 * servicio _sync._tcp.local). No usa ninguna IP fija: detecta las interfaces
 * LAN válidas y re-anuncia automáticamente cuando el PC cambia de Wi-Fi.
 *
 * Solo anuncia. Laravel y LiveKit se arrancan aparte (o todo junto con
 * `npm run sync:server`, que además reinicia LiveKit al cambiar la IP).
 */
const { createAnnouncer } = require('./lib/mdns-announcer');
const { PROTOCOL_VERSION, readLivekitPorts, apiPort, readServerId } = require('./lib/server-config');

function startDiscovery({ onAddressesChanged, log = console.log } = {}) {
  const livekit = readLivekitPorts();
  const serverId = readServerId();
  if (!serverId) log('[discover] Aviso: no se pudo leer el server_id (¿PHP en el PATH?). Se anuncia sin él; /api/health lo informará.');

  const announcer = createAnnouncer({
    apiPort: apiPort(),
    livekitPort: livekit.signal,
    protocolVersion: PROTOCOL_VERSION,
    serverId,
    log,
    onAddressesChanged,
  });
  announcer.start();
  log(`[discover] ${announcer.instanceName} | API :${apiPort()} | LiveKit :${livekit.signal} | protocolo ${PROTOCOL_VERSION}${serverId ? ` | ${serverId}` : ''}`);
  return announcer;
}

module.exports = { startDiscovery };

if (require.main === module) {
  const announcer = startDiscovery({
    onAddressesChanged: (ifaces, previous) => {
      if (previous) {
        console.log('[discover] La IP del PC cambió. Si LiveKit ya estaba corriendo, REINÍCIALO (o usa `npm run sync:server`, que lo hace solo).');
      }
    },
  });
  const shutdown = () => { announcer.stop(); setTimeout(() => process.exit(0), 300); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
