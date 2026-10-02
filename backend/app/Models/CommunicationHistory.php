<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CommunicationHistory extends Model
{
    protected $table = 'communication_history';

    protected $fillable = ['user_id', 'channel_id', 'started_at', 'ended_at'];

    protected $casts = ['started_at' => 'datetime', 'ended_at' => 'datetime'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function channel()
    {
        return $this->belongsTo(Channel::class);
    }
}
