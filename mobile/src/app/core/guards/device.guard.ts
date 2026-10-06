import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { DeviceService } from '../services/device.service';

/** Ruta del radio solo si el dispositivo ya fue activado silenciosamente. */
export const deviceGuard: CanActivateFn = async (route) => {
  const device = inject(DeviceService);
  const router = inject(Router);
  const active = await device.isActivated();
  if (!active) return router.createUrlTree(['/activate']);

  // En cada arranque en frío, al entrar a los canales, preguntar (opcionalmente)
  // quién usa el dispositivo. NO es login: sin PIN ni contraseña y se puede saltar.
  if (route.routeConfig?.path === 'channels' && !device.operatorPromptedThisRun) {
    device.operatorPromptedThisRun = true;
    return router.createUrlTree(['/operator']);
  }
  return true;
};
