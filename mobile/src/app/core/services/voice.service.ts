import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, firstValueFrom, pairwise, Subject, Subscription, timeout } from 'rxjs';
import { Room, RoomEvent, Track, LocalAudioTrack, createLocalAudioTrack, ExternalE2EEKeyProvider, RoomOptions, DisconnectReason } from 'livekit-client';
import { HttpClient } from '@angular/common/http';
import { ConnectionStatus, ServerConnectionService } from './server-connection.service';
import { RadioToneService } from './radio-tone.service';

export type FloorState = 'free' | 'requesting' | 'transmitting' | 'denied';

/** Reintentos de reconexión de voz (LiveKit puede tardar unos segundos en volver tras un cambio de IP). */
const VOICE_RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000];

@Injectable({ providedIn: 'root' })
export class VoiceService implements OnDestroy {
  private server = inject(ServerConnectionService);
  private http = inject(HttpClient);
  private tones = inject(RadioToneService);

  private room: Room | null = null;
  private localTrack: LocalAudioTrack | null = null;
  private remoteAudioEls: HTMLAudioElement[] = [];

  floorState$ = new BehaviorSubject<FloorState>('free');
  activeSpeaker$ = new BehaviorSubject<string | null>(null);
  connected$ = new BehaviorSubject<boolean>(false);
  /** Se emite cuando se pierde el control del canal (heartbeat fallido, cambio de red): la UI debe avisar. */
  floorLost$ = new Subject<void>();
  /** Desconexión NO iniciada por el cliente (p. ej. el servidor expulsó al device de la sala). */
  remoteDisconnected$ = new Subject<void>();
  private clientDisconnecting = false;

  private heartbeatTimer: any = null;
  private heartbeatFails = 0;
  private activeChannelId: number | null = null;
  private transmissionId: string | null = null;
  private attemptId = 0;

  /** Canal en el que el usuario QUIERE estar (pantalla PTT abierta). Sobrevive a cortes de red. */
  private desiredChannelId: number | null = null;
  private voiceRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private voiceRetryAttempt = 0;
  private reconnecting = false;
  private subs = new Subscription();

  constructor() {
    // Servidor perdido / IP cambiada → cortar voz y PTT; servidor de vuelta → reconectar.
    this.subs.add(this.server.status$.subscribe(status => { void this.onServerStatus(status); }));
    // Endpoint cambiado sin pasar por desconexión (p. ej. configuración manual).
    this.subs.add(this.server.endpoint$.pipe(pairwise()).subscribe(([prev, next]) => {
      if (!prev || !next) return;
      const changed = prev.host !== next.host || prev.livekitPort !== next.livekitPort || prev.apiPort !== next.apiPort;
      if (changed && (this.room || this.desiredChannelId != null)) void this.restartForNewEndpoint();
    }));
  }

  /** Fábrica de Room (sobrescribible en pruebas). */
  protected createRoom(opts: RoomOptions): Room {
    return new Room(opts);
  }

