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
| `npm run sync:server` | **PC como servidor LAN**: Laravel (0.0.0.0:8000) + scheduler + LiveKit + anuncio mDNS (reinicia LiveKit si cambia la IP) |
| `npm run sync:discover` | Solo el anuncio mDNS `SYNC-SERVER` (`_sync._tcp.local`) |
| `npm run sync:laravel` | Solo Laravel accesible desde la LAN (`--host=0.0.0.0 --port=8000`) |
| `npm run test:scripts` | Pruebas de los scripts de red del PC |

## Variables de entorno mobile

La app **no tiene ninguna IP escrita en el código**. `mobile/src/environments/environment*.ts` solo define puertos por defecto (8000 / 7880), el tipo de servicio DNS-SD (`_sync._tcp.`) y la versión de protocolo. La dirección real del servidor se descubre en tiempo de ejecución (ver la sección siguiente) y la expone una única fuente: `ServerConnectionService` (`apiBaseUrl`, `apiUrl`, `liveKitUrl`, `serverId`, `status$`).

## DESARROLLO LOCAL CON PC COMO SERVIDOR

En esta etapa el servidor de SYNC es **tu computador Windows** (Laravel + LiveKit + base de datos), y los teléfonos Android se conectan a él por la Wi-Fi local. La IP del PC puede cambiar (otra Wi-Fi, DHCP) sin recompilar la APK ni tocar código.

### Cómo encuentra la app al PC

```
Abrir SYNC
  → ¿hay lastKnownServer?  → health check (2,5 s) → responde → CONNECTED
  → si no responde          → discovery mDNS/DNS-SD (_sync._tcp.local, 5 s)
  → por cada candidato      → GET http://IP:8000/api/health
  → service=SYNC, status=ok, protocol_version=1 y server_id esperado → guardar lastKnownServer
  → conectar Laravel (device token existente) y LiveKit (token nuevo, URL nueva)
  → si nada responde        → SERVER_NOT_FOUND + reintentos con backoff 1-2-4-8-16-30 s
```

- **No se usa el nombre del Wi-Fi (SSID)** para nada: se descubre el *servicio* SYNC.
- **server_id**: cada instalación tiene un identificador estable (`php artisan sync:server-id`, guardado en `backend/storage/app/private/sync-server-id`). El teléfono guarda (cifrado) el server_id con el que se activó; si encuentra **otro** servidor SYNC no cambia solo: lo avisa y solo cambia con la acción técnica **Cambiar servidor**.
- **El token del Device no depende de la IP**: mismo server_id con otra IP → mismo Device (p. ej. Seguridad-01), sin login ni nueva activación.
- **Descubrir no autoriza**: el anuncio y `/api/health` solo dicen dónde está SYNC. Después siguen igual la autenticación del Device, los permisos por departamento y el Floor Control.
- Cambio de red durante la voz: se apaga el micrófono, la publicación y el heartbeat, se limpia el PTT local (nunca queda "TRANSMITIENDO"), se intenta `release` best-effort y se cierra la Room. Al volver el servidor se pide un **token LiveKit nuevo** y se conecta a la **nueva** URL; el Floor se vuelve a adquirir normalmente al pulsar PTT.
- Estados visibles (indicador discreto abajo): 🟢 Conectado · 🟠 Conectando…/Reconectando… · 🔴 Servidor SYNC no encontrado · Sin red Wi-Fi.
- No hay escaneo de toda la subred: mDNS/NSD es el método principal y la **configuración manual** es el respaldo (un barrido /24 sería lento, ruidoso y tampoco atraviesa el aislamiento de clientes).

### 1. Conectar PC y Android a la misma LAN

Ambos en la misma Wi-Fi (o el PC por cable en la misma red). En Windows marca la red como **Privada**: Configuración → Red e Internet → (tu red) → Tipo de perfil de red → *Privada*. (PowerShell admin: `Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private`).

### 2-4. Iniciar Laravel, LiveKit y el servicio de discovery

Todo junto (recomendado):

```bash
npm install          # en la raíz, una vez (instala multicast-dns)
npm run sync:server
```

Esto arranca:

| Proceso | Detalle |
|---|---|
| Laravel API | `php artisan serve --host=0.0.0.0 --port=8000` (accesible desde la LAN, no solo 127.0.0.1) |
| Scheduler | `php artisan schedule:work` (expiración de Floor, TTL 15 s) |
| LiveKit | `infra/livekit/bin/livekit-server.exe --config infra/livekit/livekit.yaml` |
| Discovery | anuncia `SYNC-SERVER-<NOMBRE-PC>` en `_sync._tcp.local` con TXT `apiPort`, `livekitPort`, `protocolVersion`, `serverId` |

El anunciador detecta solo la interfaz LAN válida (ignora loopback, 169.254.x.x y adaptadores virtuales Hyper-V/WSL/VirtualBox/VMware/Docker) y responde a cada teléfono con la IP de la interfaz de **su** subred. Cada 3 s revisa las IPs: si el PC cambia de Wi-Fi, re-anuncia la nueva dirección y **reinicia LiveKit** (LiveKit fija sus IPs ICE al arrancar). Si la detección eligiera un adaptador equivocado: `set SYNC_DISCOVERY_INTERFACE=Wi-Fi` antes de arrancar.

Por separado: `npm run sync:laravel`, `scripts\run-livekit.cmd` (o `npm run dev:infra` con Docker; entonces `npm run sync:server -- --no-livekit`) y `npm run sync:discover`. Con `sync:discover` suelto, si cambia la IP del PC hay que reiniciar LiveKit a mano (el script lo avisa).

