<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ChannelController;
use App\Http\Controllers\Api\FloorController;
use App\Http\Controllers\Api\VoiceController;
use App\Models\AudioEvent;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login']);
Route::middleware('auth:sanctum')->get('/auth/me', fn (\Illuminate\Http\Request $r) => $r->user());

Route::get('/admin/users', function () {
    return \App\Models\User::with('department')->get()->map(fn ($u) => [
        'id' => $u->id,
        'name' => $u->name,
        'email' => $u->email,
        'department_id' => $u->department_id,
        'department_name' => $u->department?->name,
    ]);
});

Route::get('/admin/departments', function () {
    return \App\Models\Department::all();
});

Route::patch('/admin/users/{user}/department', function (\Illuminate\Http\Request $r, \App\Models\User $user) {
    $data = $r->validate(['department_id' => 'nullable|integer|exists:departments,id']);
    $user->update(['department_id' => $data['department_id']]);

    return response()->json($user->load('department'));
});

Route::post('/admin/users', function (\Illuminate\Http\Request $r) {
    $data = $r->validate([
        'name' => 'required|string|max:255',
        'email' => 'required|email|unique:users,email',
        'department_id' => 'nullable|integer|exists:departments,id',
    ]);
    $user = \App\Models\User::create([
        'name' => $data['name'],
        'email' => $data['email'],
        'password' => \Illuminate\Support\Facades\Hash::make('1234567'),
        'department_id' => $data['department_id'] ?? null,
        'status' => 'available',
    ]);
    \App\Models\ChannelPermission::firstOrCreate(
        ['user_id' => $user->id, 'channel_id' => $user->department?->channel_id],
        ['can_listen' => true, 'can_transmit' => true]
    );

    return response()->json($user, 201);
});

Route::post('/admin/departments', function (\Illuminate\Http\Request $r) {
    $data = $r->validate(['name' => 'required|string|max:255|unique:departments,name']);
    $channel = \App\Models\Channel::create(['name' => $data['name'], 'type' => 'private']);
    $dept = \App\Models\Department::create(['name' => $data['name'], 'channel_id' => $channel->id]);

    return response()->json($dept->load('channel'), 201);
});

Route::post('/admin/channels', function (\Illuminate\Http\Request $r) {
    $data = $r->validate(['name' => 'required|string|max:255', 'type' => 'required|in:general,private,emergency']);
    return response()->json(\App\Models\Channel::create($data), 201);
});

Route::post('/admin/departments/seed', function () {
    $base = ['AyB', 'Seguridad Interna', 'Ama de Llaves', 'Recepción', 'ULC', 'Almacén', 'Boutique', 'Actividades'];
    $created = 0;
    foreach ($base as $name) {
        if (\App\Models\Department::where('name', $name)->exists()) continue;
        $channel = \App\Models\Channel::create(['name' => $name, 'type' => 'private']);
        \App\Models\Department::create(['name' => $name, 'channel_id' => $channel->id]);
        $created++;
    }

    return response()->json(['created' => $created, 'departments' => \App\Models\Department::all()]);
});

Route::post('/admin/departments/sync-users', function () {
    $created = 0;
    foreach (\App\Models\Department::all() as $dept) {
        $email = \Illuminate\Support\Str::slug($dept->name) . '@sync.local';
        $user = \App\Models\User::firstOrCreate(['email' => $email], [
            'name' => 'Equipo ' . $dept->name,
            'password' => \Illuminate\Support\Facades\Hash::make('1234567'),
            'department_id' => $dept->id,
            'status' => 'available',
        ]);
        if ($user->wasRecentlyCreated) $created++;
        foreach (\App\Models\Channel::all() as $channel) {
            \App\Models\ChannelPermission::firstOrCreate(
                ['user_id' => $user->id, 'channel_id' => $channel->id],
                ['can_listen' => true, 'can_transmit' => true]
            );
        }
    }

    return response()->json(['created' => $created, 'users' => \App\Models\User::count()]);
});
Route::get('/channels', [ChannelController::class, 'index']);
Route::get('/channels/{channel}', [ChannelController::class, 'show']);

Route::get('/events', function () {
    return AudioEvent::with('user:id,name', 'channel:id,name')
        ->latest()->limit(20)->get()
        ->map(fn (AudioEvent $e) => [
            'id' => $e->id,
            'event' => $e->event,
            'user_name' => $e->user?->name ?? '—',
            'channel_name' => $e->channel?->name ?? '—',
            'created_at' => $e->created_at,
        ]);
});

// Rutas de voz y piso: en dev no exigen token (no hay flujo de login)
Route::post('/auth/logout', [AuthController::class, 'logout']);
Route::post('/voice/token', [VoiceController::class, 'token']);
Route::post('/channels/{channel}/floor/acquire', [FloorController::class, 'acquire']);
Route::post('/channels/{channel}/floor/release', [FloorController::class, 'release']);
Route::post('/channels/{channel}/floor/heartbeat', [FloorController::class, 'heartbeat']);
