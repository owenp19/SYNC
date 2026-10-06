<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Límite global de la API: por token autenticado (o IP si no lo hay).
        // La app hace ~15 polls/min de canales + ~12 heartbeats/min por device.
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(120)
            ->by($request->user()?->getAuthIdentifier() ?: $request->ip()));

        // Login admin: 5 intentos/minuto por email+IP (anti fuerza bruta).
        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(5)
            ->by(strtolower((string) $request->input('email')).'|'.$request->ip())
            ->response(fn () => response()->json(['message' => 'Demasiados intentos. Espera un minuto.'], 429)));

        // Activación de dispositivos: 10 intentos/minuto por IP.
        // Con códigos de 6 dígitos y caducidad de 24h, esto hace inviable la fuerza bruta.
        RateLimiter::for('activation', fn (Request $request) => Limit::perMinute(10)
            ->by($request->ip())
            ->response(fn () => response()->json(['message' => 'Demasiados intentos de activación. Espera un minuto.'], 429)));
    }
}
