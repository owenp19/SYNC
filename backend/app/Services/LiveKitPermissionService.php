<?php

namespace App\Services;

use Agence104\LiveKit\RoomServiceClient;
use Livekit\ParticipantPermission;
use Livekit\TrackSource;

/**
 * Punto ÚNICO de acceso a la API de salas de LiveKit (RoomService).
 *
 * Aplica, del lado del servidor, quién puede publicar audio y quién sigue
 * conectado a cada sala. El cliente nunca concede permisos por sí solo y los
 * controllers no llaman al SDK directamente.
 *
 * Convenciones (no cambiar: el cliente y los tokens dependen de ellas):
 * - sala:      channel-{channelId}
 * - identidad: device-{deviceId}
 *
 * Los métodos devuelven bool: quien los llama (p. ej. FloorController) debe
 * revertir su operación si el permiso no pudo aplicarse.
 */
class LiveKitPermissionService
{
    public static function roomName(int $channelId): string
    {
        return "channel-{$channelId}";
    }

    public static function identity(int $deviceId): string
    {
        return "device-{$deviceId}";
    }

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

    /**
     * Expulsa un participante de una sala. Si el participante no está
     * conectado se considera éxito (el objetivo, que no esté, ya se cumple).
     */
    public function removeParticipant(string $roomName, string $identity): bool
    {
        try {
            $this->client()->removeParticipant($roomName, $identity);

            return true;
        } catch (\Throwable $e) {
            if ($this->isNotFound($e)) {
                return true;
            }
            report($e);

            return false;
        }
    }

    /**
     * Nombres de las salas de canal activas en LiveKit en este momento.
     *
     * @return list<string>
     */
    public function activeRoomNames(): array
    {
        try {
            $rooms = $this->client()->listRooms()->getRooms();
        } catch (\Throwable $e) {
            report($e);

            return [];
        }

        $names = [];
        foreach ($rooms as $room) {
            if (str_starts_with($room->getName(), 'channel-')) {
                $names[] = $room->getName();
            }
        }

        return $names;
    }

    /** Expulsa al device de TODAS las salas de canal activas. */
    public function disconnectDeviceEverywhere(int $deviceId): void
    {
        $identity = self::identity($deviceId);
        foreach ($this->activeRoomNames() as $roomName) {
            $this->removeParticipant($roomName, $identity);
        }
    }

    protected function client(): RoomServiceClient
    {
        return new RoomServiceClient(config('livekit.host'), config('livekit.api_key'), config('livekit.api_secret'));
    }

    private function update(string $roomName, string $identity, ParticipantPermission $perm): bool
    {
        try {
            $this->client()->updateParticipant($roomName, $identity, null, $perm);

            return true;
        } catch (\Throwable $e) {
            report($e);

            return false;
        }
    }

    private function isNotFound(\Throwable $e): bool
    {
        $message = strtolower($e->getMessage());

        return str_contains($message, 'not_found') || str_contains($message, 'not found') || str_contains($message, 'does not exist');
    }
}
