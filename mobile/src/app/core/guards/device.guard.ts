import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { DeviceService } from '../services/device.service';

/** Ruta del radio solo si el dispositivo ya fue activado silenciosamente. */
export const deviceGuard: CanActivateFn = async () => {
  const device = inject(DeviceService);
  const router = inject(Router);
  const active = await device.isActivated();
  return active ? true : router.createUrlTree(['/activate']);
};
