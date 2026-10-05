<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Device;
use Illuminate\Http\Request;
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

    /** Genera/regenera el código de activación (6 dígitos, 24h, un solo uso). */
    public function generateCode(Device $device)
    {
        $code = (string) random_int(100000, 999999);

        $device->update([
            'activation_token_hash' => Hash::make($code),
            'activation_expires_at' => now()->addHours(24),
            'status' => $device->status === 'revoked' ? 'pending' : $device->status,
        ]);

        return response()->json(['code' => $code, 'expires_at' => $device->activation_expires_at]);
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
