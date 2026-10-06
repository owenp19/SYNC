<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Auditoría indestructible: las referencias a personas (user_id / operator_id)
 * pasan a nullOnDelete. Eliminar un empleado ya no borra su historial de
 * comunicaciones ni sus eventos de audio; la referencia queda en NULL.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('communication_history_new', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('channel_id')->constrained()->cascadeOnDelete();
            $t->foreignId('device_id')->nullable()->constrained('devices')->nullOnDelete();
            $t->foreignId('operator_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('transmission_id')->nullable();
            $t->timestamp('started_at');
            $t->timestamp('ended_at')->nullable();
            $t->timestamps();
        });
        DB::statement('INSERT INTO communication_history_new (id, user_id, channel_id, device_id, operator_id, transmission_id, started_at, ended_at, created_at, updated_at)
            SELECT id, user_id, channel_id, device_id, operator_id, transmission_id, started_at, ended_at, created_at, updated_at FROM communication_history');
        Schema::drop('communication_history');
        DB::statement('ALTER TABLE communication_history_new RENAME TO communication_history');

        Schema::create('audio_events_new', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('channel_id')->constrained()->cascadeOnDelete();
            $t->foreignId('device_id')->nullable()->constrained('devices')->nullOnDelete();
            $t->string('event');
            $t->json('metadata')->nullable();
            $t->timestamps();
        });
        DB::statement('INSERT INTO audio_events_new (id, user_id, channel_id, device_id, event, metadata, created_at, updated_at)
            SELECT id, user_id, channel_id, device_id, event, metadata, created_at, updated_at FROM audio_events');
        Schema::drop('audio_events');
        DB::statement('ALTER TABLE audio_events_new RENAME TO audio_events');
    }

    public function down(): void
    {
        // No se revierte a cascadeOnDelete para no arriesgar la auditoría.
    }
};
