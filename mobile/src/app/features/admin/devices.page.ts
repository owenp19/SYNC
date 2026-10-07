import { Component, OnInit, signal, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { IonHeader, IonToolbar, IonContent, IonIcon, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonButtons, IonBackButton, IonButton } from '@ionic/angular';
import { ToastController } from '@ionic/angular';
import { ServerConnectionService } from '@core/services/server-connection.service';

@Component({
  selector: 'app-devices',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonContent, IonIcon, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonButtons, IonBackButton, IonButton],
  templateUrl: './devices.page.html',
  styleUrls: ['./devices.page.scss'],
})
export class DevicesPage implements OnInit {
  private server = inject(ServerConnectionService);
  private http = inject(HttpClient);
  private toast = inject(ToastController);

  devices = signal<any[]>([]);
  departments = signal<any[]>([]);
  newName = '';
  newDeptId: any = null;

  ngOnInit() { this.load(); }

  load() {
    this.http.get<any[]>(`${this.server.apiUrl}/admin/devices`).subscribe(d => this.devices.set(d));
    this.http.get<any[]>(`${this.server.apiUrl}/admin/departments`).subscribe(d => this.departments.set(d));
  }

  create() {
    if (!this.newName.trim() || !this.newDeptId) { this.toast.create({ message: 'Completa nombre y departamento', duration: 2500, color: 'warning', position: 'bottom' }).then(t => t.present()); return; }
    this.http.post(`${this.server.apiUrl}/admin/devices`, { name: this.newName.trim(), department_id: Number(this.newDeptId) }).subscribe({
      next: () => { this.newName = ''; this.newDeptId = null; this.load(); },
      error: (e) => this.toast.create({ message: e?.error?.message ?? 'Error', duration: 3000, color: 'danger', position: 'bottom' }).then(t => t.present()),
    });
  }

  genCode(id: number) {
    this.http.post<any>(`${this.server.apiUrl}/admin/devices/${id}/code`, {}).subscribe({
      next: res => {
        this.toast.create({ message: `Código: ${res.code}`, duration: 6000, color: 'success', position: 'bottom' }).then(t => t.present());
        this.load();
      },
      error: (e) => this.toast.create({ message: e?.error?.message ?? 'Error', duration: 4000, color: 'danger', position: 'bottom' }).then(t => t.present()),
    });
  }

  /** RESET/TRANSFER: mata el token del teléfono actual y emite código nuevo de un solo uso. */
  transfer(id: number) {
    this.http.post<any>(`${this.server.apiUrl}/admin/devices/${id}/reset`, {}).subscribe({
      next: res => {
        this.toast.create({ message: `Transferencia: nuevo código ${res.code} (el teléfono anterior dejó de funcionar)`, duration: 8000, color: 'success', position: 'bottom' }).then(t => t.present());
        this.load();
      },
      error: (e) => this.toast.create({ message: e?.error?.message ?? 'Error', duration: 4000, color: 'danger', position: 'bottom' }).then(t => t.present()),
    });
  }

  revoke(id: number) {
    this.http.post(`${this.server.apiUrl}/admin/devices/${id}/revoke`, {}).subscribe(() => this.load());
  }

  reassign(device: any, ev: any) {
    this.http.patch(`${this.server.apiUrl}/admin/devices/${device.id}/department`, { department_id: ev.detail.value }).subscribe(() => this.load());
  }
}
