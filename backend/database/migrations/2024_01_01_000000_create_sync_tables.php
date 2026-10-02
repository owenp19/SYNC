<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('channels', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->enum('type', ['general', 'private', 'emergency'])->default('private');
            $t->foreignId('occupied_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        Schema::create('departments', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->foreignId('channel_id')->nullable()->constrained('channels')->nullOnDelete();
            $t->timestamps();
        });

        Schema::table('users', function (Blueprint $t) {
            $t->foreignId('department_id')->nullable()->after('email')->constrained('departments')->nullOnDelete();
            $t->enum('status', ['available', 'busy', 'offline', 'emergency'])->default('offline')->after('department_id');
        });

        Schema::create('channel_permissions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->foreignId('channel_id')->constrained()->cascadeOnDelete();
            $t->boolean('can_listen')->default(true);
            $t->boolean('can_transmit')->default(false);
            $t->timestamps();
        });

        Schema::create('messages', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->foreignId('channel_id')->nullable()->constrained()->nullOnDelete();
            $t->text('body');
            $t->timestamps();
        });

        Schema::create('communication_history', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->foreignId('channel_id')->constrained()->cascadeOnDelete();
            $t->timestamp('started_at');
            $t->timestamp('ended_at')->nullable();
            $t->timestamps();
        });

        Schema::create('audio_events', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->foreignId('channel_id')->constrained()->cascadeOnDelete();
            $t->string('event'); // floor_acquired, floor_released, denied, emergency
            $t->json('metadata')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audio_events');
        Schema::dropIfExists('communication_history');
        Schema::dropIfExists('messages');
        Schema::dropIfExists('channel_permissions');
        Schema::table('users', function (Blueprint $t) {
            $t->dropConstrainedForeignId('department_id');
            $t->dropColumn('status');
        });
        Schema::dropIfExists('departments');
        Schema::dropIfExists('channels');
    }
};
