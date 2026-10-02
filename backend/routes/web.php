<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/api/docs', function () {
    return redirect('/api-docs/index.html');
});
