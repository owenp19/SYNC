import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { OperatorPage } from './operator.page';
import { DeviceService } from '@core/services/device.service';
import { deviceGuard } from '@core/guards/device.guard';

/**
 * Pregunta de operador en el arranque: es opcional y NO es login, pero solo se
 * considera contestada cuando el trabajador elige un operador o pulsa
 * "Continuar sin operador".
 */
describe('Operador en arranque', () => {
  function setup() {
    const device = {
      operatorPromptedThisRun: false,
      isActivated: vi.fn().mockResolvedValue(true),
      operators: vi.fn().mockResolvedValue([{ id: 5, name: 'Alejandro' }]),
      setOperator: vi.fn().mockResolvedValue({}),
    };
    const router = {
      navigateByUrl: vi.fn().mockResolvedValue(true),
      createUrlTree: vi.fn((commands: string[]) => ({ commands }) as unknown as UrlTree),
    };
    const toast = { create: vi.fn().mockResolvedValue({ present: vi.fn() }) };

    TestBed.configureTestingModule({
      providers: [
        { provide: DeviceService, useValue: device },
        { provide: Router, useValue: router },
        { provide: ToastController, useValue: toast },
      ],
    });
    return { device, router };
  }

  const channelsRoute = { routeConfig: { path: 'channels' } } as unknown as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;
  const runGuard = () => TestBed.runInInjectionContext(() => deviceGuard(channelsRoute, state));

  it('entrar a la pantalla de operador y volver atrás NO marca la pregunta como contestada', async () => {
    const { device } = setup();

    // 1º intento de ir a /channels → redirige a /operator
    const first = await runGuard();
    expect((first as any).commands).toEqual(['/operator']);
    expect(device.operatorPromptedThisRun).toBe(false);

    // El trabajador abre la pantalla y vuelve atrás sin elegir nada.
    const page = TestBed.runInInjectionContext(() => new OperatorPage());
    await page.ngOnInit();

    // Se vuelve a preguntar en este mismo arranque.
    const second = await runGuard();
    expect((second as any).commands).toEqual(['/operator']);
    expect(device.operatorPromptedThisRun).toBe(false);
  });

  it('"Continuar sin operador" limpia el operador y cuenta como contestada', async () => {
    const { device, router } = setup();
    const page = TestBed.runInInjectionContext(() => new OperatorPage());

    await page.choose(null);

    expect(device.setOperator).toHaveBeenCalledWith(null);
    expect(device.operatorPromptedThisRun).toBe(true);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/channels');
    expect(await runGuard()).toBe(true);
  });

  it('elegir un operador cuenta como contestada', async () => {
    const { device } = setup();
    const page = TestBed.runInInjectionContext(() => new OperatorPage());

    await page.choose(5);

    expect(device.setOperator).toHaveBeenCalledWith(5);
    expect(device.operatorPromptedThisRun).toBe(true);
  });

  it('si falla la selección, la pregunta sigue pendiente', async () => {
    const { device } = setup();
    device.setOperator.mockRejectedValueOnce({ error: { message: 'fallo' } });
    const page = TestBed.runInInjectionContext(() => new OperatorPage());

    await page.choose(5);

    expect(device.operatorPromptedThisRun).toBe(false);
  });
});
