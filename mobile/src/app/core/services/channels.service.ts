import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { ServerConnectionService } from './server-connection.service';

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
  private server = inject(ServerConnectionService);
  /**
   * Vista device (filtrada por departamento) o vista admin (todos los canales).
   * Se guarda solo la RUTA: la URL base se pide al servidor en cada petición
   * porque la IP del PC servidor puede cambiar en caliente.
   */
  private listPath = '/channels';

  /** Dashboard administrativo: todos los canales, autenticado con token de ADMIN. */
  useAdminApi() {
    this.listPath = '/admin/channels';
  }

  /** Radio del device: solo canales con can_listen del departamento. */
  useDeviceApi() {
    this.listPath = '/channels';
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
    this.http.get<ChannelDto[]>(`${this.server.apiUrl}${this.listPath}`).subscribe({
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
