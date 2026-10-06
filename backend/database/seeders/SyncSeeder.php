<?php

namespace Database\Seeders;

use App\Models\Channel;
use App\Models\Department;
use Illuminate\Database\Seeder;

class SyncSeeder extends Seeder
{
    /**
     * Nombres CANÓNICOS de departamentos (unificados: nada de variantes
     * "Seguridad"/"Seguridad Interna" ni "Ama de llaves"/"Ama de Llaves").
     * El endpoint admin /admin/departments/seed usa esta misma lista base.
     */
    public const CANALES = [
        ['name' => 'Recepción', 'type' => 'private'],
        ['name' => 'Mantenimiento', 'type' => 'private'],
        ['name' => 'Seguridad Interna', 'type' => 'private'],
        ['name' => 'Ama de Llaves', 'type' => 'private'],
        ['name' => 'Emergencias', 'type' => 'emergency'],
        ['name' => 'General', 'type' => 'general'],
    ];

    public function run(): void
    {
        foreach (self::CANALES as $c) {
            $canal = Channel::firstOrCreate(['name' => $c['name']], $c);
            Department::firstOrCreate(['name' => $c['name']], ['channel_id' => $canal->id]);
        }
    }
}
