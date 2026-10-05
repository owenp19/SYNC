import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonContent, IonIcon, ToastController } from '@ionic/angular';
import { DeviceService } from '@core/services/device.service';

@Component({
  selector: 'app-operator',
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon],
  templateUrl: './operator.page.html',
  styleUrls: ['./operator.page.scss'],
})
export class OperatorPage implements OnInit {
  operators: { id: number; name: string }[] = [];
  constructor(private device: DeviceService, private router: Router, private toast: ToastController) {}

  async ngOnInit() {
    try {
      this.operators = await this.device.operators();
    } catch {}
  }

  async choose(id: number | null) {
    try {
      await this.device.setOperator(id);
      this.router.navigateByUrl('/channels');
    } catch (e: any) {
      const msg = e?.error?.message ?? 'No se pudo asignar el operador.';
      this.toast.create({ message: msg, duration: 3000, color: 'danger', position: 'bottom' }).then(t => t.present());
    }
  }
}
