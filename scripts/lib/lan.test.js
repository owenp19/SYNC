'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { lanInterfaces, sameSubnet, addressesKey } = require('./lan');
const { readLivekitPorts, livekitYaml } = require('./server-config');

const sample = {
  'Wi-Fi': [
    { address: 'fe80::1', family: 'IPv6', internal: false, netmask: 'ffff:ffff:ffff:ffff::' },
    { address: '192.168.1.37', family: 'IPv4', internal: false, netmask: '255.255.255.0' },
  ],
  'vEthernet (WSL (Hyper-V firewall))': [{ address: '172.29.0.1', family: 'IPv4', internal: false, netmask: '255.255.240.0' }],
  'Loopback Pseudo-Interface 1': [{ address: '127.0.0.1', family: 'IPv4', internal: true, netmask: '255.0.0.0' }],
  Ethernet: [{ address: '169.254.10.2', family: 'IPv4', internal: false, netmask: '255.255.0.0' }],
};

test('solo anuncia la IPv4 LAN real (sin virtuales, loopback ni link-local)', () => {
  assert.deepStrictEqual(lanInterfaces(sample, undefined).map(i => i.address), ['192.168.1.37']);
});

test('SYNC_DISCOVERY_INTERFACE fuerza un adaptador concreto', () => {
  assert.deepStrictEqual(lanInterfaces(sample, 'vethernet').map(i => i.address), ['172.29.0.1']);
});

test('sameSubnet responde solo a teléfonos de la misma red', () => {
  assert.strictEqual(sameSubnet('192.168.1.54', '192.168.1.37', '255.255.255.0'), true);
  assert.strictEqual(sameSubnet('10.156.185.73', '192.168.1.37', '255.255.255.0'), false);
});

test('el cambio de Wi-Fi cambia la clave de direcciones', () => {
  const a = addressesKey([{ address: '10.156.185.51' }]);
  const b = addressesKey([{ address: '192.168.1.37' }]);
  assert.notStrictEqual(a, b);
});

test('los puertos de LiveKit se leen de livekit.yaml (no inventados)', () => {
  const ports = readLivekitPorts(livekitYaml);
  assert.strictEqual(ports.signal, 7880);
  assert.strictEqual(ports.rtcUdp, 7882);
  assert.strictEqual(ports.rtcTcp, 7881);
});
