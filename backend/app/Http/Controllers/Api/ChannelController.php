<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Services\ChannelAccessService;
use App\Services\FloorControlService;
use Illuminate\Http\Request;

class ChannelController extends Controller
{
    public function __construct(private FloorControlService $floor, private ChannelAccessService $access) {}

    /**
     * Lista SOLO los canales que el departamento del device puede escuchar
     * (can_listen = true), con su estado real de piso:
     * busy solo cuando el heartbeat sigue vigente; si expiró, se libera el canal
     * usando la lógica centralizada de expiración (cierra sesión y audita).
     */
    public function index(Request $request)
    {
        $device = $request->user();

        $channels = Channel::with('occupier:id,name', 'occupiedDevice:id,name')
            ->whereHas('permissions', fn ($q) => $q
                ->where('department_id', $device->department_id)
                ->where('can_listen', true))
            ->orderBy('id')
            ->get()
            ->map(fn (Channel $c) => $this->payload($c));

        return response()->json($channels);
    }

    /** Un device no autorizado no obtiene datos del canal (ni siquiera su estado). */
    public function show(Request $request, Channel $channel)
    {
        if (! $this->access->canListen($request->user(), $channel->id)) {
            return response()->json(['message' => 'No tienes acceso a este canal.'], 403);
        }

        return response()->json($this->payload($channel));
    }

    /** Vista administrativa: TODOS los canales con estado (dashboard, sin filtro por departamento). */
    public function adminIndex()
    {
        $channels = Channel::with('occupier:id,name', 'occupiedDevice:id,name')
            ->orderBy('id')
            ->get()
            ->map(fn (Channel $c) => $this->payload($c));

        return response()->json($channels);
    }

    private function payload(Channel $c): array
    {
        // Pre-chequeo sin bloqueo; la expiración real relee la fila con lockForUpdate
        // y solo libera si sigue vencida. Si parecía vencido, recargar SIEMPRE:
        // otro device pudo adquirir el canal y el modelo en memoria está obsoleto.
        if ($this->floor->looksStale($c)) {
            $this->floor->expireIfStale($c->id);
            $c->refresh();
            $c->load('occupier:id,name', 'occupiedDevice:id,name');
        }

        $occupied = $c->occupied_device_id !== null || $c->occupied_by !== null;
        $occupierName = $c->occupiedDevice?->name ?? $c->occupier?->name;

        return [
            'id' => $c->id,
            'name' => $c->name,
            'type' => $c->type,
            'occupied_by' => $occupied ? ($c->occupied_device_id ?? $c->occupied_by) : null,
            'occupier_name' => $occupied ? $occupierName : null,
            'floor_expires_at' => $occupied ? $c->floor_expires_at?->toIso8601String() : null,
            'status' => $occupied ? 'busy' : 'free',
        ];
    }
}
