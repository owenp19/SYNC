<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;

class EnsureAdmin
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();
        if (! $user || ! $user instanceof User) {
            return response()->json(['message' => 'No autenticado'], 401);
        }
        if ($user->role !== 'admin') {
            return response()->json(['message' => 'Acceso solo para administradores'], 403);
        }

        return $next($request);
    }
}
