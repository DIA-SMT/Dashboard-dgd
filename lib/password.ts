/**
 * Requisitos de contraseña, compartidos por el cliente y el servidor.
 *
 * Vive aparte de lib/auth-admin.ts a propósito: aquel importa next/headers y
 * la service key, así que no puede cargarse en el browser. La validación de
 * este archivo se usa en los dos lados, para que el formulario avise antes de
 * mandar y el servidor no confíe en que el formulario validó.
 */

export const PASSWORD_MIN = 8

export const REQUISITOS_PASSWORD = [
    `Al menos ${PASSWORD_MIN} caracteres`,
    'Al menos una letra',
    'Al menos un número',
]

/** Devuelve el mensaje de error, o null si la contraseña es válida. */
export function validarPassword(password: unknown): string | null {
    if (typeof password !== 'string' || password.length === 0) return 'La contraseña es obligatoria'
    if (password.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`
    if (!/[a-zA-Z]/.test(password)) return 'La contraseña debe incluir al menos una letra'
    if (!/[0-9]/.test(password)) return 'La contraseña debe incluir al menos un número'
    return null
}
