<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Device;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AdminDeviceController extends Controller
{
    public function index()
    {
        return Device::with('department', 'currentOperator')->orderBy('name')->get()->map(fn ($d) => [
            'id' => $d->id,
            'name' => $d->name,
            'department_id' => $d->department_id,
            'department_name' => $d->department?->name,
            'status' => $d->status,
            'activated_at' => $d->activated_at,
            'last_seen_at' => $d->last_seen_at,
            'operator' => $d->currentOperator?->name,
        ]);
    }

    public function create(Request $r)
    {
        $data = $r->validate([
            'name' => 'required|string|max:255',
            'department_id' => 'required|integer|exists:departments,id',
        ]);

        $device = Device::create([
            'uuid' => (string) Str::uuid(),
            'name' => $data['name'],
            'department_id' => $data['department_id'],
            'status' => 'pending',
        ]);

        return response()->json($device, 201);
    }

    /**
     * Genera el código de activación (6 dígitos, 24h, un solo uso).
     * Solo para devices pendientes o revocados: para un device ACTIVO hay que
     * usar reset() (RESET/TRANSFER), que además mata el token del teléfono anterior.
     */
    public function generateCode(Device $device)
    {
        if ($device->status === 'active') {
            return response()->json([
                'message' => 'El dispositivo ya está activo. Usa "Transferir" (reset) para moverlo a otro teléfono.',
            ], 422);
        }

        $code = (string) random_int(100000, 999999);

        $device->update([
            'activation_token_hash' => Hash::make($code),
            'activation_lookup' => DeviceController::codeLookup($code),
            'activation_expires_at' => now()->addHours(24),
            'status' => $device->status === 'revoked' ? 'pending' : $device->status,
        ]);

        return response()->json(['code' => $code, 'expires_at' => $device->activation_expires_at]);
    }

    /**
     * RESET / TRANSFER DEVICE: mueve la identidad del device a otro teléfono.
     * - Revoca TODOS los tokens existentes (el teléfono anterior deja de funcionar).
     * - Limpia el operador del turno e invalida cualquier código anterior.
     * - Emite un código nuevo de un solo uso y deja el device en estado pending.
     */
    public function reset(Device $device)
    {
        $code = (string) random_int(100000, 999999);
        $expiresAt = now()->addHours(24);

        DB::transaction(function () use ($device, $code, $expiresAt) {
            $device->tokens()->delete();
            $device->update([
                'status' => 'pending',
                'current_operator_id' => null,
                'activation_token_hash' => Hash::make($code),
                'activation_lookup' => DeviceController::codeLookup($code),
                'activation_expires_at' => $expiresAt,
                'activated_at' => null,
                'revoked_at' => null,
            ]);
        });

        return response()->json(['code' => $code, 'expires_at' => $expiresAt]);
    }

    public function revoke(Device $device)
    {
        $device->update(['status' => 'revoked', 'revoked_at' => now()]);
        // Borra credenciales existentes → revocación inmediata
        $device->tokens()->delete();

        return response()->json(['message' => 'Dispositivo revocado']);
    }

    public function reassign(Request $r, Device $device)
    {
        $data = $r->validate(['department_id' => 'required|integer|exists:departments,id']);
        $device->update(['department_id' => $data['department_id'], 'current_operator_id' => null]);

        return response()->json($device->load('department'));
    }
}
