<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Channel extends Model
{
    protected $fillable = ['name', 'type', 'occupied_by', 'floor_expires_at'];

    protected $casts = ['floor_expires_at' => 'datetime'];

    public function occupier()
    {
        return $this->belongsTo(User::class, 'occupied_by');
    }

    public function permissions()
    {
        return $this->hasMany(ChannelPermission::class);
    }
}
