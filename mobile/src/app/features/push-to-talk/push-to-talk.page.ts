import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environment';
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
  channel: Channel | null = null;
  private channelId = 0;
  private pttActive = false;

  constructor(public voice: VoiceService, private route: ActivatedRoute, private toast: ToastController, private http: HttpClient, private native: NativeService) {}

  async ngOnInit() {
    this.channelId = Number(this.route.snapshot.paramMap.get('id'));
    await this.native.lockPortrait();
    try {
      const c = await firstValueFrom(this.http.get<Channel>(`${environment.apiUrl}/channels/${this.channelId}`));
      this.channel = c;
    } catch {
      this.channel = { id: this.channelId, name: `Canal ${this.channelId}`, type: 'private' };
    }
    try {
      await this.voice.connect(this.channelId);
    } catch (e) {
      console.error('No se pudo conectar al canal de voz', e);
      this.toast.create({ message: 'No se pudo conectar al canal de voz', duration: 3000, color: 'danger', position: 'bottom' }).then(t => t.present());
    }
  }

  ngOnDestroy() {
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




