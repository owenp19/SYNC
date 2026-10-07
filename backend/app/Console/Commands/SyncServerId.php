<?php

namespace App\Console\Commands;

use App\Services\ServerIdentity;
use Illuminate\Console\Command;

class SyncServerId extends Command
{
    protected $signature = 'sync:server-id';

    protected $description = 'Muestra (y genera la primera vez) el server_id estable de esta instalación SYNC';

    public function handle(ServerIdentity $identity): int
    {
        $this->line($identity->serverId());

        return self::SUCCESS;
    }
}
