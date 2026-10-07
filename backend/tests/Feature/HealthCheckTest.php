<?php

namespace Tests\Feature;

use App\Services\ServerIdentity;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

class HealthCheckTest extends TestCase
{
    private string $idPath;

    protected function setUp(): void
    {
        parent::setUp();

        // server_id persistido en un directorio temporal (no toca storage real).
        $this->idPath = sys_get_temp_dir().'/sync-test-'.bin2hex(random_bytes(4)).'/sync-server-id';
        $path = $this->idPath;
        $this->app->instance(ServerIdentity::class, new class($path) extends ServerIdentity
        {
            public function __construct(private string $customPath) {}

            public function path(): string
            {
                return $this->customPath;
            }
        });
        config(['sync.server_id' => null]);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory(dirname($this->idPath));

        parent::tearDown();
    }

    public function test_health_is_public_and_identifies_sync_server(): void
    {
        $this->getJson('/api/health')
            ->assertOk()
            ->assertJsonPath('service', 'SYNC')
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('protocol_version', 1)
            ->assertJsonPath('livekit_port', 7880)
            ->assertJsonStructure(['service', 'status', 'protocol_version', 'server_id', 'livekit_port']);
    }

    public function test_health_does_not_expose_sensitive_information(): void
    {
        $res = $this->getJson('/api/health')->assertOk();

        $this->assertEqualsCanonicalizing(
            ['service', 'status', 'protocol_version', 'server_id', 'livekit_port'],
            array_keys($res->json())
        );
        $body = $res->getContent();
        foreach (array_filter([config('livekit.api_secret'), config('livekit.api_key'), config('app.key')]) as $secret) {
            $this->assertStringNotContainsString((string) $secret, $body);
        }
    }

    public function test_server_id_is_generated_once_and_stays_stable(): void
    {
        $first = $this->getJson('/api/health')->json('server_id');
        $second = $this->getJson('/api/health')->json('server_id');

        $this->assertStringStartsWith('SYNC-SERVER-', $first);
        $this->assertSame($first, $second);
        $this->assertSame($first, trim(File::get($this->idPath)));
    }

    public function test_configured_server_id_takes_precedence(): void
    {
        config(['sync.server_id' => 'SYNC-SERVER-FIXED']);

        $this->getJson('/api/health')->assertJsonPath('server_id', 'SYNC-SERVER-FIXED');
        $this->artisan('sync:server-id')->expectsOutput('SYNC-SERVER-FIXED')->assertSuccessful();
    }
}
