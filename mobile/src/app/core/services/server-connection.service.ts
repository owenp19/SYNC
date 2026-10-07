import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '@env/environment';
import { ServerHealth, ServerHealthClient, formatHost } from './server-health.client';
import { DiscoveredServer, LocalServerDiscoveryService } from './local-server-discovery.service';
import { ManualServerConfig, ServerEndpoint, ServerMode, ServerStorage } from './server-storage';
import { NetworkStatusSource } from './network-status.source';

export type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'SERVER_NOT_FOUND' | 'OFFLINE';

/** Se encontró un servidor SYNC válido, pero es OTRA instalación (otro server_id). */
export interface ServerMismatch {
  expectedServerId: string;
  found: ServerEndpoint;
}

export type ManualConnectResult =
  | { ok: true }
  | { ok: false; reason: 'unreachable' }
  | { ok: false; reason: 'mismatch'; serverId: string };

/** Tiempos (ms). Configurables para pruebas. */
export interface ServerConnectionTimings {
  lastKnownTimeout: number;
  discoveryTimeout: number;
  candidateTimeout: number;
  pingInterval: number;
  backoff: number[];
}

export const DEFAULT_TIMINGS: ServerConnectionTimings = {
  lastKnownTimeout: 2500,
  discoveryTimeout: 5000,
  candidateTimeout: 2500,
  pingInterval: 6000,
  backoff: [1000, 2000, 4000, 8000, 16000, 30000],
};

/**
 * ÚNICA fuente de verdad de dónde está el servidor SYNC.
 *
 * LAST KNOWN SERVER → DISCOVERY LOCAL (mDNS) → HEALTH CHECK → RECONEXIÓN.
 *
 * - Expone apiBaseUrl / apiUrl / liveKitUrl / serverId / status$.
 * - Nunca toca la credencial del Device: descubrir un servidor no concede
 *   identidad, permisos, Floor ni acceso administrativo.
 * - No cambia en silencio a otra instalación SYNC (server_id distinto):
 *   eso requiere la acción explícita acceptServer() ("Cambiar servidor").
 */
@Injectable({ providedIn: 'root' })
export class ServerConnectionService {
  private health = inject(ServerHealthClient);
  private discovery = inject(LocalServerDiscoveryService);
  private storage = inject(ServerStorage);
  private network = inject(NetworkStatusSource);

  timings: ServerConnectionTimings = { ...DEFAULT_TIMINGS };

  readonly status$ = new BehaviorSubject<ConnectionStatus>('CONNECTING');
  readonly endpoint$ = new BehaviorSubject<ServerEndpoint | null>(null);
  readonly mismatch$ = new BehaviorSubject<ServerMismatch | null>(null);
  readonly mode$ = new BehaviorSubject<ServerMode>('auto');
  /** Último servidor guardado (aunque ahora no responda): se muestra en Diagnóstico. */
  readonly lastKnown$ = new BehaviorSubject<ServerEndpoint | null>(null);

  private expectedServerId: string | null = null;
  private manual: ManualServerConfig | null = null;
  private resolving: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private attempt = 0;
  private started = false;
  private everConnected = false;

  // ------------------------------------------------------------------ API pública

  get status(): ConnectionStatus { return this.status$.value; }
  get serverId(): string | null { return this.endpoint$.value?.serverId ?? null; }
  get expectedId(): string | null { return this.expectedServerId; }

  /** p. ej. http://192.168.1.37:8000 */
  get apiBaseUrl(): string {
    const ep = this.endpoint$.value ?? this.lastKnown$.value;
    const host = ep ? formatHost(ep.host) : this.fallbackHost();
    const port = ep?.apiPort ?? environment.server.defaultApiPort;
    return `${environment.server.apiScheme}://${host}:${port}`;
  }

  /** p. ej. http://192.168.1.37:8000/api */
  get apiUrl(): string {
    return `${this.apiBaseUrl}/api`;
  }

  /** p. ej. ws://192.168.1.37:7880 */
  get liveKitUrl(): string {
    const ep = this.endpoint$.value ?? this.lastKnown$.value;
    const host = ep ? formatHost(ep.host) : this.fallbackHost();
    const port = ep?.livekitPort ?? environment.server.defaultLivekitPort;
    return `${environment.server.livekitScheme}://${host}:${port}`;
  }

  /**
   * Arranque: carga el último servidor y hace el primer intento de conexión.
   * Resuelve cuando ese primer intento termina (con o sin éxito): nunca bloquea
   * la interfaz de forma indefinida gracias a los timeouts.
   */
  async start(): Promise<void> {
    if (this.started) return this.resolving ?? Promise.resolve();
    this.started = true;
    const [lastKnown, mode, manual, expected] = await Promise.all([
      this.storage.getLastKnown(), this.storage.getMode(), this.storage.getManual(), this.storage.getExpectedServerId(),
    ]);
    this.lastKnown$.next(lastKnown);
    this.mode$.next(mode);
    this.manual = manual;
    this.expectedServerId = expected;

    this.network.onChange(connected => this.handleNetworkChange(connected));
    await this.resolve();
  }

