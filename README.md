# SYNC — Radio Digital Empresarial (PTT)

Plataforma de comunicación empresarial tipo radio digital con Push-To-Talk, canales privados por departamento y audio en tiempo real vía WebRTC (LiveKit).

## Arquitectura

```
Celular ──► App SYNC (Ionic/Angular/Capacitor)
                 │ REST (Laravel API)  +  WebRTC (LiveKit SFU)
            Tu computador / VPS
        ┌────────┴─────────┐
   Laravel API        LiveKit Server
   (usuarios,        (audio, SFU,
    canales,          salas = canales)
    permisos,
    floor control)
        │
      MySQL
```

- **Backend**: Laravel 13 + Sanctum, MySQL. Emite tokens JWT para LiveKit y controla el turno de voz (floor control).
- **Voz**: LiveKit (SFU Open Source). Cada canal es una sala `channel-{id}`.
- **Mobile**: Ionic 9 + Angular 22 (standalone), Capacitor 8 → APK Android.

## Estructura

```
SYNC/
├── mobile/   # App Ionic Angular
├── backend/  # API Laravel
├── infra/    # docker-compose, config LiveKit, binario LiveKit (bin/), nginx
├── scripts/  # dev.js, run-livekit.cmd (automatización de arranque)
└── docs/
```

## Scripts (raíz)

| comando | acción |
|---|---|
| `npm run dev` | Backend + Mobile + LiveKit |
| `npm run dev:backend` | Solo API Laravel |
| `npm run dev:mobile` | Solo Ionic dev server |
| `npm run dev:infra` | Docker MySQL + LiveKit |
| `npm run build:mobile` | Build producción Ionic |
| `npm run sync:android` | cap sync android |

## Variables de entorno mobile

`mobile/src/environments/environment.ts` usa `LAN_IP = 10.156.185.51`. Cambiala a la IP de tu PC cuando cambie de red para probar desde celular físico.

## Instalación

### Desarrollo completo (un solo comando)
```bash
npm run dev
```
Levanta backend (Laravel), mobile (ng serve) y LiveKit Server local.
Requiere: PHP 8.3+, Composer, Node 22+, livekit-server.exe en `infra/livekit/bin/`.
Sin Docker se usa el binario local de LiveKit (`scripts/run-livekit.cmd`); con Docker se usa `dev:infra`.

### 1. Infraestructura (opcional, con Docker)
```bash
cd infra
docker compose up -d
```

### 2. Backend Laravel
```bash
cd backend
composer install
php artisan migrate --seed   # crea canales, departamentos y usuario de prueba
php artisan serve            # http://localhost:8000
```

### 3. App móvil
```bash
cd mobile
npm install
npm run build
npx cap sync
npx cap open android
```

## Configuración WebRTC / LiveKit

- LiveKit corre en `ws://localhost:7880`; las claves están en `infra/livekit/livekit.yaml` y deben coincidir con `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` del `backend/.env`. En producción se genera un par nuevo (nunca el de desarrollo).
- El backend genera el token JWT: `POST /api/voice/token { channel_id }` (solo si el departamento del device tiene `can_listen` en el canal).
- La app se conecta con `livekit-client` y publica el micrófono solo al adquirir el piso (el permiso lo concede el backend, server-side, nunca el cliente).

## Floor Control (turno de voz)

1. Usuario presiona PTT → `POST /api/channels/{id}/floor/acquire` (requiere `can_transmit` del departamento).
2. Si el canal está libre → `granted: true` + `transmission_id`, el backend habilita el mic en LiveKit y la app reproduce el chirrido de radio antes de abrir el mic.
3. Si está ocupado → `409 Canal ocupado` (bonk grave en la app).
4. Si LiveKit no puede conceder el micrófono → el backend revierte el piso (`502`, el canal NO queda ocupado).
5. Mientras transmite, heartbeat cada **5 s** → `POST /api/channels/{id}/floor/heartbeat` renueva `floor_expires_at` (**TTL 15 s**).
6. Fail-safe del cliente: 2 heartbeats fallidos consecutivos (o un 409) → mic apagado, release best-effort y aviso en la UI.
7. Al soltar PTT → `POST /api/channels/{id}/floor/release` (con `transmission_id` obligatorio), canal libre y se registra en historial/eventos.

Expiración server-side real: el comando `floor:expire-stale` corre cada **30 s** vía Laravel Scheduler (en dev lo lanza `npm run dev` con `schedule:work`; en producción, cron cada minuto con `schedule:run` o un worker de `schedule:work`). No depende del polling del frontend.

Solo un device puede transmitir a la vez; el resto recibe el audio vía SFU.

## Activación y transferencia de dispositivos

- El admin crea el Device (nombre + departamento) en el dashboard y genera un **código de 6 dígitos** (24 h, un solo uso).
- En el celular: abrir SYNC → escribir el código → el device queda activado (sin login, credencial guardada cifrada con Android Keystore).
- **Transferir a otro teléfono**: dashboard → Dispositivos → "Transferir" → revoca el token actual, invalida códigos anteriores y emite un código nuevo. Solo el teléfono nuevo funciona después.
- Generar código para un device activo está bloqueado: siempre se usa "Transferir".

## Permisos por departamento

Dashboard → **Permisos**: matriz departamento × canal con `can_listen` / `can_transmit`. Los permisos son del DEPARTAMENTO, nunca del empleado. Un device solo recibe en `GET /api/channels` los canales donde su departamento tiene `can_listen = true`.

## Flujo de canales (ejemplo hotel)

| Canal | Departamento |
|-------|--------------|
| 1 | Recepción |
| 2 | Mantenimiento |
| 3 | Seguridad |
| 4 | Ama de llaves |
| 5 | Emergencias |

## Pantallas

- **Welcome** (`/welcome`, ruta por defecto) — logo, hero con pill, feature cards, carrusel de fondos automático, dots sincronizados, animación entrada/salida.
- **Login** (`/auth/login`) — solo para la parte administrativa.
- **Channels** (`/channels`) — lista de canales (acceso libre para usuarios finales).
- **Push-To-Talk** (`/talk/:id`) — PTT con floor control, heartbeat y audio WebRTC (LiveKit).
- **Preloader global** — spinner con logo centrado durante la carga inicial.

## Migración a VPS

1. Subir `backend` y `infra` a un servidor Linux (Ubuntu).
2. Configurar dominio + SSL (Nginx + Certbot) → URL `https://api.tudominio.com`, `wss://livekit.tudominio.com`.
3. Actualizar `mobile/src/environments/environment.prod.ts` con esas URLs.
4. Cambiar `LIVEKIT_API_KEY/SECRET` y claves de producción.

## Estado actual y próximos pasos

Implementado:

- [x] Radio SIN login para trabajadores (activación por código de un solo uso)
- [x] Login administrativo (dashboard: asignaciones, dispositivos, permisos, auditoría)
- [x] Floor control con TTL 15 s + heartbeat 5 s + barrido server-side cada 30 s
- [x] Permisos por departamento (matriz admin: escuchar/transmitir por canal)
- [x] Transferencia de dispositivos (reset: mata el token anterior)
- [x] Beeps de radio reales (chirrido/blip/bonk) + fail-safe de heartbeat
- [x] Credencial del device cifrada (Android Keystore)

Pendiente (siguiente fase):

- [ ] Radio siempre conectado / background Android (foreground service)
- [ ] Canal de emergencia con prioridad (preemption)
- [ ] Indicador visual de "en vivo" y lista de usuarios conectados
- [ ] Historial y grabaciones de eventos de audio
- [ ] Migración a VPS (ver arriba) para uso fuera de la WiFi local

