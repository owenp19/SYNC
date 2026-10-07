'use strict';

/**
 * Anunciador mDNS / DNS-SD del servidor SYNC (servicio _sync._tcp.local).
 *
 * - Un socket mDNS por cada interfaz LAN válida: así la respuesta sale por la
 *   interfaz correcta y lleva la IP de ESA interfaz (nunca la de un adaptador
 *   virtual ni la de otra red).
 * - Solo responde a consultas que llegan desde la misma subred de la interfaz.
 * - Cada pocos segundos revisa las IPs del PC: si cambian (Wi-Fi A → Wi-Fi B)
 *   cierra los sockets viejos, abre los nuevos y re-anuncia con cache-flush.
 *
 * El anuncio solo dice DÓNDE está SYNC. No concede identidad, permisos ni acceso:
 * la app valida después con GET /api/health y se autentica como Device.
 */
const os = require('os');
const mdnsFactory = require('multicast-dns');
const { lanInterfaces, sameSubnet, addressesKey } = require('./lan');

const SERVICE_TYPE = '_sync._tcp.local';
const SERVICES_META = '_services._dns-sd._udp.local';
const RECORD_TTL = 120;
const HOST_TTL = 60;

function sanitizeLabel(value) {
  return String(value).replace(/[^A-Za-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'pc';
}

/**
 * @param {{
 *   apiPort: number, livekitPort: number, protocolVersion: number, serverId?: string|null,
 *   instanceName?: string, pollMs?: number, log?: (msg: string) => void,
 *   onAddressesChanged?: (ifaces: {name: string, address: string}[], previous: string) => void,
 * }} options
 */
function createAnnouncer(options) {
  const log = options.log || (() => {});
  const hostLabel = sanitizeLabel(os.hostname());
  const instanceName = options.instanceName || `SYNC-SERVER-${hostLabel}`;
  const instanceFqdn = `${instanceName}.${SERVICE_TYPE}`;
  const hostFqdn = `sync-${hostLabel}.local`.toLowerCase();
  const pollMs = options.pollMs || 3000;

  const txt = [
    `apiPort=${options.apiPort}`,
    `livekitPort=${options.livekitPort}`,
    `protocolVersion=${options.protocolVersion}`,
  ];
  if (options.serverId) txt.push(`serverId=${options.serverId}`);

  /** @type {Map<string, {iface: {name: string, address: string, netmask: string}, mdns: any}>} */
  const sockets = new Map();
  let currentKey = '';
  let timer = null;
  let stopped = false;

  function records(address, ttlScale = 1) {
    return {
      ptr: { name: SERVICE_TYPE, type: 'PTR', ttl: 4500 * ttlScale, data: instanceFqdn },
      meta: { name: SERVICES_META, type: 'PTR', ttl: 4500 * ttlScale, data: SERVICE_TYPE },
      srv: { name: instanceFqdn, type: 'SRV', ttl: RECORD_TTL * ttlScale, flush: true, data: { priority: 0, weight: 0, port: options.apiPort, target: hostFqdn } },
      txt: { name: instanceFqdn, type: 'TXT', ttl: RECORD_TTL * ttlScale, flush: true, data: txt },
      a: { name: hostFqdn, type: 'A', ttl: HOST_TTL * ttlScale, flush: true, data: address },
    };
  }

  function fullAnnouncement(address, ttlScale = 1) {
    const r = records(address, ttlScale);
    return { answers: [r.ptr, r.srv, r.txt, r.a], additionals: [] };
  }

  function answerQuery(entry, query, rinfo) {
    const { iface, mdns } = entry;
    // Solo contestar a quien está en la subred de esta interfaz: evita
    // entregar a un teléfono una IP de otra red (o de un adaptador virtual).
    if (!sameSubnet(rinfo.address, iface.address, iface.netmask)) return;

    const r = records(iface.address);
    const answers = [];
    const additionals = [];
    for (const q of query.questions || []) {
      const name = String(q.name || '').toLowerCase();
      const type = q.type;
      if (name === SERVICE_TYPE.toLowerCase() && (type === 'PTR' || type === 'ANY')) {
        answers.push(r.ptr);
        additionals.push(r.srv, r.txt, r.a);
      } else if (name === SERVICES_META.toLowerCase() && (type === 'PTR' || type === 'ANY')) {
        answers.push(r.meta);
      } else if (name === instanceFqdn.toLowerCase() && ['SRV', 'TXT', 'ANY'].includes(type)) {
        if (type !== 'TXT') answers.push(r.srv);
        if (type !== 'SRV') answers.push(r.txt);
        additionals.push(r.a);
      } else if (name === hostFqdn && (type === 'A' || type === 'ANY')) {
        answers.push(r.a);
      }
    }
    if (!answers.length) return;

    const response = { answers, additionals: additionals.filter(a => !answers.includes(a)) };
    // Respuesta multicast estándar (RFC 6762) por la interfaz correcta…
    mdns.respond(response);
    // …y unicast para consultas "legacy" (puerto origen distinto de 5353).
    if (rinfo.port !== 5353) {
      mdns.respond({ ...response, id: query.id, questions: query.questions }, { port: rinfo.port, address: rinfo.address });
    }
  }

  function openSocket(iface) {
    const mdns = mdnsFactory({ interface: iface.address, bind: '0.0.0.0', reuseAddr: true, loopback: true });
    const entry = { iface, mdns };
    mdns.on('query', (query, rinfo) => answerQuery(entry, query, rinfo));
    mdns.on('error', err => log(`[mdns] error en ${iface.name} (${iface.address}): ${err.message}`));
    mdns.on('warning', () => {});
    mdns.on('ready', () => {
      // Anuncio no solicitado (x2) para que los clientes actualicen su caché.
      mdns.respond(fullAnnouncement(iface.address));
      setTimeout(() => { if (!stopped && sockets.get(iface.address) === entry) mdns.respond(fullAnnouncement(iface.address)); }, 1000);
    });
    sockets.set(iface.address, entry);
  }

  function closeSocket(address, goodbye) {
    const entry = sockets.get(address);
    if (!entry) return;
    sockets.delete(address);
    try {
      if (goodbye) entry.mdns.respond(fullAnnouncement(address, 0));
    } catch { /* la interfaz puede haber desaparecido ya */ }
    setTimeout(() => { try { entry.mdns.destroy(); } catch { /* ignore */ } }, goodbye ? 200 : 0);
  }

  function refresh() {
    if (stopped) return;
    const ifaces = lanInterfaces();
    const key = addressesKey(ifaces);
    if (key === currentKey) return;

    const previous = currentKey;
    const wanted = new Set(ifaces.map(i => i.address));
    for (const address of [...sockets.keys()]) {
      if (!wanted.has(address)) closeSocket(address, true);
    }
    for (const iface of ifaces) {
      if (!sockets.has(iface.address)) openSocket(iface);
    }
    currentKey = key;

    if (ifaces.length) {
      log(`[mdns] Anunciando ${instanceName} (${SERVICE_TYPE}) en: ${ifaces.map(i => `${i.address} [${i.name}]`).join(', ')}`);
    } else {
      log('[mdns] Sin red LAN válida: esperando a que el PC se conecte a una red…');
    }
    if (previous !== '' || ifaces.length) {
      options.onAddressesChanged?.(ifaces, previous);
    }
  }

  return {
    instanceName,
    hostFqdn,
    start() {
      refresh();
      timer = setInterval(refresh, pollMs);
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      for (const address of [...sockets.keys()]) closeSocket(address, true);
    },
  };
}

module.exports = { createAnnouncer, SERVICE_TYPE };
