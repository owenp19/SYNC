<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class DeviceController extends Controller
{
    /**
     * Activación única. Código generado por el admin, un solo uso, con expiración,
     * almacenado hasheado. Devuelve credencial del DEVICE (no de un empleado).
     *
     * La búsqueda es O(1): se indexa por HMAC del código (activation_lookup) y
     * solo se ejecuta bcrypt cuando hay coincidencia exacta. El consumo del
     * código es atómico (UPDATE condicional) para impedir doble uso concurrente.
     */
    public function activate(Request $request)
    {
        $data = $request->validate(['code' => 'required|string|max:64']);

        $device = Device::where('activation_lookup', self::codeLookup($data['code']))->first();

        if (! $device || ! Hash::check($data['code'], (string) $device->activation_token_hash)) {
            return response()->json(['message' => 'Código inválido'], 422);
        }
        if (! in_array($device->status, ['pending', 'active'], true)) {
            return response()->json(['message' => 'Código inválido'], 422);
        }
        if (! $device->activation_expires_at || $device->activation_expires_at->isPast()) {
            return response()->json(['message' => 'Código expirado'], 422);
        }

        // Consumo atómico del código: solo una petición puede ganar, incluso
        // con peticiones concurrentes (la condición va en el propio UPDATE).
        $consumed = Device::where('id', $device->id)
            ->where('activation_lookup', self::codeLookup($data['code']))
            ->whereNotNull('activation_token_hash')
            ->where('activation_expires_at', '>', now())
            ->whereIn('status', ['pending', 'active'])
            ->update([
                'status' => 'active',
                'activated_at' => $device->activated_at ?? now(),
                'activation_token_hash' => null,
                'activation_lookup' => null,
                'activation_expires_at' => null,
            ]);

        if ($consumed !== 1) {
            return response()->json(['message' => 'Código ya utilizado'], 422);
        }

        $token = $device->createToken('device')->plainTextToken;

        return response()->json([
            'token' => $token,
            'device' => $this->devicePayload($device->refresh()),
        ]);
    }

    /** Huella indexable del código de activación (no reversible sin la APP_KEY). */
    public static function codeLookup(string $code): string
    {
        return hash_hmac('sha256', $code, (string) config('app.key'));
    }

    public function me(Request $request)
    {
        return response()->json($this->devicePayload($request->user()->load(['department', 'currentOperator'])));
    }

    /** Empleados del departamento del device: posibles operadores del turno. */
    public function operators(Request $request)
    {
        $device = $request->user();

        return User::where('department_id', $device->department_id)
            ->where('role', 'employee')
            ->where('active', true)
            ->orderBy('name')
            ->get(['id', 'name']);
    }

    /** Selecciona el operador actual. Nunca determina permisos. */
    public function setOperator(Request $request)
    {
        $data = $request->validate(['operator_id' => 'nullable|integer|exists:users,id']);

        $device = $request->user();

        $data['operator_id'] ??= null;

        if ($data['operator_id']) {
            $op = User::find($data['operator_id']);
            if (! $op || $op->department_id !== $device->department_id || $op->role !== 'employee' || ! $op->active) {
                return response()->json(['message' => 'Operador inválido para este dispositivo'], 422);
            }
        }

        $device->update(['current_operator_id' => $data['operator_id']]);

        return response()->json($this->devicePayload($device->load(['department', 'currentOperator'])));
    }

    private function devicePayload(Device $device): array
    {
        return [
            'id' => $device->id,
            'name' => $device->name,
            'department' => $device->department?->name,
            'department_id' => $device->department_id,
            'status' => $device->status,
            'operator' => $device->currentOperator ? ['id' => $device->currentOperator->id, 'name' => $device->currentOperator->name] : null,
        ];
    }
}