  private bindRoomEvents(room: Room) {
    room.on(RoomEvent.Connected, () => this.connected$.next(true));
    // La señalización con LiveKit se cortó (cambio de Wi-Fi, PC caído): nunca
    // seguir mostrando TRANSMITIENDO sin servidor → cortar la transmisión ya.
    room.on(RoomEvent.Reconnecting, () => {
      if (this.room === room && (this.transmissionId || this.floorState$.value === 'transmitting' || this.floorState$.value === 'requesting')) {
        void this.handleFloorLost();
      }
    });
    room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      this.connected$.next(false);
      this.floorState$.next('free');
      if (this.clientDisconnecting || this.room !== room) return;

      // Apagar mic y heartbeat de inmediato.
      this.attemptId++;
      this.clearHeartbeat();
      this.localTrack?.stop();
      this.localTrack = null;
      this.transmissionId = null;
      this.room = null;

      if (reason === DisconnectReason.PARTICIPANT_REMOVED || reason === DisconnectReason.ROOM_DELETED) {
        // Expulsado por el servidor (revocado, reasignado, permisos retirados).
        this.desiredChannelId = null;
        this.clearVoiceRetry();
        this.remoteDisconnected$.next();
        return;
      }
      // Pérdida de conexión: verificar el servidor y reintentar con backoff.
      this.server.reportUnreachable();
      this.scheduleVoiceRetry();
    });
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

  /**
   * Entra a la sala del canal. Siempre pide un token NUEVO al servidor actual y
   * usa la URL de LiveKit actual: nunca se reutiliza un token contra otro servidor.
   */
  async connect(channelId: number) {
    this.desiredChannelId = channelId;
    this.clearVoiceRetry();
    if (this.connected$.value || this.room) {
      await this.teardown();
    }
    const res = await firstValueFrom(
      this.http.post<{ token: string; url: string; e2ee_key?: string; user_name?: string }>(
        `${this.server.apiUrl}/voice/token`,
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

    const room = this.createRoom(opts);
    this.bindRoomEvents(room);
    this.room = room;
    this.activeChannelId = channelId;
    try {
      await room.connect(this.server.liveKitUrl, res.token);
      this.voiceRetryAttempt = 0;
    } catch (e) {
      if (this.room === room) this.room = null;
      throw e;
    }
  }

  private async onServerStatus(status: ConnectionStatus) {
    if (status !== 'CONNECTED') {
      if (this.room || this.transmissionId || this.floorState$.value !== 'free') {
        await this.suspendForConnectionLoss();
      }
      return;
    }
    if (this.desiredChannelId != null && !this.room) {
      await this.reconnectDesired();
    }
  }

  /**
   * Corte por pérdida de servidor o cambio de red: apaga micrófono, publicación
   * y heartbeat, limpia el PTT local (nunca queda "TRANSMITIENDO"), intenta un
   * release best-effort y cierra la Room antigua. Conserva el canal deseado
   * para reconectar cuando el servidor vuelva.
   */
  async suspendForConnectionLoss() {
    const wasTransmitting = !!this.transmissionId || this.floorState$.value === 'transmitting' || this.floorState$.value === 'requesting';
    if (wasTransmitting) {
      await this.handleFloorLost(1500);
    }
    this.clearVoiceRetry();
    await this.teardown();
  }

  private async restartForNewEndpoint() {
    await this.suspendForConnectionLoss();
    if (this.server.status === 'CONNECTED') await this.reconnectDesired();
  }

  private async reconnectDesired() {
    const channelId = this.desiredChannelId;
    if (channelId == null || this.reconnecting || this.server.status !== 'CONNECTED') return;
    this.reconnecting = true;
    try {
      await this.connect(channelId);
    } catch (e: any) {
      if (e?.status === 401 || e?.status === 403) {
        // Ya no hay acceso a este canal (o el device dejó de estar autorizado).
        this.desiredChannelId = null;
        this.remoteDisconnected$.next();
      } else {
        this.scheduleVoiceRetry();
      }
    } finally {
      this.reconnecting = false;
    }
  }

  private scheduleVoiceRetry() {
    if (this.desiredChannelId == null || this.voiceRetryTimer) return;
    const delay = VOICE_RETRY_DELAYS[Math.min(this.voiceRetryAttempt, VOICE_RETRY_DELAYS.length - 1)];
    this.voiceRetryAttempt++;
    this.voiceRetryTimer = setTimeout(() => {
      this.voiceRetryTimer = null;
      if (this.server.status === 'CONNECTED' && !this.room) void this.reconnectDesired();
    }, delay);
  }

  private clearVoiceRetry() {
    if (this.voiceRetryTimer) { clearTimeout(this.voiceRetryTimer); this.voiceRetryTimer = null; }
  }

  /** PTT presionado: solicita el piso, chirrido de radio y DESPUÉS abre el micrófono. */
  async startTransmit(channelId: number) {
    const attempt = ++this.attemptId;
    this.tones.unlock(); // dentro del gesto del usuario (autoplay policy)
    if (this.server.status !== 'CONNECTED') {
      // Sin servidor no se pide Floor: tras reconectar se adquiere normalmente.
      this.floorState$.next('denied');
      this.tones.deniedBonk();
      setTimeout(() => { if (this.floorState$.value === 'denied') this.floorState$.next('free'); }, 1500);
      return;
    }
    this.floorState$.next('requesting');
    try {
      const res = await firstValueFrom(this.http.post<any>(
        `${this.server.apiUrl}/channels/${channelId}/floor/acquire`,
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
      await firstValueFrom(this.http.post(`${this.server.apiUrl}/channels/${id}/floor/heartbeat`, { transmission_id: this.transmissionId }));
      this.heartbeatFails = 0;
    } catch (e: any) {
      // 409: el servidor dice que ya no poseemos el piso → parar de inmediato.
      // Otros errores (red/caída del backend): tolerar 1 fallo; al 2º consecutivo, rendirse.
      if (e?.status === 409 || ++this.heartbeatFails >= 2) {
        await this.handleFloorLost();
      }
    }
  }

  /**
   * Pérdida del piso: apagar mic ya, limpiar heartbeat, release best-effort y avisar a la UI.
   * `releaseTimeoutMs` acota el release cuando el servidor probablemente ya no responde.
   */
  private async handleFloorLost(releaseTimeoutMs = 5000) {
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
        await firstValueFrom(this.http.post(`${this.server.apiUrl}/channels/${id}/floor/release`, { transmission_id: tx }).pipe(timeout(releaseTimeoutMs)));
      } catch {}
    }
  }

  /** Libera el piso en el backend tras un acquire que ya no interesa (PTT soltado antes de tiempo). */
  private async abortFloor(channelId: number) {
    try {
      await firstValueFrom(this.http.post(`${this.server.apiUrl}/channels/${channelId}/floor/release`, { transmission_id: this.transmissionId }));
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
      await firstValueFrom(this.http.post(`${this.server.apiUrl}/channels/${channelId}/floor/release`, { transmission_id: this.transmissionId }));
    } catch {}
    this.transmissionId = null;
    this.floorState$.next('free');
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  /** El usuario sale de la pantalla del canal: desconexión definitiva (sin reconexión). */
  async disconnect() {
    this.desiredChannelId = null;
    this.clearVoiceRetry();
    this.voiceRetryAttempt = 0;
    await this.teardown();
  }

  /** Cierra limpiamente la sesión de voz actual (mic, Floor, Room) sin olvidar el canal deseado. */
  private async teardown() {
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
        await firstValueFrom(this.http.post(`${this.server.apiUrl}/channels/${this.activeChannelId}/floor/release`, { transmission_id: this.transmissionId }).pipe(timeout(2000)));
      } catch {}
      this.transmissionId = null;
    }
    if (this.room) {
      const room = this.room;
      this.clientDisconnecting = true;
      try {
        await room.disconnect();
      } catch {
        // la conexión ya estaba rota
      } finally {
        this.clientDisconnecting = false;
      }
      this.room = null;
    }
    this.remoteAudioEls.forEach(el => el.remove());
    this.remoteAudioEls = [];
    this.floorState$.next('free');
    this.activeSpeaker$.next(null);
    this.connected$.next(false);
    this.activeChannelId = null;
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.disconnect();
  }
}
