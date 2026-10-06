import { Injectable, inject } from '@angular/core';
import { HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { from, Observable, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { DeviceService } from '../services/device.service';

/**
 * Distinción inequívoca de credenciales:
 * - Rutas /admin/* y /auth/*  → token de ADMIN (usuario del panel).
 * - Todo lo demás (radio)     → token de DEVICE (credencial del terminal).
 * Nunca se mezclan: un device no opera el panel y un admin no opera la radio.
 */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private auth = inject(AuthService);
  private device = inject(DeviceService);


  private isAdminCall(url: string): boolean {
    return url.includes('/admin/') || url.endsWith('/auth/login') || url.endsWith('/auth/logout') || url.endsWith('/auth/me');
  }

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<any> {
    const tokenPromise = this.isAdminCall(req.url) ? Promise.resolve(this.auth.token) : this.device.token();
    return from(tokenPromise).pipe(
      switchMap(token => next.handle(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req))
    );
  }
}
