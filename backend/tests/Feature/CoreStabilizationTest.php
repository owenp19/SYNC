<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\DeviceController;
use App\Models\Channel;
use App\Models\ChannelPermission;
use App\Models\CommunicationHistory;
use App\Models\Department;
use App\Models\Device;
use App\Models\User;
use App\Services\DeviceActivationCodeService;
use App\Services\FloorControlService;
use App\Services\LiveKitPermissionService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\Support\FakeLiveKitPermissionService;
use Tests\TestCase;

/**
 * Estabilización del núcleo DEVICE → DEPARTMENT → PERMISSIONS → FLOOR → LIVEKIT.
 */
class CoreStabilizationTest extends TestCase
{
    use RefreshDatabase;

    private FakeLiveKitPermissionService $livekit;

    private Channel $recepcion;

    private Channel $seguridadCh;

    private Department $deptSeg;

    private Department $deptRec;

    private Device $seg1;

    private Device $seg2;

    private Device $rec1;

    private User $admin;

    private User $alejandro;

    protected function setUp(): void
    {
        parent::setUp();

        $this->livekit = new FakeLiveKitPermissionService;
        $this->app->instance(LiveKitPermissionService::class, $this->livekit);

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

        $this->alejandro = User::create([
            'name' => 'Alejandro', 'email' => 'alejandro@sync.local', 'password' => Hash::make(Str::random(32)),
            'employee_code' => 'SEG900', 'department_id' => $this->deptSeg->id, 'role' => 'employee',
            'active' => true, 'status' => 'available',
        ]);

        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'admin@sync.local', 'password' => Hash::make('secret-test'),
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

    private function asAdmin(): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders(['Authorization' => 'Bearer '.$this->admin->createToken('a')->plainTextToken]);
    }

