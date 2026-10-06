import { Component, OnInit, signal, inject } from '@angular/core';

import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { PreloaderComponent } from './shared/components/preloader.component';
import { DeviceService } from './core/services/device.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet, PreloaderComponent],
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
      @if (loading()) {
        <app-preloader></app-preloader>
      }
    </ion-app>
    `
})
export class AppComponent implements OnInit {
  private device = inject(DeviceService);

  loading = signal(true);

  ngOnInit() {
    this.device.init();
    setTimeout(() => this.loading.set(false), 1500);
  }
}
