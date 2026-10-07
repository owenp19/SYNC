// Etapa actual: el servidor SYNC sigue siendo un PC en la LAN (sin VPS ni dominio),
// así que también el build "production" descubre el servidor por mDNS.
// Cuando exista un servidor público con TLS, aquí se fijará https/wss.
// La política de Android se mantiene: HTTP en claro solo en builds debug.
export const environment = {
  production: true,
  server: {
    serviceType: '_sync._tcp.',
    defaultApiPort: 8000,
    defaultLivekitPort: 7880,
    protocolVersion: 1,
    apiScheme: 'http',
    livekitScheme: 'ws',
    debugLogs: false,
  },
};
