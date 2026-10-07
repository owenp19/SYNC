// SIN IPs fijas: la dirección del servidor SYNC (el PC de desarrollo en la LAN)
// se descubre en tiempo de ejecución con mDNS/DNS-SD y se valida con
// GET /api/health. Ver ServerConnectionService y README
// ("DESARROLLO LOCAL CON PC COMO SERVIDOR").
export const environment = {
  production: false,
  server: {
    /** Tipo de servicio DNS-SD anunciado por `npm run sync:discover`. */
    serviceType: '_sync._tcp.',
    /** Puertos por defecto si el anuncio no los trae (Android NSD no expone TXT). */
    defaultApiPort: 8000,
    defaultLivekitPort: 7880,
    /** Versión de protocolo que esta app entiende (debe coincidir con /api/health). */
    protocolVersion: 1,
    /** LAN de desarrollo: HTTP/WS sin TLS (Android lo permite solo en builds debug). */
    apiScheme: 'http',
    livekitScheme: 'ws',
    /** Logs de diagnóstico de conexión (nunca incluyen tokens ni claves). */
    debugLogs: true,
  },
};
