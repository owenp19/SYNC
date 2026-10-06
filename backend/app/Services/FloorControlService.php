<?php

namespace App\Services;

use App\Models\AudioEvent;
use App\Models\Channel;
use App\Models\CommunicationHistory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class FloorControlService
{
    public static function ttlSeconds(): int
    {
        return (int) config('floor.ttl_seconds', 15);
    }

    /**
     * @return array{ok:bool, transmission_id:?string, message:string}
     */
    public function acquire(Channel $channel, int $deviceId, ?int $operatorId): array
    {
        return DB::transaction(function () use ($channel, $deviceId, $operatorId) {
            $locked = Channel::lockForUpdate()->find($channel->id) ?? $channel;

            $this->expireIfStale($locked);

            if ($locked->occupied_device_id !== null || $locked->occupied_by !== null) {
                AudioEvent::create(['device_id' => $deviceId, 'channel_id' => $channel->id, 'event' => 'denied']);

                return ['ok' => false, 'transmission_id' => null, 'message' => 'Canal ocupado.'];
            }

            $transmissionId = (string) Str::uuid();

            $locked->update([
                'occupied_device_id' => $deviceId,
                'occupied_operator_id' => $operatorId,
                'occupied_by' => $operatorId, // auditoría vía user del operador
                'floor_session_id' => $transmissionId,
                'floor_expires_at' => now()->addSeconds(self::ttlSeconds()),
            ]);

            CommunicationHistory::where('device_id', $deviceId)->where('channel_id', $channel->id)
                ->whereNull('ended_at')->update(['ended_at' => now()]);
            CommunicationHistory::create([
                'device_id' => $deviceId,
                'operator_id' => $operatorId,
                'user_id' => $operatorId,
                'channel_id' => $channel->id,
                'transmission_id' => $transmissionId,
                'started_at' => now(),
            ]);
            AudioEvent::create(['device_id' => $deviceId, 'channel_id' => $channel->id, 'event' => 'floor_acquired']);

            return ['ok' => true, 'transmission_id' => $transmissionId, 'message' => 'Canal disponible. Puede transmitir.'];
        });
    }

    public function release(Channel $channel, int $deviceId, ?string $transmissionId): bool
    {
        return DB::transaction(function () use ($channel, $deviceId, $transmissionId) {
            $locked = Channel::lockForUpdate()->find($channel->id) ?? $channel;

            if ($locked->occupied_device_id !== $deviceId) {
                return false;
            }
            // Si hay sesión de piso activa, la transmisión es obligatoria y debe coincidir.
            if ($locked->floor_session_id !== null && $locked->floor_session_id !== $transmissionId) {
                return false;
            }

            $locked->update([
                'occupied_device_id' => null,
                'occupied_operator_id' => null,
                'occupied_by' => null,
                'floor_session_id' => null,
                'floor_expires_at' => null,
            ]);

            CommunicationHistory::where('channel_id', $channel->id)
                ->where('device_id', $deviceId)
                ->whereNull('ended_at')
                ->when($transmissionId, fn ($q) => $q->where('transmission_id', $transmissionId))
                ->latest('id')->first()?->update(['ended_at' => now()]);

            AudioEvent::create(['device_id' => $deviceId, 'channel_id' => $channel->id, 'event' => 'floor_released']);

            return true;
        });
    }

    public function heartbeat(Channel $channel, int $deviceId, ?string $transmissionId): bool
    {
        return DB::transaction(function () use ($channel, $deviceId, $transmissionId) {
            $locked = Channel::lockForUpdate()->find($channel->id) ?? $channel;

            $this->expireIfStale($locked);

            if ($locked->occupied_device_id !== $deviceId) {
                return false;
            }
            if ($locked->floor_session_id !== null && $locked->floor_session_id !== $transmissionId) {
                return false;
            }

            $locked->update(['floor_expires_at' => now()->addSeconds(self::ttlSeconds())]);

            return true;
        });
    }

    public function expireIfStale(Channel $locked): bool
    {
        $occupied = $locked->occupied_device_id !== null || $locked->occupied_by !== null;
        if (! $occupied) {
            return false;
        }
        if ($locked->floor_expires_at === null || $locked->floor_expires_at->isFuture()) {
            return false;
        }

        $previousDevice = $locked->occupied_device_id;
        $transmission = $locked->floor_session_id;

        $locked->update([
            'occupied_device_id' => null,
            'occupied_operator_id' => null,
            'occupied_by' => null,
            'floor_session_id' => null,
            'floor_expires_at' => null,
        ]);

        CommunicationHistory::where('channel_id', $locked->id)
            ->when($previousDevice, fn ($q) => $q->where('device_id', $previousDevice))
            ->whereNull('ended_at')
            ->when($transmission, fn ($q) => $q->where('transmission_id', $transmission))
            ->latest('id')->first()?->update(['ended_at' => now()]);

        AudioEvent::create(['device_id' => $previousDevice, 'channel_id' => $locked->id, 'event' => 'floor_expired']);

        try {
            if ($previousDevice) {
                app(LiveKitPermissionService::class)->revokeMicrophone("channel-{$locked->id}", "device-{$previousDevice}");
            }
        } catch (\Throwable $e) {
            report($e);
        }

        return true;
    }
}
