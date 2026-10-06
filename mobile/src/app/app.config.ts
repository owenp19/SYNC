import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideIonicAngular } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowForwardOutline, bed, business, chevronForward, construct, globe, gridOutline, informationCircleOutline, lockClosed, lockClosedOutline, mailOutline, menuOutline, mic, people, peopleOutline, personAddOutline, personCircleOutline, addCircleOutline, pulseOutline, settingsOutline, shieldCheckmark, warning, warningOutline, wifiOutline } from 'ionicons/icons';
import { routes } from './app.routes';
import { AuthInterceptor } from './core/interceptors/auth.interceptor';
import { NativeService } from './core/services/native.service';
import { DeviceCredentialStorage, SyncDeviceCredentialStorage } from './core/services/device-credential.storage';
import { APP_INITIALIZER } from '@angular/core';

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
  globe: globe,
  'warning': warning,
  'menu-outline': menuOutline,
  'grid-outline': gridOutline,
  'warning-outline': warningOutline,
  'person-circle-outline': personCircleOutline,
  'wifi-outline': wifiOutline,
  'settings-outline': settingsOutline,
  'pulse-outline': pulseOutline,
  'mail-outline': mailOutline,
  'lock-closed-outline': lockClosedOutline,
  'information-circle-outline': informationCircleOutline,
  'people-outline': peopleOutline,
  'add-circle-outline': addCircleOutline,
  'person-add-outline': personAddOutline,
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideIonicAngular({ mode: 'md' }),
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    { provide: DeviceCredentialStorage, useClass: SyncDeviceCredentialStorage },
    {
      provide: APP_INITIALIZER,
      useFactory: (native: NativeService) => () => native.init(),
      deps: [NativeService],
      multi: true
    }
  ]
};




