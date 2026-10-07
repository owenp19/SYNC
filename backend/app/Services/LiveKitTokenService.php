<?php

namespace App\Services;

use Agence104\LiveKit\AccessToken;
use Agence104\LiveKit\AccessTokenOptions;
use Agence104\LiveKit\VideoGrant;

class LiveKitTokenService
{
    public function createToken(int $userId, int $channelId, string $userName, ?string $guestId = null): string
    {
        $options = new AccessTokenOptions;
        // Identidad por DEVICE: dos celulares del mismo departamento no se pisan
        $identity = "device-{$userId}";
        $options->setIdentity($identity);
        $options->setName($userName);
        // TTL corto: el token solo sirve para ENTRAR a la sala. Una vez conectado,
        // LiveKit renueva la sesión por sí mismo; así un device revocado/expulsado
        // no puede reutilizar un JWT viejo para volver a entrar durante horas.
        $options->setTtl(600);

        $grant = new VideoGrant;
        $grant->setRoomName("channel-{$channelId}");
        $grant->setRoomJoin(true);
        // Por defecto solo escucha. Publicar micrófono requiere haber adquirido el Floor
        // y el backend lo habilita con ParticipantPermission server-side.
        $grant->setCanPublish(false);
        $grant->setCanSubscribe(true);

        $token = new AccessToken(config('livekit.api_key'), config('livekit.api_secret'));
        $token->init($options);
        $token->setGrant($grant);

        return $token->toJwt();
    }
}
