import { Component, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastController } from '@ionic/angular';
import { IonHeader, IonToolbar, IonContent, IonItem, IonLabel, IonInput, IonButton, IonSelect, IonSelectOption, IonButtons, IonBackButton, IonIcon } from '@ionic/angular';
import { ServerConnectionService } from '@core/services/server-connection.service';

@Component({
  selector: 'app-manage',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonContent, IonItem, IonLabel, IonInput, IonButton, IonSelect, IonSelectOption, IonButtons, IonBackButton, IonIcon],
  templateUrl: './manage.page.html',
  styleUrls: ['./manage.page.scss'],
})
export class ManagePage {
  private server = inject(ServerConnectionService);
  private http = inject(HttpClient);
  private toast = inject(ToastController);

  deptName = '';
  channelName = '';
  channelType = 'private';

  async createDepartment() {
    if (!this.deptName.trim()) return;
    this.http.post(`${this.server.apiUrl}/admin/departments`, { name: this.deptName.trim() }).subscribe({
      next: async () => {
        const t = await this.toast.create({ message: `Departamento "${this.deptName}" creado`, duration: 2500, color: 'success', position: 'bottom' });
        await t.present();
        this.deptName = '';
      },
      error: async (e) => {
        const t = await this.toast.create({ message: e?.error?.message ?? 'Error al crear', duration: 2500, color: 'danger', position: 'bottom' });
        await t.present();
      },
    });
  }

  async seedDepartments() {
    this.http.post(`${this.server.apiUrl}/admin/departments/seed`, {}).subscribe({
      next: async (res: any) => {
        const t = await this.toast.create({ message: `${res.created} departamentos creados`, duration: 2500, color: 'success', position: 'bottom' });
        await t.present();
      },
      error: async () => {
        const t = await this.toast.create({ message: 'Error al cargar', duration: 2500, color: 'danger', position: 'bottom' });
        await t.present();
      },
    });
  }

  async createChannel() {
    if (!this.channelName.trim()) return;
    this.http.post(`${this.server.apiUrl}/admin/channels`, { name: this.channelName.trim(), type: this.channelType }).subscribe({
      next: async () => {
        const t = await this.toast.create({ message: `Canal "${this.channelName}" creado`, duration: 2500, color: 'success', position: 'bottom' });
        await t.present();
        this.channelName = '';
      },
      error: async (e) => {
        const t = await this.toast.create({ message: e?.error?.message ?? 'Error al crear', duration: 2500, color: 'danger', position: 'bottom' });
        await t.present();
      },
    });
  }
}
