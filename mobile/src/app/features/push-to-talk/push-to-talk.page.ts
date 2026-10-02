import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, ToastController } from '@ionic/angular';
import { VoiceService } from '@core/services/voice.service';
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

  constructor(public voice: VoiceService, private route: ActivatedRoute, private toast: ToastController) {}

  async ngOnInit() {
    this.channelId = Number(this.route.snapshot.paramMap.get('id'));
    this.channel = { id: this.channelId, name: `Canal ${this.channelId}`, type: 'private' };
    try {
      await this.voice.connect(this.channelId);
    } catch (e) {
      console.error('No se pudo conectar al canal de voz', e);
      this.toast.create({ message: 'No se pudo conectar al canal de voz', duration: 3000, color: 'danger', position: 'bottom' }).then(t => t.present());
    }
  }

  ngOnDestroy() {
    this.voice.disconnect();
  }

  async onPttDown() { await this.voice.startTransmit(this.channelId); }
  async onPttUp() { await this.voice.stopTransmit(this.channelId); }
}




