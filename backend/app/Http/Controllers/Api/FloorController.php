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
            // Si LiveKit no puede conceder el micrÃ³fono, el Floor NO puede quedar ocupado:
            // se revierte la adquisiciÃ³n para no bloquear el canal.
            if (! $this->livekit->grantMicrophone(LiveKitPermissionService::roomName($channel->id), LiveKitPermissionService::identity($device->id))) {
                $this->floor->release($channel, $device->id, $result['transmission_id']);

                return response()->json([
                    'granted' => false,
                    'message' => 'No se pudo habilitar el micrÃ³fono en el servidor de voz. Intenta de nuevo.',
                    'transmission_id' => null,
                ], 502);
            }
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
            $this->livekit->revokeMicrophone(LiveKitPermissionService::roomName($channel->id), LiveKitPermissionService::identity($device->id));
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

        $this->livekit->revokeMicrophone(LiveKitPermissionService::roomName($channel->id), LiveKitPermissionService::identity($device->id));

        return response()->json(['message' => 'No posees el piso de este canal.'], 409);
    }
}
