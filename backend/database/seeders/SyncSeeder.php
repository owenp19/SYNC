<?php

namespace Database\Seeders;

use App\Models\Channel;
use App\Models\Department;
use Illuminate\Database\Seeder;

class SyncSeeder extends Seeder
{
    public function run(): void
    {
        $canales = [
            ['name' => 'Recepción', 'type' => 'private'],
            ['name' => 'Mantenimiento', 'type' => 'private'],
            ['name' => 'Seguridad', 'type' => 'private'],
            ['name' => 'Ama de llaves', 'type' => 'private'],
            ['name' => 'Emergencias', 'type' => 'emergency'],
            ['name' => 'General', 'type' => 'general'],
        ];

        foreach ($canales as $c) {
            $canal = Channel::firstOrCreate(['name' => $c['name']], $c);
            Department::firstOrCreate(['name' => $c['name']], ['channel_id' => $canal->id]);
        }
    }
}
