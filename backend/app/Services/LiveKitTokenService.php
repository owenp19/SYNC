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
        // Identidad única por dispositivo: dos tablets del mismo usuario no se pisan
        $identity = $guestId ? "user-{$userId}-{$guestId}" : "user-{$userId}";
        $options->setIdentity($identity);
        $options->setName($userName);
        $options->setTtl(14400);

        $grant = new VideoGrant;
        $grant->setRoomName("channel-{$channelId}");
        $grant->setRoomJoin(true);
        $grant->setCanPublish(true);
        $grant->setCanSubscribe(true);

        $token = new AccessToken(config('livekit.api_key'), config('livekit.api_secret'));
        $token->init($options);
        $token->setGrant($grant);

        return $token->toJwt();
    }
}
