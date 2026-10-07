<?php

namespace App\Services;

use App\Models\Channel;
use App\Models\Device;
use Illuminate\Support\Facades\Log;

/**
 * Terminación centralizada de sesiones de radio de un DEVICE.
 *
 * Se usa cuando el admin revoca, transfiere (reset) o reasigna un device, y
 * cuando cambian en caliente los permisos de un departamento. Garantiza que la
 * sesión de voz anterior no sobreviva al cambio: libera Floors, revoca el
 * micrófono y expulsa al participante de LiveKit.
 */
class DeviceSessionService
{
    public function __construct(private FloorControlService $floor) {}

    /**
     * Termina toda la sesión activa del device:
     * - libera cualquier Floor que posea (cierra CommunicationHistory, audita floor_terminated, revoca mic)
     * - lo expulsa de cualquier sala LiveKit activa
     * - opcionalmente elimina sus tokens Sanctum
     * - limpia current_operator_id
     */
    public function terminateDeviceSession(Device $device, string $reason, bool $revokeTokens = true): void
    {
        $this->terminateFloors($device, $reason);

        $this->livekit()->disconnectDeviceEverywhere($device->id);

        if ($revokeTokens) {
            $device->tokens()->delete();
        }

        if ($device->current_operator_id !== null) {
            $device->update(['current_operator_id' => null]);
        }

        Log::info('Sesión de device terminada', ['device_id' => $device->id, 'reason' => $reason, 'tokens_revoked' => $revokeTokens]);
    }

    /**
     * Aplica en caliente un cambio de permisos de un departamento sobre un canal:
     * - sin can_transmit: termina el Floor activo de sus devices en ese canal (y revoca mic)
     * - sin can_listen:   además expulsa a sus devices de la sala LiveKit del canal
     */
    public function enforceDepartmentPermission(int $departmentId, int $channelId, bool $canListen, bool $canTransmit): void
    {
        if ($canListen && $canTransmit) {
            return;
        }

        $deviceIds = Device::where('department_id', $departmentId)->pluck('id')->map(fn ($id) => (int) $id);

        $occupant = Channel::whereKey($channelId)->value('occupied_device_id');
        if ($occupant !== null && $deviceIds->contains((int) $occupant)) {
            $this->floor->terminate($channelId, (int) $occupant, $canListen ? 'transmit_permission_revoked' : 'listen_permission_revoked');
        }

        if (! $canListen) {
            $roomName = LiveKitPermissionService::roomName($channelId);
            foreach ($deviceIds as $deviceId) {
                $this->livekit()->removeParticipant($roomName, LiveKitPermissionService::identity($deviceId));
            }
        }
    }

    private function terminateFloors(Device $device, string $reason): void
    {
        $channelIds = Channel::where('occupied_device_id', $device->id)->pluck('id');

        foreach ($channelIds as $channelId) {
            $this->floor->terminate((int) $channelId, $device->id, $reason);
        }
    }

    /** Resuelto en cada uso para respetar el binding vigente del contenedor. */
    private function livekit(): LiveKitPermissionService
    {
        return app(LiveKitPermissionService::class);
    }
}
