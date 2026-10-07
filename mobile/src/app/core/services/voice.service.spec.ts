import { of, throwError } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { VoiceService } from './voice.service';
import { RadioToneService } from './radio-tone.service';
import { ServerConnectionService } from './server-connection.service';
import { FakeServerConnection, endpoint } from './testing/fake-server-deps';

/**
 * Fail-safe del heartbeat: el cliente nunca sigue transmitiendo
 * sin poder confirmar el Floor.
 */
describe('VoiceService - heartbeat fail-safe', () => {
  function makeSvc(postImpl: (url: string) => any) {
    const calls: string[] = [];
    const http = { post: vi.fn((url: string) => { calls.push(url); return postImpl(url); }) };
    const tones = {
      unlock: vi.fn(),
      startChirp: vi.fn().mockResolvedValue(undefined),
      endBlip: vi.fn(),
      deniedBonk: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        VoiceService,
        { provide: HttpClient, useValue: http },
        { provide: RadioToneService, useValue: tones },
        { provide: ServerConnectionService, useValue: new FakeServerConnection() },
      ],
    });
    return { svc: TestBed.inject(VoiceService), calls };
  }

  function simulateTransmitting(svc: VoiceService) {
    (svc as any).activeChannelId = 7;
    (svc as any).transmissionId = 'tx-1';
    svc.floorState$.next('transmitting');
  }

  it('heartbeat correcto mantiene la transmisión', async () => {
    const { svc } = makeSvc(() => of({}));
    simulateTransmitting(svc);
    await (svc as any).sendHeartbeat();
    expect(svc.floorState$.value).toBe('transmitting');
  });

  it('tras 2 fallos consecutivos: apaga mic, limpia heartbeat, libera best-effort y avisa', async () => {
    const { svc, calls } = makeSvc(() => throwError(() => ({ status: 0 })));
    simulateTransmitting(svc);
    let lost = false;
    svc.floorLost$.subscribe(() => (lost = true));

    await (svc as any).sendHeartbeat(); // 1er fallo: tolera
    expect(svc.floorState$.value).toBe('transmitting');
    expect(calls.some(u => u.includes('/floor/release'))).toBe(false);

    await (svc as any).sendHeartbeat(); // 2º fallo consecutivo: fail-safe
    expect(svc.floorState$.value).toBe('free');
    expect((svc as any).transmissionId).toBeNull();
    expect((svc as any).heartbeatTimer).toBeNull();
    expect(calls.some(u => u.includes('/floor/release'))).toBe(true);
    expect(lost).toBe(true);
  });

  it('un 409 (piso perdido en el servidor) detiene al instante sin reintentos', async () => {
    const { svc, calls } = makeSvc(url =>
      url.includes('/floor/heartbeat') ? throwError(() => ({ status: 409 })) : of({})
    );
    simulateTransmitting(svc);

    await (svc as any).sendHeartbeat();
    expect(svc.floorState$.value).toBe('free');
    expect(calls.filter(u => u.includes('/floor/heartbeat')).length).toBe(1);
    expect(calls.some(u => u.includes('/floor/release'))).toBe(true);
  });

  it('un fallo aislado seguido de éxito no interrumpe la transmisión', async () => {
    let fail = true;
    const { svc } = makeSvc(() => (fail ? throwError(() => ({ status: 0 })) : of({})));
    simulateTransmitting(svc);

    await (svc as any).sendHeartbeat(); // fallo 1
    fail = false;
    await (svc as any).sendHeartbeat(); // éxito: contador reseteado
    fail = true;
    await (svc as any).sendHeartbeat(); // fallo 1 otra vez (no consecutivo)
    expect(svc.floorState$.value).toBe('transmitting');
  });
});

/**
 * Cambio de red / pérdida del servidor SYNC durante la voz.
 */
