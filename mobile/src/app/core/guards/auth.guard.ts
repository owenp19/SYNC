import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { User } from '../models';
import { ServerConnectionService } from '../services/server-connection.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated) return true;
  return router.createUrlTree(['/auth/login']);
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const http = inject(HttpClient);
  const server = inject(ServerConnectionService);
  if (!auth.isAuthenticated || !auth.token) return router.createUrlTree(['/auth/login']);
  return http.get<User>(`${server.apiUrl}/auth/me`).pipe(
    map(u => (u.role === 'admin' ? true : router.createUrlTree(['/channels']))),
    catchError(() => of(router.createUrlTree(['/auth/login'])))
  );
};

/** Evita que el admin navegue a canales (su login es solo para la parte administrativa). */
export const noAdminChannelsGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.currentUser$.value;
  if (user?.role === 'admin') return router.createUrlTree(['/admin']);
  return true;
};
