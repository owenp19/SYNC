import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton, ToastController } from '@ionic/angular';
import { environment } from '@env/environment';
import { ConnectionStatus, ServerConnectionService, ServerMismatch } from '@core/services/server-connection.service';
import { ServerEndpoint, ServerMode } from '@core/services/server-storage';
import { formatHost } from '@core/services/server-health.client';

/**
 * Configuración → Diagnóstico de red (pantalla TÉCNICA).
 * El trabajador normal no la necesita: AUTO es el modo predeterminado.
 * Aquí se ve qué servidor se detectó y existe el respaldo manual.
 */
@Component({
  selector: 'app-network-diagnostics',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton],
  templateUrl: './network-diagnostics.page.html',
  styleUrls: ['./network-diagnostics.page.scss'],
})
export class NetworkDiagnosticsPage implements OnDestroy {
  server = inject(ServerConnectionService);
  private toast = inject(ToastController);

  status = signal<ConnectionStatus>(this.server.status);
  endpoint = signal<ServerEndpoint | null>(null);
  mode = signal<ServerMode>('auto');
  mismatch = signal<ServerMismatch | null>(null);
  livekitState = signal<'unknown' | 'checking' | 'ok' | 'fail'>('unknown');
  searching = signal(false);
  showManual = signal(false);
  pendingMismatchId = signal<string | null>(null);

  manualHost = '';
  manualApiPort = environment.server.defaultApiPort;
  manualLivekitPort = environment.server.defaultLivekitPort;

  private subs = new Subscription();

  constructor() {
    this.subs.add(this.server.status$.subscribe(s => { this.status.set(s); if (s === 'CONNECTED') void this.checkLivekit(); }));
    this.subs.add(this.server.endpoint$.subscribe(e => this.endpoint.set(e ?? this.server.lastKnown$.value)));
    this.subs.add(this.server.mode$.subscribe(m => this.mode.set(m)));
    this.subs.add(this.server.mismatch$.subscribe(m => this.mismatch.set(m)));
    const ep = this.server.endpoint$.value ?? this.server.lastKnown$.value;
    if (ep) {
      this.manualHost = ep.host;
      this.manualApiPort = ep.apiPort;
      this.manualLivekitPort = ep.livekitPort;
    }
  }

  apiLabel(): string {
    switch (this.status()) {
      case 'CONNECTED': return 'Conectada';
      case 'CONNECTING': return 'Conectando…';
      case 'RECONNECTING': return 'Reconectando…';
      case 'OFFLINE': return 'Sin red';
      default: return 'Servidor no encontrado';
    }
  }

  livekitLabel(): string {
    switch (this.livekitState()) {
      case 'ok': return 'Conectado';
      case 'fail': return 'No responde';
      case 'checking': return 'Comprobando…';
      default: return '—';
    }
  }

  /** LiveKit responde "OK" por HTTP en su puerto de señalización. */
  async checkLivekit() {
    const ep = this.server.endpoint$.value;
    if (!ep) { this.livekitState.set('unknown'); return; }
    this.livekitState.set('checking');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const scheme = environment.server.livekitScheme === 'wss' ? 'https' : 'http';
      const res = await fetch(`${scheme}://${formatHost(ep.host)}:${ep.livekitPort}/`, { signal: controller.signal, cache: 'no-store' });
      this.livekitState.set(res.ok ? 'ok' : 'fail');
    } catch {
      this.livekitState.set('fail');
    } finally {
      clearTimeout(timer);
    }
  }

  async searchAgain() {
    this.searching.set(true);
    try {
      if (this.mode() === 'manual') await this.server.useAuto();
      else await this.server.retryNow();
    } finally {
      this.searching.set(false);
    }
  }

  async connectManual(allowDifferent = false) {
    const host = this.manualHost.trim();
    if (!host) { await this.notify('Introduce la IP o el nombre del computador servidor.', 'warning'); return; }
    this.searching.set(true);
    try {
      const res = await this.server.connectManual(
        { host, apiPort: Number(this.manualApiPort), livekitPort: Number(this.manualLivekitPort) },
        allowDifferent,
      );
      if (res.ok) {
        this.pendingMismatchId.set(null);
        this.showManual.set(false);
        await this.notify('Servidor configurado manualmente.', 'success');
      } else if (res.reason === 'mismatch') {
        this.pendingMismatchId.set(res.serverId);
      } else {
        await this.notify('No responde un servidor SYNC en esa dirección.', 'danger');
      }
    } finally {
      this.searching.set(false);
    }
  }

  /** Acción técnica explícita: aceptar OTRA instalación SYNC encontrada en la red. */
  async changeServer() {
    const m = this.mismatch();
    if (!m) return;
    if (!confirm('Este dispositivo pasará a usar OTRO servidor SYNC. Es posible que deba activarse de nuevo en ese servidor. ¿Continuar?')) return;
    await this.server.acceptServer(m.found);
    await this.notify('Servidor cambiado.', 'success');
  }

  private async notify(message: string, color: 'success' | 'warning' | 'danger') {
    const t = await this.toast.create({ message, duration: 2500, color, position: 'bottom' });
    await t.present();
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }
}
