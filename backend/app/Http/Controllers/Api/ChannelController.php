<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use Illuminate\Http\Request;

class ChannelController extends Controller
{
    /**
     * Lista los canales con su estado real de piso:
     * busy solo cuando el heartbeat sigue vigente; si expiró, se libera el canal.
     */
    public function index(Request $request)
    {
        $now = now();

        $channels = Channel::with('occupier:id,name')->orderBy('id')->get()->map(function (Channel $c) use ($now) {
            if ($c->occupied_by !== null && $c->floor_expires_at !== null && $c->floor_expires_at->isPast()) {
                $c->update(['occupied_by' => null, 'floor_expires_at' => null]);
                $c->occupier = null;
            }

            $occupied = $c->occupied_by !== null;

            return [
                'id' => $c->id,
                'name' => $c->name,
                'type' => $c->type,
                'occupied_by' => $c->occupied_by,
                'occupier_name' => $occupied && $c->occupier ? $c->occupier->name : null,
                'floor_expires_at' => $c->floor_expires_at?->toIso8601String(),
                'status' => $occupied ? 'busy' : 'free',
            ];
        });

        return response()->json($channels);
    }
}
