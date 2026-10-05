<?php

return [
    /* TTL del piso PTT en segundos. Si un dispositivo deja de enviar heartbeats
       antes de que expire, el canal se libera automáticamente. */
    'ttl_seconds' => (int) env('FLOOR_TTL_SECONDS', 15),

    /* Intervalo esperado de heartbeats del dispositivo que transmite. */
    'heartbeat_seconds' => (int) env('FLOOR_HEARTBEAT_SECONDS', 5),
];
