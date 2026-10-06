<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Channel extends Model
{
    protected $fillable = ['name', 'type', 'occupied_by', 'occupied_device_id', 'occupied_operator_id', 'floor_expires_at', 'floor_session_id'];

    protected $casts = ['floor_expires_at' => 'datetime'];

    public function occupier()
    {
        return $this->belongsTo(User::class, 'occupied_by');
    }

    public function occupiedDevice()
    {
        return $this->belongsTo(Device::class, 'occupied_device_id');
    }

    public function permissions()
    {
        return $this->hasMany(ChannelPermission::class);
    }
}
