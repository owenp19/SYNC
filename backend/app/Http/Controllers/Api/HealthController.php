<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ServerIdentity;
use Illuminate\Http\JsonResponse;

/**
 * Health check público y ligero para el descubrimiento en LAN.
 *
 * Solo dice "aquí hay un servidor SYNC" y cómo hablar con su LiveKit.
 * NO devuelve secretos, tokens ni información de base de datos, y NO
 * concede identidad de Device, permisos, Floor ni acceso administrativo.
 */
class HealthController extends Controller
{
    public function __invoke(ServerIdentity $identity): JsonResponse
    {
        return response()->json([
            'service' => 'SYNC',
            'status' => 'ok',
            'protocol_version' => (int) config('sync.protocol_version'),
            'server_id' => $identity->serverId(),
            'livekit_port' => (int) config('sync.livekit_public_port'),
        ])->header('Cache-Control', 'no-store');
    }
}
