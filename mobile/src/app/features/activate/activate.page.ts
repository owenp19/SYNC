import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { FormsModule } from '@angular/forms';
import { IonContent, IonItem, IonInput, IonButton, IonIcon, ToastController } from '@ionic/angular';
import { DeviceService } from '@core/services/device.service';

@Component({
  selector: 'app-activate',
  standalone: true,
  imports: [FormsModule, IonContent, IonItem, IonInput, IonButton, IonIcon],
  templateUrl: './activate.page.html',
  styleUrls: ['./activate.page.scss'],
})
export class ActivatePage {
  private device = inject(DeviceService);
  private router = inject(Router);
  private toast = inject(ToastController);

  code = '';
  async onActivate() {
    try {
      await this.device.activate(this.code.trim());
      this.router.navigateByUrl('/operator');
    } catch (e: any) {
      const msg = e?.error?.message ?? 'No se pudo activar. Revisa el código.';
      this.toast.create({ message: msg, duration: 3000, color: 'danger', position: 'bottom' }).then(t => t.present());
    }
  }
}
