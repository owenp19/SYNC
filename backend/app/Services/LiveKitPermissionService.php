<?php

namespace App\Services;

use Agence104\LiveKit\RoomServiceClient;
use Livekit\ParticipantPermission;
use Livekit\TrackSource;

/**
 * Aplica, del lado del servidor, quién puede publicar audio en LiveKit.
 * El cliente nunca concede permisos de publicación por sí solo.
 *
 * Los métodos devuelven bool: quien los llama (p. ej. FloorController) debe
 * revertir su operación si el permiso no pudo aplicarse.
 */
class LiveKitPermissionService
{
    public function grantMicrophone(string $roomName, string $identity): bool
    {
        $perm = new ParticipantPermission;
        $perm->setCanSubscribe(true);
        $perm->setCanPublish(true);
        $perm->setCanPublishData(false);
        $perm->setCanPublishSources([TrackSource::MICROPHONE]);

        return $this->update($roomName, $identity, $perm);
    }

    public function revokeMicrophone(string $roomName, string $identity): bool
    {
        $perm = new ParticipantPermission;
        $perm->setCanSubscribe(true);
        $perm->setCanPublish(false);
        $perm->setCanPublishData(false);

        return $this->update($roomName, $identity, $perm);
    }

    private function update(string $roomName, string $identity, ParticipantPermission $perm): bool
    {
        try {
            $client = new RoomServiceClient(config('livekit.host'), config('livekit.api_key'), config('livekit.api_secret'));
            $client->updateParticipant($roomName, $identity, null, $perm);

            return true;
        } catch (\Throwable $e) {
            report($e);

            return false;
        }
    }
}
