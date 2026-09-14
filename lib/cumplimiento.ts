/**
 * Indicadores de cumplimiento y productividad (R15, D9).
 *
 * "Cumplimiento" acá significa una sola cosa: si la tarea se terminó antes de
 * su fecha límite o después. Para poder medirlo hace falta saber CUÁNDO se
 * terminó, no sólo que está terminada: ese dato lo estampa el trigger de
 * `tasks.completed_at` que crea db/02_pedido.sql.
 *
 * Vive aparte de los componentes para poder probarlo sin navegador: el cálculo
 * de fechas es donde se esconden los errores.
 */

export type TareaMedible = {
    id: string
    status: string | null
    deadline: string | null
    completed_at: string | null
    project_id: string | null
}

/**
 * - `en-plazo`      terminada en la fecha límite o antes
 * - `fuera-de-plazo` terminada después
 * - `sin-fecha`     terminada, pero nunca tuvo fecha límite: no es medible
 * - `null`          todavía no está terminada
 */
export type EstadoCumplimiento = 'en-plazo' | 'fuera-de-plazo' | 'sin-fecha' | null

/** 'YYYY-MM-DD' a medianoche local (ver la nota en lib/task-status.ts). */
function fechaLocal(fecha: string): Date {
    const d = new Date(fecha + 'T00:00:00')
    d.setHours(0, 0, 0, 0)
    return d
}

/** Un timestamp a medianoche local, para comparar días y no instantes. */
function diaDe(iso: string): Date {
    const d = new Date(iso)
    d.setHours(0, 0, 0, 0)
    return d
}

export function evaluarCumplimiento(t: TareaMedible): EstadoCumplimiento {
    if (t.status !== 'Terminada' || !t.completed_at) return null
    if (!t.deadline) return 'sin-fecha'

    // Se comparan días, no instantes: terminar a las 23:50 del día del
    // vencimiento es en plazo, aunque el timestamp sea posterior a la
    // medianoche con la que arranca esa fecha.
    return diaDe(t.completed_at) <= fechaLocal(t.deadline) ? 'en-plazo' : 'fuera-de-plazo'
}

export type Resumen = {
    total: number
    terminadas: number
    pendientes: number
    enPlazo: number
    fueraDePlazo: number
    sinFecha: number
    /**
     * Porcentaje de cumplimiento sobre las tareas MEDIBLES, es decir las
     * terminadas que tenían fecha. null cuando no hay ninguna: mostrar 0%
     * cuando no hay nada que medir haría pensar que se incumplió todo.
     */
    porcentaje: number | null
}

export function resumir(tareas: TareaMedible[]): Resumen {
    let terminadas = 0, enPlazo = 0, fueraDePlazo = 0, sinFecha = 0

    for (const t of tareas) {
        const e = evaluarCumplimiento(t)
        if (e === null) continue
        terminadas++
        if (e === 'en-plazo') enPlazo++
        else if (e === 'fuera-de-plazo') fueraDePlazo++
        else sinFecha++
    }

    const medibles = enPlazo + fueraDePlazo
    return {
        total: tareas.length,
        terminadas,
        pendientes: tareas.length - terminadas,
        enPlazo,
        fueraDePlazo,
        sinFecha,
        porcentaje: medibles === 0 ? null : Math.round((enPlazo / medibles) * 100),
    }
}

/** ¿La tarea se terminó dentro de la ventana de los últimos `dias`? */
export function terminadaEnLosUltimos(t: TareaMedible, dias: number | null): boolean {
    if (t.status !== 'Terminada' || !t.completed_at) return false
    if (dias === null) return true

    const desde = new Date()
    desde.setHours(0, 0, 0, 0)
    desde.setDate(desde.getDate() - dias)
    return new Date(t.completed_at) >= desde
}

/**
 * Filtra por período de finalización, dejando pasar siempre las no terminadas.
 *
 * Las pendientes no tienen fecha de cierre contra la cual filtrar, y sacarlas
 * haría que las columnas de "asignadas" y "pendientes" cambiaran al mover el
 * período, que no es lo que uno espera de un filtro temporal de productividad.
 */
export function filtrarPorPeriodo(tareas: TareaMedible[], dias: number | null): TareaMedible[] {
    if (dias === null) return tareas
    return tareas.filter(t => t.status !== 'Terminada' || terminadaEnLosUltimos(t, dias))
}

/** Color del porcentaje de cumplimiento, para no repetir los cortes. */
export function colorCumplimiento(porcentaje: number | null): string {
    if (porcentaje === null) return 'text-slate-400'
    if (porcentaje >= 80) return 'text-emerald-700'
    if (porcentaje >= 50) return 'text-amber-700'
    return 'text-red-700'
}
