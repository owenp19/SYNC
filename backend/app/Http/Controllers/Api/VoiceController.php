<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Models\ChannelPermission;
use App\Services\LiveKitTokenService;
use Illuminate\Http\Request;

class VoiceController extends Controller
{
    public function __construct(private LiveKitTokenService $tokens) {}

    public function token(Request $request)
    {
        $data = $request->validate([
            'channel_id' => 'required|integer|exists:channels,id',
            'guest_id' => 'nullable|string|max:64',
        ]);
        $user = $request->user() ?? $this->userByDepartment($request->input('department'));
        $channel = Channel::findOrFail($data['channel_id']);

        $permission = ChannelPermission::where('user_id', $user->id)
            ->where('channel_id', $channel->id)->first();

        if (! $permission || (! $permission->can_listen && ! $permission->can_transmit)) {
            return response()->json(['message' => 'No tienes acceso a este canal.'], 403);
        }

        return response()->json([
            'token' => $this->tokens->createToken($user->id, $channel->id, $user->name, $data['guest_id'] ?? null),
            'url' => config('livekit.host'),
            // Clave E2EE por canal: solo quien recibe este token (con permiso del canal) puede descifrar.
            'e2ee_key' => hash_hmac('sha256', "channel-{$channel->id}", config('livekit.api_secret')),
            'user_name' => $user->name,
        ]);
    }

    /** Modo sin login: el usuario corresponde al departamento que eligió el dispositivo. */
    private function userByDepartment(?string $department): ?\App\Models\User
    {
        if ($department) {
            $slug = \Illuminate\Support\Str::slug($department) . '@sync.local';
            $u = \App\Models\User::where('email', $slug)->first()
                ?? \App\Models\User::where('name', 'like', "%{$department}%")->first();
            if ($u) return $u;
        }

        return \App\Models\User::where('email', 'supervisor@sync.local')->first() ?? \App\Models\User::first();
    }
}
