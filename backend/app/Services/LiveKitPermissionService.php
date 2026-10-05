<?php

namespace App\Services;

use Agence104\LiveKit\RoomServiceClient;
use Livekit\ParticipantPermission;

/**
 * Aplica, del lado del servidor, quién puede publicar audio en LiveKit.
 * El cliente nunca concede permisos de publicación por sí solo.
 */
class LiveKitPermissionService
{
    public function grantMicrophone(string $roomName, string $identity): void
    {
        $perm = new ParticipantPermission;
        $perm->setCanSubscribe(true);
        $perm->setCanPublish(true);
        $perm->setCanPublishData(false);
        $perm->setCanPublishSources([\Livekit\TrackSource::MICROPHONE]);
        $this->update($roomName, $identity, $perm);
    }

    public function revokeMicrophone(string $roomName, string $identity): void
    {
        $perm = new ParticipantPermission;
        $perm->setCanSubscribe(true);
        $perm->setCanPublish(false);
        $perm->setCanPublishData(false);
        $this->update($roomName, $identity, $perm);
    }

    private function update(string $roomName, string $identity, ParticipantPermission $perm): void
    {
        try {
            $client = new RoomServiceClient(config('livekit.host'), config('livekit.api_key'), config('livekit.api_secret'));
            $client->updateParticipant($roomName, $identity, null, $perm);
        } catch (\Throwable $e) {
            // LiveKit puede no estar disponible en pruebas: nunca rompe el floor control.
            report($e);
        }
    }
}