Comprobación en el PC: `http://localhost:8000/api/health` debe devolver `{"service":"SYNC","status":"ok","protocol_version":1,"server_id":"SYNC-SERVER-…","livekit_port":7880}`.

### 5-6. Abrir SYNC y comprobar la detección

Abre la app: verás "Conectando…" un instante y después la radio (el indicador "Conectado" solo aparece al recuperarse de un corte). Para ver los detalles técnicos: **Configuración → Diagnóstico de red** (o el botón *Diagnóstico* del aviso "Servidor SYNC no encontrado"): modo AUTO/MANUAL, IP detectada, estado de API y LiveKit, server_id actual y esperado.

En la consola de desarrollo de la app (Chrome → `chrome://inspect`) aparecen logs `[SYNC server]` (Network changed, Last server failed, Starting discovery, SYNC server discovered, Health check OK, Server ID verified, API/LiveKit endpoint updated, Reconnecting). Nunca se imprimen tokens, claves, códigos de activación ni contraseñas.

### 7. Windows Firewall

Puertos REALES de este proyecto (`infra/livekit/livekit.yaml`: `port: 7880`, `rtc.udp_port: 7882`; `rtc.tcp_port` no está definido → valor por defecto de LiveKit 7881, el mismo que publica `infra/docker-compose.yml`):

| Servicio | Protocolo / puerto |
|---|---|
| Laravel API | TCP 8000 |
| LiveKit señalización (WebSocket) | TCP 7880 |
| LiveKit medios ICE/TCP (respaldo) | TCP 7881 |
| LiveKit medios WebRTC | UDP 7882 |
| Discovery mDNS / DNS-SD | UDP 5353 (multicast 224.0.0.251) |

Reglas solo para redes **privadas** (PowerShell como administrador):

```powershell
New-NetFirewallRule -DisplayName "SYNC Laravel API" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "SYNC LiveKit TCP" -Direction Inbound -Protocol TCP -LocalPort 7880,7881 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "SYNC LiveKit UDP" -Direction Inbound -Protocol UDP -LocalPort 7882 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "SYNC mDNS discovery" -Direction Inbound -Protocol UDP -LocalPort 5353 -Action Allow -Profile Private
```

Si Windows muestra el diálogo "¿Permitir acceso?" para `php.exe`, `node.exe` o `livekit-server.exe`, marca solo **Redes privadas**. Síntoma de firewall: desde el teléfono `http://IP-DEL-PC:8000/api/health` no carga aunque en el PC sí.

### 8. AP isolation / client isolation

Muchas Wi-Fi de invitados, hoteles o empresas activan *AP isolation*, *client isolation*, *guest isolation* o VLAN/firewall entre clientes: los dispositivos llegan a Internet pero **no se ven entre ellos**. SYNC no puede saltarse esa restricción: la app mostrará "No se encontró el servidor SYNC en esta red. Verifica que el teléfono y el computador estén en una red que permita comunicación entre dispositivos." Solución: usar una red sin aislamiento (router propio o punto de acceso del PC/teléfono) o pedir a TI que lo desactive para esa red.

### 9. Configuración manual (respaldo)

Diagnóstico de red → **Configuración manual** → Host/IP (p. ej. `192.168.1.37`), API Port (`8000`), LiveKit Port (`7880`) → Conectar. Se valida igual con `/api/health`; si es otra instalación SYNC pide confirmación explícita. Para volver al modo automático: **Buscar servidor nuevamente**.

### 10. Probar cambiando de Wi-Fi

Con `npm run sync:server` corriendo y la app en un canal: cambia el PC y los teléfonos a otra Wi-Fi. El PC re-anuncia su nueva IP y reinicia LiveKit; la app muestra "Reconectando…", redescubre el PC, valida el mismo server_id, actualiza API y LiveKit y vuelve a "Conectado" sin login, sin activación, sin recompilar y sin escribir IPs. (Ver las pruebas 1-5 al final de esta sección.)

### Pruebas manuales

1. **Misma Wi-Fi**: `npm run sync:server` → abrir SYNC → radio conectada; Diagnóstico muestra la IP del PC, API y LiveKit conectados.
2. **Cambiar PC + teléfonos a otra Wi-Fi**: con la app en un canal (y pulsando PTT durante el cambio): la transmisión se corta al instante, aparece "Reconectando…", luego "Conectado" con la IP nueva; el device sigue siendo el mismo y el PTT vuelve a funcionar.
3. **Servidor apagado**: Ctrl+C en `sync:server` → la app pasa a "Reconectando…" y luego "Servidor SYNC no encontrado" con *Reintentar*; reintentos espaciados (backoff). Al arrancarlo de nuevo vuelve sola.
4. **Wi-Fi con client isolation**: la app muestra "Servidor SYNC no encontrado" con el mensaje de red que no permite comunicación entre dispositivos; la configuración manual tampoco conectará (comprobación: `http://IP:8000/api/health` desde el navegador del teléfono no carga).
5. **Configuración manual**: Diagnóstico de red → Configuración manual con la IP que muestra el PC (`ipconfig`) → Conectar → modo MANUAL y radio conectada; *Buscar servidor nuevamente* vuelve a AUTO.

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

- El admin crea el Device (nombre + departamento) en el dashboard y genera un **código de 8 dígitos** (12 h, un solo uso; los códigos de 6 dígitos ya emitidos siguen siendo válidos).
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
3. Configurar en `mobile/src/environments/environment.prod.ts` el servidor público (https/wss) en lugar del descubrimiento LAN.
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

