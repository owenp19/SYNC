<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    /**
     * Login del panel de administración: email + password (solo role=admin).
     * El departamento y rol siempre salen del usuario autenticado, nunca del cliente.
     */
    public function login(Request $request)
    {
        $data = $request->validate(['email' => 'required|email', 'password' => 'required']);
        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password) || $user->role !== 'admin') {
            return response()->json(['message' => 'Credenciales inválidas'], 401);
        }

        if (! $user->active) {
            return response()->json(['message' => 'Usuario desactivado'], 403);
        }

        return response()->json([
            'token' => $user->createToken('sync')->plainTextToken,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'employee_code' => $user->employee_code,
                'department' => $user->department?->name,
                'department_id' => $user->department_id,
                'role' => $user->role,
            ],
        ]);
    }

    public function me(Request $request)
    {
        $user = $request->user()->load('department');

        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'employee_code' => $user->employee_code,
            'department' => $user->department?->name,
            'department_id' => $user->department_id,
            'role' => $user->role,
        ]);
    }

    public function logout(Request $request)
    {
        if ($request->user()) {
            $request->user()->currentAccessToken()->delete();
        }

        return response()->json(['message' => 'Sesión cerrada']);
    }
}
