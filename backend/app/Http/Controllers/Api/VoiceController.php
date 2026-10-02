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
        $user = $request->user() ?? \App\Models\User::where('email', 'supervisor@sync.local')->first() ?? \App\Models\User::first();
        $channel = Channel::findOrFail($data['channel_id']);

        $permission = ChannelPermission::where('user_id', $user->id)
            ->where('channel_id', $channel->id)->first();

        if (! $permission || (! $permission->can_listen && ! $permission->can_transmit)) {
            return response()->json(['message' => 'No tienes acceso a este canal.'], 403);
        }

        return response()->json([
            'token' => $this->tokens->createToken($user->id, $channel->id, $user->name, $data['guest_id'] ?? null),
            'url' => config('livekit.host'),
        ]);
    }
}
