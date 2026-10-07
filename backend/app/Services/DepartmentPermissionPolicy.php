<?php

namespace App\Services;

use App\Models\Channel;
use App\Models\ChannelPermission;
use App\Models\Department;

/**
 * Política ÚNICA de permisos iniciales de un departamento (producción y seeders):
 * - su propio canal: escuchar + transmitir
 * - canales de tipo general/emergency: escuchar + transmitir
 * - NUNCA canales privados de otros departamentos (eso lo decide el admin en la matriz)
 *
 * Usa firstOrCreate: nunca sobrescribe una celda que el admin ya haya editado.
 * Los empleados no intervienen: los permisos pertenecen al departamento.
 */
class DepartmentPermissionPolicy
{
    public const SHARED_CHANNEL_TYPES = ['general', 'emergency'];

    public function applyDefaults(Department $department): void
    {
        $channelIds = Channel::whereIn('type', self::SHARED_CHANNEL_TYPES)->pluck('id');

        if ($department->channel_id) {
            $channelIds->push($department->channel_id);
        }

        foreach ($channelIds->unique() as $channelId) {
            ChannelPermission::firstOrCreate(
                ['department_id' => $department->id, 'channel_id' => $channelId],
                ['can_listen' => true, 'can_transmit' => true]
            );
        }
    }
}
