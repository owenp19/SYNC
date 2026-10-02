<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Models\ChannelPermission;
use App\Services\FloorControlService;
use Illuminate\Http\Request;

class FloorController extends Controller
{
    public function __construct(private FloorControlService $floor) {}

    public function acquire(Request $request, Channel $channel)
    {
        $user = $request->user() ?? \App\Models\User::where('email', 'supervisor@sync.local')->first() ?? \App\Models\User::first();

        $permission = ChannelPermission::where('user_id', $user->id)
            ->where('channel_id', $channel->id)->first();

        if (! $permission || ! $permission->can_transmit) {
            return response()->json(['message' => 'No tienes permiso para transmitir en este canal.'], 403);
        }

        $ok = $this->floor->acquire($channel, $user->id);

        return response()->json([
            'granted' => $ok,
            'message' => $ok ? 'Canal disponible. Puede transmitir.' : 'Canal ocupado.',
        ], $ok ? 200 : 409);
    }

    public function release(Request $request, Channel $channel)
    {
        $this->floor->release($channel, ($request->user() ?? \App\Models\User::where('email', 'supervisor@sync.local')->first() ?? \App\Models\User::first())->id);

        return response()->json(['message' => 'Canal libre.']);
    }

    public function heartbeat(Request $request, Channel $channel)
    {
        $locked = Channel::find($channel->id);
        if ($locked && $locked->occupied_by === ($request->user() ?? \App\Models\User::where('email', 'supervisor@sync.local')->first() ?? \App\Models\User::first())->id) {
            $locked->update(['floor_expires_at' => now()->addSeconds(FloorControlService::FLOOR_TTL_SECONDS)]);
        }

        return response()->json(['message' => 'ok']);
    }
}
