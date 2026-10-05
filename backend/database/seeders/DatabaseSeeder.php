<?php

namespace Database\Seeders;

use App\Models\ChannelPermission;
use App\Models\Department;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $this->call(SyncSeeder::class);

        // Administrador
        $admin = User::firstOrCreate(
            ['email' => 'admin@sync.local'],
            [
                'name' => 'Administrador',
                'password' => Hash::make('admin123'),
                'role' => 'admin',
                'active' => true,
                'status' => 'available',
            ]
        );

        // Empleados de ejemplo
        $employees = [
            ['code' => 'SEG001', 'name' => 'Carlos Pérez', 'dept' => 'Seguridad', 'pin' => '4285'],
            ['code' => 'SEG002', 'name' => 'Alejandro Ruiz', 'dept' => 'Seguridad', 'pin' => '1357'],
            ['code' => 'SEG003', 'name' => 'Juan López', 'dept' => 'Seguridad', 'pin' => '2468'],
            ['code' => 'REC001', 'name' => 'Laura Gómez', 'dept' => 'Recepción', 'pin' => '1470'],
            ['code' => 'HLL001', 'name' => 'Marcela Diaz', 'dept' => 'Ama de llaves', 'pin' => '3691'],
            ['code' => 'MAN001', 'name' => 'Pedro Soto', 'dept' => 'Mantenimiento', 'pin' => '4826'],
        ];

        foreach ($employees as $e) {
            $dept = Department::where('name', $e['dept'])->first();
            $u = User::firstOrCreate(
                ['employee_code' => $e['code']],
                [
                    'name' => $e['name'],
                    'email' => strtolower($e['code']).'@sync.local',
                    'password' => Hash::make('sync2026'),
                    'pin' => $e['pin'],
                    'department_id' => $dept?->id,
                    'role' => 'employee',
                    'active' => true,
                    'status' => 'available',
                ]
            );

            foreach (\App\Models\Channel::all() as $channel) {
                ChannelPermission::firstOrCreate(
                    ['department_id' => $dept?->id, 'channel_id' => $channel->id],
                    ['can_listen' => true, 'can_transmit' => true]
                );
            }
        }
    }
}
