<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Services\DeviceActivationCodeService;
use App\Services\DeviceSessionService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AdminDeviceController extends Controller
{
    public function __construct(
        private DeviceSessionService $sessions,
        private DeviceActivationCodeService $codes,
    ) {}

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
     * Genera el código de activación (8 dígitos, 12 h, un solo uso, lookup único).
     * Solo para devices pendientes o revocados: para un device ACTIVO hay que
     * usar reset() (RESET/TRANSFER), que además mata la sesión del teléfono anterior.
     */
    public function generateCode(Device $device)
    {
        if ($device->status === 'active') {
            return response()->json([
                'message' => 'El dispositivo ya está activo. Usa "Transferir" (reset) para moverlo a otro teléfono.',
            ], 422);
        }

        $issued = $this->codes->issue($device, [
            'status' => $device->status === 'revoked' ? 'pending' : $device->status,
        ]);

        return response()->json($issued);
    }

    /**
     * RESET / TRANSFER DEVICE: mueve la identidad del device a otro teléfono.
     * 1) Termina la sesión activa del teléfono anterior: pierde tokens, Floor,
     *    micrófono y es expulsado de LiveKit; se limpia el operador del turno.
     * 2) Emite un código nuevo de un solo uso (invalida cualquier código anterior)
     *    y deja el device en estado pending.
     */
    public function reset(Device $device)
    {
        $this->sessions->terminateDeviceSession($device, 'device_reset');

        $issued = $this->codes->issue($device, [
            'status' => 'pending',
            'current_operator_id' => null,
            'activated_at' => null,
            'revoked_at' => null,
        ]);

        return response()->json($issued);
    }

    /**
     * Revocación inmediata: primero el estado (nuevas peticiones → 403) y luego
     * la terminación de la sesión activa (tokens, Floor, micrófono, LiveKit).
     */
    public function revoke(Device $device)
    {
        $device->update([
            'status' => 'revoked',
            'revoked_at' => now(),
            'activation_token_hash' => null,
            'activation_lookup' => null,
            'activation_expires_at' => null,
        ]);

        $this->sessions->terminateDeviceSession($device, 'device_revoked');

        return response()->json(['message' => 'Dispositivo revocado']);
    }

    /**
     * Reasignación de departamento: se cambia el departamento y después se corta
     * la sesión de voz anterior (Floor, micrófono, salas LiveKit, operador).
     * La credencial Sanctum se conserva: el device vuelve a conectar y obtiene
     * tokens de voz según los permisos del NUEVO departamento.
     */
    public function reassign(Request $r, Device $device)
    {
        $data = $r->validate(['department_id' => 'required|integer|exists:departments,id']);

        $device->update(['department_id' => $data['department_id'], 'current_operator_id' => null]);

        $this->sessions->terminateDeviceSession($device, 'device_reassigned', revokeTokens: false);

        return response()->json($device->fresh()->load('department'));
    }
}
