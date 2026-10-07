<?php

use App\Http\Controllers\Api\AdminDeviceController;
use App\Http\Controllers\Api\AdminEmployeeController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ChannelController;
use App\Http\Controllers\Api\DeviceController;
use App\Http\Controllers\Api\FloorController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\VoiceController;
use App\Models\AudioEvent;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// --- Descubrimiento LAN: health check público (sin auth, sin datos sensibles) ---
Route::get('/health', HealthController::class);

// --- Admin tradicional (email + password, role=admin) ---
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::post('/auth/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
Route::get('/auth/me', [AuthController::class, 'me'])->middleware('auth:sanctum');

// --- Activación del dispositivo (única, pública, con anti fuerza bruta) ---
Route::post('/device/activate', [DeviceController::class, 'activate'])->middleware('throttle:activation');

// --- Operación de radio: auth por credencial del DEVICE ---
Route::middleware(['auth:sanctum', 'device'])->group(function () {
    Route::get('/device/me', [DeviceController::class, 'me']);
    Route::get('/device/operators', [DeviceController::class, 'operators']);
    Route::post('/device/operator', [DeviceController::class, 'setOperator']);

    Route::get('/channels', [ChannelController::class, 'index']);
    Route::get('/channels/{channel}', [ChannelController::class, 'show']);
    Route::post('/voice/token', [VoiceController::class, 'token']);
    Route::post('/channels/{channel}/floor/acquire', [FloorController::class, 'acquire']);
    Route::post('/channels/{channel}/floor/release', [FloorController::class, 'release']);
    Route::post('/channels/{channel}/floor/heartbeat', [FloorController::class, 'heartbeat']);
});

// --- Admin protegido ---
Route::middleware(['auth:sanctum', 'admin'])->prefix('admin')->group(function () {
    // Auditoría global del hotel: SOLO el admin la consulta (los devices no).
    Route::get('/events', function () {
        return AudioEvent::with('user:id,name', 'device:id,name', 'channel:id,name')
            ->latest()->limit(50)->get()
            ->map(fn (AudioEvent $e) => [
                'id' => $e->id,
                'event' => $e->event,
                'user_name' => $e->device?->name ?? $e->user?->name ?? '—',
                'channel_name' => $e->channel?->name ?? '—',
                'created_at' => $e->created_at,
            ]);
    });

    // Vista administrativa de canales (sin filtro por departamento).
    Route::get('/channels', [ChannelController::class, 'adminIndex']);

    // Matriz de permisos por departamento.
    Route::get('/permissions', [AdminEmployeeController::class, 'permissionMatrix']);
    Route::put('/permissions', [AdminEmployeeController::class, 'updatePermission']);

    Route::get('/users', [AdminEmployeeController::class, 'employees']);
    Route::get('/departments', [AdminEmployeeController::class, 'departments']);
    Route::post('/users', [AdminEmployeeController::class, 'createEmployee']);
    Route::patch('/users/{user}', [AdminEmployeeController::class, 'updateEmployee']);
    Route::post('/departments', [AdminEmployeeController::class, 'createDepartment']);
    Route::post('/departments/seed', [AdminEmployeeController::class, 'seedDepartments']);
    Route::post('/channels', [AdminEmployeeController::class, 'createChannel']);
    Route::patch('/users/{user}/department', function (Request $r, User $user) {
        $data = $r->validate(['department_id' => 'nullable|integer|exists:departments,id']);
        $r->merge(['department_id' => $data['department_id']]);

        return app(AdminEmployeeController::class)->updateEmployee($r, $user);
    });

    Route::get('/devices', [AdminDeviceController::class, 'index']);
    Route::post('/devices', [AdminDeviceController::class, 'create']);
    Route::post('/devices/{device}/code', [AdminDeviceController::class, 'generateCode']);
    Route::post('/devices/{device}/reset', [AdminDeviceController::class, 'reset']);
    Route::post('/devices/{device}/revoke', [AdminDeviceController::class, 'revoke']);
    Route::patch('/devices/{device}/department', [AdminDeviceController::class, 'reassign']);
});
