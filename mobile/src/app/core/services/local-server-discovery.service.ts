import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { mDNS } from '@devioarts/capacitor-mdns';
import { environment } from '@env/environment';

/** Candidato encontrado en la LAN. Todavía NO es confiable: falta el health check. */
export interface DiscoveredServer {
  host: string;
  apiPort: number;
  livekitPort?: number;
  serverId?: string;
  name?: string;
}

/**
 * Abstracción del descubrimiento local del servidor SYNC.
 * La app depende de esta clase, no de una biblioteca concreta de mDNS.
 */
export abstract class LocalServerDiscoveryService {
  /** Busca servidores SYNC en la LAN durante como máximo `timeoutMs`. Nunca lanza. */
  abstract discover(timeoutMs: number): Promise<DiscoveredServer[]>;
}

/**
 * Implementación por defecto:
 * - Android/iOS: DNS-SD nativo (Android NSD) vía @devioarts/capacitor-mdns,
 *   servicio `_sync._tcp.` anunciado por `npm run sync:discover` en el PC.
 * - Navegador (ng serve en el PC): el propio host desde el que se sirve la app.
 *
 * El TXT (apiPort/livekitPort/serverId) es solo orientativo porque Android NSD
 * no siempre lo expone: la autoridad final es GET /api/health.
 */
@Injectable({ providedIn: 'root' })
export class MdnsLocalServerDiscoveryService extends LocalServerDiscoveryService {
  async discover(timeoutMs: number): Promise<DiscoveredServer[]> {
    if (!Capacitor.isNativePlatform()) {
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      return host ? [{ host, apiPort: environment.server.defaultApiPort }] : [];
    }

    try {
      const res = await mDNS.discover({ type: environment.server.serviceType, timeout: timeoutMs });
      return toCandidates(res?.services ?? []);
    } catch {
      return [];
    }
  }
}

/** Normaliza servicios mDNS a candidatos IPv4 únicos (host:puerto). */
export function toCandidates(services: { name?: string; port?: number; hosts?: string[]; txt?: Record<string, string> }[]): DiscoveredServer[] {
  const seen = new Set<string>();
  const out: DiscoveredServer[] = [];
  for (const s of services) {
    const txt = s.txt ?? {};
    const apiPort = Number(txt['apiPort']) || Number(s.port) || environment.server.defaultApiPort;
    for (const host of s.hosts ?? []) {
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('169.254.') || host.startsWith('127.')) continue;
      const key = `${host}:${apiPort}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        host,
        apiPort,
        livekitPort: Number(txt['livekitPort']) || undefined,
        serverId: txt['serverId'] || undefined,
        name: s.name,
      });
    }
  }
  return out;
}
