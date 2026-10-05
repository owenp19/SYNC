<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DeviceController extends Controller
{
    /**
     * Activación única. Código generado por el admin, un solo uso, con expiración,
     * almacenado hasheado. Devuelve credencial del DEVICE (no de un empleado).
     */
    public function activate(Request $request)
    {
        $data = $request->validate(['code' => 'required|string|max:64']);

        $device = Device::whereNotNull('activation_token_hash')->get()
            ->first(fn ($d) => Hash::check($data['code'], $d->activation_token_hash));

        if (! $device || $device->status !== 'pending' && $device->status !== 'active') {
            return response()->json(['message' => 'Código inválido'], 422);
        }
        if (! $device->activation_expires_at || $device->activation_expires_at->isPast()) {
            return response()->json(['message' => 'Código expirado'], 422);
        }

        $device->update([
            'status' => 'active',
            'activated_at' => $device->activated_at ?? now(),
            'activation_token_hash' => null,
            'activation_expires_at' => null,
        ]);

        $token = $device->createToken('device')->plainTextToken;

        return response()->json([
            'token' => $token,
            'device' => $this->devicePayload($device),
        ]);
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
