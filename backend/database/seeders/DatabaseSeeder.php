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

        // Sin login activo: el usuario por defecto tiene permiso total en todos los canales
        foreach (\App\Models\Channel::all() as $channel) {
            \App\Models\ChannelPermission::firstOrCreate(
                ['user_id' => $user->id, 'channel_id' => $channel->id],
                ['can_listen' => true, 'can_transmit' => true]
            );
        }
    }
}
