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
        $stale = Channel::whereNotNull('floor_expires_at')
            ->where('floor_expires_at', '<=', now())
            ->where(fn ($q) => $q->whereNotNull('occupied_device_id')->orWhereNotNull('occupied_by'))
            ->get();

        $released = 0;
        foreach ($stale as $channel) {
            // expireIfStale: libera el canal, cierra CommunicationHistory,
            // registra el evento floor_expired y revoca el mic en LiveKit.
            if ($floor->expireIfStale($channel)) {
                $released++;
            }
        }

        if ($released > 0) {
            $this->info("Pisos expirados liberados: {$released}");
        }

        return self::SUCCESS;
    }
}
