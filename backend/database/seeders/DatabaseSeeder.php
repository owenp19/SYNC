<?php

namespace Database\Seeders;

use App\Models\Channel;
use App\Models\ChannelPermission;
use App\Models\Department;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $this->call(SyncSeeder::class);

        // Administrador. La contraseña viene de SEED_ADMIN_PASSWORD para no
        // fijar credenciales en el código; el fallback es SOLO para desarrollo.
        $admin = User::firstOrCreate(
            ['email' => 'admin@sync.local'],
            [
                'name' => 'Administrador',
                'password' => Hash::make(env('SEED_ADMIN_PASSWORD', 'admin123')),
                'role' => 'admin',
                'active' => true,
                'status' => 'available',
            ]
        );

        // Empleados de ejemplo (sin PIN ni contraseña usable: son solo operadores)
        $employees = [
            ['code' => 'SEG001', 'name' => 'Carlos Pérez', 'dept' => 'Seguridad Interna'],
            ['code' => 'SEG002', 'name' => 'Alejandro Ruiz', 'dept' => 'Seguridad Interna'],
            ['code' => 'SEG003', 'name' => 'Juan López', 'dept' => 'Seguridad Interna'],
            ['code' => 'REC001', 'name' => 'Laura Gómez', 'dept' => 'Recepción'],
            ['code' => 'HLL001', 'name' => 'Marcela Diaz', 'dept' => 'Ama de Llaves'],
            ['code' => 'MAN001', 'name' => 'Pedro Soto', 'dept' => 'Mantenimiento'],
        ];

        foreach ($employees as $e) {
            $dept = Department::where('name', $e['dept'])->first();
            $u = User::firstOrCreate(
                ['employee_code' => $e['code']],
                [
                    'name' => $e['name'],
                    'email' => strtolower($e['code']).'@sync.local',
                    'password' => Hash::make(Str::random(32)),
                    'department_id' => $dept?->id,
                    'role' => 'employee',
                    'active' => true,
                    'status' => 'available',
                ]
            );

            foreach (Channel::all() as $channel) {
                ChannelPermission::firstOrCreate(
                    ['department_id' => $dept?->id, 'channel_id' => $channel->id],
                    ['can_listen' => true, 'can_transmit' => true]
                );
            }
        }
    }
}
