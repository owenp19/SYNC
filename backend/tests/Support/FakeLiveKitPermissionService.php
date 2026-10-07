<?php

namespace Tests\Support;

use App\Models\Channel;
use App\Services\LiveKitPermissionService;

/**
 * Fake verificable de LiveKit: no hace llamadas de red y registra cada
 * operación para que los tests puedan comprobar qué se pidió al servidor de voz.
 */
class FakeLiveKitPermissionService extends LiveKitPermissionService
{
    /** @var list<array{room: string, identity: string}> */
    public array $granted = [];

    /** @var list<array{room: string, identity: string}> */
    public array $revoked = [];

    /** @var list<array{room: string, identity: string}> */
    public array $removed = [];

    public bool $grantSucceeds = true;

    public function grantMicrophone(string $roomName, string $identity): bool
    {
        $this->granted[] = ['room' => $roomName, 'identity' => $identity];

        return $this->grantSucceeds;
    }

    public function revokeMicrophone(string $roomName, string $identity): bool
    {
        $this->revoked[] = ['room' => $roomName, 'identity' => $identity];

        return true;
    }

    public function removeParticipant(string $roomName, string $identity): bool
    {
        $this->removed[] = ['room' => $roomName, 'identity' => $identity];

        return true;
    }

    /** Simula que todas las salas de canal existentes están activas. */
    public function activeRoomNames(): array
    {
        return Channel::pluck('id')->map(fn ($id) => self::roomName((int) $id))->all();
    }

    public function wasRevoked(string $roomName, string $identity): bool
    {
        return in_array(['room' => $roomName, 'identity' => $identity], $this->revoked, true);
    }

    public function wasRemoved(string $roomName, string $identity): bool
    {
        return in_array(['room' => $roomName, 'identity' => $identity], $this->removed, true);
    }

    public function wasRemovedAnywhere(string $identity): bool
    {
        return collect($this->removed)->contains(fn ($call) => $call['identity'] === $identity);
    }
}
