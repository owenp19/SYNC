import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, distinctUntilChanged, filter, firstValueFrom, skip } from 'rxjs';
import { Preferences } from '@capacitor/preferences';
import { ServerConnectionService } from './server-connection.service';
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
  private server = inject(ServerConnectionService);
  private http = inject(HttpClient);
  private credential = inject(DeviceCredentialStorage);

  private deviceKey = 'sync_device_profile'; // solo info visual NO sensible
  device$ = new BehaviorSubject<DeviceInfo | null>(null);
  ready$ = new BehaviorSubject<boolean>(false);

  /**
   * ¿El trabajador ya CONTESTÓ la pregunta de operador en este arranque en frío?
   * Solo se marca al elegir un operador o pulsar "Continuar sin operador"
   * (ver OperatorPage.choose). Entrar a la pantalla y volver atrás NO cuenta.
   * Se reinicia al cerrar la app.
   */
  operatorPromptedThisRun = false;

  private watchingServer = false;

  /**
   * Carga el perfil del device. La credencial del Device es independiente del
   * descubrimiento de servidor: si el PC cambió de IP pero es el MISMO server_id,
   * se sigue usando el mismo token (sin pedir activación otra vez). Solo un
   * 401/403 del servidor verificado invalida la credencial; un fallo de red no.
   */
  async init() {
    await this.refreshProfile();
    this.ready$.next(true);

    if (!this.watchingServer) {
      this.watchingServer = true;
      // Al reconectar (misma instalación, quizá con otra IP) refrescar el perfil.
      this.server.status$.pipe(skip(1), distinctUntilChanged(), filter(s => s === 'CONNECTED'))
        .subscribe(() => { void this.refreshProfile(); });
    }
  }

  private async refreshProfile() {
    const t = await this.credential.getToken();
    if (!t) return;
    if (this.server.status !== 'CONNECTED') {
      // Sin servidor todavía: mostrar el último perfil conocido (no sensible).
      if (!this.device$.value) {
        const cached = (await Preferences.get({ key: this.deviceKey })).value;
        if (cached) { try { this.device$.next(JSON.parse(cached)); } catch { /* perfil corrupto */ } }
      }
      return;
    }
    try {
      const me = await firstValueFrom(this.http.get<DeviceInfo>(`${this.server.apiUrl}/device/me`));
      this.device$.next(me);
      await Preferences.set({ key: this.deviceKey, value: JSON.stringify(me) });
      // Instalaciones activadas antes del server_id: vincular al primer servidor verificado.
      await this.server.trustCurrentServerIfUnbound();
    } catch (e: any) {
      if (e?.status === 403 || e?.status === 401) {
        // Device revocado, transferido o token inválido: limpiar credencial
        await this.credential.clearToken();
        await Preferences.remove({ key: this.deviceKey });
        this.device$.next(null);
      }
    }
  }

  async activate(code: string) {
    const res = await firstValueFrom(this.http.post<{ token: string; device: DeviceInfo }>(`${this.server.apiUrl}/device/activate`, { code }));
    await this.credential.setToken(res.token);
    // El device queda vinculado a ESTA instalación (server_id esperado, en almacenamiento seguro).
    await this.server.trustCurrentServer();
    this.device$.next(res.device);
    await Preferences.set({ key: this.deviceKey, value: JSON.stringify(res.device) });
    // La activación lleva a la pantalla de operador; la pregunta se marca
    // como contestada solo cuando el trabajador elige allí.
    return res.device;
  }

  async operators(): Promise<{ id: number; name: string }[]> {
    return firstValueFrom(this.http.get<{ id: number; name: string }[]>(`${this.server.apiUrl}/device/operators`));
  }

  async setOperator(operatorId: number | null) {
    const res = await firstValueFrom(this.http.post<DeviceInfo>(`${this.server.apiUrl}/device/operator`, { operator_id: operatorId }));
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
