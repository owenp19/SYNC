import { Component, OnInit, signal, inject } from '@angular/core';

import { HttpClient } from '@angular/common/http';
import { IonHeader, IonToolbar, IonContent, IonButtons, IonBackButton } from '@ionic/angular';
import { ToastController } from '@ionic/angular';
import { ServerConnectionService } from '@core/services/server-connection.service';

interface MatrixData {
  departments: { id: number; name: string }[];
  channels: { id: number; name: string; type: string }[];
  permissions: { department_id: number; channel_id: number; can_listen: boolean; can_transmit: boolean }[];
}

/**
 * Matriz de permisos por DEPARTAMENTO: qué departamento puede escuchar (E)
 * y transmitir (T) en cada canal. Los permisos nunca son del empleado.
 */
@Component({
  selector: 'app-permissions',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonContent, IonButtons, IonBackButton],
  templateUrl: './permissions.page.html',
  styleUrls: ['./permissions.page.scss'],
})
export class PermissionsPage implements OnInit {
  private server = inject(ServerConnectionService);
  private http = inject(HttpClient);
  private toast = inject(ToastController);

  departments = signal<MatrixData['departments']>([]);
  channels = signal<MatrixData['channels']>([]);
  cells = signal<Map<string, { can_listen: boolean; can_transmit: boolean }>>(new Map());

  ngOnInit() { this.load(); }

  load() {
    this.http.get<MatrixData>(`${this.server.apiUrl}/admin/permissions`).subscribe(res => {
      this.departments.set(res.departments);
      this.channels.set(res.channels);
      const map = new Map<string, { can_listen: boolean; can_transmit: boolean }>();
      for (const p of res.permissions) {
        map.set(`${p.department_id}:${p.channel_id}`, { can_listen: !!p.can_listen, can_transmit: !!p.can_transmit });
      }
      this.cells.set(map);
    });
  }

  cell(deptId: number, channelId: number) {
    return this.cells().get(`${deptId}:${channelId}`) ?? { can_listen: false, can_transmit: false };
  }

  toggle(deptId: number, channelId: number, field: 'can_listen' | 'can_transmit') {
    const current = this.cell(deptId, channelId);
    const next = { ...current, [field]: !current[field] };
    // Transmitir implica poder escuchar; dejar de escuchar implica no poder transmitir.
    if (field === 'can_transmit' && next.can_transmit) next.can_listen = true;
    if (field === 'can_listen' && !next.can_listen) next.can_transmit = false;

    this.http.put(`${this.server.apiUrl}/admin/permissions`, {
      department_id: deptId, channel_id: channelId,
      can_listen: next.can_listen, can_transmit: next.can_transmit,
    }).subscribe({
      next: () => {
        const map = new Map(this.cells());
        map.set(`${deptId}:${channelId}`, next);
        this.cells.set(map);
      },
      error: async () => {
        const t = await this.toast.create({ message: 'No se pudo guardar el permiso', duration: 3000, color: 'danger', position: 'bottom' });
        await t.present();
      },
    });
  }
}
