import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

/**
 * Abstracción del almacenamiento de la credencial operativa del Device.
 * DeviceService no se acopla a ninguna biblioteca concreta.
 */
export abstract class DeviceCredentialStorage {
  abstract getToken(): Promise<string | null>;
  abstract setToken(token: string): Promise<void>;
  abstract clearToken(): Promise<void>;
}

/**
 * Implementación segura:
 * - Android/iOS nativo: @aparajita/capacitor-secure-storage, respaldado por
 *   Android Keystore (EncryptedSharedPreferences) / iOS Keychain.
 * - Web (solo desarrollo en navegador): Preferences como fallback,
 *   ya que el Keystore no existe fuera del dispositivo.
 */
@Injectable({ providedIn: 'root' })
export class SyncDeviceCredentialStorage extends DeviceCredentialStorage {
  private readonly key = 'sync_device_token';
  private readonly native = Capacitor.isNativePlatform();

  async getToken(): Promise<string | null> {
    if (!this.native) {
      return (await Preferences.get({ key: this.key })).value;
    }
    try {
      const value = await SecureStorage.get(this.key, false);
      return typeof value === 'string' ? value : null;
    } catch {
      return null; // clave inexistente o keystore no disponible → sin credencial
    }
  }

  async setToken(token: string): Promise<void> {
    if (!this.native) {
      await Preferences.set({ key: this.key, value: token });
      return;
    }
    await SecureStorage.set(this.key, token, false);
  }

  async clearToken(): Promise<void> {
    if (!this.native) {
      await Preferences.remove({ key: this.key });
      return;
    }
    try {
      await SecureStorage.remove(this.key);
    } catch {}
  }
}
