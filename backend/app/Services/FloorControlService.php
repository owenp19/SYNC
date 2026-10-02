<?php

namespace App\Services;

use App\Models\AudioEvent;
use App\Models\Channel;
use App\Models\CommunicationHistory;
use Illuminate\Support\Facades\DB;

class FloorControlService
{
    /** Tiempo de vida del piso de voz (heartbeat). Si expira, el canal se libera. */
    public const FLOOR_TTL_SECONDS = 300; // 5 minutos

    public function acquire(Channel $channel, int $userId): bool
    {
        return DB::transaction(function () use ($channel, $userId) {
            $locked = Channel::lockForUpdate()->find($channel->id) ?? $channel;

            // Liberar piso huérfano: ocupado pero expirado
            if ($locked->occupied_by !== null && $locked->floor_expires_at !== null && $locked->floor_expires_at->isPast()) {
                $previous = $locked->occupied_by;
                $locked->update(['occupied_by' => null, 'floor_expires_at' => null]);
                AudioEvent::create(['user_id' => $previous, 'channel_id' => $channel->id, 'event' => 'floor_expired']);
            }

            if ($locked->occupied_by !== null && $locked->occupied_by !== $userId) {
                AudioEvent::create(['user_id' => $userId, 'channel_id' => $channel->id, 'event' => 'denied']);

                return false;
            }

            $locked->update([
                'occupied_by' => $userId,
                'floor_expires_at' => now()->addSeconds(self::FLOOR_TTL_SECONDS),
            ]);

            CommunicationHistory::updateOrCreate(
                ['user_id' => $userId, 'channel_id' => $channel->id, 'ended_at' => null],
                ['started_at' => now()]
            );
            AudioEvent::create(['user_id' => $userId, 'channel_id' => $channel->id, 'event' => 'floor_acquired']);

            return true;
        });
    }

    public function release(Channel $channel, int $userId): void
    {
        DB::transaction(function () use ($channel, $userId) {
            $locked = Channel::lockForUpdate()->find($channel->id) ?? $channel;

            if ($locked->occupied_by === $userId) {
                $locked->update(['occupied_by' => null, 'floor_expires_at' => null]);
                CommunicationHistory::where('user_id', $userId)->where('channel_id', $channel->id)
                    ->whereNull('ended_at')->latest()->first()?->update(['ended_at' => now()]);
                AudioEvent::create(['user_id' => $userId, 'channel_id' => $channel->id, 'event' => 'floor_released']);
            }
        });
    }
}
