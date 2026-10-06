<?php

namespace App\Http\Middleware;

use App\Models\Device;
use Closure;
use Illuminate\Http\Request;

class ResolveDevice
{
    public function handle(Request $request, Closure $next)
    {
        $device = $request->user();

        if (! $device instanceof Device) {
            return response()->json(['message' => 'Dispositivo no autenticado'], 401);
        }

        if ($device->status !== 'active') {
            return response()->json(['message' => 'Este dispositivo ya no está autorizado. Contacte al administrador.'], 403);
        }

        // Una escritura por minuto como máximo: actualizar last_seen_at en cada
        // petición duplicaría la carga de escritura de la BD bajo polling intenso.
        if ($device->last_seen_at === null || $device->last_seen_at->diffInSeconds(now()) >= 60) {
            $device->update(['last_seen_at' => now()]);
        }

        return $next($request);
    }
}
