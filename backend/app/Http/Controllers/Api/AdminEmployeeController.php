<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Models\ChannelPermission;
use App\Models\Department;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AdminEmployeeController extends Controller
{
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

    public function createEmployee(Request $r)
    {
        $data = $r->validate([
            'name' => 'required|string|max:255',
            'employee_code' => 'required|string|max:32|unique:users,employee_code',
            'pin' => 'required|string|regex:/^\d{4,6}$/',
            'department_id' => 'required|integer|exists:departments,id',
            'role' => 'nullable|in:admin,employee',
        ]);

        return DB::transaction(function () use ($data) {
            $user = User::create([
                'name' => $data['name'],
                'email' => $data['employee_code'].'@sync.local',
                'password' => Hash::make(\Illuminate\Support\Str::random(32)),
                'employee_code' => $data['employee_code'],
                'pin' => $data['pin'],
                'department_id' => $data['department_id'],
                'role' => $data['role'] ?? 'employee',
                'active' => true,
                'status' => 'available',
            ]);

            $this->syncPermissions($user);

            return response()->json($user->load('department'), 201);
        });
    }

    public function updateEmployee(Request $r, User $user)
    {
        $data = $r->validate([
            'name' => 'sometimes|string|max:255',
            'department_id' => 'sometimes|nullable|integer|exists:departments,id',
            'active' => 'sometimes|boolean',
            'role' => 'sometimes|in:admin,employee',
        ]);

        return DB::transaction(function () use ($user, $data) {
            $departmentChanged = array_key_exists('department_id', $data) && $data['department_id'] !== $user->department_id;

            $user->update($data);

            if ($departmentChanged) {
                $this->syncPermissions($user->refresh());
            }

            return response()->json($user->load('department'));
        });
    }

    public function resetPin(Request $r, User $user)
    {
        $data = $r->validate(['pin' => 'required|string|regex:/^\d{4,6}$/']);
        $user->update(['pin' => $data['pin']]);

        return response()->json(['message' => 'PIN actualizado']);
    }

    /**
     * Permisos consistentes tras cambiar de departamento:
     * escuchar/transmitir en su canal de departamento y en canales generales.
     */
    private function syncPermissions(User $user): void
    {
        $user->load('department');
        $channelIds = collect();

        if ($user->department?->channel_id) {
            $channelIds->push($user->department->channel_id);
        }
        $generals = Channel::whereIn('type', ['general', 'emergency'])->pluck('id');
        $channelIds = $channelIds->merge($generals)->unique()->filter();

        foreach ($channelIds as $channelId) {
            ChannelPermission::updateOrCreate(
                ['department_id' => $user->department_id, 'channel_id' => $channelId],
                ['can_listen' => true, 'can_transmit' => true]
            );
        }
    }

    public function createDepartment(Request $r)
    {
        $data = $r->validate(['name' => 'required|string|max:255|unique:departments,name']);

        return DB::transaction(function () use ($data) {
            $channel = Channel::create(['name' => $data['name'], 'type' => 'private']);
            $dept = Department::create(['name' => $data['name'], 'channel_id' => $channel->id]);

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
            if (Department::where('name', $name)->exists()) continue;
            $channel = Channel::create(['name' => $name, 'type' => 'private']);
            Department::create(['name' => $name, 'channel_id' => $channel->id]);
            $created++;
        }

        return response()->json(['created' => $created, 'departments' => Department::all()]);
    }
}
