<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\User;
use App\Services\DepartmentPermissionPolicy;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use RuntimeException;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /** Contraseña de desarrollo. NUNCA se usa en producción. */
    private const DEV_ADMIN_PASSWORD = 'admin123';

    public function run(DepartmentPermissionPolicy $policy): void
    {
        $this->call(SyncSeeder::class);

        // Permisos: EXACTAMENTE la misma política que producción (propio canal +
        // canales generales/emergencia). Los empleados no conceden permisos.
        foreach (Department::all() as $department) {
            $policy->applyDefaults($department);
        }

        $this->seedAdmin();

        // Empleados de ejemplo (sin PIN ni contraseña usable: son solo operadores)
        $employees = [
            ['code' => 'SEG001', 'name' => 'Carlos Pérez', 'dept' => 'Seguridad Interna'],
            ['code' => 'SEG002', 'name' => 'Alejandro Ruiz', 'dept' => 'Seguridad Interna'],
            ['code' => 'SEG003', 'name' => 'Juan López', 'dept' => 'Seguridad Interna'],
            ['code' => 'REC001', 'name' => 'Laura Gómez', 'dept' => 'Recepción'],
            ['code' => 'HLL001', 'name' => 'Marcela Diaz', 'dept' => 'Ama de Llaves'],
            ['code' => 'MAN001', 'name' => 'Pedro Soto', 'dept' => 'Mantenimiento'],
        ];

        foreach ($employees as $e) {
            $dept = Department::where('name', $e['dept'])->first();
            User::firstOrCreate(
                ['employee_code' => $e['code']],
                [
                    'name' => $e['name'],
                    'email' => strtolower($e['code']).'@sync.local',
                    'password' => Hash::make(Str::random(32)),
                    'department_id' => $dept?->id,
                    'role' => 'employee',
                    'active' => true,
                    'status' => 'available',
                ]
            );
        }
    }

    /**
     * Administrador. La contraseña viene de SEED_ADMIN_PASSWORD; en producción
     * es OBLIGATORIA (no existe fallback conocido). Fuera de producción se
     * conserva el fallback de desarrollo.
     */
    private function seedAdmin(): void
    {
        if (User::where('email', 'admin@sync.local')->exists()) {
            return;
        }

        $password = config('app.seed_admin_password');

        if (blank($password)) {
            if (app()->environment('production')) {
                throw new RuntimeException('SEED_ADMIN_PASSWORD es obligatorio en producción: no se crea un administrador con contraseña conocida.');
            }
            $password = self::DEV_ADMIN_PASSWORD;
        }

        User::create([
            'email' => 'admin@sync.local',
            'name' => 'Administrador',
            'password' => Hash::make($password),
            'role' => 'admin',
            'active' => true,
            'status' => 'available',
        ]);
    }
}
