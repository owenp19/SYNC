<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\DeviceController;
use App\Models\AudioEvent;
use App\Models\Channel;
use App\Models\ChannelPermission;
use App\Models\CommunicationHistory;
use App\Models\Department;
use App\Models\Device;
use App\Models\User;
use App\Services\FloorControlService;
use App\Services\LiveKitPermissionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class SyncMvpTest extends TestCase
{
    use RefreshDatabase;

    private Channel $recepcion;

    private Channel $seguridadCh;

    private Department $deptSeg;

    private Department $deptRec;

    private Device $seg1;

    private Device $seg2;

    private Device $rec1;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        // LiveKit no corre en tests: el servicio de permisos se simula con éxito.
        // Los tests que necesitan un fallo de LiveKit re-bindean su propio fake.
        $this->app->instance(LiveKitPermissionService::class, new class extends LiveKitPermissionService
        {
            public function grantMicrophone(string $roomName, string $identity): bool
            {
                return true;
            }

            public function revokeMicrophone(string $roomName, string $identity): bool
            {
                return true;
            }
        });

        $this->recepcion = Channel::create(['name' => 'Recepción', 'type' => 'private']);
        $this->seguridadCh = Channel::create(['name' => 'Seguridad', 'type' => 'private']);
        $this->deptRec = Department::create(['name' => 'Recepción', 'channel_id' => $this->recepcion->id]);
        $this->deptSeg = Department::create(['name' => 'Seguridad', 'channel_id' => $this->seguridadCh->id]);

        ChannelPermission::create(['department_id' => $this->deptSeg->id, 'channel_id' => $this->seguridadCh->id, 'can_listen' => true, 'can_transmit' => true]);
        ChannelPermission::create(['department_id' => $this->deptSeg->id, 'channel_id' => $this->recepcion->id, 'can_listen' => true, 'can_transmit' => true]);
        ChannelPermission::create(['department_id' => $this->deptRec->id, 'channel_id' => $this->recepcion->id, 'can_listen' => true, 'can_transmit' => true]);

        $this->seg1 = $this->makeDevice('Seguridad-01', $this->deptSeg->id);
        $this->seg2 = $this->makeDevice('Seguridad-02', $this->deptSeg->id);
        $this->rec1 = $this->makeDevice('Recepcion-01', $this->deptRec->id);

        foreach ([$this->deptSeg, $this->deptRec] as $d) {
            User::create(['name' => 'Carlos', 'email' => 'carlos@'.$d->id.'@s.local', 'password' => Hash::make('x'), 'employee_code' => 'C'.$d->id, 'department_id' => $d->id, 'role' => 'employee', 'active' => true, 'status' => 'available']);
        }

        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'admin@sync.local', 'password' => Hash::make('admin123'),
            'role' => 'admin', 'active' => true, 'status' => 'available',
        ]);
    }

    private function makeDevice(string $name, int $deptId, string $status = 'active'): Device
    {
        return Device::create([
            'uuid' => (string) Str::uuid(),
            'name' => $name,
            'department_id' => $deptId,
            'status' => $status,
            'activated_at' => now(),
        ]);
    }

    private function tokenFor(Device $d): string
    {
        return $d->createToken('test')->plainTextToken;
    }

    /**
     * Sanctum cachea el usuario resuelto en el guard entre peticiones del MISMO
     * test: hay que olvidar los guards al cambiar de identidad dentro de un test.
     */
    private function asAdmin(): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders(['Authorization' => 'Bearer '.$this->admin->createToken('a')->plainTextToken]);
    }

    private function asDevice(Device $d): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($d)]);
    }

    private function asToken(string $token): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders(['Authorization' => "Bearer $token"]);
    }

    public function test_1_app_activada_entra_radio_sin_login_employee()
    {
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->getJson('/api/device/me')->assertStatus(200)
            ->assertJsonPath('name', 'Seguridad-01');
    }

    public function test_2_app_no_activada_no_puede_usar_radio()
    {
        $d = $this->makeDevice('Pendiente-01', $this->deptSeg->id, 'pending');
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($d)])
            ->getJson('/api/device/me')->assertStatus(403);
    }

    public function test_3_codigo_valido_registra_dispositivo()
    {
        $code = '847291';
        $d = Device::create([
            'uuid' => (string) Str::uuid(), 'name' => 'Tablet', 'department_id' => $this->deptSeg->id,
            'status' => 'pending', 'activation_token_hash' => Hash::make($code),
            'activation_lookup' => DeviceController::codeLookup($code),
            'activation_expires_at' => now()->addHours(1),
        ]);

        $res = $this->postJson('/api/device/activate', ['code' => $code]);
        $res->assertStatus(200)->assertJsonStructure(['token', 'device']);
        $this->assertEquals('active', $d->fresh()->status);
    }

    public function test_4_codigo_no_reutilizable()
    {
        $code = '111222';
        Device::create([
            'uuid' => (string) Str::uuid(), 'name' => 'T2', 'department_id' => $this->deptSeg->id,
            'status' => 'pending', 'activation_token_hash' => Hash::make($code),
            'activation_lookup' => DeviceController::codeLookup($code),
            'activation_expires_at' => now()->addHour(),
        ]);
        $this->postJson('/api/device/activate', ['code' => $code])->assertStatus(200);
        $this->postJson('/api/device/activate', ['code' => $code])->assertStatus(422);
    }

    public function test_5_codigo_expirado_rechazado()
    {
        $code = '999000';
        Device::create([
            'uuid' => (string) Str::uuid(), 'name' => 'T3', 'department_id' => $this->deptSeg->id,
            'status' => 'pending', 'activation_token_hash' => Hash::make($code),
            'activation_lookup' => DeviceController::codeLookup($code),
            'activation_expires_at' => now()->subMinute(),
        ]);
        $this->postJson('/api/device/activate', ['code' => $code])->assertStatus(422);
    }

    public function test_6_device_revocado_no_accede()
    {
        $d = $this->makeDevice('Rev-01', $this->deptSeg->id, 'revoked');
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($d)])
            ->getJson('/api/device/me')->assertStatus(403);
    }

    public function test_7_frontend_no_puede_falsificar_departamento()
    {
        // Mandar department en el body no cambia los permisos del device
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson("/api/channels/{$this->recepcion->id}/floor/acquire", ['department' => 'Recepción']);
        $this->assertEquals($this->seg1->id, $this->recepcion->fresh()->occupied_device_id);
    }

    public function test_8_device_seguridad_mantiene_departamento_seguridad()
    {
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->getJson('/api/device/me')->assertJsonPath('department_id', $this->deptSeg->id);
    }

    public function test_9_cambiar_operator_no_cambia_departamento()
    {
        $op = User::where('department_id', $this->deptSeg->id)->first();
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson('/api/device/operator', ['operator_id' => $op->id])
            ->assertJsonPath('department_id', $this->deptSeg->id)
            ->assertJsonPath('operator.name', $op->name);
    }

    public function test_10_operator_debe_pertenecer_al_departamento_del_device()
    {
        $opRec = User::where('department_id', $this->deptRec->id)->first();
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson('/api/device/operator', ['operator_id' => $opRec->id])
            ->assertStatus(422);
    }

    public function test_11_device_a_adquiere_floor()
    {
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson("/api/channels/{$this->recepcion->id}/floor/acquire")
            ->assertStatus(200)->assertJsonPath('granted', true);
    }

    public function test_12_device_b_no_adquiere_mismo_canal()
    {
        $this->asDevice($this->seg1)
            ->postJson("/api/channels/{$this->recepcion->id}/floor/acquire");
        $this->asDevice($this->rec1)
            ->postJson("/api/channels/{$this->recepcion->id}/floor/acquire")
            ->assertStatus(409);
    }

    public function test_13_device_b_adquiere_otro_canal()
    {
        $this->asDevice($this->seg1)
            ->postJson("/api/channels/{$this->recepcion->id}/floor/acquire");
        $this->asDevice($this->seg2)
            ->postJson("/api/channels/{$this->seguridadCh->id}/floor/acquire")
            ->assertStatus(200);
    }

    public function test_14_sin_can_transmit_403()
    {
        ChannelPermission::where('department_id', $this->deptRec->id)->where('channel_id', $this->recepcion->id)
            ->update(['can_transmit' => false]);
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->rec1)])
            ->postJson("/api/channels/{$this->recepcion->id}/floor/acquire")->assertStatus(403);
    }

    public function test_15_sin_can_listen_no_recibe_token_livekit()
    {
        ChannelPermission::where('department_id', $this->deptSeg->id)->where('channel_id', $this->recepcion->id)
            ->update(['can_listen' => false]);
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson('/api/voice/token', ['channel_id' => $this->recepcion->id])->assertStatus(403);
    }

    public function test_16_usuario_no_admin_no_accede_admin()
    {
        $emp = User::where('role', 'employee')->first();
        $token = $emp->createToken('e')->plainTextToken;
        $this->withHeaders(['Authorization' => "Bearer $token"])->getJson('/api/admin/users')->assertStatus(403);
    }

    public function test_17_admin_autenticado_accede()
    {
        $token = $this->admin->createToken('a')->plainTextToken;
        $this->withHeaders(['Authorization' => "Bearer $token"])->getJson('/api/admin/users')->assertStatus(200);
        $this->withHeaders(['Authorization' => "Bearer $token"])->getJson('/api/admin/devices')->assertStatus(200);
    }

    public function test_18_floor_expira_correctamente()
    {
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson("/api/channels/{$this->recepcion->id}/floor/acquire");
        $this->recepcion->update(['floor_expires_at' => now()->subSecond()]);
        $this->app->make(FloorControlService::class)->expireIfStale($this->recepcion->fresh());
        $this->assertNull($this->recepcion->fresh()->occupied_device_id);
    }

    public function test_19_communication_history_se_cierra()
    {
        $res = $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson("/api/channels/{$this->recepcion->id}/floor/acquire");
        $tx = $res->json('transmission_id');
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson("/api/channels/{$this->recepcion->id}/floor/release", ['transmission_id' => $tx])->assertStatus(200);
        $this->assertNotNull(CommunicationHistory::latest('id')->first()->ended_at);
    }

    public function test_20_release_solo_transmision_correcta()
    {
        $res = $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson("/api/channels/{$this->recepcion->id}/floor/acquire");
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson("/api/channels/{$this->recepcion->id}/floor/release", ['transmission_id' => 'ajeno'])
            ->assertStatus(409);
        $this->assertEquals($this->seg1->id, $this->recepcion->fresh()->occupied_device_id);
    }

    public function test_21_reiniciar_app_no_exige_login()
    {
        // El mismo token de device sigue funcionando (credencial persistente)
        $token = $this->tokenFor($this->seg1);
        $this->withHeaders(['Authorization' => "Bearer $token"])->getJson('/api/device/me')->assertStatus(200);
        $this->withHeaders(['Authorization' => "Bearer $token"])->getJson('/api/device/me')->assertStatus(200);
    }

    public function test_22_token_revocado_impide_uso()
    {
        $d = $this->makeDevice('Rev2-01', $this->deptSeg->id);
        $token = $this->tokenFor($d);
        $d->update(['status' => 'revoked']);
        $d->tokens()->delete();
        $this->withHeaders(['Authorization' => "Bearer $token"])->getJson('/api/device/me')->assertStatus(401);
    }

    public function test_admin_login_con_email()
    {
        $this->postJson('/api/auth/login', ['email' => 'admin@sync.local', 'password' => 'admin123'])->assertStatus(200);
        $this->postJson('/api/auth/login', ['email' => 'admin@sync.local', 'password' => 'bad'])->assertStatus(401);
    }

    public function test_23_release_sin_transmission_id_rechazado()
    {
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson("/api/channels/{$this->recepcion->id}/floor/acquire")->assertStatus(200);
        // Sin transmission_id ya no se omite la validación de sesión
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson("/api/channels/{$this->recepcion->id}/floor/release")->assertStatus(409);
        $this->assertEquals($this->seg1->id, $this->recepcion->fresh()->occupied_device_id);
    }

    public function test_24_heartbeat_sin_transmission_id_rechazado()
    {
        $res = $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson("/api/channels/{$this->recepcion->id}/floor/acquire");
        $tx = $res->json('transmission_id');
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson("/api/channels/{$this->recepcion->id}/floor/heartbeat")->assertStatus(409);
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson("/api/channels/{$this->recepcion->id}/floor/heartbeat", ['transmission_id' => $tx])->assertStatus(200);
    }

    public function test_25_auditoria_global_solo_admin()
    {
        AudioEvent::create(['device_id' => $this->seg1->id, 'channel_id' => $this->recepcion->id, 'event' => 'floor_acquired']);

        // Sin token: denegado (headers limpios porque es la primera petición del test)
        $this->getJson('/api/admin/events')->assertStatus(401);

        // Device operativo: NO puede consultar la auditoría global
        $this->asDevice($this->seg1)->getJson('/api/admin/events')->assertStatus(401);

        // Admin: sí accede
        $this->asAdmin()->getJson('/api/admin/events')->assertStatus(200)
            ->assertJsonPath('0.user_name', 'Seguridad-01');

        // La ruta antigua /api/events ya no existe
        $this->getJson('/api/events')->assertStatus(404);
    }

    public function test_26_login_tiene_throttle()
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['email' => 'throttle@sync.local', 'password' => 'bad'])->assertStatus(401);
        }
        $this->postJson('/api/auth/login', ['email' => 'throttle@sync.local', 'password' => 'bad'])->assertStatus(429);
    }

    public function test_27_activacion_tiene_throttle()
    {
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/device/activate', ['code' => '000000'])->assertStatus(422);
        }
        $this->postJson('/api/device/activate', ['code' => '000000'])->assertStatus(429);
    }

    public function test_28_codigo_erroneo_no_ejecuta_bucle_bcrypt()
    {
        // 15 devices pendientes: un código erróneo debe fallar sin recorrer hashes.
        for ($i = 0; $i < 15; $i++) {
            Device::create([
                'uuid' => (string) Str::uuid(), 'name' => "P-$i", 'department_id' => $this->deptSeg->id,
                'status' => 'pending', 'activation_token_hash' => Hash::make('12345'.$i),
                'activation_lookup' => DeviceController::codeLookup('12345'.$i),
                'activation_expires_at' => now()->addHour(),
            ]);
        }
        $t0 = microtime(true);
        $this->postJson('/api/device/activate', ['code' => '999999'])->assertStatus(422);
        $this->assertLessThan(2.0, microtime(true) - $t0, 'La activación con código erróneo debe ser O(1)');
    }

    public function test_29_migracion_permisos_legacy_a_departamento()
    {
        require_once database_path('migrations/2026_10_06_000000_migrate_channel_permissions_to_departments.php');

        // Estado LEGACY: permisos por user_id con department_id NULL
        $u1 = User::where('department_id', $this->deptSeg->id)->first();
        $canalExtra = Channel::create(['name' => 'LegacyCh', 'type' => 'general']);
        $legacy1 = ChannelPermission::create(['user_id' => $u1->id, 'channel_id' => $canalExtra->id, 'can_listen' => true, 'can_transmit' => false]);
        $legacy2 = ChannelPermission::create(['user_id' => $u1->id, 'channel_id' => $this->seguridadCh->id, 'can_listen' => true, 'can_transmit' => false]);

        // Preexistente de departamento con can_transmit=true en seguridadCh: el OR debe conservarlo
        (new \MigrateChannelPermissionsToDepartments)->up();

        // Filas legacy convertidas (eliminadas), permisos agrupados por departamento
        $this->assertDatabaseMissing('channel_permissions', ['id' => $legacy1->id]);
        $this->assertDatabaseMissing('channel_permissions', ['id' => $legacy2->id]);
        $this->assertDatabaseHas('channel_permissions', [
            'department_id' => $this->deptSeg->id, 'channel_id' => $canalExtra->id,
            'user_id' => null, 'can_listen' => true, 'can_transmit' => false,
        ]);
        // can_transmit=true del permiso de departamento preexistente NO se pierde
        $perm = ChannelPermission::where('department_id', $this->deptSeg->id)->where('channel_id', $this->seguridadCh->id)->first();
        $this->assertTrue($perm->can_transmit);

        // Idempotente: segunda ejecución no duplica
        (new \MigrateChannelPermissionsToDepartments)->up();
        $this->assertEquals(1, ChannelPermission::where('department_id', $this->deptSeg->id)->where('channel_id', $canalExtra->id)->count());
    }

    public function test_30_device_solo_ve_canales_autorizados()
    {
        // deptRec NO tiene permiso sobre seguridadCh
        $res = $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->rec1)])
            ->getJson('/api/channels')->assertStatus(200);
        $ids = collect($res->json())->pluck('id');
        $this->assertTrue($ids->contains($this->recepcion->id));
        $this->assertFalse($ids->contains($this->seguridadCh->id));
    }

    public function test_31_device_no_puede_hacer_show_de_canal_no_autorizado()
    {
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->rec1)])
            ->getJson("/api/channels/{$this->seguridadCh->id}")->assertStatus(403);

        // Y tampoco token de voz ni floor
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->rec1)])
            ->postJson('/api/voice/token', ['channel_id' => $this->seguridadCh->id])->assertStatus(403);
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->rec1)])
            ->postJson("/api/channels/{$this->seguridadCh->id}/floor/acquire")->assertStatus(403);
    }

    public function test_32_empleado_no_necesita_pin()
    {
        $adminToken = $this->admin->createToken('a')->plainTextToken;
        $this->withHeaders(['Authorization' => "Bearer $adminToken"])
            ->postJson('/api/admin/users', [
                'name' => 'Sin PIN', 'department_id' => $this->deptSeg->id,
            ])
            ->assertStatus(201)
            ->assertJsonPath('role', 'employee');
        $this->assertDatabaseHas('users', ['name' => 'Sin PIN', 'pin' => null, 'role' => 'employee']);
    }

    public function test_33_reset_device_invalida_token_anterior()
    {
        $oldToken = $this->tokenFor($this->seg1);

        $res = $this->asAdmin()
            ->postJson("/api/admin/devices/{$this->seg1->id}/reset")
            ->assertStatus(200)
            ->assertJsonStructure(['code', 'expires_at']);

        // El token del teléfono anterior ya no funciona
        $this->asToken($oldToken)->getJson('/api/device/me')->assertStatus(401);

        // El device queda pending, sin operador y con código nuevo de un solo uso
        $d = $this->seg1->fresh();
        $this->assertEquals('pending', $d->status);
        $this->assertNull($d->current_operator_id);
        $this->assertNotNull($d->activation_lookup);

        // El código nuevo activa el "teléfono nuevo" y ese token SÍ funciona
        $act = $this->postJson('/api/device/activate', ['code' => $res->json('code')])->assertStatus(200);
        $newToken = $act->json('token');
        $this->asToken($newToken)
            ->getJson('/api/device/me')->assertStatus(200)
            ->assertJsonPath('id', $this->seg1->id);
    }

    public function test_34_no_dos_telefonos_con_la_misma_identidad()
    {
        // Generar código para un device ACTIVO está prohibido (hay que usar reset)
        $this->asAdmin()
            ->postJson("/api/admin/devices/{$this->seg1->id}/code")->assertStatus(422);

        // Flujo completo: teléfono 1 activo → reset → teléfono 2 → solo el 2 funciona
        $tokenPhone1 = $this->tokenFor($this->seg1);
        $reset = $this->asAdmin()
            ->postJson("/api/admin/devices/{$this->seg1->id}/reset")->assertStatus(200);
        $act = $this->postJson('/api/device/activate', ['code' => $reset->json('code')])->assertStatus(200);
        $tokenPhone2 = $act->json('token');

        $this->asToken($tokenPhone1)->getJson('/api/device/me')->assertStatus(401);
        $this->asToken($tokenPhone2)->getJson('/api/device/me')->assertStatus(200);
    }

    public function test_35_fallo_livekit_tras_acquire_libera_floor()
    {
        // LiveKit falla al conceder el micrófono
        $this->app->instance(LiveKitPermissionService::class, new class extends LiveKitPermissionService
        {
            public function grantMicrophone(string $roomName, string $identity): bool
            {
                return false;
            }
        });

        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson("/api/channels/{$this->recepcion->id}/floor/acquire")
            ->assertStatus(502)
            ->assertJsonPath('granted', false);

        // El canal NO quedó ocupado
        $fresh = $this->recepcion->fresh();
        $this->assertNull($fresh->occupied_device_id);
        $this->assertNull($fresh->floor_session_id);
    }

    public function test_36_floor_expirado_se_libera_server_side_sin_polling()
    {
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson("/api/channels/{$this->recepcion->id}/floor/acquire")->assertStatus(200);

        // Simular heartbeat muerto (expirado) SIN que nadie consulte el canal
        $this->recepcion->update(['floor_expires_at' => now()->subSecond()]);

        $this->artisan('floor:expire-stale')->assertSuccessful();

        $fresh = $this->recepcion->fresh();
        $this->assertNull($fresh->occupied_device_id);
        $this->assertNull($fresh->floor_session_id);
        $this->assertNotNull(CommunicationHistory::latest('id')->first()->ended_at);
        $this->assertDatabaseHas('audio_events', ['event' => 'floor_expired', 'channel_id' => $this->recepcion->id]);
    }

    public function test_37_admin_ve_todos_los_canales_sin_filtro_departamental()
    {
        $res = $this->asAdmin()->getJson('/api/admin/channels')->assertStatus(200);
        $this->assertCount(2, $res->json());

        // Un device NO puede usar la vista admin
        $this->asDevice($this->seg1)->getJson('/api/admin/channels')->assertStatus(401);
    }

    public function test_38_eliminar_operador_no_elimina_historial()
    {
        $op = User::where('department_id', $this->deptSeg->id)->first();

        CommunicationHistory::create([
            'device_id' => $this->seg1->id, 'operator_id' => $op->id, 'user_id' => $op->id,
            'channel_id' => $this->recepcion->id, 'transmission_id' => (string) Str::uuid(), 'started_at' => now(),
        ]);
        AudioEvent::create(['user_id' => $op->id, 'device_id' => $this->seg1->id, 'channel_id' => $this->recepcion->id, 'event' => 'floor_acquired']);

        $op->delete();

        $this->assertEquals(1, CommunicationHistory::count());
        $this->assertEquals(1, AudioEvent::count());
        $this->assertNull(CommunicationHistory::first()->operator_id);
        $this->assertNull(AudioEvent::first()->user_id);
    }

    public function test_39_matriz_permisos_admin()
    {
        $this->asAdmin()->getJson('/api/admin/permissions')->assertStatus(200)
            ->assertJsonStructure(['departments', 'channels', 'permissions']);

        // Quitar can_listen a deptSeg en recepcion → seg1 deja de ver el canal
        $this->asAdmin()
            ->putJson('/api/admin/permissions', [
                'department_id' => $this->deptSeg->id, 'channel_id' => $this->recepcion->id,
                'can_listen' => false, 'can_transmit' => false,
            ])->assertStatus(200);

        $res = $this->asDevice($this->seg1)->getJson('/api/channels')->assertStatus(200);
        $this->assertFalse(collect($res->json())->pluck('id')->contains($this->recepcion->id));

        // Device no puede tocar la matriz
        $this->asDevice($this->seg1)
            ->putJson('/api/admin/permissions', [
                'department_id' => $this->deptSeg->id, 'channel_id' => $this->recepcion->id,
                'can_listen' => true, 'can_transmit' => true,
            ])->assertStatus(401);
    }
}
