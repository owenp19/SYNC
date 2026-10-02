<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChannelPermission extends Model
{
    protected $table = 'channel_permissions';

    protected $fillable = ['user_id', 'channel_id', 'can_listen', 'can_transmit'];

    protected function casts(): array
    {
        return ['can_listen' => 'boolean', 'can_transmit' => 'boolean'];
    }
}
