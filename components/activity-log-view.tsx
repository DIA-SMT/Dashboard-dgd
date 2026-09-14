'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react'

type Registro = {
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

/** Nombre legible de cada columna. Las que no figuran se muestran tal cual. */
const NOMBRE_CAMPO: Record<string, string> = {
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
const CAMPOS_OCULTOS = new Set(['id', 'created_at', 'project_id'])

function valorLegible(v: string | null): string {
    if (v === null || v === '') return 'vacío'

    // Fechas: 'YYYY-MM-DD' al formato local.
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00').toLocaleDateString('es-AR')

    // Timestamps: mostrarlos crudos llena el historial de ruido ilegible del
    // tipo «2026-09-14T13:25:59.490457+00:00».
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
        const d = new Date(v)
        if (!isNaN(d.getTime())) {
            return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
                ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        }
    }

    if (v.length > 60) return `«${v.slice(0, 60)}…»`
    return `«${v}»`
}

function formatarFecha(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
        ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export function ActivityLogView({ projectId, tareas }: {
    projectId: string
    /** id -> título, para poder nombrar la tarea de cada cambio. */
    tareas: Record<string, string>
}) {
    const [registros, setRegistros] = useState<Registro[]>([])
    const [cargando, setCargando] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // `tareas` es un objeto que el padre rearma en cada render, así que ponerlo
    // como dependencia del useCallback recrea `cargar` siempre, el useEffect
    // vuelve a disparar, el setState re-renderiza y la consulta se repite sin
    // fin. La clave derivada sólo cambia cuando cambian los ids de verdad.
    const claveTareas = Object.keys(tareas).sort().join('|')

    const cargar = useCallback(async () => {
        setCargando(true)
        setError(null)
        try {
            const ids = claveTareas ? [projectId, ...claveTareas.split('|')] : [projectId]
            const { data, error: err } = await supabase
                .from('activity_log')
                .select('id, entity_type, entity_id, action, field, old_value, new_value, changed_by, changed_at, profiles(full_name)')
                .in('entity_id', ids)
                .order('changed_at', { ascending: false })
                .limit(150)

            if (err) throw err
            setRegistros((data ?? []) as unknown as Registro[])
        } catch (e) {
            console.error('Error cargando el historial:', e)
            setError(e instanceof Error ? e.message : 'No se pudo cargar el historial')
        } finally {
            setCargando(false)
        }
    }, [projectId, claveTareas])

    useEffect(() => { cargar() }, [cargar])

    function describir(r: Registro): string | null {
        const esProyecto = r.entity_type === 'project'
        const nombreTarea = tareas[r.entity_id] ? `«${tareas[r.entity_id]}»` : '(eliminada)'

        // Dos formas del mismo sujeto: una para cuando va suelto ("Creó el
        // proyecto") y otra contraída para cuando va precedido de "de", que si
        // no queda "de el proyecto".
        const sujeto = esProyecto ? 'el proyecto' : `la tarea ${nombreTarea}`
        const sujetoDe = esProyecto ? 'del proyecto' : `de la tarea ${nombreTarea}`

        if (r.action === 'insert') return `Creó ${sujeto}`
        if (r.action === 'delete') return `Eliminó ${sujeto}`

        if (!r.field || CAMPOS_OCULTOS.has(r.field)) return null

        // El borrado es lógico: habilita cambia en vez de borrarse la fila.
        if (r.field === 'habilita') {
            return r.new_value === '0' ? `Dio de baja ${sujeto}` : `Reactivó ${sujeto}`
        }

        const campo = NOMBRE_CAMPO[r.field] ?? `«${r.field}»`
        if (r.old_value === null || r.old_value === '') {
            return `Cargó ${campo} ${sujetoDe}: ${valorLegible(r.new_value)}`
        }
        return `Cambió ${campo} ${sujetoDe}: ${valorLegible(r.old_value)} → ${valorLegible(r.new_value)}`
    }

    const visibles = registros
        .map(r => ({ r, texto: describir(r) }))
        .filter((x): x is { r: Registro; texto: string } => x.texto !== null)

    if (cargando) {
        return (
            <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
        )
    }

    if (error) return <p className="py-4 text-sm text-red-600">{error}</p>

    if (visibles.length === 0) {
        return (
            <p className="py-4 text-sm italic text-slate-400">
                Todavía no hay movimientos registrados en este proyecto.
            </p>
        )
    }

    return (
        <ul className="max-h-96 space-y-0 overflow-y-auto">
            {visibles.map(({ r, texto }) => {
                const Icono = r.action === 'insert' ? Plus : r.action === 'delete' ? Trash2 : Pencil
                const tono = r.action === 'insert'
                    ? 'bg-emerald-50 text-emerald-700'
                    : r.action === 'delete'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-slate-100 text-slate-500'
                return (
                    <li key={r.id} className="flex gap-3 border-b border-slate-100 py-2.5 last:border-0">
                        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded ${tono}`}>
                            <Icono className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm text-slate-700">{texto}</p>
                            <p className="text-[11px] text-slate-400">
                                {r.profiles?.full_name || 'Sistema'} · {formatarFecha(r.changed_at)}
                            </p>
                        </div>
                    </li>
                )
            })}
        </ul>
    )
}
