// En desarrollo usamos el mismo host desde el que se sirve la app:
// - En el navegador del PC: http://localhost:8000
// - Desde el servidor de `ng serve` en la LAN: apunta a la IP del PC
// - En la APK nativa (Capacitor): caemos a la IP de la LAN (cámbiala al cambiar de red)
import { Capacitor } from '@capacitor/core';

const LAN_IP = '10.156.185.51';
const browserHost = typeof window !== 'undefined' && window.location.hostname
  ? window.location.hostname
  : '';

const HOST = Capacitor.isNativePlatform()
  ? LAN_IP
  : (browserHost || 'localhost');

export const environment = {
  production: false,
  apiUrl: `http://${HOST}:8000/api`,
  socketUrl: `http://${HOST}:8000`,
  livekitUrl: `ws://${HOST}:7880`,
  livekitTokenEndpoint: `http://${HOST}:8000/api/voice/token`
};

