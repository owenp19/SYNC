<?php

namespace Tests\Feature;

use App\Models\AudioEvent;
use App\Models\Channel;
use App\Models\ChannelPermission;
use App\Models\CommunicationHistory;
use App\Models\Department;
use App\Models\Device;
use App\Models\User;
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
            'status' => 'pending', 'activation_token_hash' => Hash::make($code), 'activation_expires_at' => now()->addHours(1),
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
            'status' => 'pending', 'activation_token_hash' => Hash::make($code), 'activation_expires_at' => now()->addHour(),
        ]);
        $this->postJson('/api/device/activate', ['code' => $code])->assertStatus(200);
        $this->postJson('/api/device/activate', ['code' => $code])->assertStatus(422);
    }

    public function test_5_codigo_expirado_rechazado()
    {
        $code = '999000';
        Device::create([
            'uuid' => (string) Str::uuid(), 'name' => 'T3', 'department_id' => $this->deptSeg->id,
            'status' => 'pending', 'activation_token_hash' => Hash::make($code), 'activation_expires_at' => now()->subMinute(),
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
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson("/api/channels/{$this->recepcion->id}/floor/acquire");
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->rec1)])
            ->postJson("/api/channels/{$this->recepcion->id}/floor/acquire")
            ->assertStatus(409);
    }

    public function test_13_device_b_adquiere_otro_canal()
    {
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg1)])
            ->postJson("/api/channels/{$this->recepcion->id}/floor/acquire");
        $this->withHeaders(['Authorization' => 'Bearer '.$this->tokenFor($this->seg2)])
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
        $this->app->make(\App\Services\FloorControlService::class)->expireIfStale($this->recepcion->fresh());
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
}
