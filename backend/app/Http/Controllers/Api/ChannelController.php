<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Services\FloorControlService;
use Illuminate\Http\Request;

class ChannelController extends Controller
{
    public function __construct(private FloorControlService $floor) {}

    /**
     * Lista los canales con su estado real de piso:
     * busy solo cuando el heartbeat sigue vigente; si expiró, se libera el canal
     * usando la lógica centralizada de expiración (cierra sesión y audita).
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $channels = Channel::with('occupier:id,name', 'occupiedDevice:id,name')->orderBy('id')->get()->map(function (Channel $c) {
            $this->floor->expireIfStale($c);
            $c->refresh();
            $c->load('occupier:id,name', 'occupiedDevice:id,name');

            $occupied = $c->occupied_device_id !== null || $c->occupied_by !== null;
            $occupierName = $c->occupiedDevice?->name ?? $c->occupier?->name;

            return [
                'id' => $c->id,
                'name' => $c->name,
                'type' => $c->type,
                'occupied_by' => $c->occupied_device_id ?? $c->occupied_by,
                'occupier_name' => $occupied ? $occupierName : null,
                'floor_expires_at' => $c->floor_expires_at?->toIso8601String(),
                'status' => $occupied ? 'busy' : 'free',
            ];
        });

        return response()->json($channels);
    }

    public function show(Channel $channel)
    {
        $this->floor->expireIfStale($channel);
        $channel->refresh();
        $channel->load('occupier:id,name', 'occupiedDevice:id,name');
        $occupied = $channel->occupied_device_id !== null || $channel->occupied_by !== null;

        return response()->json([
            'id' => $channel->id,
            'name' => $channel->name,
            'type' => $channel->type,
            'occupied_by' => $occupied ? ($channel->occupied_device_id ?? $channel->occupied_by) : null,
            'occupier_name' => $occupied ? ($channel->occupiedDevice?->name ?? $channel->occupier?->name) : null,
            'floor_expires_at' => $occupied ? $channel->floor_expires_at?->toIso8601String() : null,
            'status' => $occupied ? 'busy' : 'free',
        ]);
    }
}
