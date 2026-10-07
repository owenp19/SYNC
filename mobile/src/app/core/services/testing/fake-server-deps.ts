import { BehaviorSubject } from 'rxjs';
import { ServerHealth } from '../server-health.client';
import { DiscoveredServer } from '../local-server-discovery.service';
import { ManualServerConfig, ServerEndpoint, ServerMode } from '../server-storage';
import { ConnectionStatus } from '../server-connection.service';

/** Dobles de prueba de las dependencias de ServerConnectionService (sin red real). */

export class FakeHealthClient {
  responses = new Map<string, ServerHealth | null>();
  calls: string[] = [];

  set(host: string, serverId: string | null, apiPort = 8000, livekitPort = 7880) {
    this.responses.set(`${host}:${apiPort}`, serverId ? { serverId, livekitPort, protocolVersion: 1 } : null);
  }

  async check(host: string, apiPort: number): Promise<ServerHealth | null> {
    this.calls.push(`${host}:${apiPort}`);
    return this.responses.get(`${host}:${apiPort}`) ?? null;
  }
}

export class FakeDiscovery {
  result: DiscoveredServer[] = [];
  calls = 0;

  async discover(): Promise<DiscoveredServer[]> {
    this.calls++;
    return this.result;
  }
}

export class FakeServerStorage {
  lastKnown: ServerEndpoint | null = null;
  mode: ServerMode = 'auto';
  manual: ManualServerConfig | null = null;
  expected: string | null = null;

  async getLastKnown() { return this.lastKnown; }
  async setLastKnown(e: ServerEndpoint) { this.lastKnown = e; }
  async getMode() { return this.mode; }
  async setMode(m: ServerMode) { this.mode = m; }
  async getManual() { return this.manual; }
  async setManual(c: ManualServerConfig) { this.manual = c; }
  async getExpectedServerId() { return this.expected; }
  async setExpectedServerId(id: string) { this.expected = id; }
}

export class FakeNetwork {
  connected = true;
  listener: ((connected: boolean, type: string) => void) | null = null;

  async isConnected() { return this.connected; }
  onChange(l: (connected: boolean, type: string) => void) { this.listener = l; }
}

export function endpoint(host: string, serverId: string, apiPort = 8000, livekitPort = 7880): ServerEndpoint {
  return { host, apiPort, livekitPort, serverId, lastConnectedAt: '2026-10-01T00:00:00.000Z' };
}

/** Doble mínimo de ServerConnectionService para probar VoiceService. */
export class FakeServerConnection {
  status$ = new BehaviorSubject<ConnectionStatus>('CONNECTED');
  endpoint$ = new BehaviorSubject<ServerEndpoint | null>(endpoint('10.156.185.51', 'SYNC-SERVER-A'));
  reportUnreachable = vi.fn();

  get status() { return this.status$.value; }
  get apiUrl() { return `http://${this.endpoint$.value?.host}:8000/api`; }
  get liveKitUrl() { return `ws://${this.endpoint$.value?.host}:${this.endpoint$.value?.livekitPort}`; }
}
