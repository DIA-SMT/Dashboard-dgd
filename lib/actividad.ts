/**
 * Piezas compartidas para leer el historial de cambios.
 *
 * Los triggers de `activity_log` anotan un renglón por campo modificado, con el
 * nombre de columna y los valores crudos. Traducirlo a castellano estaba
 * duplicado entre el historial del proyecto y la columna de actividad reciente;
 * acá vive una sola vez.
 *
 * Lo que NO se comparte es la forma de la oración: el historial de un proyecto
 * habla en tercera persona del cambio ("Cambió el estado de la tarea X"), y los
 * listados generales empiezan por la persona ("Fulano cambió el estado"). Son
 * dos lecturas distintas y forzarlas a una sola las empeora a las dos.
 */

export type RegistroActividad = {
    id: number
    entity_type: string
    entity_id: string
    action: string
    field: string | null
    old_value: string | null
    new_value: string | null
    changed_by: string | null
    changed_at: string | null
    profiles: { full_name: string | null } | null
}

/** Las columnas que se leen y qué se dice de cada una. */
export const NOMBRE_CAMPO: Record<string, string> = {
    title: 'el título',
    description: 'la descripción',
    status: 'el estado',
    deadline: 'la fecha límite',
    start_date: 'la fecha de inicio',
    objectives: 'los objetivos',
    scope: 'el alcance',
    priority: 'la prioridad',
    progress: 'el avance',
    area: 'el área',
    type: 'el tipo',
    notes: 'las notas',
    link: 'el enlace',
    parent_task_id: 'la tarea madre',
    completed_at: 'la fecha de cierre',
    completion_analysis: 'el análisis de cierre',
    upload_link: 'el enlace del material',
    owner_id: 'el responsable',
}

/** Campos que no aportan nada al leer un historial. */
export const CAMPOS_OCULTOS = new Set(['id', 'created_at', 'project_id'])

/**
 * Un valor crudo de la base, legible.
 *
 * Las marcas de tiempo son el caso importante: mostrarlas tal cual llena el
 * historial de ruido del tipo «2026-09-14T13:25:59.490457+00:00».
 */
export function valorLegible(v: string | null): string {
    if (v === null || v === '') return 'vacío'

    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00').toLocaleDateString('es-AR')

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
        const d = new Date(v)
        if (!isNaN(d.getTime())) return fechaHora(v)
    }

    if (v.length > 60) return `«${v.slice(0, 60)}…»`
    return `«${v}»`
}

export function fechaHora(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
        + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

/** "Hoy", "Ayer", "miércoles 14 de octubre". Para agrupar por día. */
export function etiquetaDeDia(iso: string | null): string {
    if (!iso) return 'Sin fecha'
    const d = new Date(iso)
    if (isNaN(d.getTime())) return 'Sin fecha'

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    const dia = new Date(d); dia.setHours(0, 0, 0, 0)
    const diferencia = Math.round((hoy.getTime() - dia.getTime()) / 86_400_000)

    if (diferencia === 0) return 'Hoy'
    if (diferencia === 1) return 'Ayer'
    return d.toLocaleDateString('es-AR', {
        weekday: 'long', day: 'numeric', month: 'long',
        ...(d.getFullYear() !== hoy.getFullYear() ? { year: 'numeric' } : {}),
    })
}

/**
 * Qué se hizo, empezando por el verbo y en minúscula, para poder colgarlo
 * después de un nombre: "Fulano <esto>".
 *
 * Devuelve null cuando el renglón no vale la pena mostrarlo.
 */
export function describirAccion(
    r: RegistroActividad,
    nombreDe: (tipo: string, id: string) => string | undefined
): string | null {
    const esProyecto = r.entity_type === 'project'
    const nombre = nombreDe(r.entity_type, r.entity_id)
    const cual = nombre ? `«${nombre}»` : '(eliminada)'
    const sujeto = esProyecto ? `el proyecto ${nombre ? `«${nombre}»` : '(eliminado)'}` : `la tarea ${cual}`
    const sujetoDe = esProyecto
        ? `del proyecto ${nombre ? `«${nombre}»` : '(eliminado)'}`
        : `de la tarea ${cual}`

    if (r.action === 'insert') return `creó ${sujeto}`
    if (r.action === 'delete') return `eliminó ${sujeto}`

    if (!r.field || CAMPOS_OCULTOS.has(r.field)) return null

    // El borrado es lógico: `habilita` cambia en vez de borrarse la fila.
    if (r.field === 'habilita') {
        return r.new_value === '0' ? `dio de baja ${sujeto}` : `reactivó ${sujeto}`
    }

    const campo = NOMBRE_CAMPO[r.field] ?? `«${r.field}»`
    if (r.old_value === null || r.old_value === '') {
        return `cargó ${campo} ${sujetoDe}: ${valorLegible(r.new_value)}`
    }
    return `cambió ${campo} ${sujetoDe}: ${valorLegible(r.old_value)} → ${valorLegible(r.new_value)}`
}

/** "cambió el estado" -> "Cambió el estado". Para los listados en tercera persona. */
export function conMayuscula(texto: string): string {
    return texto.charAt(0).toUpperCase() + texto.slice(1)
}
