import { Injectable } from '@angular/core';
import { HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { from, Observable, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { DeviceService } from '../services/device.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private auth: AuthService, private device: DeviceService) {}
  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<any> {
    const isAdminCall = req.url.includes('/admin/') || req.url.endsWith('/auth/login') || req.url.endsWith('/auth/logout') || req.url.endsWith('/auth/me');
    const tokenPromise = isAdminCall ? Promise.resolve(this.auth.token) : this.device.token();
    return from(tokenPromise).pipe(
      switchMap(token => next.handle(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req))
    );
  }
}
