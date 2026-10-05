<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Services\ChannelAccessService;
use App\Services\LiveKitTokenService;
use Illuminate\Http\Request;

class VoiceController extends Controller
{
    public function __construct(private LiveKitTokenService $tokens, private ChannelAccessService $access) {}

    public function token(Request $request)
    {
        $data = $request->validate(['channel_id' => 'required|integer|exists:channels,id']);

        $device = $request->user();
        $channel = Channel::findOrFail($data['channel_id']);

        // can_listen requerido; departamento siempre desde el device, nunca del body
        if (! $this->access->canListen($device, $channel->id)) {
            return response()->json(['message' => 'No tienes acceso a este canal.'], 403);
        }

        return response()->json([
            'token' => $this->tokens->createToken($device->id, $channel->id, $device->name, $device->uuid),
            'url' => config('livekit.host'),
            'e2ee_key' => hash_hmac('sha256', "channel-{$channel->id}", config('livekit.api_secret')),
            'user_name' => $device->name,
            'can_transmit' => $this->access->canTransmit($device, $channel->id),
        ]);
    }
}
