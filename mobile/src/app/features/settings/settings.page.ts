import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton, IonItem, IonLabel, IonToggle, IonNote } from '@ionic/angular';
import { NativeService } from '@core/services/native.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton, IonItem, IonLabel, IonToggle, IonNote],
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage {
  deviceInfo = 'Cargando…';
  constructor(private native: NativeService) {
    this.native.deviceInfo().then(i => (this.deviceInfo = i));
  }
}
