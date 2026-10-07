import { Injectable } from '@angular/core';
import { environment } from '@env/environment';

/** Respuesta validada de GET /api/health. */
export interface ServerHealth {
  serverId: string;
  livekitPort: number;
  protocolVersion: number;
}

/**
 * Health check de un candidato a servidor SYNC.
 *
 * Encontrar un host en la red NO basta: solo se acepta si responde
 * service == "SYNC", status == "ok" y una versión de protocolo compatible.
 * Usa fetch (no HttpClient) para no pasar por los interceptores: nunca se
 * envía la credencial del Device a un host que todavía no está validado.
 */
@Injectable({ providedIn: 'root' })
export class ServerHealthClient {
  async check(host: string, apiPort: number, timeoutMs: number): Promise<ServerHealth | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `${environment.server.apiScheme}://${formatHost(host)}:${apiPort}/api/health`;
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      return parseHealth(await res.json());
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Valida la forma del health. Devuelve null si NO es un servidor SYNC compatible. */
export function parseHealth(body: any): ServerHealth | null {
  if (!body || body.service !== 'SYNC' || body.status !== 'ok') return null;
  if (Number(body.protocol_version) !== environment.server.protocolVersion) return null;
  if (typeof body.server_id !== 'string' || body.server_id === '') return null;
  return {
    serverId: body.server_id,
    livekitPort: Number(body.livekit_port) || environment.server.defaultLivekitPort,
    protocolVersion: Number(body.protocol_version),
  };
}

/** IPv6 necesita corchetes en una URL. */
export function formatHost(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}
