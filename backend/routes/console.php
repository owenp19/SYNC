<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Barrido server-side de pisos PTT vencidos (TTL ~15s). Requiere el scheduler
// activo: en dev `php artisan schedule:work`, en prod cron cada minuto con
// `schedule:run` (las tareas sub-minuto se ejecutan dentro del propio minuto).
Schedule::command('floor:expire-stale')->everyThirtySeconds()->withoutOverlapping();
