'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react'
import {
    type RegistroActividad, describirAccion, conMayuscula, fechaHora,
} from '@/lib/actividad'

export function ActivityLogView({ projectId, proyecto, tareas }: {
    projectId: string
    /** El título del proyecto, para poder nombrarlo en los renglones. */
    proyecto: string
    /** id -> título, para poder nombrar la tarea de cada cambio. */
    tareas: Record<string, string>
}) {
    const [registros, setRegistros] = useState<RegistroActividad[]>([])
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
            setRegistros((data ?? []) as unknown as RegistroActividad[])
        } catch (e) {
            console.error('Error cargando el historial:', e)
            setError(e instanceof Error ? e.message : 'No se pudo cargar el historial')
        } finally {
            setCargando(false)
        }
    }, [projectId, claveTareas])

    useEffect(() => { cargar() }, [cargar])

    function describir(r: RegistroActividad): string | null {
        const texto = describirAccion(r, (tipo, id) =>
            tipo === 'project' ? (id === projectId ? proyecto : undefined) : tareas[id])
        return texto ? conMayuscula(texto) : null
    }

    const visibles = registros
        .map(r => ({ r, texto: describir(r) }))
        .filter((x): x is { r: RegistroActividad; texto: string } => x.texto !== null)

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
                                {r.profiles?.full_name || 'Sistema'} · {fechaHora(r.changed_at)}
                            </p>
                        </div>
                    </li>
                )
            })}
        </ul>
    )
}
