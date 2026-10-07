import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';

/**
 * Fuente de cambios de conectividad (Wi-Fi A → sin red → Wi-Fi B).
 * Envuelve @capacitor/network para poder simularla en pruebas.
 * No usa el nombre del Wi-Fi (SSID): la identidad la da el servidor SYNC.
 */
@Injectable({ providedIn: 'root' })
export class NetworkStatusSource {
  async isConnected(): Promise<boolean> {
    try {
      return (await Network.getStatus()).connected;
    } catch {
      return true;
    }
  }

  onChange(listener: (connected: boolean, connectionType: string) => void): void {
    Network.addListener('networkStatusChange', s => listener(s.connected, s.connectionType)).catch(() => {});
  }
}
