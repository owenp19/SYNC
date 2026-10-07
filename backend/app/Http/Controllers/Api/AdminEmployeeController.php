<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Models\ChannelPermission;
use App\Models\Department;
use App\Models\User;
use App\Services\DepartmentPermissionPolicy;
use App\Services\DeviceSessionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AdminEmployeeController extends Controller
{
    public function __construct(
        private DepartmentPermissionPolicy $policy,
        private DeviceSessionService $sessions,
    ) {}

    public function employees()
    {
        return User::with('department')->orderBy('name')->get()->map(fn ($u) => [
            'id' => $u->id,
            'name' => $u->name,
            'employee_code' => $u->employee_code,
            'department_id' => $u->department_id,
            'department_name' => $u->department?->name,
            'role' => $u->role,
            'active' => $u->active,
        ]);
    }

    public function departments()
    {
        return Department::all();
    }

    /**
     * Crea un empleado. El empleado NO se autentica: es solo un OPERADOR
     * identificable que un device puede seleccionar por turno. Sin PIN ni contraseña.
     */
    public function createEmployee(Request $r)
    {
        $data = $r->validate([
            'name' => 'required|string|max:255',
            'employee_code' => 'nullable|string|max:32|unique:users,employee_code',
            'department_id' => 'required|integer|exists:departments,id',
            'active' => 'nullable|boolean',
        ]);

        return DB::transaction(function () use ($data) {
            $user = User::create([
                'name' => $data['name'],
                'email' => ($data['employee_code'] ?? 'emp-'.Str::random(8)).'@sync.local',
                'password' => Hash::make(Str::random(32)), // nunca se usa: los empleados no hacen login
                'employee_code' => $data['employee_code'] ?? null,
                'department_id' => $data['department_id'],
                'role' => 'employee',
                'active' => $data['active'] ?? true,
                'status' => 'available',
            ]);

            return response()->json($user->load('department'), 201);
        });
    }

    /**
     * Actualiza un empleado (operador). Cambiar su departamento NO toca
     * channel_permissions: los permisos pertenecen al departamento, no a la persona.
     */
    public function updateEmployee(Request $r, User $user)
    {
        $data = $r->validate([
            'name' => 'sometimes|string|max:255',
            'department_id' => 'sometimes|nullable|integer|exists:departments,id',
            'active' => 'sometimes|boolean',
            'role' => 'sometimes|in:admin,employee',
        ]);

        $user->update($data);

        return response()->json($user->load('department'));
    }

    /**
     * Matriz de permisos por DEPARTAMENTO: qué departamento puede
     * escuchar (can_listen) y transmitir (can_transmit) en cada canal.
     */
    public function permissionMatrix()
    {
        $departments = Department::orderBy('name')->get(['id', 'name']);
        $channels = Channel::orderBy('id')->get(['id', 'name', 'type']);
        $cells = ChannelPermission::whereNotNull('department_id')
            ->get(['department_id', 'channel_id', 'can_listen', 'can_transmit']);

        return response()->json([
            'departments' => $departments,
            'channels' => $channels,
            'permissions' => $cells,
        ]);
    }

    /**
     * Actualiza (o crea) una celda de la matriz de permisos de un departamento.
     *
     * Regla de negocio (aplicada en backend, no solo en Angular):
     * can_transmit = true requiere can_listen = true → si no, 422.
     *
     * Los cambios se aplican EN CALIENTE: si se retira transmitir se termina el
     * Floor activo del departamento en ese canal; si se retira escuchar, además
     * se expulsa a sus devices de la sala LiveKit.
     */
    public function updatePermission(Request $r)
    {
        $data = $r->validate([
            'department_id' => 'required|integer|exists:departments,id',
            'channel_id' => 'required|integer|exists:channels,id',
            'can_listen' => 'required|boolean',
            'can_transmit' => 'required|boolean',
        ]);

        $canListen = filter_var($data['can_listen'], FILTER_VALIDATE_BOOLEAN);
        $canTransmit = filter_var($data['can_transmit'], FILTER_VALIDATE_BOOLEAN);

        if ($canTransmit && ! $canListen) {
            throw ValidationException::withMessages([
                'can_transmit' => 'Para transmitir en un canal el departamento también debe poder escucharlo.',
            ]);
        }

        $perm = ChannelPermission::updateOrCreate(
            ['department_id' => $data['department_id'], 'channel_id' => $data['channel_id']],
            ['can_listen' => $canListen, 'can_transmit' => $canTransmit]
        );

        $this->sessions->enforceDepartmentPermission((int) $data['department_id'], (int) $data['channel_id'], $canListen, $canTransmit);

        return response()->json($perm);
    }

    /**
     * Crea un departamento con su canal privado y sus permisos iniciales
     * (propio canal + canales generales/emergencia, según DepartmentPermissionPolicy).
     */
    public function createDepartment(Request $r)
    {
        $data = $r->validate(['name' => 'required|string|max:255|unique:departments,name']);

        return DB::transaction(function () use ($data) {
            $channel = Channel::create(['name' => $data['name'], 'type' => 'private']);
            $dept = Department::create(['name' => $data['name'], 'channel_id' => $channel->id]);

            $this->policy->applyDefaults($dept);

            return response()->json($dept->load('channel'), 201);
        });
    }

    public function createChannel(Request $r)
    {
        $data = $r->validate(['name' => 'required|string|max:255', 'type' => 'required|in:general,private,emergency']);

        return response()->json(Channel::create($data), 201);
    }

    public function seedDepartments()
    {
        $base = ['AyB', 'Seguridad Interna', 'Ama de Llaves', 'Recepción', 'ULC', 'Almacén', 'Boutique', 'Actividades'];
        $created = 0;
        foreach ($base as $name) {
            if (Department::where('name', $name)->exists()) {
                continue;
            }
            $channel = Channel::create(['name' => $name, 'type' => 'private']);
            Department::create(['name' => $name, 'channel_id' => $channel->id]);
            $created++;
        }
        foreach (Department::all() as $dept) {
            $this->policy->applyDefaults($dept);
        }

        return response()->json(['created' => $created, 'departments' => Department::all()]);
    }
}
