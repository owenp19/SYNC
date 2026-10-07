<?php

namespace App\Console\Commands;

use App\Models\Channel;
use App\Services\FloorControlService;
use Illuminate\Console\Command;

class ExpireStaleFloors extends Command
{
    protected $signature = 'floor:expire-stale';

    protected $description = 'Libera pisos de canal cuyo heartbeat expiró (barrido server-side, sin depender del polling del frontend)';

    public function handle(FloorControlService $floor): int
    {
        $staleIds = Channel::whereNotNull('floor_expires_at')
            ->where('floor_expires_at', '<=', now())
            ->where(fn ($q) => $q->whereNotNull('occupied_device_id')->orWhereNotNull('occupied_by'))
            ->pluck('id');

        $released = 0;
        foreach ($staleIds as $channelId) {
            // Variante segura: relee la fila con lockForUpdate y solo libera si
            // sigue vencida (un device pudo adquirir el canal tras la consulta).
            if ($floor->expireIfStale((int) $channelId)) {
                $released++;
            }
        }

        if ($released > 0) {
            $this->info("Pisos expirados liberados: {$released}");
        }

        return self::SUCCESS;
    }
}
