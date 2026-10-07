import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { firstValueFrom, Subscription } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ServerConnectionService } from '@core/services/server-connection.service';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, ToastController } from '@ionic/angular';
import { VoiceService } from '@core/services/voice.service';
import { NativeService } from '@core/services/native.service';
import { Channel } from '@core/models';

@Component({
  selector: 'app-push-to-talk',
  standalone: true,
  imports: [CommonModule, IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon],
  templateUrl: './push-to-talk.page.html',
  styleUrls: ['./push-to-talk.page.scss']
})
export class PushToTalkPage implements OnInit, OnDestroy {
  voice = inject(VoiceService);
  private server = inject(ServerConnectionService);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastController);
  private http = inject(HttpClient);
  private native = inject(NativeService);
  private router = inject(Router);

  channel: Channel | null = null;
  private channelId = 0;
  private pttActive = false;
  private floorLostSub?: Subscription;
  private remoteDisconnectSub?: Subscription;

  async ngOnInit() {
    this.channelId = Number(this.route.snapshot.paramMap.get('id'));
    await this.native.lockPortrait();
    try {
      const c = await firstValueFrom(this.http.get<Channel>(`${this.server.apiUrl}/channels/${this.channelId}`));
      this.channel = c;
    } catch (e: any) {
      // Sin canal confirmado por el backend NO se inventa un "Canal {id}" ni se
      // pide token de voz: acceso denegado → volver a la lista de canales.
      if (e?.status === 403) {
        this.notify('No tienes acceso a este canal', 'warning');
      } else {
        this.notify('Error de conexión. No se pudo cargar el canal.', 'danger');
      }
      await this.router.navigateByUrl('/channels', { replaceUrl: true });
      return;
    }

    // Fail-safe del heartbeat: si se pierde el piso, el mic ya está apagado; avisar al operador.
    this.floorLostSub = this.voice.floorLost$.subscribe(() => {
      this.pttActive = false;
      this.native.keepScreenOn(false);
      this.notify('Se perdió el control del canal. Dejaste de transmitir.', 'warning');
    });

    // El servidor cerró la sesión de voz (permisos cambiados, device reasignado o
    // revocado): volver a la lista para reconectar con los permisos vigentes.
    this.remoteDisconnectSub = this.voice.remoteDisconnected$.subscribe(() => {
      this.pttActive = false;
      this.native.keepScreenOn(false);
      this.notify('La sesión de voz fue cerrada por el servidor.', 'warning');
      void this.router.navigateByUrl('/channels', { replaceUrl: true });
    });

    try {
      await this.voice.connect(this.channelId);
    } catch (e: any) {
      console.error('No se pudo conectar al canal de voz', e);
      if (e?.status === 403) {
        this.notify('No tienes acceso a este canal', 'warning');
        await this.router.navigateByUrl('/channels', { replaceUrl: true });
        return;
      }
      this.notify('No se pudo conectar al canal de voz', 'danger');
    }
  }

  private notify(message: string, color: 'warning' | 'danger') {
    this.toast.create({ message, duration: 3000, color, position: 'bottom' }).then(t => t.present());
  }

  ngOnDestroy() {
    this.floorLostSub?.unsubscribe();
    this.remoteDisconnectSub?.unsubscribe();
    this.native.unlockOrientation();
    this.native.keepScreenOn(false);
    this.voice.disconnect();
  }

  async onPttDown() {
    if (this.pttActive) return; // evita doble pointerdown
    this.pttActive = true;
    await this.native.haptic('heavy');
    await this.native.keepScreenOn(true);
    await this.voice.startTransmit(this.channelId);
  }
  async onPttUp() {
    if (!this.pttActive && (this.voice.floorState$.value === 'free' || this.voice.floorState$.value === 'denied')) return;
    this.pttActive = false;
    await this.native.haptic('light');
    await this.native.keepScreenOn(false);
    await this.voice.stopTransmit(this.channelId);
  }
}




