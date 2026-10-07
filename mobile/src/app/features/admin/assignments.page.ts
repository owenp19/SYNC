import { Component, OnInit, signal, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { IonHeader, IonToolbar, IonContent, IonIcon, IonItem, IonLabel, IonSelect, IonSelectOption, IonButtons, IonBackButton, IonInput, IonButton } from '@ionic/angular';
import { ToastController } from '@ionic/angular';
import { ServerConnectionService } from '@core/services/server-connection.service';

@Component({
  selector: 'app-assignments',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonContent, IonIcon, IonItem, IonLabel, IonSelect, IonSelectOption, IonButtons, IonBackButton, IonInput, IonButton],
  templateUrl: './assignments.page.html',
  styleUrls: ['./assignments.page.scss'],
})
export class AssignmentsPage implements OnInit {
  private server = inject(ServerConnectionService);
  private http = inject(HttpClient);
  private toast = inject(ToastController);

  users = signal<any[]>([]);
  departments = signal<any[]>([]);

  newName = '';
  newCode = '';
  newDeptId: any = null;

  ngOnInit() {
    this.load();
  }

  load() {
    this.http.get<any[]>(`${this.server.apiUrl}/admin/users`).subscribe(u => this.users.set(u));
    this.http.get<any[]>(`${this.server.apiUrl}/admin/departments`).subscribe(d => this.departments.set(d));
  }

  async createUser() {
    if (!this.newName.trim() || this.newDeptId === null || this.newDeptId === '') {
      const t = await this.toast.create({ message: 'Completa nombre y departamento', duration: 2500, color: 'warning', position: 'bottom' });
      await t.present();
      return;
    }
    const deptId = Number(this.newDeptId);
    const payload: any = { name: this.newName.trim(), department_id: deptId };
    if (this.newCode.trim()) payload.employee_code = this.newCode.trim();
    this.http.post(`${this.server.apiUrl}/admin/users`, payload).subscribe({
      next: async () => {
        const t = await this.toast.create({ message: 'Empleado agregado', duration: 2500, color: 'success', position: 'bottom' });
        await t.present();
        this.newName = ''; this.newCode = ''; this.newDeptId = null;
        this.load();
      },
      error: async (e) => {
        console.error('Error al agregar persona', e.error);
        const msg = e?.error?.errors
          ? Object.values(e.error.errors).flat().join(' · ')
          : (e?.error?.message ?? 'Error');
        const t = await this.toast.create({ message: msg, duration: 4000, color: 'danger', position: 'bottom' });
        await t.present();
      },
    });
  }

  changeDepartment(user: any, ev: any) {
    const deptId = ev.detail.value === '' ? null : ev.detail.value;
    this.http.patch(`${this.server.apiUrl}/admin/users/${user.id}/department`, { department_id: deptId }).subscribe(() => {
      user.department_id = deptId;
    });
  }
}
