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

    /** Usuario efectivo: login real → departamento elegido en el dispositivo → supervisor. */
    private function resolveUser(Request $request): ?\App\Models\User
    {
        if ($request->user()) return $request->user();
        $department = $request->input('department');
        if ($department) {
            $slug = \Illuminate\Support\Str::slug($department) . '@sync.local';
            $u = \App\Models\User::where('email', $slug)->first()
                ?? \App\Models\User::where('name', 'like', "%{$department}%")->first();
            if ($u) return $u;
        }

        return \App\Models\User::where('email', 'supervisor@sync.local')->first() ?? \App\Models\User::first();
    }

    public function acquire(Request $request, Channel $channel)
    {
        $user = $this->resolveUser($request);
        if (! $user) {
            return response()->json(['message' => 'No hay usuarios configurados.'], 503);
        }

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
        $user = $this->resolveUser($request);
        if (! $user) {
            return response()->json(['message' => 'No hay usuarios configurados.'], 503);
        }
        $this->floor->release($channel, $user->id);

        return response()->json(['message' => 'Canal libre.']);
    }

    public function heartbeat(Request $request, Channel $channel)
    {
        $user = $this->resolveUser($request);
        if (! $user) {
            return response()->json(['message' => 'No hay usuarios configurados.'], 503);
        }
        $locked = Channel::find($channel->id);
        if ($locked && $locked->occupied_by === $user->id) {
            $locked->update(['floor_expires_at' => now()->addSeconds(FloorControlService::FLOOR_TTL_SECONDS)]);

            return response()->json(['message' => 'ok']);
        }

        return response()->json(['message' => 'No posees el piso de este canal.'], 409);
    }
}
