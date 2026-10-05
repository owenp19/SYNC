<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('devices', function (Blueprint $t) {
            $t->id();
            $t->uuid('uuid')->unique();
            $t->string('name');
            $t->foreignId('department_id')->constrained()->cascadeOnDelete();
            $t->enum('status', ['pending', 'active', 'revoked'])->default('pending');
            $t->string('activation_token_hash')->nullable();
            $t->timestamp('activation_expires_at')->nullable();
            $t->timestamp('activated_at')->nullable();
            $t->timestamp('revoked_at')->nullable();
            $t->timestamp('last_seen_at')->nullable();
            $t->foreignId('current_operator_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        Schema::table('channels', function (Blueprint $t) {
            $t->foreignId('occupied_device_id')->nullable()->after('occupied_by')->constrained('devices')->nullOnDelete();
            $t->foreignId('occupied_operator_id')->nullable()->after('occupied_device_id')->constrained('users')->nullOnDelete();
        });

        // channel_permissions: user_id pasa a nullable y agregamos department_id.
        // Reconstruimos la tabla para compatibilidad con SQLite y MySQL.
        Schema::create('channel_permissions_new', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $t->foreignId('department_id')->nullable()->constrained()->cascadeOnDelete();
            $t->foreignId('channel_id')->constrained()->cascadeOnDelete();
            $t->boolean('can_listen')->default(true);
            $t->boolean('can_transmit')->default(false);
            $t->timestamps();
        });
        DB::statement('INSERT INTO channel_permissions_new (user_id, channel_id, can_listen, can_transmit, created_at, updated_at)
            SELECT user_id, channel_id, can_listen, can_transmit, created_at, updated_at FROM channel_permissions');
        Schema::drop('channel_permissions');
        DB::statement('ALTER TABLE channel_permissions_new RENAME TO channel_permissions');
        try {
            DB::statement('CREATE UNIQUE INDEX channel_permissions_user_channel_unique ON channel_permissions (user_id, channel_id)');
        } catch (\Throwable $e) {}
        try {
            DB::statement('CREATE UNIQUE INDEX channel_permissions_dept_channel_unique ON channel_permissions (department_id, channel_id)');
        } catch (\Throwable $e) {}

        // communication_history: user_id pasa a nullable; agregamos device_id/operator_id
        Schema::create('communication_history_new', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $t->foreignId('channel_id')->constrained()->cascadeOnDelete();
            $t->foreignId('device_id')->nullable()->constrained('devices')->nullOnDelete();
            $t->foreignId('operator_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('transmission_id')->nullable();
            $t->timestamp('started_at');
            $t->timestamp('ended_at')->nullable();
            $t->timestamps();
        });
        DB::statement('INSERT INTO communication_history_new (user_id, channel_id, transmission_id, started_at, ended_at, created_at, updated_at)
            SELECT user_id, channel_id, transmission_id, started_at, ended_at, created_at, updated_at FROM communication_history');
        Schema::drop('communication_history');
        DB::statement('ALTER TABLE communication_history_new RENAME TO communication_history');

        // audio_events: user_id pasa a nullable; agregamos device_id
        Schema::create('audio_events_new', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $t->foreignId('channel_id')->constrained()->cascadeOnDelete();
            $t->foreignId('device_id')->nullable()->constrained('devices')->nullOnDelete();
            $t->string('event');
            $t->json('metadata')->nullable();
            $t->timestamps();
        });
        DB::statement('INSERT INTO audio_events_new (user_id, channel_id, event, metadata, created_at, updated_at)
            SELECT user_id, channel_id, event, metadata, created_at, updated_at FROM audio_events');
        Schema::drop('audio_events');
        DB::statement('ALTER TABLE audio_events_new RENAME TO audio_events');
    }

    public function down(): void
    {
        Schema::dropIfExists('devices');
    }
};
