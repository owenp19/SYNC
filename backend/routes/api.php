<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ChannelController;
use App\Http\Controllers\Api\FloorController;
use App\Http\Controllers\Api\VoiceController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login']);
Route::get('/channels', [ChannelController::class, 'index']);

// Rutas de voz y piso: en dev no exigen token (no hay flujo de login)
Route::post('/auth/logout', [AuthController::class, 'logout']);
Route::post('/voice/token', [VoiceController::class, 'token']);
Route::post('/channels/{channel}/floor/acquire', [FloorController::class, 'acquire']);
Route::post('/channels/{channel}/floor/release', [FloorController::class, 'release']);
Route::post('/channels/{channel}/floor/heartbeat', [FloorController::class, 'heartbeat']);
