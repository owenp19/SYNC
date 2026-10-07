<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * activation_lookup pasa de índice simple a UNIQUE: dos devices no pueden
 * compartir el mismo código de activación (los NULL siguen permitidos en
 * SQLite y MySQL, por lo que los devices sin código no colisionan).
 *
 * Migración segura sobre datos existentes: si ya hubiera duplicados, se conserva
 * el código del device más reciente y se invalida el de los demás (el admin
 * puede generarles otro). Los códigos únicos existentes NO se tocan.
 */
return new class extends Migration
{
    public function up(): void
    {
        $duplicates = DB::table('devices')
            ->select('activation_lookup')
            ->whereNotNull('activation_lookup')
            ->groupBy('activation_lookup')
            ->havingRaw('COUNT(*) > 1')
            ->pluck('activation_lookup');

        foreach ($duplicates as $lookup) {
            $keepId = DB::table('devices')->where('activation_lookup', $lookup)->max('id');

            DB::table('devices')
                ->where('activation_lookup', $lookup)
                ->where('id', '!=', $keepId)
                ->update([
                    'activation_lookup' => null,
                    'activation_token_hash' => null,
                    'activation_expires_at' => null,
                ]);
        }

        Schema::table('devices', function (Blueprint $t) {
            $t->dropIndex(['activation_lookup']);
            $t->unique('activation_lookup');
        });
    }

    public function down(): void
    {
        Schema::table('devices', function (Blueprint $t) {
            $t->dropUnique(['activation_lookup']);
            $t->index('activation_lookup');
        });
    }
};
