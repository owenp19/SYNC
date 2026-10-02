import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideIonicAngular } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowForwardOutline, bed, business, chevronForward, construct, lockClosed, mic, people, shieldCheckmark, warning, wifiOutline } from 'ionicons/icons';
import { routes } from './app.routes';
import { AuthInterceptor } from './core/interceptors/auth.interceptor';

addIcons({
  'arrow-forward-outline': arrowForwardOutline,
  bed: bed,
  business: business,
  'chevron-forward': chevronForward,
  construct: construct,
  'lock-closed': lockClosed,
  mic: mic,
  people: people,
  'shield-checkmark': shieldCheckmark,
  warning: warning,
  'wifi-outline': wifiOutline,
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideIonicAngular({ mode: 'md' }),
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
  ]
};




