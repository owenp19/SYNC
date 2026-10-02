<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();

        $this->call(SyncSeeder::class);

        $user = User::firstOrCreate(
            ['email' => 'test@example.com'],
            ['name' => 'Recepción', 'password' => \Illuminate\Support\Facades\Hash::make('secret'), 'status' => 'available']
        );

        // Sin login activo: el usuario supervisor tiene acceso a todo (modo desarrollo)
        $supervisor = User::firstOrCreate(
            ['email' => 'supervisor@sync.local'],
            ['name' => 'Supervisor', 'password' => \Illuminate\Support\Facades\Hash::make('secret'), 'status' => 'available']
        );

        foreach (\App\Models\Channel::all() as $channel) {
            \App\Models\ChannelPermission::firstOrCreate(
                ['user_id' => $supervisor->id, 'channel_id' => $channel->id],
                ['can_listen' => true, 'can_transmit' => true]
            );
        }

        // Usuarios reales por departamento: cada uno solo en su canal
        $depts = [
            'Equipo Recepción' => 'recepcion@sync.local',
            'Equipo Mantenimiento' => 'mantenimiento@sync.local',
            'Equipo Seguridad' => 'seguridad@sync.local',
            'Equipo Ama de Llaves' => 'llaves@sync.local',
            'Equipo Emergencias' => 'emergencias@sync.local',
            'Equipo General' => 'general@sync.local',
        ];

        foreach ($depts as $name => $email) {
            $u = User::firstOrCreate(
                ['email' => $email],
                ['name' => $name, 'password' => \Illuminate\Support\Facades\Hash::make('secret'), 'status' => 'available']
            );
            $channel = \App\Models\Channel::where('name', str_replace('Equipo ', '', $name) === 'Ama de Llaves' ? 'Ama de llaves' : str_replace('Equipo ', '', $name))->first();
            if ($channel) {
                \App\Models\ChannelPermission::firstOrCreate(
                    ['user_id' => $u->id, 'channel_id' => $channel->id],
                    ['can_listen' => true, 'can_transmit' => true]
                );
            }
        }
    }
}
