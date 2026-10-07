import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { ServerConnectionService } from '../services/server-connection.service';

/**
 * Si una petición a la API de SYNC falla por red (status 0: host inalcanzable,
 * IP cambiada, Wi-Fi caído), avisa a ServerConnectionService para que verifique
 * el servidor y, si hace falta, lo redescubra. No reintenta por sí mismo:
 * el backoff lo gestiona ServerConnectionService (sin bucles agresivos).
 */
@Injectable()
export class ConnectivityInterceptor implements HttpInterceptor {
  private server = inject(ServerConnectionService);

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<any> {
    return next.handle(req).pipe(
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 0 && req.url.startsWith(this.server.apiBaseUrl)) {
          this.server.reportUnreachable();
        }
        return throwError(() => err);
      })
    );
  }
}
