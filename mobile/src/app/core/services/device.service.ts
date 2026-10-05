import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { Preferences } from '@capacitor/preferences';
import { environment } from '@env/environment';

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
  private tokenKey = 'sync_device_token';
  private deviceKey = 'sync_device_profile';
  device$ = new BehaviorSubject<DeviceInfo | null>(null);
  ready$ = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpClient) {}

  async init() {
    const t = await Preferences.get({ key: this.tokenKey });
    if (!t.value) { this.ready$.next(true); return; }
    try {
      const me = await firstValueFrom(this.http.get<DeviceInfo>(`${environment.apiUrl}/device/me`));
      this.device$.next(me);
      await Preferences.set({ key: this.deviceKey, value: JSON.stringify(me) });
    } catch (e: any) {
      if (e?.status === 403 || e?.status === 401) {
        // Device revocado o token inválido: limpiar credencial
        await Preferences.remove({ key: this.tokenKey });
        await Preferences.remove({ key: this.deviceKey });
        this.device$.next(null);
      }
    }
    this.ready$.next(true);
  }

  async activate(code: string) {
    const res = await firstValueFrom(this.http.post<{ token: string; device: DeviceInfo }>(`${environment.apiUrl}/device/activate`, { code }));
    await Preferences.set({ key: this.tokenKey, value: res.token });
    this.device$.next(res.device);
    await Preferences.set({ key: this.deviceKey, value: JSON.stringify(res.device) });
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
    const t = await Preferences.get({ key: this.tokenKey });
    return t.value;
  }

  async isActivated(): Promise<boolean> {
    return !!(await this.token());
  }

  async clear() {
    await Preferences.remove({ key: this.tokenKey });
    await Preferences.remove({ key: this.deviceKey });
    this.device$.next(null);
  }
}
