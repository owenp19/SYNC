<?php

namespace Tests\Feature;

use App\Models\Channel;
use App\Models\ChannelPermission;
use App\Models\Department;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use RuntimeException;
use Tests\TestCase;

class DatabaseSeederPolicyTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeder_does_not_grant_every_private_channel_to_every_department(): void
    {
        config(['app.seed_admin_password' => 'seed-test-password']);

        $this->seed(DatabaseSeeder::class);

        $seguridad = Department::where('name', 'Seguridad Interna')->firstOrFail();
        $recepcionChannel = Channel::where('name', 'Recepción')->firstOrFail();
        $general = Channel::where('type', 'general')->firstOrFail();
        $emergencias = Channel::where('type', 'emergency')->firstOrFail();

        // Propio canal + canales compartidos: sí.
        $this->assertDatabaseHas('channel_permissions', [
            'department_id' => $seguridad->id, 'channel_id' => $seguridad->channel_id, 'can_listen' => true, 'can_transmit' => true,
        ]);
        $this->assertDatabaseHas('channel_permissions', ['department_id' => $seguridad->id, 'channel_id' => $general->id]);
        $this->assertDatabaseHas('channel_permissions', ['department_id' => $seguridad->id, 'channel_id' => $emergencias->id]);

        // Canal privado de otro departamento: no.
        $this->assertDatabaseMissing('channel_permissions', ['department_id' => $seguridad->id, 'channel_id' => $recepcionChannel->id]);

        // Ningún departamento tiene acceso a canales privados ajenos.
        foreach (Department::all() as $department) {
            $foreignPrivate = ChannelPermission::where('department_id', $department->id)
                ->whereIn('channel_id', Channel::where('type', 'private')->where('id', '!=', $department->channel_id)->pluck('id'))
                ->count();
            $this->assertSame(0, $foreignPrivate, "{$department->name} no debe acceder a canales privados ajenos");
        }

        $admin = User::where('email', 'admin@sync.local')->firstOrFail();
        $this->assertTrue(Hash::check('seed-test-password', $admin->password));
    }

    public function test_seeder_refuses_known_admin_password_in_production(): void
    {
        config(['app.seed_admin_password' => null]);
        $this->app['env'] = 'production';

        try {
            // Invocación directa: db:seed pediría confirmación interactiva en producción.
            $this->app->make(DatabaseSeeder::class)->setContainer($this->app)->__invoke();
            $this->fail('El seeder debió fallar sin SEED_ADMIN_PASSWORD en producción.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('SEED_ADMIN_PASSWORD', $e->getMessage());
        } finally {
            $this->app['env'] = 'testing';
        }

        $this->assertDatabaseMissing('users', ['email' => 'admin@sync.local']);
    }

    public function test_seeder_keeps_development_fallback_outside_production(): void
    {
        config(['app.seed_admin_password' => null]);

        $this->seed(DatabaseSeeder::class);

        $admin = User::where('email', 'admin@sync.local')->firstOrFail();
        $this->assertTrue(Hash::check('admin123', $admin->password));
    }
}
