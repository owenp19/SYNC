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

- LiveKit corre en `ws://localhost:7880` con clave `devkey`/`secret` (ver `infra/livekit/livekit.yaml`).
- El backend genera el token JWT: `POST /api/voice/token { channel_id, guest_id }`.
- La app se conecta con `livekit-client` y publica el micrófono solo al adquirir el piso.

## Floor Control (turno de voz)

1. Usuario presiona PTT → `POST /api/channels/{id}/floor/acquire`
2. Si el canal está libre → `granted: true`, la app publica el mic.
3. Si está ocupado → `409 Canal ocupado`, la UI muestra "Canal ocupado".
4. Mientras transmite, heartbeat cada 60 s → `POST /api/channels/{id}/floor/heartbeat` renueva `floor_expires_at` (TTL 5 min).
5. Al soltar PTT → `POST /api/channels/{id}/floor/release`, canal queda libre y se registra en historial / eventos.

Piso expirado se libera automáticamente al siguiente `acquire`. En SQLite local el `lockForUpdate` no es atómico; en producción (MySQL/Redis) sí.

Solo un usuario puede transmitir a la vez; el resto recibe el audio vía SFU.

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

## Próximos pasos

- [ ] Login/registro completo y gestión de usuarios
- [ ] CRUD de departamentos y canales privados
- [ ] Permisos por usuario/canal (escuchar/transmitir)
- [ ] Push-To-Talk end-to-end en dispositivo físico
- [ ] Canal de emergencia con prioridad (preemption)
- [ ] Indicador visual de "en vivo" y lista de usuarios conectados
- [ ] Historial y grabaciones de eventos de audio

