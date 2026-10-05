<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use App\Models\Device;

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

        $device->update(['last_seen_at' => now()]);

        return $next($request);
    }
}
