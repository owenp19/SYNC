import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Network } from '@capacitor/network';
import { Device } from '@capacitor/device';
import { Geolocation } from '@capacitor/geolocation';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { App } from '@capacitor/app';
import { KeepAwake } from '@capawesome/capacitor-keep-awake';
import { ToastController } from '@ionic/angular';

@Injectable({ providedIn: 'root' })
export class NativeService {
  private isNative = Capacitor.isNativePlatform();

  constructor(private toast: ToastController) {}

  /** Inicializa plugins seguros de ejecutar al arranque (con try/catch: nunca rompe la app). */
  async init() {
    try {
      if (this.isNative) {
        await StatusBar.setOverlaysWebView({ overlay: true });
        await StatusBar.setStyle({ style: Style.Dark });
      }
    } catch (e) { console.warn('StatusBar', e); }

    Network.addListener('networkStatusChange', async (status) => {
      const msg = status.connected ? 'Conexión restaurada' : 'Sin conexión a internet';
      const t = await this.toast.create({ message: msg, duration: 2500, color: status.connected ? 'success' : 'danger', position: 'bottom' });
      await t.present();
    }).catch(() => {});

    if (this.isNative) {
      App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) window.history.back();
        else App.exitApp();
      }).catch(() => {});

      this.setupPush().catch(() => {});
      this.currentPosition().catch(() => {});
    }
  }

  /** Confirmación háptica al presionar/soltar PTT. */
  async haptic(impact: 'light' | 'heavy' = 'light') {
    if (!this.isNative) return;
    try {
      await Haptics.impact({ style: impact === 'heavy' ? ImpactStyle.Heavy : ImpactStyle.Light });
    } catch (e) { console.warn('Haptics', e); }
  }

  /** Network: estado actual (para indicadores). */
  async isOnline(): Promise<boolean> {
    try {
      const s = await Network.getStatus();
      return s.connected;
    } catch { return true; }
  }

  /** Device: info del dispositivo para la pantalla de configuración. */
  async deviceInfo(): Promise<string> {
    try {
      const info = await Device.getInfo();
      return `${info.model} · ${info.platform} ${info.osVersion}`;
    } catch { return 'Dispositivo no disponible'; }
  }

  /** Geolocation: posición actual (canales por hotel/edificio). */
  async currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
    try {
      const pos = await Geolocation.getCurrentPosition({ timeout: 5000 });
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch (e) {
      console.warn('Geolocation', e);
      return null;
    }
  }

  /** Screen orientation: bloquear a portrait durante PTT. */
  async lockPortrait() {
    if (!this.isNative) return;
    try { await ScreenOrientation.lock({ orientation: 'portrait' }); } catch {}
  }
  async unlockOrientation() {
    if (!this.isNative) return;
    try { await ScreenOrientation.unlock(); } catch {}
  }

  /** Keep-awake: mantener pantalla encendida mientras se transmite. */
  async keepScreenOn(on: boolean) {
    if (!this.isNative) return;
    try {
      if (on) await KeepAwake.keepAwake();
      else await KeepAwake.allowSleep();
    } catch {}
  }

  /** Push: solicitar permiso y registrar token (Android/iOS real). */
  private async setupPush() {
    try {
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive === 'granted') await PushNotifications.register();
    } catch (e) { console.warn('Push', e); }
  }

  /** Local notifications: alerta offline de canal activo. */
  async notifyLocal(title: string, body: string) {
    try {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') return;
      await LocalNotifications.schedule({
        notifications: [{ id: Date.now(), title, body, schedule: { at: new Date(Date.now() + 1000) } }],
      });
    } catch (e) { console.warn('LocalNotifications', e); }
  }
}