    private function asDevice(Device $device): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders(['Authorization' => 'Bearer '.$device->createToken('d')->plainTextToken]);
    }

    private function asToken(string $token): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders(['Authorization' => "Bearer {$token}"]);
    }

    /** @return list<array<string, mixed>> */
    private function permissionsSnapshot(): array
    {
        return ChannelPermission::orderBy('id')
            ->get(['id', 'department_id', 'channel_id', 'can_listen', 'can_transmit'])
            ->toArray();
    }

    private function floor(): FloorControlService
    {
        return $this->app->make(FloorControlService::class);
    }

    /** Device adquiere el piso vía API y devuelve el transmission_id. */
    private function acquire(Device $device, Channel $channel): string
    {
        return $this->asDevice($device)
            ->postJson("/api/channels/{$channel->id}/floor/acquire")
            ->assertStatus(200)
            ->json('transmission_id');
    }

    // ---------------------------------------------------------------- 1. expireIfStale

    public function test_expire_if_stale_with_stale_model_does_not_clear_new_acquisition(): void
    {
        $this->floor()->acquire($this->recepcion, $this->seg1->id, null);
        Channel::whereKey($this->recepcion->id)->update(['floor_expires_at' => now()->subSecond()]);

        // A: carga el canal y "cree" que el piso está vencido.
        $stale = Channel::find($this->recepcion->id);
        $this->assertTrue($this->floor()->looksStale($stale));

        // B: antes de que A expire, la fila real recibe una adquisición nueva y válida.
        $acquisitionB = $this->floor()->acquire(Channel::find($this->recepcion->id), $this->seg2->id, null);
        $this->assertTrue($acquisitionB['ok']);

        // A usa su modelo viejo: NO debe borrar la adquisición de B.
        $this->assertFalse($this->floor()->expireIfStale($stale));

        $fresh = $this->recepcion->fresh();
        $this->assertSame($this->seg2->id, $fresh->occupied_device_id);
        $this->assertSame($acquisitionB['transmission_id'], $fresh->floor_session_id);
        $this->assertTrue($fresh->floor_expires_at->isFuture());
        $this->assertNull(CommunicationHistory::where('transmission_id', $acquisitionB['transmission_id'])->value('ended_at'));
    }

    public function test_expire_if_stale_accepts_channel_id_and_releases_expired_floor(): void
    {
        $result = $this->floor()->acquire($this->recepcion, $this->seg1->id, null);
        Channel::whereKey($this->recepcion->id)->update(['floor_expires_at' => now()->subSecond()]);

        $this->assertTrue($this->floor()->expireIfStale($this->recepcion->id));

        $this->assertNull($this->recepcion->fresh()->occupied_device_id);
        $this->assertNotNull(CommunicationHistory::where('transmission_id', $result['transmission_id'])->value('ended_at'));
        $this->assertDatabaseHas('audio_events', ['event' => 'floor_expired', 'device_id' => $this->seg1->id]);
        $this->assertTrue($this->livekit->wasRevoked('channel-'.$this->recepcion->id, 'device-'.$this->seg1->id));
    }

    // ---------------------------------------------------------------- 2. empleados no tocan permisos

    public function test_creating_employee_does_not_change_channel_permissions(): void
    {
        $lavanderia = Department::create(['name' => 'Lavandería']);
        $before = $this->permissionsSnapshot();

        $this->asAdmin()->postJson('/api/admin/users', ['name' => 'Alejandro Nuevo', 'department_id' => $this->deptSeg->id])
            ->assertStatus(201);
        $this->asAdmin()->postJson('/api/admin/users', ['name' => 'Sin permisos', 'department_id' => $lavanderia->id])
            ->assertStatus(201);

        $this->assertSame($before, $this->permissionsSnapshot());
        $this->assertSame(0, ChannelPermission::where('department_id', $lavanderia->id)->count());
    }

    public function test_changing_employee_department_does_not_change_channel_permissions(): void
    {
        $before = $this->permissionsSnapshot();

        $this->asAdmin()->patchJson("/api/admin/users/{$this->alejandro->id}", ['department_id' => $this->deptRec->id])
            ->assertStatus(200)
            ->assertJsonPath('department_id', $this->deptRec->id);
        $this->asAdmin()->patchJson("/api/admin/users/{$this->alejandro->id}/department", ['department_id' => $this->deptSeg->id])
            ->assertStatus(200);

        $this->assertSame($before, $this->permissionsSnapshot());
    }

    // ---------------------------------------------------------------- 3. regla listen/transmit en backend

    public function test_backend_rejects_transmit_without_listen(): void
    {
        $before = $this->permissionsSnapshot();

        $this->asAdmin()->putJson('/api/admin/permissions', [
            'department_id' => $this->deptRec->id, 'channel_id' => $this->seguridadCh->id,
            'can_listen' => false, 'can_transmit' => true,
        ])->assertStatus(422)->assertJsonValidationErrors('can_transmit');

        $this->asAdmin()->putJson('/api/admin/permissions', [
            'department_id' => $this->deptSeg->id, 'channel_id' => $this->recepcion->id,
            'can_listen' => false, 'can_transmit' => true,
        ])->assertStatus(422);

        $this->assertSame($before, $this->permissionsSnapshot());
    }

    // ---------------------------------------------------------------- 4. permisos iniciales del departamento

    public function test_creating_department_grants_its_own_channel_only_plus_shared_channels(): void
    {
        $general = Channel::create(['name' => 'General', 'type' => 'general']);

        $res = $this->asAdmin()->postJson('/api/admin/departments', ['name' => 'SPA'])->assertStatus(201);
        $spa = Department::find($res->json('id'));
        $spaChannel = Channel::find($spa->channel_id);

        $this->assertSame('SPA', $spaChannel->name);
        $this->assertDatabaseHas('channel_permissions', [
            'department_id' => $spa->id, 'channel_id' => $spaChannel->id, 'can_listen' => true, 'can_transmit' => true,
        ]);
        $this->assertDatabaseHas('channel_permissions', ['department_id' => $spa->id, 'channel_id' => $general->id]);

        // Nunca acceso automático a canales privados de otros departamentos.
        $this->assertDatabaseMissing('channel_permissions', ['department_id' => $spa->id, 'channel_id' => $this->recepcion->id]);
        $this->assertDatabaseMissing('channel_permissions', ['department_id' => $spa->id, 'channel_id' => $this->seguridadCh->id]);
    }

    // ---------------------------------------------------------------- 6. revocar device

    public function test_revoking_device_releases_active_floor_and_disconnects_livekit(): void
    {
        $tx = $this->acquire($this->seg1, $this->recepcion);
        $this->seg1->update(['current_operator_id' => $this->alejandro->id]);
        $oldToken = $this->seg1->createToken('phone')->plainTextToken;

        $this->asAdmin()->postJson("/api/admin/devices/{$this->seg1->id}/revoke")->assertStatus(200);

        $fresh = $this->recepcion->fresh();
        $this->assertNull($fresh->occupied_device_id);
        $this->assertNull($fresh->floor_session_id);
        $this->assertNotNull(CommunicationHistory::where('transmission_id', $tx)->value('ended_at'));
        $this->assertDatabaseHas('audio_events', ['event' => 'floor_terminated', 'device_id' => $this->seg1->id, 'channel_id' => $this->recepcion->id]);

        $device = $this->seg1->fresh();
        $this->assertSame('revoked', $device->status);
        $this->assertNull($device->current_operator_id);
        $this->assertSame(0, $device->tokens()->count());

        // LiveKit: micrófono revocado y participante expulsado (fake verificable).
        $this->assertTrue($this->livekit->wasRevoked('channel-'.$this->recepcion->id, 'device-'.$this->seg1->id));
        $this->assertTrue($this->livekit->wasRemoved('channel-'.$this->recepcion->id, 'device-'.$this->seg1->id));
        $this->assertTrue($this->livekit->wasRemoved('channel-'.$this->seguridadCh->id, 'device-'.$this->seg1->id));

        $this->asToken($oldToken)->getJson('/api/device/me')->assertStatus(401);
    }

    // ---------------------------------------------------------------- 7. reset / transfer

    public function test_resetting_device_releases_active_floor_before_issuing_new_code(): void
    {
        $tx = $this->acquire($this->seg1, $this->recepcion);
        $oldToken = $this->seg1->createToken('phone')->plainTextToken;

        $res = $this->asAdmin()->postJson("/api/admin/devices/{$this->seg1->id}/reset")
            ->assertStatus(200)
            ->assertJsonStructure(['code', 'expires_at']);

        $this->assertNull($this->recepcion->fresh()->occupied_device_id);
        $this->assertNotNull(CommunicationHistory::where('transmission_id', $tx)->value('ended_at'));
        $this->assertTrue($this->livekit->wasRevoked('channel-'.$this->recepcion->id, 'device-'.$this->seg1->id));
        $this->assertTrue($this->livekit->wasRemovedAnywhere('device-'.$this->seg1->id));
        $this->asToken($oldToken)->getJson('/api/device/me')->assertStatus(401);

        $device = $this->seg1->fresh();
        $this->assertSame('pending', $device->status);
        $this->assertSame(DeviceActivationCodeService::CODE_DIGITS, strlen($res->json('code')));

        $this->postJson('/api/device/activate', ['code' => $res->json('code')])->assertStatus(200);
    }

    // ---------------------------------------------------------------- 8. reasignar departamento

    public function test_reassigning_device_releases_floor_clears_operator_and_cuts_voice_session(): void
    {
        $this->seg1->update(['current_operator_id' => $this->alejandro->id]);
        $token = $this->seg1->createToken('phone')->plainTextToken;
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->postJson("/api/channels/{$this->seguridadCh->id}/floor/acquire")->assertStatus(200);

        $this->asAdmin()->patchJson("/api/admin/devices/{$this->seg1->id}/department", ['department_id' => $this->deptRec->id])
            ->assertStatus(200);

        $this->assertNull($this->seguridadCh->fresh()->occupied_device_id);
        $device = $this->seg1->fresh();
        $this->assertSame($this->deptRec->id, $device->department_id);
        $this->assertNull($device->current_operator_id);
        $this->assertTrue($this->livekit->wasRemoved('channel-'.$this->seguridadCh->id, 'device-'.$this->seg1->id));

        // La credencial se conserva, pero los permisos de voz son ya los de Recepción.
        $this->asToken($token)->getJson('/api/device/me')->assertStatus(200)->assertJsonPath('department_id', $this->deptRec->id);
        $this->asToken($token)->postJson('/api/voice/token', ['channel_id' => $this->seguridadCh->id])->assertStatus(403);
    }

    // ---------------------------------------------------------------- 9. cambios de permisos en caliente

    public function test_removing_can_transmit_terminates_active_floor_and_revokes_microphone(): void
    {
        $tx = $this->acquire($this->seg1, $this->recepcion);

        $this->asAdmin()->putJson('/api/admin/permissions', [
            'department_id' => $this->deptSeg->id, 'channel_id' => $this->recepcion->id,
            'can_listen' => true, 'can_transmit' => false,
        ])->assertStatus(200);

        $this->assertNull($this->recepcion->fresh()->occupied_device_id);
        $this->assertNotNull(CommunicationHistory::where('transmission_id', $tx)->value('ended_at'));
        $this->assertTrue($this->livekit->wasRevoked('channel-'.$this->recepcion->id, 'device-'.$this->seg1->id));
        // Sigue pudiendo escuchar: no se le expulsa de la sala.
        $this->assertFalse($this->livekit->wasRemovedAnywhere('device-'.$this->seg1->id));

        // Y ya no puede volver a tomar el piso.
        $this->asDevice($this->seg1)->postJson("/api/channels/{$this->recepcion->id}/floor/acquire")->assertStatus(403);
    }

    public function test_removing_can_transmit_does_not_affect_floor_of_other_department(): void
    {
        $this->acquire($this->rec1, $this->recepcion);

        $this->asAdmin()->putJson('/api/admin/permissions', [
            'department_id' => $this->deptSeg->id, 'channel_id' => $this->recepcion->id,
            'can_listen' => true, 'can_transmit' => false,
        ])->assertStatus(200);

        $this->assertSame($this->rec1->id, $this->recepcion->fresh()->occupied_device_id);
    }

    public function test_removing_can_listen_terminates_floor_denies_access_and_disconnects_participants(): void
    {
        $this->acquire($this->seg1, $this->recepcion);

        $this->asAdmin()->putJson('/api/admin/permissions', [
            'department_id' => $this->deptSeg->id, 'channel_id' => $this->recepcion->id,
            'can_listen' => false, 'can_transmit' => false,
        ])->assertStatus(200);

        $room = 'channel-'.$this->recepcion->id;
        $this->assertNull($this->recepcion->fresh()->occupied_device_id);
        $this->assertTrue($this->livekit->wasRemoved($room, 'device-'.$this->seg1->id));
        $this->assertTrue($this->livekit->wasRemoved($room, 'device-'.$this->seg2->id));
        $this->assertFalse($this->livekit->wasRemoved($room, 'device-'.$this->rec1->id));

        $this->asDevice($this->seg2)->postJson('/api/voice/token', ['channel_id' => $this->recepcion->id])->assertStatus(403);
        $this->asDevice($this->seg2)->getJson("/api/channels/{$this->recepcion->id}")->assertStatus(403);
    }

    // ---------------------------------------------------------------- 11. códigos de activación

    public function test_two_devices_cannot_share_activation_lookup(): void
    {
        $lookup = DeviceController::codeLookup('12345678');
        $this->seg1->update(['status' => 'pending', 'activation_lookup' => $lookup, 'activation_expires_at' => now()->addHour()]);

        $this->expectException(UniqueConstraintViolationException::class);
        $this->seg2->update(['status' => 'pending', 'activation_lookup' => $lookup, 'activation_expires_at' => now()->addHour()]);
    }

    public function test_activation_code_generation_regenerates_on_collision(): void
    {
        $this->seg1->update(['status' => 'pending', 'activation_lookup' => DeviceController::codeLookup('11111111')]);

        $service = new class extends DeviceActivationCodeService
        {
            /** @var list<string> */
            public array $sequence = ['11111111', '22222222'];

            protected function generateCode(): string
            {
                return array_shift($this->sequence);
            }
        };

        $pending = $this->makeDevice('Nuevo-01', $this->deptSeg->id, 'pending');
        $issued = $service->issue($pending);

        $this->assertSame('22222222', $issued['code']);
        $this->assertSame(DeviceController::codeLookup('22222222'), $pending->fresh()->activation_lookup);
        $this->assertSame(DeviceController::codeLookup('11111111'), $this->seg1->fresh()->activation_lookup);
    }

    public function test_legacy_six_digit_codes_still_activate(): void
    {
        $code = '654321';
        $device = $this->makeDevice('Legacy-01', $this->deptSeg->id, 'pending');
        $device->update([
            'activation_token_hash' => Hash::make($code),
            'activation_lookup' => DeviceController::codeLookup($code),
            'activation_expires_at' => now()->addHour(),
        ]);

        $this->postJson('/api/device/activate', ['code' => $code])->assertStatus(200);
    }

    // ---------------------------------------------------------------- 12. operador opcional

    public function test_continue_without_operator_clears_current_operator(): void
    {
        $this->seg1->update(['current_operator_id' => $this->alejandro->id]);

        $this->asDevice($this->seg1)->postJson('/api/device/operator', ['operator_id' => null])
            ->assertStatus(200)
            ->assertJsonPath('operator', null);

        $this->assertNull($this->seg1->fresh()->current_operator_id);
    }
}
