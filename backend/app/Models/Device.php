<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Device extends Authenticatable
{
    use HasApiTokens;

    protected $fillable = [
        'uuid', 'name', 'department_id', 'status',
        'activation_token_hash', 'activation_lookup', 'activation_expires_at', 'activated_at',
        'revoked_at', 'last_seen_at', 'current_operator_id',
    ];

    protected $hidden = ['activation_token_hash', 'activation_lookup'];

    protected $casts = [
        'activated_at' => 'datetime',
        'revoked_at' => 'datetime',
        'last_seen_at' => 'datetime',
        'activation_expires_at' => 'datetime',
    ];

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function currentOperator()
    {
        return $this->belongsTo(User::class, 'current_operator_id');
    }

    /** Empleados activos del departamento del dispositivo (posibles operadores). */
    public function availableOperators()
    {
        return User::where('department_id', $this->department_id)
            ->where('role', 'employee')
            ->where('active', true)
            ->get(['id', 'name']);
    }
}
