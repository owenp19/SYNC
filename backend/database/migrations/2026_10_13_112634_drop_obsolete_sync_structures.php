<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('messages')) {
            Schema::dropIfExists('messages');
        }

        Schema::table('channels', function ($table) {
            if (Schema::hasColumn('channels', 'occupied_device')) {
                $table->dropColumn('occupied_device');
            }
            if (Schema::hasColumn('channels', 'occupied_by')) {
                $table->dropConstrainedForeignId('occupied_by');
            }
        });
    }

    public function down(): void
    {
        // Irreversible: the messages table and legacy columns are obsolete.
    }
};