import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { IonHeader, IonToolbar, IonContent, IonIcon, IonItem, IonLabel, IonSelect, IonSelectOption, IonButtons, IonBackButton, IonInput, IonButton } from '@ionic/angular';
import { ToastController } from '@ionic/angular';
import { environment } from '@env/environment';

@Component({
  selector: 'app-assignments',
  standalone: true,
  imports: [CommonModule, FormsModule, IonHeader, IonToolbar, IonContent, IonIcon, IonItem, IonLabel, IonSelect, IonSelectOption, IonButtons, IonBackButton, IonInput, IonButton],
  templateUrl: './assignments.page.html',
  styleUrls: ['./assignments.page.scss'],
})
export class AssignmentsPage implements OnInit {
  users = signal<any[]>([]);
  departments = signal<any[]>([]);

  newName = '';
  newCode = '';
  newPin = '';
  newDeptId: any = null;

  constructor(private http: HttpClient, private toast: ToastController) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.http.get<any[]>(`${environment.apiUrl}/admin/users`).subscribe(u => this.users.set(u));
    this.http.get<any[]>(`${environment.apiUrl}/admin/departments`).subscribe(d => this.departments.set(d));
  }

  async createUser() {
    if (!this.newName.trim() || !this.newCode.trim() || !this.newPin.trim()) {
      const t = await this.toast.create({ message: 'Completa nombre, código y PIN', duration: 2500, color: 'warning', position: 'bottom' });
      await t.present();
      return;
    }
    const deptId = this.newDeptId === '' || this.newDeptId === null ? null : Number(this.newDeptId);
    this.http.post(`${environment.apiUrl}/admin/users`, { name: this.newName.trim(), employee_code: this.newCode.trim(), pin: this.newPin.trim(), department_id: deptId }).subscribe({
      next: async () => {
        const t = await this.toast.create({ message: 'Empleado agregado', duration: 2500, color: 'success', position: 'bottom' });
        await t.present();
        this.newName = ''; this.newCode = ''; this.newPin = ''; this.newDeptId = null;
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
    this.http.patch(`${environment.apiUrl}/admin/users/${user.id}/department`, { department_id: deptId }).subscribe(() => {
      user.department_id = deptId;
    });
  }
}
