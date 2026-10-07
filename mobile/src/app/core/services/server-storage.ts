import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

/** Último servidor SYNC verificado (no sensible: solo dónde estaba). */
export interface ServerEndpoint {
  host: string;
  apiPort: number;
  livekitPort: number;
  serverId: string;
  lastConnectedAt: string;
}

export interface ManualServerConfig {
  host: string;
  apiPort: number;
  livekitPort: number;
}

export type ServerMode = 'auto' | 'manual';

/**
 * Persistencia del descubrimiento de servidor. Independiente de la credencial
 * del Device: cambiar de IP o de servidor guardado NUNCA borra el token.
 * - lastKnownServer / modo / config manual → Preferences (no sensibles).
 * - server_id esperado (la instalación a la que se activó el device) →
 *   almacenamiento seguro en nativo (Keystore), Preferences en navegador.
 */
@Injectable({ providedIn: 'root' })
export class ServerStorage {
  private readonly lastKnownKey = 'sync_server_last_known';
  private readonly modeKey = 'sync_server_mode';
  private readonly manualKey = 'sync_server_manual';
  private readonly expectedKey = 'sync_expected_server_id';
  private readonly native = Capacitor.isNativePlatform();

  async getLastKnown(): Promise<ServerEndpoint | null> {
    return this.readJson<ServerEndpoint>(this.lastKnownKey);
  }

  async setLastKnown(endpoint: ServerEndpoint): Promise<void> {
    await Preferences.set({ key: this.lastKnownKey, value: JSON.stringify(endpoint) });
  }

  async getMode(): Promise<ServerMode> {
    const v = (await Preferences.get({ key: this.modeKey })).value;
    return v === 'manual' ? 'manual' : 'auto';
  }

  async setMode(mode: ServerMode): Promise<void> {
    await Preferences.set({ key: this.modeKey, value: mode });
  }

  async getManual(): Promise<ManualServerConfig | null> {
    return this.readJson<ManualServerConfig>(this.manualKey);
  }

  async setManual(config: ManualServerConfig): Promise<void> {
    await Preferences.set({ key: this.manualKey, value: JSON.stringify(config) });
  }

  async getExpectedServerId(): Promise<string | null> {
    if (!this.native) return (await Preferences.get({ key: this.expectedKey })).value;
    try {
      const v = await SecureStorage.get(this.expectedKey, false);
      return typeof v === 'string' ? v : null;
    } catch {
      return null;
    }
  }

  async setExpectedServerId(serverId: string): Promise<void> {
    if (!this.native) {
      await Preferences.set({ key: this.expectedKey, value: serverId });
      return;
    }
    await SecureStorage.set(this.expectedKey, serverId, false);
  }

  private async readJson<T>(key: string): Promise<T | null> {
    try {
      const v = (await Preferences.get({ key })).value;
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  }
}
