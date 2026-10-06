<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('devices', function (Blueprint $t) {
            // HMAC-SHA256 del código de activación: permite buscar el device
            // por índice (O(1)) en lugar de recorrer todos los hashes bcrypt.
            $t->string('activation_lookup', 64)->nullable()->index()->after('activation_token_hash');
        });
    }

    public function down(): void
    {
        Schema::table('devices', function (Blueprint $t) {
            $t->dropIndex(['activation_lookup']);
            $t->dropColumn('activation_lookup');
        });
    }
};
