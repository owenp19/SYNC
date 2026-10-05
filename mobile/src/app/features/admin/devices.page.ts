import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { IonHeader, IonToolbar, IonContent, IonIcon, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonButtons, IonBackButton, IonButton } from '@ionic/angular';
import { ToastController } from '@ionic/angular';
import { environment } from '@env/environment';

@Component({
  selector: 'app-devices',
  standalone: true,
  imports: [CommonModule, FormsModule, IonHeader, IonToolbar, IonContent, IonIcon, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonButtons, IonBackButton, IonButton],
  templateUrl: './devices.page.html',
  styleUrls: ['./devices.page.scss'],
})
export class DevicesPage implements OnInit {
  devices = signal<any[]>([]);
  departments = signal<any[]>([]);
  newName = '';
  newDeptId: any = null;

  constructor(private http: HttpClient, private toast: ToastController) {}

  ngOnInit() { this.load(); }

  load() {
    this.http.get<any[]>(`${environment.apiUrl}/admin/devices`).subscribe(d => this.devices.set(d));
    this.http.get<any[]>(`${environment.apiUrl}/admin/departments`).subscribe(d => this.departments.set(d));
  }

  create() {
    if (!this.newName.trim() || !this.newDeptId) { this.toast.create({ message: 'Completa nombre y departamento', duration: 2500, color: 'warning', position: 'bottom' }).then(t => t.present()); return; }
    this.http.post(`${environment.apiUrl}/admin/devices`, { name: this.newName.trim(), department_id: Number(this.newDeptId) }).subscribe({
      next: () => { this.newName = ''; this.newDeptId = null; this.load(); },
      error: (e) => this.toast.create({ message: e?.error?.message ?? 'Error', duration: 3000, color: 'danger', position: 'bottom' }).then(t => t.present()),
    });
  }

  genCode(id: number) {
    this.http.post<any>(`${environment.apiUrl}/admin/devices/${id}/code`, {}).subscribe(res => {
      this.toast.create({ message: `Código: ${res.code}`, duration: 6000, color: 'success', position: 'bottom' }).then(t => t.present());
    });
  }

  revoke(id: number) {
    this.http.post(`${environment.apiUrl}/admin/devices/${id}/revoke`, {}).subscribe(() => this.load());
  }

  reassign(device: any, ev: any) {
    this.http.patch(`${environment.apiUrl}/admin/devices/${device.id}/department`, { department_id: ev.detail.value }).subscribe(() => this.load());
  }
}
