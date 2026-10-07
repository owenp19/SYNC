import { Component, OnInit, signal, inject } from '@angular/core';

import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { PreloaderComponent } from './shared/components/preloader.component';
import { ConnectionStatusComponent } from './shared/components/connection-status.component';
import { DeviceService } from './core/services/device.service';
import { ServerConnectionService } from './core/services/server-connection.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet, PreloaderComponent, ConnectionStatusComponent],
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
      <app-connection-status></app-connection-status>
      @if (loading()) {
        <app-preloader></app-preloader>
      }
    </ion-app>
    `
})
export class AppComponent implements OnInit {
  private device = inject(DeviceService);
  private server = inject(ServerConnectionService);

  loading = signal(true);

  ngOnInit() {
    // 1) Localizar el servidor SYNC (último conocido → mDNS → health check).
    // 2) Cargar el perfil del Device con su credencial existente.
    // Ninguno bloquea la interfaz indefinidamente (timeouts + reintentos en segundo plano).
    void this.server.start().finally(() => this.device.init());
    setTimeout(() => this.loading.set(false), 1500);
  }
}
