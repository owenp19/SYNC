<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens;

    protected $fillable = ['name', 'email', 'password', 'department_id', 'status', 'employee_code', 'pin', 'role', 'active'];

    protected $hidden = ['password', 'pin', 'remember_token'];

    protected function casts(): array
    {
        return ['password' => 'hashed', 'pin' => 'hashed', 'active' => 'boolean'];
    }

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function permissions()
    {
        return $this->hasMany(ChannelPermission::class);
    }
}
