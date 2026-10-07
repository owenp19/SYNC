<?php

return [
    /*
    | Versión del protocolo cliente ↔ servidor SYNC. La app solo acepta
    | servidores cuya versión entienda (ver GET /api/health).
    */
    'protocol_version' => 1,

    /*
    | Identificador estable de ESTA instalación de SYNC. Si se deja vacío se
    | genera una sola vez y se guarda en storage/app/private/sync-server-id.
    | Permite que un teléfono reconozca "su" servidor aunque cambie la IP LAN
    | y que no se conecte por error a otra instalación SYNC de la misma red.
    */
    'server_id' => env('SYNC_SERVER_ID'),

    /*
    | Puerto de señalización de LiveKit que deben usar los teléfonos
    | (infra/livekit/livekit.yaml → port). Se publica en /api/health.
    */
    'livekit_public_port' => (int) env('LIVEKIT_PUBLIC_PORT', 7880),
];
