<?php

namespace App\Services;

use App\Http\Controllers\Api\DeviceController;
use App\Models\Device;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

/**
 * Emisión de códigos de activación de un solo uso.
 *
 * - 8 dígitos (10^8 combinaciones) para mantener una UX sencilla con más entropía
 *   que los 6 dígitos originales; los códigos de 6 dígitos ya emitidos siguen siendo
 *   válidos porque la búsqueda es por HMAC del texto introducido.
 * - Ventana de activación de 12 h.
 * - activation_lookup es UNIQUE: se comprueba la colisión antes de guardar y, si
 *   aun así otra petición concurrente gana la carrera, se regenera.
 */
class DeviceActivationCodeService
{
    public const CODE_DIGITS = 8;

    public const TTL_HOURS = 12;

    private const MAX_ATTEMPTS = 10;

    /**
     * Genera y guarda un código nuevo para el device.
     *
     * @param  array<string, mixed>  $attributes  atributos adicionales a guardar junto con el código
     * @return array{code: string, expires_at: Carbon}
     */
    public function issue(Device $device, array $attributes = []): array
    {
        $expiresAt = now()->addHours(self::TTL_HOURS);

        for ($attempt = 0; $attempt < self::MAX_ATTEMPTS; $attempt++) {
            $code = $this->generateCode();
            $lookup = DeviceController::codeLookup($code);

            if (Device::where('activation_lookup', $lookup)->whereKeyNot($device->id)->exists()) {
                continue;
            }

            try {
                $device->update($attributes + [
                    'activation_token_hash' => Hash::make($code),
                    'activation_lookup' => $lookup,
                    'activation_expires_at' => $expiresAt,
                ]);
            } catch (UniqueConstraintViolationException) {
                continue;
            }

            return ['code' => $code, 'expires_at' => $expiresAt];
        }

        throw new RuntimeException('No se pudo generar un código de activación único.');
    }

    protected function generateCode(): string
    {
        $max = (10 ** self::CODE_DIGITS) - 1;

        return str_pad((string) random_int(0, $max), self::CODE_DIGITS, '0', STR_PAD_LEFT);
    }
}