describe('VoiceService - cambio de red', () => {
  function fakeRoom() {
    return {
      on: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      localParticipant: { publishTrack: vi.fn(), unpublishTrack: vi.fn().mockResolvedValue(undefined) },
    };
  }

  function setup() {
    const server = new FakeServerConnection();
    const calls: { url: string; body: any }[] = [];
    let tokenN = 0;
    const http = {
      post: vi.fn((url: string, body: any) => {
        calls.push({ url, body });
        if (url.endsWith('/voice/token')) return of({ token: `token-${++tokenN}`, url: '' });
        return of({});
      }),
    };
    const tones = { unlock: vi.fn(), startChirp: vi.fn(), endBlip: vi.fn(), deniedBonk: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        VoiceService,
        { provide: HttpClient, useValue: http },
        { provide: RadioToneService, useValue: tones },
        { provide: ServerConnectionService, useValue: server },
      ],
    });
    const svc = TestBed.inject(VoiceService);
    const rooms: ReturnType<typeof fakeRoom>[] = [];
    vi.spyOn(svc as any, 'createRoom').mockImplementation(() => { const r = fakeRoom(); rooms.push(r); return r; });
    return { svc, server, calls, rooms };
  }

  const flush = () => new Promise(r => setTimeout(r, 0));

  it('7. un cambio de red cancela la transmisión PTT local de inmediato', async () => {
    const { svc, server, calls, rooms } = setup();
    await svc.connect(7);
    const track = { stop: vi.fn() };
    (svc as any).localTrack = track;
    (svc as any).transmissionId = 'tx-9';
    (svc as any).heartbeatTimer = setInterval(() => {}, 5000);
    svc.floorState$.next('transmitting');
    let lost = false;
    svc.floorLost$.subscribe(() => (lost = true));

    server.status$.next('OFFLINE');
    await flush();
    await flush();

    expect(svc.floorState$.value).toBe('free');
    expect(track.stop).toHaveBeenCalled();
    expect((svc as any).heartbeatTimer).toBeNull();
    expect((svc as any).transmissionId).toBeNull();
    expect(lost).toBe(true);
    expect(calls.some(c => c.url.endsWith('/floor/release') && c.body.transmission_id === 'tx-9')).toBe(true);
    expect(rooms[0].disconnect).toHaveBeenCalled();
    expect(svc.connected$.value).toBe(false);
  });

  it('8. tras cambiar de red reconecta con la NUEVA URL de LiveKit y un token nuevo', async () => {
    const { svc, server, calls, rooms } = setup();
    await svc.connect(7);
    expect(rooms[0].connect).toHaveBeenCalledWith('ws://10.156.185.51:7880', 'token-1');

    // Se pierde el servidor: se cierra la Room antigua.
    server.status$.next('RECONNECTING');
    await flush();
    expect(rooms[0].disconnect).toHaveBeenCalled();

    // Mismo server_id, nueva IP.
    server.endpoint$.next(endpoint('192.168.1.37', 'SYNC-SERVER-A'));
    server.status$.next('CONNECTED');
    await flush();
    await flush();

    expect(rooms.length).toBe(2);
    expect(rooms[1].connect).toHaveBeenCalledWith('ws://192.168.1.37:7880', 'token-2');
    expect(calls.filter(c => c.url === 'http://192.168.1.37:8000/api/voice/token').length).toBe(1);
  });

  it('salir del canal (disconnect) no reconecta al volver el servidor', async () => {
    const { svc, server, rooms } = setup();
    await svc.connect(7);
    await svc.disconnect();
    server.status$.next('RECONNECTING');
    server.status$.next('CONNECTED');
    await flush();
    expect(rooms.length).toBe(1);
  });

  it('sin servidor no se solicita el Floor', async () => {
    const { svc, server, calls } = setup();
    server.status$.next('SERVER_NOT_FOUND');
    await svc.startTransmit(7);
    expect(calls.some(c => c.url.includes('/floor/acquire'))).toBe(false);
    expect(svc.floorState$.value).toBe('denied');
  });
});