import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sync.communication',
  appName: 'SYNC',
  webDir: 'www',
  android: {
    // La app se sirve desde https://localhost y, en desarrollo, el servidor SYNC
    // es un PC de la LAN por http://IP:8000 y ws://IP:7880 (descubierto por mDNS).
    // Sin esto el WebView bloquearía esas peticiones como "contenido mixto".
    // El tráfico HTTP en claro sigue permitido SOLO en builds debug
    // (src/debug/AndroidManifest.xml); los builds release lo rechazan.
    allowMixedContent: true,
  },
};

export default config;
