import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { Room, RoomEvent, Track, LocalAudioTrack, createLocalAudioTrack, ExternalE2EEKeyProvider, RoomOptions } from 'livekit-client';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environment';

export type FloorState = 'free' | 'requesting' | 'transmitting' | 'denied';

@Injectable({ providedIn: 'root' })
export class VoiceService implements OnDestroy {
  private room: Room | null = null;
  private localTrack: LocalAudioTrack | null = null;
  private remoteAudioEls: HTMLAudioElement[] = [];

  floorState$ = new BehaviorSubject<FloorState>('free');
  activeSpeaker$ = new BehaviorSubject<string | null>(null);
  connected$ = new BehaviorSubject<boolean>(false);

  private heartbeatTimer: any = null;
  private activeChannelId: number | null = null;
  private transmissionId: string | null = null;
  private attemptId = 0;

  constructor(private http: HttpClient) {}

  private bindRoomEvents(room: Room) {
    room.on(RoomEvent.Connected, () => this.connected$.next(true));
    room.on(RoomEvent.Disconnected, () => { this.connected$.next(false); this.floorState$.next('free'); });
    room.on(RoomEvent.TrackSubscribed, (_t, _pub, participant) => {
      if (_t.kind === Track.Kind.Audio) {
        this.activeSpeaker$.next(participant.identity);
        const el = (_t as any).attach() as HTMLAudioElement;
        el.autoplay = true;
        this.remoteAudioEls.push(el);
        document.body.appendChild(el);
      }
    });
    room.on(RoomEvent.TrackUnsubscribed, (t) => {
      this.activeSpeaker$.next(null);
      (t as any).detach()?.forEach?.((el: HTMLElement) => el.remove());
    });
  }

  async connect(channelId: number) {
    if (this.connected$.value || this.room) {
      await this.disconnect();
    }
    const res = await firstValueFrom(
      this.http.post<{ token: string; url: string; e2ee_key?: string; user_name?: string }>(
        environment.livekitTokenEndpoint,
        { channel_id: channelId }
      )
    );

    const opts: RoomOptions = {};
    if (res.e2ee_key) {
      const keyProvider = new ExternalE2EEKeyProvider();
      await keyProvider.setKey(res.e2ee_key);
      opts.e2ee = {
        keyProvider,
        worker: new Worker(new URL('./e2ee-worker.ts', import.meta.url), { type: 'module' }),
      };
    }

    const room = new Room(opts);
    this.bindRoomEvents(room);
    this.room = room;
    this.activeChannelId = channelId;
    await room.connect(environment.livekitUrl, res.token);
  }

  /** PTT presionado: solicita el piso y publica el micrófono. */
  async startTransmit(channelId: number) {
    const attempt = ++this.attemptId;
    this.floorState$.next('requesting');
    try {
      this.localTrack = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true });
      const res = await firstValueFrom(this.http.post<any>(
        `${environment.apiUrl}/channels/${channelId}/floor/acquire`,
        {}
      ));

      // El usuario ya soltó el botón mientras esperaba el acquire: liberar de inmediato.
      if (attempt !== this.attemptId || this.floorState$.value === 'free') {
        try {
          await firstValueFrom(this.http.post(`${environment.apiUrl}/channels/${channelId}/floor/release`, { transmission_id: res?.transmission_id }));
        } catch {}
        this.localTrack.stop();
        this.localTrack = null;
        return;
      }

      this.transmissionId = res?.transmission_id ?? null;
      this.activeChannelId = channelId;
      await this.room?.localParticipant.publishTrack(this.localTrack);
      this.floorState$.next('transmitting');
      this.heartbeatTimer = setInterval(() => {
        const id = this.activeChannelId;
        if (id == null) return;
        this.http.post(`${environment.apiUrl}/channels/${id}/floor/heartbeat`, { transmission_id: this.transmissionId }).subscribe();
      }, 5000);
    } catch {
      this.floorState$.next('denied');
      this.localTrack?.stop();
      this.localTrack = null;
      setTimeout(() => { if (this.floorState$.value === 'denied') this.floorState$.next('free'); }, 1500);
    }
  }

  /** PTT liberado: detiene el micrófono y libera el piso. */
  async stopTransmit(channelId: number) {
    this.attemptId++; // invalida acquires tardíos
    this.clearHeartbeat();
    if (this.localTrack) {
      try { await this.room?.localParticipant.unpublishTrack(this.localTrack); } catch {}
      this.localTrack.stop();
      this.localTrack = null;
    }
    try {
      await firstValueFrom(this.http.post(`${environment.apiUrl}/channels/${channelId}/floor/release`, { transmission_id: this.transmissionId }));
    } catch {}
    this.transmissionId = null;
    this.floorState$.next('free');
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  async disconnect() {
    this.attemptId++;
    this.clearHeartbeat();
    if (this.localTrack) {
      try { await this.room?.localParticipant.unpublishTrack(this.localTrack); } catch {}
      this.localTrack.stop();
      this.localTrack = null;
    }
    // Liberar el piso si seguimos ocupándolo (navegó atrás, cambió de canal, cerró pantalla)
    if (this.activeChannelId != null && this.transmissionId) {
      try {
        await firstValueFrom(this.http.post(`${environment.apiUrl}/channels/${this.activeChannelId}/floor/release`, { transmission_id: this.transmissionId }));
      } catch {}
      this.transmissionId = null;
    }
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
    this.remoteAudioEls.forEach(el => el.remove());
    this.remoteAudioEls = [];
    this.floorState$.next('free');
    this.activeSpeaker$.next(null);
    this.connected$.next(false);
    this.activeChannelId = null;
  }

  ngOnDestroy() { this.disconnect(); }
}
