/**
 * Estados de tarea y vencimientos.
 *
 * Única fuente de verdad: antes los estados estaban escritos a mano en cada
 * selector y cada switch de colores, y la lógica de avance vivía duplicada en
 * dos componentes. Todo lo que decida según el estado de una tarea o su fecha
 * límite debería pasar por acá.
 *
 * `tasks.status` es texto libre en la base (no tiene enum ni CHECK), así que
 * esta lista es lo que la UI ofrece, no una restricción del motor.
 */

// Sin empezar / En desarrollo / Terminada ya existían. Pausada y Cancelada las
// suma el expediente (R8).
export const TASK_STATUSES = [
    'Sin empezar',
    'En desarrollo',
    'Pausada',
    'Terminada',
    'Cancelada',
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export const DEFAULT_TASK_STATUS: TaskStatus = 'Sin empezar'

/**
 * Estados terminales: la tarea ya no espera trabajo.
 *
 * Se usa para no marcar como vencida una tarea que ya se cerró. "Pausada" no
 * entra: está frenada, pero sigue pendiente, así que si se pasa la fecha
 * corresponde avisar.
 */
export function isTerminalStatus(status: string | null | undefined): boolean {
    return status === 'Terminada' || status === 'Cancelada'
}

export function isCompletedStatus(status: string | null | undefined): boolean {
    return status === 'Terminada'
}

/**
 * Una tarea cancelada no cuenta para el avance: no suma como hecha, pero
 * tampoco pesa en el total. Si no la excluyéramos del denominador, cancelar
 * una tarea bajaría el porcentaje del proyecto, que es lo contrario de lo que
 * uno espera.
 */
export function countsTowardProgress(status: string | null | undefined): boolean {
    return status !== 'Cancelada'
}

/** Porcentaje de avance (0-100) de un conjunto de tareas. */
export function computeProgress(tasks: { status: string | null }[]): number {
    const computables = tasks.filter(t => countsTowardProgress(t.status))
    if (computables.length === 0) return 0
    const hechas = computables.filter(t => isCompletedStatus(t.status)).length
    return Math.round((hechas / computables.length) * 100)
}

// ---------------------------------------------------------------------------
// Vencimientos (R12)
// ---------------------------------------------------------------------------

/**
 * Días de anticipación con los que una tarea se considera "próxima a vencer".
 *
 * Ojo: el tile "Vencen esta semana" de project-summary.tsx usa otro criterio
 * para PROYECTOS (semana calendario lunes a domingo). Acá usamos una ventana
 * móvil porque con la semana calendario, un domingo no habría nunca nada
 * próximo a vencer.
 */
export const DUE_SOON_DAYS = 7

export type DeadlineState = 'vencida' | 'por-vencer' | null

/**
 * 'YYYY-MM-DD' a medianoche LOCAL.
 *
 * El `T00:00:00` no es decorativo: sin él, el motor interpreta la fecha como
 * UTC y en Argentina (UTC-3) se corre un día para atrás, con lo que una tarea
 * que vence hoy aparecería como vencida ayer.
 */
function parseLocalDate(fecha: string): Date {
    const d = new Date(fecha + 'T00:00:00')
    d.setHours(0, 0, 0, 0)
    return d
}

/** Días que faltan para la fecha; negativo si ya pasó, 0 si es hoy. */
export function daysUntil(deadline: string): number {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const limite = parseLocalDate(deadline)
    return Math.round((limite.getTime() - hoy.getTime()) / 86_400_000)
}

/**
 * Clasifica una tarea según su fecha límite.
 *
 * Devuelve null si no tiene fecha o si ya está cerrada: una tarea terminada o
 * cancelada nunca se muestra como vencida.
 */
export function getDeadlineState(
    deadline: string | null | undefined,
    status: string | null | undefined
): DeadlineState {
    if (!deadline) return null
    if (isTerminalStatus(status)) return null

    const dias = daysUntil(deadline)
    if (dias < 0) return 'vencida'
    if (dias <= DUE_SOON_DAYS) return 'por-vencer'
    return null
}

/** Texto corto para el badge de vencimiento. */
export function getDeadlineLabel(deadline: string, state: DeadlineState): string | null {
    if (!state) return null
    const dias = daysUntil(deadline)
    if (state === 'vencida') {
        const atraso = Math.abs(dias)
        return atraso === 1 ? 'Vencida por 1 día' : `Vencida por ${atraso} días`
    }
    if (dias === 0) return 'Vence hoy'
    if (dias === 1) return 'Vence mañana'
    return `Vence en ${dias} días`
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

/** Clases del badge de estado. */
export function getStatusColor(status: string | null | undefined): string {
    switch (status) {
        case 'Terminada':
            return 'bg-green-100 text-green-800'
        case 'En desarrollo':
            return 'bg-blue-100 text-blue-800'
        case 'Pausada':
            return 'bg-amber-100 text-amber-800'
        case 'Cancelada':
            return 'bg-rose-100 text-rose-700 line-through'
        default:
            return 'bg-slate-100 text-slate-600'
    }
}

/** Clases del badge de vencimiento. */
export function getDeadlineColor(state: DeadlineState): string {
    switch (state) {
        case 'vencida':
            return 'bg-red-100 text-red-800 border-red-200'
        case 'por-vencer':
            return 'bg-amber-100 text-amber-800 border-amber-200'
        default:
            return ''
    }
}
