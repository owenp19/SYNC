import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { Preferences } from '@capacitor/preferences';
import { environment } from '@env/environment';
import { DeviceCredentialStorage } from './device-credential.storage';

export interface DeviceInfo {
  id: number;
  name: string;
  department: string | null;
  department_id: number | null;
  status: string;
  operator: { id: number; name: string } | null;
}

@Injectable({ providedIn: 'root' })
export class DeviceService {
  private http = inject(HttpClient);
  private credential = inject(DeviceCredentialStorage);

  private deviceKey = 'sync_device_profile'; // solo info visual NO sensible
  device$ = new BehaviorSubject<DeviceInfo | null>(null);
  ready$ = new BehaviorSubject<boolean>(false);

  /** ¿Ya se le preguntó el operador en este arranque en frío? (se reinicia al cerrar la app) */
  operatorPromptedThisRun = false;

  async init() {
    const t = await this.credential.getToken();
    if (!t) { this.ready$.next(true); return; }
    try {
      const me = await firstValueFrom(this.http.get<DeviceInfo>(`${environment.apiUrl}/device/me`));
      this.device$.next(me);
      await Preferences.set({ key: this.deviceKey, value: JSON.stringify(me) });
    } catch (e: any) {
      if (e?.status === 403 || e?.status === 401) {
        // Device revocado, transferido o token inválido: limpiar credencial
        await this.credential.clearToken();
        await Preferences.remove({ key: this.deviceKey });
        this.device$.next(null);
      }
    }
    this.ready$.next(true);
  }

  async activate(code: string) {
    const res = await firstValueFrom(this.http.post<{ token: string; device: DeviceInfo }>(`${environment.apiUrl}/device/activate`, { code }));
    await this.credential.setToken(res.token);
    this.device$.next(res.device);
    await Preferences.set({ key: this.deviceKey, value: JSON.stringify(res.device) });
    this.operatorPromptedThisRun = true; // la activación ya muestra la pantalla de operador
    return res.device;
  }

  async operators(): Promise<{ id: number; name: string }[]> {
    return firstValueFrom(this.http.get<{ id: number; name: string }[]>(`${environment.apiUrl}/device/operators`));
  }

  async setOperator(operatorId: number | null) {
    const res = await firstValueFrom(this.http.post<DeviceInfo>(`${environment.apiUrl}/device/operator`, { operator_id: operatorId }));
    this.device$.next(res);
    await Preferences.set({ key: this.deviceKey, value: JSON.stringify(res) });
    return res;
  }

  async token(): Promise<string | null> {
    return this.credential.getToken();
  }

  async isActivated(): Promise<boolean> {
    return !!(await this.token());
  }

  async clear() {
    await this.credential.clearToken();
    await Preferences.remove({ key: this.deviceKey });
    this.device$.next(null);
  }
}
