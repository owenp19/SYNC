<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Services\ChannelAccessService;
use App\Services\FloorControlService;
use App\Services\LiveKitPermissionService;
use Illuminate\Http\Request;

class FloorController extends Controller
{
    public function __construct(
        private FloorControlService $floor,
        private LiveKitPermissionService $livekit,
        private ChannelAccessService $access,
    ) {}

    public function acquire(Request $request, Channel $channel)
    {
        $device = $request->user();

        if (! $this->access->canTransmit($device, $channel->id)) {
            return response()->json(['message' => 'No tienes permiso para transmitir en este canal.'], 403);
        }

        $operatorId = $device->current_operator_id;
        $result = $this->floor->acquire($channel, $device->id, $operatorId);

        if ($result['ok']) {
            $this->livekit->grantMicrophone("channel-{$channel->id}", "device-{$device->id}");
        }

        return response()->json([
            'granted' => $result['ok'],
            'message' => $result['message'],
            'transmission_id' => $result['transmission_id'],
        ], $result['ok'] ? 200 : 409);
    }

    public function release(Request $request, Channel $channel)
    {
        $device = $request->user();
        $ok = $this->floor->release($channel, $device->id, $request->input('transmission_id'));

        if ($ok) {
            $this->livekit->revokeMicrophone("channel-{$channel->id}", "device-{$device->id}");
        }

        return response()->json(['message' => $ok ? 'Canal libre.' : 'No posees el piso de este canal.'], $ok ? 200 : 409);
    }

    public function heartbeat(Request $request, Channel $channel)
    {
        $device = $request->user();
        $ok = $this->floor->heartbeat($channel, $device->id, $request->input('transmission_id'));

        if ($ok) {
            return response()->json(['message' => 'ok']);
        }

        $this->livekit->revokeMicrophone("channel-{$channel->id}", "device-{$device->id}");

        return response()->json(['message' => 'No posees el piso de este canal.'], 409);
    }
}
