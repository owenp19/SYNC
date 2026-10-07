import { Subject, throwError } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { PushToTalkPage } from './push-to-talk.page';
import { VoiceService } from '@core/services/voice.service';
import { NativeService } from '@core/services/native.service';
import { ServerConnectionService } from '@core/services/server-connection.service';
import { FakeServerConnection } from '@core/services/testing/fake-server-deps';

/**
 * Acceso directo (deep link / URL) a un canal: si el backend no confirma el
 * canal, la pantalla NO inventa un "Canal {id}" ni inicia la sesión de voz.
 */
describe('PushToTalkPage - acceso directo a canal', () => {
  function setup(getError: any) {
    const voice = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      floorLost$: new Subject<void>(),
      remoteDisconnected$: new Subject<void>(),
    };
    const toasts: string[] = [];
    const toast = {
      create: vi.fn((opts: { message: string }) => {
        toasts.push(opts.message);
        return Promise.resolve({ present: vi.fn() });
      }),
    };
    const router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
    const http = { get: vi.fn(() => throwError(() => getError)) };
    const native = { lockPortrait: vi.fn(), unlockOrientation: vi.fn(), keepScreenOn: vi.fn(), haptic: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: VoiceService, useValue: voice },
        { provide: ToastController, useValue: toast },
        { provide: Router, useValue: router },
        { provide: HttpClient, useValue: http },
        { provide: NativeService, useValue: native },
        { provide: ServerConnectionService, useValue: new FakeServerConnection() },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', '42']]) } } },
      ],
    });
    const page = TestBed.runInInjectionContext(() => new PushToTalkPage());
    return { page, voice, toasts, router };
  }

  it('403: avisa, vuelve a /channels y NO inicia VoiceService', async () => {
    const { page, voice, toasts, router } = setup({ status: 403 });

    await page.ngOnInit();

    expect(voice.connect).not.toHaveBeenCalled();
    expect(page.channel).toBeNull();
    expect(toasts).toContain('No tienes acceso a este canal');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/channels', { replaceUrl: true });
  });

  it('fallo de red: muestra error de conexión y tampoco crea un canal ficticio', async () => {
    const { page, voice, toasts } = setup({ status: 0 });

    await page.ngOnInit();

    expect(voice.connect).not.toHaveBeenCalled();
    expect(page.channel).toBeNull();
    expect(toasts.some(m => m.includes('Error de conexión'))).toBe(true);
  });
});
