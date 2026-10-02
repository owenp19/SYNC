<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Department extends Model
{
    protected $fillable = ['name', 'channel_id'];

    public function channel()
    {
        return $this->belongsTo(Channel::class);
    }

    public function users()
    {
        return $this->hasMany(User::class);
    }
}