  /** Reintento manual / "Buscar servidor nuevamente". */
  retryNow(): Promise<void> {
    this.attempt = 0;
    this.clearRetry();
    return this.resolve();
  }

  /**
   * Cambio de conectividad de Android: intento inmediato (sin esperar el backoff).
   * Si se perdió la red, el estado pasa a OFFLINE y la voz se corta (VoiceService).
   */
  async handleNetworkChange(connected: boolean): Promise<void> {
    this.log(`Network changed (connected=${connected})`);
    this.clearRetry();
    this.attempt = 0;
    if (!connected) {
      this.stopPing();
      this.status$.next('OFFLINE');
      return;
    }
    if (this.status$.value === 'CONNECTED') this.status$.next('RECONNECTING');
    await this.resolve();
  }

  /** Una petición a la API falló por red (status 0): verificar el servidor. */
  reportUnreachable(): void {
    if (this.status$.value !== 'CONNECTED' || this.resolving) return;
    void this.verifyCurrent();
  }

  /**
   * El device quedó vinculado a ESTE servidor (activación correcta, o primer
   * servidor verificado en una instalación que ya estaba activada).
   */
  async trustCurrentServer(): Promise<void> {
    const id = this.serverId;
    if (!id || this.expectedServerId === id) return;
    this.expectedServerId = id;
    await this.storage.setExpectedServerId(id);
    this.log('Server ID verified');
  }

  /** Solo vincula si todavía no había ningún server_id esperado (TOFU). */
  async trustCurrentServerIfUnbound(): Promise<void> {
    if (!this.expectedServerId) await this.trustCurrentServer();
  }

  /**
   * Acción técnica EXPLÍCITA "Cambiar servidor": acepta otra instalación SYNC.
   * La credencial del Device no se borra aquí; si no es válida en el nuevo
   * servidor, el backend responderá 401 y la app pedirá activación.
   */
  async acceptServer(endpoint: ServerEndpoint): Promise<void> {
    this.expectedServerId = endpoint.serverId;
    await this.storage.setExpectedServerId(endpoint.serverId);
    this.mismatch$.next(null);
    await this.setConnected(endpoint);
  }

  /** Configuración manual de respaldo (host/puertos). Siempre valida con /api/health. */
  async connectManual(config: ManualServerConfig, allowDifferentServer = false): Promise<ManualConnectResult> {
    const health = await this.health.check(config.host, config.apiPort, this.timings.candidateTimeout);
    if (!health) return { ok: false, reason: 'unreachable' };

    if (this.expectedServerId && health.serverId !== this.expectedServerId && !allowDifferentServer) {
      return { ok: false, reason: 'mismatch', serverId: health.serverId };
    }

    this.manual = config;
    await this.storage.setManual(config);
    await this.storage.setMode('manual');
    this.mode$.next('manual');

    const endpoint = this.toEndpoint(config.host, config.apiPort, health, config.livekitPort);
    if (allowDifferentServer || !this.expectedServerId) {
      await this.acceptServer(endpoint);
    } else {
      await this.setConnected(endpoint);
    }
    return { ok: true };
  }

  /** Volver al modo AUTO (predeterminado) y buscar el servidor. */
  async useAuto(): Promise<void> {
    await this.storage.setMode('auto');
    this.mode$.next('auto');
    await this.retryNow();
  }

  // ------------------------------------------------------------------ resolución

  /** Una sola resolución a la vez: llamadas concurrentes comparten la misma promesa. */
  resolve(): Promise<void> {
    if (!this.resolving) {
      this.resolving = this.doResolve().finally(() => { this.resolving = null; });
    }
    return this.resolving;
  }

