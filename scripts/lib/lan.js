'use strict';

/**
 * Utilidades de red LAN para el servidor SYNC en Windows (sin dependencias).
 */
const os = require('os');

/**
 * Adaptadores que NO deben anunciarse: virtuales de Hyper-V/WSL/Docker,
 * máquinas virtuales, VPNs mesh y Bluetooth. Un teléfono en el Wi-Fi nunca
 * llega a esas IPs, y anunciarlas solo haría perder tiempo al descubrimiento.
 */
const VIRTUAL_ADAPTER = /(vEthernet|WSL|Hyper-V|VirtualBox|VMware|vboxnet|Docker|Loopback|Bluetooth|Tailscale|ZeroTier|Npcap|TAP-|Hamachi|utun|veth|br-)/i;

function ipToInt(ip) {
  return ip.split('.').reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0);
}

/** ¿Está `ip` dentro de la subred address/netmask? */
function sameSubnet(ip, address, netmask) {
  if (!ip || !address || !netmask) return false;
  const mask = ipToInt(netmask);
  return (ipToInt(ip) & mask) === (ipToInt(address) & mask);
}

/**
 * IPv4 LAN válidas de este PC: excluye loopback, link-local (169.254.x.x) y
 * adaptadores virtuales. SYNC_DISCOVERY_INTERFACE permite forzar un adaptador
 * por nombre (p. ej. "Wi-Fi") si la detección automática no acierta.
 *
 * @returns {{name: string, address: string, netmask: string}[]}
 */
function lanInterfaces(networkInterfaces = os.networkInterfaces(), forced = process.env.SYNC_DISCOVERY_INTERFACE) {
  const result = [];
  for (const [name, addrs] of Object.entries(networkInterfaces || {})) {
    if (forced) {
      if (!name.toLowerCase().includes(String(forced).toLowerCase())) continue;
    } else if (VIRTUAL_ADAPTER.test(name)) {
      continue;
    }
    for (const a of addrs || []) {
      const isV4 = a.family === 'IPv4' || a.family === 4;
      if (!isV4 || a.internal) continue;
      if (a.address.startsWith('169.254.') || a.address.startsWith('127.')) continue;
      result.push({ name, address: a.address, netmask: a.netmask });
    }
  }
  return result;
}

/** Clave estable para detectar cambios de IP (Wi-Fi A → Wi-Fi B). */
function addressesKey(ifaces) {
  return ifaces.map(i => i.address).sort().join(',');
}

module.exports = { lanInterfaces, sameSubnet, addressesKey, VIRTUAL_ADAPTER };
