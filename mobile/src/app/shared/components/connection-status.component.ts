import { Component, OnDestroy, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, pairwise } from 'rxjs';
import { ConnectionStatus, ServerConnectionService } from '@core/services/server-connection.service';

/**
 * Indicador global y discreto del estado de conexión con el servidor SYNC.
 * No bloquea la interfaz: solo aparece cuando NO hay conexión (y unos segundos
 * como "Conectado" al recuperarla). El trabajador no ve IPs ni puertos.
 */
@Component({
  selector: 'app-connection-status',
  standalone: true,
  template: `
    @if (visible()) {
      <div [class]="'conn ' + tone()" role="status" aria-live="polite">
        <span class="dot"></span>
        <span class="text">{{ label() }}</span>
        @if (status() === 'SERVER_NOT_FOUND' || status() === 'OFFLINE') {
          <button type="button" (click)="retry()">Reintentar</button>
          <button type="button" class="link" (click)="diagnostics()">Diagnóstico</button>
        }
      </div>
      @if (status() === 'SERVER_NOT_FOUND') {
        <p class="hint">{{ hint() }}</p>
      }
    }
  `,
  styles: [`
    :host { position: fixed; left: 0; right: 0; bottom: calc(12px + env(safe-area-inset-bottom)); z-index: 9999; display: flex; flex-direction: column; align-items: center; pointer-events: none; padding: 0 12px; }
    .conn { pointer-events: auto; display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; color: #fff; background: rgba(15, 23, 42, .92); box-shadow: 0 6px 18px rgba(0,0,0,.35); max-width: 100%; }
    .dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
    .ok .dot { background: #22C55E; }
    .warn .dot { background: #F59E0B; animation: pulse 1s infinite alternate; }
    .err .dot { background: #EF4444; }
    button { pointer-events: auto; border: 0; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 700; background: #fff; color: #0F172A; }
    button.link { background: transparent; color: #CBD5E1; text-decoration: underline; padding: 4px 2px; }
    .hint { pointer-events: auto; margin: 6px 0 0; padding: 6px 12px; max-width: 420px; font-size: 12px; line-height: 1.35; text-align: center; color: #E2E8F0; background: rgba(15, 23, 42, .85); border-radius: 10px; }
    @keyframes pulse { from { opacity: .35; } to { opacity: 1; } }
  `],
})
export class ConnectionStatusComponent implements OnDestroy {
  private server = inject(ServerConnectionService);
  private router = inject(Router);

  status = signal<ConnectionStatus>(this.server.status);
  visible = signal(false);
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private subs = new Subscription();

  constructor() {
    this.subs.add(this.server.status$.subscribe(s => this.status.set(s)));
    this.subs.add(this.server.status$.pipe(pairwise()).subscribe(([prev, next]) => this.onChange(prev, next)));
    this.visible.set(this.server.status !== 'CONNECTED' && this.server.status !== 'CONNECTING');
    // Arranque: "Conectando…" solo si tarda (evita parpadeos en conexiones rápidas).
    setTimeout(() => { if (this.server.status === 'CONNECTING') this.visible.set(true); }, 800);
  }

  private onChange(prev: ConnectionStatus, next: ConnectionStatus) {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    if (next === 'CONNECTED') {
      // Mostrar "Conectado" brevemente solo si veníamos de un problema visible.
      if (this.visible() || prev === 'RECONNECTING') {
        this.visible.set(true);
        this.hideTimer = setTimeout(() => this.visible.set(false), 2000);
      }
      return;
    }
    this.visible.set(true);
  }

  tone(): string {
    switch (this.status()) {
      case 'CONNECTED': return 'ok';
      case 'CONNECTING':
      case 'RECONNECTING': return 'warn';
      default: return 'err';
    }
  }

  label(): string {
    switch (this.status()) {
      case 'CONNECTED': return 'Conectado';
      case 'CONNECTING': return 'Conectando…';
      case 'RECONNECTING': return 'Reconectando…';
      case 'OFFLINE': return 'Sin red Wi-Fi';
      default: return 'Servidor SYNC no encontrado';
    }
  }

  hint(): string {
    if (this.server.mismatch$.value) {
      return 'Se encontró otro servidor SYNC distinto al de este dispositivo. Revisa la red o usa Diagnóstico de red → Cambiar servidor.';
    }
    return 'No se encontró el servidor SYNC en esta red. Verifica que el teléfono y el computador estén en una red que permita comunicación entre dispositivos.';
  }

  retry() {
    void this.server.retryNow();
  }

  diagnostics() {
    void this.router.navigateByUrl('/network');
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    if (this.hideTimer) clearTimeout(this.hideTimer);
  }
}
