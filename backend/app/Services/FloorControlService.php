<?php

namespace App\Services;

use App\Models\AudioEvent;
use App\Models\Channel;
use App\Models\CommunicationHistory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Floor Control (un solo transmisor por canal).
 *
 * Regla de concurrencia: TODA modificación del estado de piso se hace dentro de
 * DB::transaction sobre una fila obtenida con lockForUpdate() y releída en ese
 * momento. Nunca se escribe sobre un modelo Channel cargado previamente, que
 * podría estar obsoleto (p. ej. otro device adquirió el canal entretanto).
 *
 * Las llamadas a LiveKit se hacen DESPUÉS del commit para no mantener el
 * bloqueo de la fila durante una petición de red.
 */
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
        [$result, $expiredDevice] = DB::transaction(function () use ($channel, $deviceId, $operatorId) {
            $locked = Channel::lockForUpdate()->find($channel->id) ?? $channel;

            $expiredDevice = $this->expireLocked($locked);

            if ($this->isOccupied($locked)) {
                AudioEvent::create(['device_id' => $deviceId, 'channel_id' => $channel->id, 'event' => 'denied']);

                return [['ok' => false, 'transmission_id' => null, 'message' => 'Canal ocupado.'], $expiredDevice];
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

            return [['ok' => true, 'transmission_id' => $transmissionId, 'message' => 'Canal disponible. Puede transmitir.'], $expiredDevice];
        });

        // El dueño anterior (expirado) pierde el micrófono; si es el mismo device
        // que acaba de adquirir, FloorController se lo vuelve a conceder después.
        if ($expiredDevice !== null && $expiredDevice !== $deviceId) {
            $this->revokeMicrophone($channel->id, $expiredDevice);
        }

        return $result;
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

            $this->clearLocked($locked, 'floor_released');

            return true;
        });
    }

    public function heartbeat(Channel $channel, int $deviceId, ?string $transmissionId): bool
    {
        [$ok, $expiredDevice] = DB::transaction(function () use ($channel, $deviceId, $transmissionId) {
            $locked = Channel::lockForUpdate()->find($channel->id) ?? $channel;

            $expiredDevice = $this->expireLocked($locked);

            if ($locked->occupied_device_id !== $deviceId) {
                return [false, $expiredDevice];
            }
            if ($locked->floor_session_id !== null && $locked->floor_session_id !== $transmissionId) {
                return [false, $expiredDevice];
            }

            $locked->update(['floor_expires_at' => now()->addSeconds(self::ttlSeconds())]);

            return [true, $expiredDevice];
        });

        if ($expiredDevice !== null && $expiredDevice !== $deviceId) {
            $this->revokeMicrophone($channel->id, $expiredDevice);
        }

        return $ok;
    }

    /**
     * Expiración SEGURA ante concurrencia. Acepta un modelo (posiblemente
     * obsoleto) o un id: el estado real siempre se relee bajo bloqueo y solo se
     * libera si, en la fila actual, el piso sigue ocupado y vencido.
     */
    public function expireIfStale(Channel|int $channel): bool
    {
        $channelId = $channel instanceof Channel ? $channel->id : $channel;

        $expiredDevice = DB::transaction(function () use ($channelId) {
            $locked = Channel::lockForUpdate()->find($channelId);

            return $locked ? $this->expireLocked($locked) : null;
        });

        if ($expiredDevice === null) {
            return false;
        }

        $this->revokeMicrophone($channelId, $expiredDevice);

        return true;
    }

    /**
     * Fuerza el fin del piso de un device en un canal (revocación, transferencia,
     * reasignación, cambio de permisos). Solo actúa si la fila ACTUAL sigue
     * perteneciendo a ese device.
     */
    public function terminate(Channel|int $channel, int $deviceId, string $reason): bool
    {
        $channelId = $channel instanceof Channel ? $channel->id : $channel;

        $terminated = DB::transaction(function () use ($channelId, $deviceId, $reason) {
            $locked = Channel::lockForUpdate()->find($channelId);
            if (! $locked || $locked->occupied_device_id !== $deviceId) {
                return false;
            }

            $this->clearLocked($locked, 'floor_terminated', ['reason' => $reason]);

            return true;
        });

        if ($terminated) {
            $this->revokeMicrophone($channelId, $deviceId);
        }

        return $terminated;
    }

    /** Lectura sin bloqueo para evitar transacciones innecesarias (p. ej. listados). */
    public function looksStale(Channel $channel): bool
    {
        return $this->isOccupied($channel)
            && $channel->floor_expires_at !== null
            && ! $channel->floor_expires_at->isFuture();
    }

    /**
     * Expira un canal YA bloqueado dentro de la transacción en curso.
     * Devuelve el device que poseía el piso expirado (o null si no expiró).
     * No llama a LiveKit: eso lo hace el llamador tras el commit.
     */
    private function expireLocked(Channel $locked): ?int
    {
        if (! $this->looksStale($locked)) {
            return null;
        }

        return $this->clearLocked($locked, 'floor_expired') ?? 0;
    }

    /**
     * Libera el piso de una fila bloqueada: limpia el canal, cierra la
     * CommunicationHistory de esa transmisión y registra el evento de auditoría.
     *
     * @param  array<string, mixed>  $metadata
     */
    private function clearLocked(Channel $locked, string $event, array $metadata = []): ?int
    {
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

        AudioEvent::create([
            'device_id' => $previousDevice,
            'channel_id' => $locked->id,
            'event' => $event,
            'metadata' => array_filter($metadata + ['transmission_id' => $transmission]) ?: null,
        ]);

        return $previousDevice;
    }

    private function isOccupied(Channel $channel): bool
    {
        return $channel->occupied_device_id !== null || $channel->occupied_by !== null;
    }

    private function revokeMicrophone(int $channelId, int $deviceId): void
    {
        if ($deviceId <= 0) {
            return;
        }

        try {
            app(LiveKitPermissionService::class)->revokeMicrophone(
                LiveKitPermissionService::roomName($channelId),
                LiveKitPermissionService::identity($deviceId),
            );
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
