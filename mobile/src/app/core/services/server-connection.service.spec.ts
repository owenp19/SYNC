import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { ServerConnectionService } from './server-connection.service';
import { ServerHealthClient, parseHealth } from './server-health.client';
import { LocalServerDiscoveryService, toCandidates } from './local-server-discovery.service';
import { ServerStorage } from './server-storage';
import { NetworkStatusSource } from './network-status.source';
import { DeviceService } from './device.service';
import { DeviceCredentialStorage } from './device-credential.storage';
import { FakeDiscovery, FakeHealthClient, FakeNetwork, FakeServerStorage, endpoint } from './testing/fake-server-deps';

const OLD_IP = '10.156.185.51';
const NEW_IP = '192.168.1.37';
const ID_A = 'SYNC-SERVER-AAAA';
const ID_B = 'SYNC-SERVER-BBBB';

describe('ServerConnectionService - descubrimiento LAN', () => {
  let health: FakeHealthClient;
  let discovery: FakeDiscovery;
  let storage: FakeServerStorage;
  let network: FakeNetwork;
  let svc: ServerConnectionService;

  beforeEach(() => {
    health = new FakeHealthClient();
    discovery = new FakeDiscovery();
    storage = new FakeServerStorage();
    network = new FakeNetwork();
    TestBed.configureTestingModule({
      providers: [
        ServerConnectionService,
        { provide: ServerHealthClient, useValue: health },
        { provide: LocalServerDiscoveryService, useValue: discovery },
        { provide: ServerStorage, useValue: storage },
        { provide: NetworkStatusSource, useValue: network },
      ],
    });
    svc = TestBed.inject(ServerConnectionService);
  });

  afterEach(() => {
    svc.dispose();
    vi.useRealTimers();
  });

  it('1. reutiliza el lastKnownServer válido sin ejecutar discovery', async () => {
    storage.lastKnown = endpoint(OLD_IP, ID_A);
    health.set(OLD_IP, ID_A);

    await svc.start();

    expect(svc.status).toBe('CONNECTED');
    expect(discovery.calls).toBe(0);
    expect(svc.apiUrl).toBe(`http://${OLD_IP}:8000/api`);
    expect(svc.liveKitUrl).toBe(`ws://${OLD_IP}:7880`);
  });

  it('2. un lastKnownServer que no responde dispara el discovery', async () => {
    storage.lastKnown = endpoint(OLD_IP, ID_A);
    health.set(OLD_IP, null);
    discovery.result = [{ host: NEW_IP, apiPort: 8000 }];
    health.set(NEW_IP, ID_A);

    await svc.start();

    expect(discovery.calls).toBe(1);
    expect(svc.status).toBe('CONNECTED');
    expect(svc.endpoint$.value?.host).toBe(NEW_IP);
  });

  it('3. el discovery encuentra un servidor válido y lo guarda como lastKnownServer', async () => {
    discovery.result = [{ host: NEW_IP, apiPort: 8000 }];
    health.set(NEW_IP, ID_A, 8000, 7880);

    await svc.start();

    expect(svc.status).toBe('CONNECTED');
    expect(svc.serverId).toBe(ID_A);
    expect(svc.liveKitUrl).toBe(`ws://${NEW_IP}:7880`);
    expect(storage.lastKnown?.host).toBe(NEW_IP);
    expect(storage.lastKnown?.serverId).toBe(ID_A);
    expect(storage.lastKnown?.lastConnectedAt).toBeTruthy();
  });

  it('4. un host sin health SYNC válido es rechazado', async () => {
    discovery.result = [{ host: '192.168.1.99', apiPort: 8000 }];
    health.set('192.168.1.99', null);

    await svc.start();

    expect(svc.status).toBe('SERVER_NOT_FOUND');
    expect(svc.endpoint$.value).toBeNull();
    expect(storage.lastKnown).toBeNull();
  });

  it('4b. parseHealth exige service=SYNC, status=ok, protocolo compatible y server_id', () => {
    const ok = { service: 'SYNC', status: 'ok', protocol_version: 1, server_id: ID_A, livekit_port: 7880 };
    expect(parseHealth(ok)?.serverId).toBe(ID_A);
    expect(parseHealth({ ...ok, service: 'OTHER' })).toBeNull();
    expect(parseHealth({ ...ok, status: 'down' })).toBeNull();
    expect(parseHealth({ ...ok, protocol_version: 2 })).toBeNull();
    expect(parseHealth({ ...ok, server_id: '' })).toBeNull();
    expect(parseHealth('<html>router</html>')).toBeNull();
  });

  it('5. un server_id diferente NO reemplaza en silencio el servidor existente', async () => {
    storage.expected = ID_A;
    storage.lastKnown = endpoint(OLD_IP, ID_A);
    health.set(OLD_IP, null);
    discovery.result = [{ host: NEW_IP, apiPort: 8000 }];
    health.set(NEW_IP, ID_B);

    await svc.start();

    expect(svc.status).toBe('SERVER_NOT_FOUND');
    expect(svc.endpoint$.value).toBeNull();
    expect(svc.mismatch$.value?.found.serverId).toBe(ID_B);
    expect(storage.lastKnown?.host).toBe(OLD_IP);
    expect(storage.expected).toBe(ID_A);

    // Solo la acción técnica explícita "Cambiar servidor" lo acepta.
    await svc.acceptServer(svc.mismatch$.value!.found);
    expect(svc.status).toBe('CONNECTED');
    expect(storage.expected).toBe(ID_B);
  });

  it('6. mismo server_id con IP nueva SÍ actualiza API y LiveKit', async () => {
    storage.expected = ID_A;
    storage.lastKnown = endpoint(OLD_IP, ID_A);
    health.set(OLD_IP, null);
    discovery.result = [{ host: NEW_IP, apiPort: 8000 }];
    health.set(NEW_IP, ID_A);

    await svc.start();

    expect(svc.status).toBe('CONNECTED');
    expect(svc.apiUrl).toBe(`http://${NEW_IP}:8000/api`);
    expect(svc.liveKitUrl).toBe(`ws://${NEW_IP}:7880`);
    expect(storage.lastKnown?.host).toBe(NEW_IP);
  });

  it('14. Wi-Fi A → Wi-Fi B: detecta la caída por el ping y redescubre la nueva IP sin intervención', async () => {
    vi.useFakeTimers();
    storage.expected = ID_A;
    storage.lastKnown = endpoint(OLD_IP, ID_A);
    health.set(OLD_IP, ID_A);
    await svc.start();
    expect(svc.endpoint$.value?.host).toBe(OLD_IP);

    const statuses: string[] = [];
    svc.status$.subscribe(s => statuses.push(s));

    // El PC cambia de red: la IP vieja deja de responder y aparece la nueva.
    health.set(OLD_IP, null);
    discovery.result = [{ host: NEW_IP, apiPort: 8000 }];
    health.set(NEW_IP, ID_A);

    await vi.advanceTimersByTimeAsync(svc.timings.pingInterval + 10);

    expect(statuses).toContain('RECONNECTING');
    expect(svc.status).toBe('CONNECTED');
    expect(svc.endpoint$.value?.host).toBe(NEW_IP);
    expect(svc.liveKitUrl).toBe(`ws://${NEW_IP}:7880`);
  });

  it('10. sin servidor muestra SERVER_NOT_FOUND; sin red muestra OFFLINE', async () => {
    await svc.start();
    expect(svc.status).toBe('SERVER_NOT_FOUND');

    await svc.handleNetworkChange(false);
    expect(svc.status).toBe('OFFLINE');
  });

  it('11. la configuración manual funciona y se valida con /api/health', async () => {
    await svc.start();
    expect(svc.status).toBe('SERVER_NOT_FOUND');

    health.set(NEW_IP, ID_A, 8000, 7880);
    const res = await svc.connectManual({ host: NEW_IP, apiPort: 8000, livekitPort: 7881 });

    expect(res.ok).toBe(true);
    expect(svc.status).toBe('CONNECTED');
    expect(svc.mode$.value).toBe('manual');
    expect(svc.liveKitUrl).toBe(`ws://${NEW_IP}:7881`);

    // En modo manual no se ejecuta discovery.
    const before = discovery.calls;
    await svc.retryNow();
    expect(discovery.calls).toBe(before);

    // Host manual que no es SYNC → rechazado.
    expect(await svc.connectManual({ host: '192.168.1.200', apiPort: 8000, livekitPort: 7880 })).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('11b. manual hacia otra instalación exige confirmación explícita', async () => {
    storage.expected = ID_A;
    await svc.start();
    health.set(NEW_IP, ID_B);

    const res = await svc.connectManual({ host: NEW_IP, apiPort: 8000, livekitPort: 7880 });
    expect(res).toEqual({ ok: false, reason: 'mismatch', serverId: ID_B });
    expect(svc.status).not.toBe('CONNECTED');

    const forced = await svc.connectManual({ host: NEW_IP, apiPort: 8000, livekitPort: 7880 }, true);
    expect(forced.ok).toBe(true);
    expect(storage.expected).toBe(ID_B);
  });

  it('12. la reconexión usa backoff y no crea bucles agresivos', async () => {
    vi.useFakeTimers();
    await svc.start(); // intento 1 (t=0)
    expect(discovery.calls).toBe(1);

    await vi.advanceTimersByTimeAsync(60_000);
    // Reintentos en t=1, 3, 7, 15, 31 s (1-2-4-8-16) → 6 intentos en un minuto, no cientos.
    expect(discovery.calls).toBeLessThanOrEqual(7);
    expect(discovery.calls).toBeGreaterThanOrEqual(5);

    const beforeCap = discovery.calls;
    await vi.advanceTimersByTimeAsync(60_000);
    // Con el tope de 30 s: como mucho 2-3 intentos más por minuto.
    expect(discovery.calls - beforeCap).toBeLessThanOrEqual(3);

    // Un cambio de red permite un intento inmediato.
    const beforeNet = discovery.calls;
    await svc.handleNetworkChange(true);
    expect(discovery.calls).toBe(beforeNet + 1);
  });

  it('las peticiones concurrentes comparten una sola resolución', async () => {
    await svc.start();
    const before = discovery.calls;
    await Promise.all([svc.resolve(), svc.resolve(), svc.resolve()]);
    expect(discovery.calls).toBe(before + 1);
  });

  it('toCandidates usa solo IPv4 LAN y el puerto del TXT/SRV', () => {
    const list = toCandidates([
      { name: 'SYNC-SERVER-PC', port: 8000, hosts: ['fe80::1', '169.254.1.1', NEW_IP, NEW_IP], txt: { apiPort: '8000', serverId: ID_A } },
    ]);
    expect(list).toEqual([{ host: NEW_IP, apiPort: 8000, livekitPort: undefined, serverId: ID_A, name: 'SYNC-SERVER-PC' }]);
  });
});

describe('Device token y cambio de IP del mismo servidor', () => {
  it('9. el token del Device permanece y se reutiliza tras cambiar la IP del mismo server_id', async () => {
    const health = new FakeHealthClient();
    const discovery = new FakeDiscovery();
    const storage = new FakeServerStorage();
    const network = new FakeNetwork();
    const credential = {
      getToken: vi.fn().mockResolvedValue('device-token'),
      setToken: vi.fn(),
      clearToken: vi.fn(),
    };
    const urls: string[] = [];
    const http = {
      get: vi.fn((url: string) => { urls.push(url); return of({ id: 1, name: 'Seguridad-01', department: 'Seguridad', department_id: 1, status: 'active', operator: null }); }),
      post: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        ServerConnectionService,
        DeviceService,
        { provide: ServerHealthClient, useValue: health },
        { provide: LocalServerDiscoveryService, useValue: discovery },
        { provide: ServerStorage, useValue: storage },
        { provide: NetworkStatusSource, useValue: network },
        { provide: DeviceCredentialStorage, useValue: credential },
        { provide: HttpClient, useValue: http },
      ],
    });
    const server = TestBed.inject(ServerConnectionService);
    const device = TestBed.inject(DeviceService);

    // Ayer: server_id A en 10.156.185.51
    storage.expected = ID_A;
    storage.lastKnown = endpoint(OLD_IP, ID_A);
    health.set(OLD_IP, ID_A);
    await server.start();
    await device.init();
    expect(urls.at(-1)).toBe(`http://${OLD_IP}:8000/api/device/me`);

    // Hoy: mismo server_id A en 192.168.1.37
    health.set(OLD_IP, null);
    discovery.result = [{ host: NEW_IP, apiPort: 8000 }];
    health.set(NEW_IP, ID_A);
    await server.handleNetworkChange(true);
    await new Promise(r => setTimeout(r, 0));

    expect(urls.at(-1)).toBe(`http://${NEW_IP}:8000/api/device/me`);
    expect(credential.clearToken).not.toHaveBeenCalled();
    expect(credential.setToken).not.toHaveBeenCalled();
    expect(device.device$.value?.name).toBe('Seguridad-01');
    server.dispose();
  });
});