  private async doResolve(): Promise<void> {
    this.clearRetry();
    this.stopPing();

    if (!(await this.network.isConnected())) {
      this.status$.next('OFFLINE');
      return;
    }

    if (this.status$.value !== 'CONNECTED' && this.status$.value !== 'RECONNECTING') {
      this.status$.next(this.everConnected ? 'RECONNECTING' : 'CONNECTING');
    }

    // 1) Modo manual: solo el host configurado.
    if (this.mode$.value === 'manual' && this.manual) {
      const m = this.manual;
      const health = await this.health.check(m.host, m.apiPort, this.timings.lastKnownTimeout);
      if (health && this.isExpected(health.serverId)) {
        await this.setConnected(this.toEndpoint(m.host, m.apiPort, health, m.livekitPort));
        return;
      }
      if (health) this.mismatch$.next({ expectedServerId: this.expectedServerId!, found: this.toEndpoint(m.host, m.apiPort, health, m.livekitPort) });
      this.notFound();
      return;
    }

    // 2) Último servidor conocido (timeout corto).
    const last = this.lastKnown$.value;
    if (last) {
      const health = await this.health.check(last.host, last.apiPort, this.timings.lastKnownTimeout);
      if (health && this.isExpected(health.serverId)) {
        this.log('Health check OK');
        await this.setConnected(this.toEndpoint(last.host, last.apiPort, health));
        return;
      }
      this.log('Last server failed');
    }

    // 3) Descubrimiento local mDNS / DNS-SD.
    this.log('Starting discovery');
    const candidates = await this.discovery.discover(this.timings.discoveryTimeout);
    const verified = await this.verifyCandidates(candidates);
    if (verified.length) this.log('SYNC server discovered');

    const match = verified.find(v => this.isExpected(v.serverId));
    if (match) {
      this.mismatch$.next(null);
      await this.setConnected(match);
      return;
    }

    // 4) Solo hay OTRA instalación SYNC: avisar, nunca cambiar en silencio.
    if (verified.length && this.expectedServerId) {
      this.mismatch$.next({ expectedServerId: this.expectedServerId, found: verified[0] });
    }
    this.notFound();
  }

  private async verifyCandidates(candidates: DiscoveredServer[]): Promise<ServerEndpoint[]> {
    const results = await Promise.all(candidates.map(async c => {
      const health = await this.health.check(c.host, c.apiPort, this.timings.candidateTimeout);
      return health ? this.toEndpoint(c.host, c.apiPort, health) : null;
    }));
    return results.filter((r): r is ServerEndpoint => r !== null);
  }

  private isExpected(serverId: string): boolean {
    return !this.expectedServerId || this.expectedServerId === serverId;
  }

  private async setConnected(endpoint: ServerEndpoint): Promise<void> {
    const previous = this.endpoint$.value;
    const saved: ServerEndpoint = { ...endpoint, lastConnectedAt: new Date().toISOString() };
    await this.storage.setLastKnown(saved);
    this.lastKnown$.next(saved);

    const changed = !previous || previous.host !== saved.host || previous.apiPort !== saved.apiPort || previous.livekitPort !== saved.livekitPort;
    if (changed || !previous) {
      this.endpoint$.next(saved);
      this.log(`API endpoint updated → ${this.apiBaseUrl}`);
      this.log(`LiveKit endpoint updated → ${this.liveKitUrl}`);
    } else {
      this.endpoint$.next(saved);
    }

    this.attempt = 0;
    this.everConnected = true;
    this.mismatch$.next(null);
    this.status$.next('CONNECTED');
    this.startPing();
  }

  private notFound(): void {
    this.status$.next('SERVER_NOT_FOUND');
    this.scheduleRetry();
  }

  /** Backoff exponencial con tope: 1 s, 2 s, 4 s, 8 s, 16 s, 30 s, 30 s… */
  private scheduleRetry(): void {
    this.clearRetry();
    const delays = this.timings.backoff;
    const delay = delays[Math.min(this.attempt, delays.length - 1)];
    this.attempt++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.log('Reconnecting');
      void this.resolve();
    }, delay);
  }

  /** Ping ligero mientras está conectado, para detectar la pérdida aunque no haya tráfico. */
  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => { void this.verifyCurrent(); }, this.timings.pingInterval);
  }

  private async verifyCurrent(): Promise<void> {
    const ep = this.endpoint$.value;
    if (!ep || this.resolving || this.status$.value !== 'CONNECTED') return;
    const health = await this.health.check(ep.host, ep.apiPort, this.timings.lastKnownTimeout);
    if (health && health.serverId === ep.serverId) return;
    if (this.status$.value !== 'CONNECTED') return;
    this.log('Reconnecting');
    this.status$.next('RECONNECTING');
    await this.resolve();
  }

  private stopPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  private clearRetry(): void {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
  }

  private toEndpoint(host: string, apiPort: number, health: ServerHealth, livekitPort?: number): ServerEndpoint {
    return {
      host,
      apiPort,
      livekitPort: livekitPort || health.livekitPort || environment.server.defaultLivekitPort,
      serverId: health.serverId,
      lastConnectedAt: new Date().toISOString(),
    };
  }

  private fallbackHost(): string {
    return typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  }

  /** Solo en desarrollo. Nunca se registran tokens, claves ni códigos. */
  private log(message: string): void {
    if (environment.server.debugLogs) console.info(`[SYNC server] ${message}`);
  }

  /** Para pruebas: detiene temporizadores. */
  dispose(): void {
    this.stopPing();
    this.clearRetry();
  }
}
