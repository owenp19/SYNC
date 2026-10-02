import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { Room, RoomEvent, Track, LocalAudioTrack, createLocalAudioTrack } from 'livekit-client';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environment';

export type FloorState = 'free' | 'requesting' | 'transmitting' | 'denied';

@Injectable({ providedIn: 'root' })
export class VoiceService implements OnDestroy {
  private room = new Room();
  private localTrack: LocalAudioTrack | null = null;

  floorState$ = new BehaviorSubject<FloorState>('free');
  activeSpeaker$ = new BehaviorSubject<string | null>(null);
  connected$ = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpClient) {
    this.room.on(RoomEvent.Connected, () => this.connected$.next(true));
    this.room.on(RoomEvent.Disconnected, () => { this.connected$.next(false); this.floorState$.next('free'); });
    this.room.on(RoomEvent.TrackSubscribed, (_t, _pub, participant) => {
      if (_t.kind === Track.Kind.Audio) {
        this.activeSpeaker$.next(participant.identity);
        // livekit-client NO reproduce audio remoto por defecto: hay que adjuntar el track al DOM
        const el = (_t as any).attach() as HTMLAudioElement;
        el.autoplay = true;
        document.body.appendChild(el);
      }
    });
    this.room.on(RoomEvent.TrackUnsubscribed, (t) => {
      this.activeSpeaker$.next(null);
      (t as any).detach()?.forEach?.((el: HTMLElement) => el.remove());
    });
  }

  async connect(channelId: number) {
    const { token } = await firstValueFrom(
      this.http.post<{ token: string }>(environment.livekitTokenEndpoint, { channel_id: channelId })
    );
    await this.room.connect(environment.livekitUrl, token);
  }

  /** PTT presionado: solicita el piso y publica el micrófono. */
  private heartbeatTimer: any = null;

  async startTransmit(channelId: number) {
    this.floorState$.next('requesting');
    try {
      this.localTrack = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true });
      // Floor control: el backend autoriza (LiveKit egress / data message al servidor)
      await firstValueFrom(this.http.post(`${environment.apiUrl}/channels/${channelId}/floor/acquire`, {}));
      await this.room.localParticipant.publishTrack(this.localTrack);
      this.floorState$.next('transmitting');
      this.heartbeatTimer = setInterval(() => {
        this.http.post(`${environment.apiUrl}/channels/${channelId}/floor/heartbeat`, {}).subscribe();
      }, 60_000);
    } catch {
      this.floorState$.next('denied');
      this.localTrack?.stop();
      this.localTrack = null;
    }
  }

  /** PTT liberado: detiene el micrófono y libera el piso. */
  async stopTransmit(channelId: number) {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.localTrack) {
      await this.room.localParticipant.unpublishTrack(this.localTrack);
      this.localTrack.stop();
      this.localTrack = null;
    }
    try { await firstValueFrom(this.http.post(`${environment.apiUrl}/channels/${channelId}/floor/release`, {})); } catch {}
    this.floorState$.next('free');
  }

  async disconnect() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.localTrack) {
      try { await this.room.localParticipant.unpublishTrack(this.localTrack); } catch {}
      this.localTrack.stop();
      this.localTrack = null;
    }
    await this.room.disconnect();
    this.floorState$.next('free');
    this.activeSpeaker$.next(null);
  }

  ngOnDestroy() { this.disconnect(); }
}



