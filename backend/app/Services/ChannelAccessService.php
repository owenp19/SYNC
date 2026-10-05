<?php

namespace App\Services;

use App\Models\ChannelPermission;
use App\Models\Device;

/**
 * Permisos operativos derivados del DEVICE (su departamento),
 * nunca del operador ni de un string enviado por el cliente.
 */
class ChannelAccessService
{
    public function permission(Device $device, int $channelId): ?ChannelPermission
    {
        return ChannelPermission::where('department_id', $device->department_id)
            ->where('channel_id', $channelId)
            ->first();
    }

    public function canListen(Device $device, int $channelId): bool
    {
        return (bool) $this->permission($device, $channelId)?->can_listen;
    }

    public function canTransmit(Device $device, int $channelId): bool
    {
        return (bool) $this->permission($device, $channelId)?->can_transmit;
    }
}
