<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AudioEvent extends Model
{
    protected $fillable = ['user_id', 'device_id', 'channel_id', 'event', 'metadata'];

    protected $casts = ['metadata' => 'array'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function channel()
    {
        return $this->belongsTo(Channel::class);
    }
}
