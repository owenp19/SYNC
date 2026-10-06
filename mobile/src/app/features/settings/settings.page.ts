import { Component, inject } from '@angular/core';

import { IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton, IonItem, IonLabel, IonToggle, IonNote } from '@ionic/angular';
import { NativeService } from '@core/services/native.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton, IonItem, IonLabel, IonToggle, IonNote],
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage {
  private native = inject(NativeService);

  deviceInfo = 'Cargando…';
  constructor() {
    this.native.deviceInfo().then(i => (this.deviceInfo = i));
  }
}
