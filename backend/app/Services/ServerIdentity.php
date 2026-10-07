<?php

namespace App\Services;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

/**
 * Identidad estable del servidor SYNC (server_id).
 *
 * Se genera UNA sola vez y se persiste en storage/app/private/sync-server-id
 * (o se fija con SYNC_SERVER_ID). No es un secreto: solo sirve para que los
 * teléfonos distingan esta instalación de otra. No concede ningún acceso.
 */
class ServerIdentity
{
    public function serverId(): string
    {
        $configured = config('sync.server_id');
        if (is_string($configured) && $configured !== '') {
            return $configured;
        }

        $path = $this->path();
        if (File::exists($path)) {
            $stored = trim((string) File::get($path));
            if ($stored !== '') {
                return $stored;
            }
        }

        $generated = 'SYNC-SERVER-'.Str::upper(bin2hex(random_bytes(8)));
        File::ensureDirectoryExists(dirname($path));
        File::put($path, $generated, true);

        return $generated;
    }

    public function path(): string
    {
        return storage_path('app/private/sync-server-id');
    }
}
