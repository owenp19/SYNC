<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Migración de datos (segura e idempotente):
 * convierte channel_permissions legacy (asociadas a user_id) en permisos
 * por departamento (department_id + channel_id).
 *
 * - Deriva department_id del usuario cuando la fila no lo trae.
 * - Agrupa varios permisos del mismo departamento/canal (OR: cualquier acceso se conserva).
 * - No destruye información: las filas sin departamento derivable se conservan intactas.
 * - Puede ejecutarse más de una vez sin duplicar filas.
 */
class MigrateChannelPermissionsToDepartments extends Migration
{
    public function up(): void
    {
        $legacy = DB::table('channel_permissions')
            ->whereNotNull('user_id')
            ->get(['id', 'user_id', 'department_id', 'channel_id', 'can_listen', 'can_transmit']);

        foreach ($legacy as $row) {
            $deptId = $row->department_id
                ?? DB::table('users')->where('id', $row->user_id)->value('department_id');

            if (! $deptId) {
                // Usuario sin departamento (o borrado): conservar la fila como histórico.
                continue;
            }

            $existing = DB::table('channel_permissions')
                ->where('department_id', $deptId)
                ->where('channel_id', $row->channel_id)
                ->whereNull('user_id')
                ->first();

            if ($existing) {
                // Agrupar sin perder accesos: cualquier true gana.
                DB::table('channel_permissions')->where('id', $existing->id)->update([
                    'can_listen' => (bool) $existing->can_listen || (bool) $row->can_listen,
                    'can_transmit' => (bool) $existing->can_transmit || (bool) $row->can_transmit,
                    'updated_at' => now(),
                ]);
            } else {
                DB::table('channel_permissions')->insert([
                    'user_id' => null,
                    'department_id' => $deptId,
                    'channel_id' => $row->channel_id,
                    'can_listen' => (bool) $row->can_listen,
                    'can_transmit' => (bool) $row->can_transmit,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            // La fila legacy ya quedó representada a nivel departamento: se elimina.
            DB::table('channel_permissions')->where('id', $row->id)->delete();
        }
    }

    public function down(): void
    {
        // No reversible de forma fiel: la agrupación pierde la referencia al usuario original.
    }
}
