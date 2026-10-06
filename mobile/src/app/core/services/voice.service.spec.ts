import { of, throwError } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { VoiceService } from './voice.service';
import { RadioToneService } from './radio-tone.service';

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
