import { Injectable } from '@angular/core';

/**
 * Tonos de radio PTT sintetizados con WebAudio (sin archivos de audio).
 * - startChirp:  chirrido ascendente al concederse el piso (talk-permit tone).
 * - endBlip:     blip descendente al terminar la transmisión.
 * - deniedBonk:  bonk grave de "canal ocupado / denegado".
 */
@Injectable({ providedIn: 'root' })
export class RadioToneService {
  private ctx: AudioContext | null = null;

  /** Debe llamarse dentro de un gesto del usuario (pointerdown del PTT). */
  unlock() {
    try {
      const ctx = this.audioCtx();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch {}
  }

  private audioCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Secuencia de tonos con envolvente de ataque/release (anti-clic). */
  private play(steps: { freq: number; dur: number }[], volume: number): Promise<void> {
    return new Promise(resolve => {
      try {
        const ctx = this.audioCtx();
        const master = ctx.createGain();
        master.gain.value = volume;
        master.connect(ctx.destination);

        let t = ctx.currentTime + 0.01;
        let total = 0;
        for (const s of steps) {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = s.freq;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(1, t + 0.008);
          g.gain.setValueAtTime(1, t + Math.max(0.008, s.dur - 0.015));
          g.gain.exponentialRampToValueAtTime(0.0001, t + s.dur);
          osc.connect(g);
          g.connect(master);
          osc.start(t);
          osc.stop(t + s.dur + 0.02);
          t += s.dur;
          total += s.dur;
        }
        setTimeout(resolve, total * 1000 + 30);
      } catch {
        resolve();
      }
    });
  }

  /** Piso concedido: chirrido de dos tonos ascendentes (~160 ms). */
  startChirp(): Promise<void> {
    return this.play([
      { freq: 988, dur: 0.07 },
      { freq: 1319, dur: 0.09 },
    ], 0.25);
  }

  /** Fin de transmisión: blip descendente (~160 ms). */
  endBlip(): Promise<void> {
    return this.play([
      { freq: 1319, dur: 0.06 },
      { freq: 784, dur: 0.1 },
    ], 0.22);
  }

  /** Canal ocupado / denegado: bonk grave descendente (~270 ms). */
  deniedBonk(): Promise<void> {
    return this.play([
      { freq: 392, dur: 0.11 },
      { freq: 311, dur: 0.16 },
    ], 0.25);
  }
}
