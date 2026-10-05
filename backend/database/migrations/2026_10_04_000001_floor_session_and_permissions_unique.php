<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('channels', function (Blueprint $table) {
            $table->string('floor_session_id')->nullable()->after('floor_expires_at');
            $table->string('occupied_device')->nullable()->after('floor_session_id');
        });

        Schema::table('communication_history', function (Blueprint $table) {
            $table->string('transmission_id')->nullable()->after('channel_id');
        });

        Schema::table('channel_permissions', function (Blueprint $table) {
            $table->unique(['user_id', 'channel_id'], 'channel_permissions_user_channel_unique');
        });
    }

    public function down(): void
    {
        Schema::table('channel_permissions', function (Blueprint $table) {
            $table->dropUnique('channel_permissions_user_channel_unique');
        });
        Schema::table('communication_history', function (Blueprint $table) {
            $table->dropColumn('transmission_id');
        });
        Schema::table('channels', function (Blueprint $table) {
            $table->dropColumn(['floor_session_id', 'occupied_device']);
        });
    }
};
