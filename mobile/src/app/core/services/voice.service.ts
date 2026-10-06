import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, firstValueFrom, Subject } from 'rxjs';
import { Room, RoomEvent, Track, LocalAudioTrack, createLocalAudioTrack, ExternalE2EEKeyProvider, RoomOptions } from 'livekit-client';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environment';
import { RadioToneService } from './radio-tone.service';

export type FloorState = 'free' | 'requesting' | 'transmitting' | 'denied';

@Injectable({ providedIn: 'root' })
export class VoiceService implements OnDestroy {
  private http = inject(HttpClient);
  private tones = inject(RadioToneService);

  private room: Room | null = null;
  private localTrack: LocalAudioTrack | null = null;
  private remoteAudioEls: HTMLAudioElement[] = [];

  floorState$ = new BehaviorSubject<FloorState>('free');
  activeSpeaker$ = new BehaviorSubject<string | null>(null);
  connected$ = new BehaviorSubject<boolean>(false);
  /** Se emite cuando se pierde el control del canal (heartbeat fallido): la UI debe avisar. */
  floorLost$ = new Subject<void>();

  private heartbeatTimer: any = null;
  private heartbeatFails = 0;
  private activeChannelId: number | null = null;
  private transmissionId: string | null = null;
  private attemptId = 0;

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

  /** PTT presionado: solicita el piso, chirrido de radio y DESPUÉS abre el micrófono. */
  async startTransmit(channelId: number) {
    const attempt = ++this.attemptId;
    this.tones.unlock(); // dentro del gesto del usuario (autoplay policy)
    this.floorState$.next('requesting');
    try {
      const res = await firstValueFrom(this.http.post<any>(
        `${environment.apiUrl}/channels/${channelId}/floor/acquire`,
        {}
      ));

      this.transmissionId = res?.transmission_id ?? null;
      this.activeChannelId = channelId;

      // El usuario ya soltó el botón mientras esperaba el acquire: liberar de inmediato.
      if (attempt !== this.attemptId || this.floorState$.getValue() === 'free') {
        await this.abortFloor(channelId);
        return;
      }

      // 1) Chirrido de "piso concedido" ANTES de abrir el mic:
      //    no se transmite y enmascara el clic de apertura del micrófono.
      await this.tones.startChirp();
      if (attempt !== this.attemptId || this.floorState$.getValue() === 'free') {
        await this.abortFloor(channelId);
        return;
      }

      // 2) Ahora sí, abrir y publicar el micrófono.
      this.localTrack = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true });
      if (attempt !== this.attemptId || this.floorState$.getValue() === 'free') {
        this.localTrack.stop();
        this.localTrack = null;
        await this.abortFloor(channelId);
        return;
      }
      await this.room?.localParticipant.publishTrack(this.localTrack);
      this.floorState$.next('transmitting');
      this.startHeartbeat();
    } catch {
      this.floorState$.next('denied');
      this.tones.deniedBonk(); // bonk de "canal ocupado"
      if (this.localTrack) {
        this.localTrack.stop();
        this.localTrack = null;
      }
      this.clearHeartbeat();
      // Si el piso llegó a concederse pero algo posterior falló (tono, mic, publish):
      // liberar el Floor para no dejar el canal ocupado.
      if (this.transmissionId) await this.abortFloor(channelId);
      setTimeout(() => { if (this.floorState$.value === 'denied') this.floorState$.next('free'); }, 1500);
    }
  }

  private startHeartbeat() {
    this.heartbeatFails = 0;
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => { void this.sendHeartbeat(); }, 5000);
  }

  /** Heartbeat con fail-safe: el cliente nunca transmite sin confirmar el Floor. */
  private async sendHeartbeat() {
    const id = this.activeChannelId;
    if (id == null || !this.transmissionId) return;
    try {
      await firstValueFrom(this.http.post(`${environment.apiUrl}/channels/${id}/floor/heartbeat`, { transmission_id: this.transmissionId }));
      this.heartbeatFails = 0;
    } catch (e: any) {
      // 409: el servidor dice que ya no poseemos el piso → parar de inmediato.
      // Otros errores (red/caída del backend): tolerar 1 fallo; al 2º consecutivo, rendirse.
      if (e?.status === 409 || ++this.heartbeatFails >= 2) {
        await this.handleFloorLost();
      }
    }
  }

  /** Pérdida del piso: apagar mic ya, limpiar heartbeat, release best-effort y avisar a la UI. */
  private async handleFloorLost() {
    this.attemptId++;
    this.clearHeartbeat();
    if (this.localTrack) {
      try { await this.room?.localParticipant.unpublishTrack(this.localTrack); } catch {}
      this.localTrack.stop();
      this.localTrack = null;
    }
    const id = this.activeChannelId;
    const tx = this.transmissionId;
    this.transmissionId = null;
    this.floorState$.next('free');
    this.floorLost$.next();
    if (id != null && tx) {
      try {
        await firstValueFrom(this.http.post(`${environment.apiUrl}/channels/${id}/floor/release`, { transmission_id: tx }));
      } catch {}
    }
  }

  /** Libera el piso en el backend tras un acquire que ya no interesa (PTT soltado antes de tiempo). */
  private async abortFloor(channelId: number) {
    try {
      await firstValueFrom(this.http.post(`${environment.apiUrl}/channels/${channelId}/floor/release`, { transmission_id: this.transmissionId }));
    } catch {}
    this.transmissionId = null;
  }

  /** PTT liberado: detiene el micrófono, blip de cierre y libera el piso. */
  async stopTransmit(channelId: number) {
    this.attemptId++; // invalida acquires tardíos
    this.clearHeartbeat();
    const wasTransmitting = this.floorState$.value === 'transmitting';
    if (this.localTrack) {
      try { await this.room?.localParticipant.unpublishTrack(this.localTrack); } catch {}
      this.localTrack.stop();
      this.localTrack = null;
    }
    // Blip DESPUÉS de cerrar el mic (no se transmite) y solo si realmente transmitía.
    if (wasTransmitting) this.tones.endBlip();
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
