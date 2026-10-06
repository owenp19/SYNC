import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { environment } from '@env/environment';

export interface ChannelDto {
  id: number;
  name: string;
  type: 'general' | 'private' | 'emergency';
  occupied_by: number | null;
  occupier_name: string | null;
  floor_expires_at: string | null;
  status: 'free' | 'busy';
}

@Injectable({ providedIn: 'root' })
export class ChannelsService {
  private http = inject(HttpClient);

  channels$ = new BehaviorSubject<ChannelDto[]>([]);
  loadError$ = new BehaviorSubject<string | null>(null);
  private timer: any;
  /** Vista device (filtrada por departamento) o vista admin (todos los canales). */
  private listUrl = `${environment.apiUrl}/channels`;

  /** Dashboard administrativo: todos los canales, autenticado con token de ADMIN. */
  useAdminApi() {
    this.listUrl = `${environment.apiUrl}/admin/channels`;
  }

  /** Radio del device: solo canales con can_listen del departamento. */
  useDeviceApi() {
    this.listUrl = `${environment.apiUrl}/channels`;
  }

  startPolling(intervalMs = 4000) {
    this.refresh();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.refresh(), intervalMs);
  }

  stopPolling() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  refresh() {
    this.http.get<ChannelDto[]>(this.listUrl).subscribe({
      next: (channels) => {
        this.loadError$.next(null);
        this.channels$.next(channels);
      },
      error: (err) => {
        console.error('Error cargando canales', err);
        this.loadError$.next('No se pudo cargar la lista de canales. Verifica que el backend esté activo.');
      },
    });
  }
}
