'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { iniciales, tonoAvatar, tiempoRelativo, diaYMes } from '@/lib/ui'
import { getDeadlineState, getStatusColor, isTerminalStatus } from '@/lib/task-status'
import type { Project, Task } from '@/types'

type TareaConProyecto = Task & { projects: Project | null }

type Registro = {
    id: number
    entity_type: string
    entity_id: string
    action: string
    field: string | null
    new_value: string | null
    changed_at: string | null
    profiles: { full_name: string | null } | null
}

const CAMPOS_LEGIBLES: Record<string, string> = {
    title: 'el título',
    description: 'la descripción',
    status: 'el estado',
    deadline: 'la fecha límite',
    start_date: 'la fecha de inicio',
    objectives: 'los objetivos',
    scope: 'el alcance',
    priority: 'la prioridad',
    progress: 'el avance',
    owner_id: 'el responsable',
    notes: 'las notas',
    completed_at: 'el cierre',
}

function Encabezado({ titulo, href }: { titulo: string; href?: string }) {
    return (
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <h2 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">{titulo}</h2>
            {href && (
                <Link href={href} className="text-[11px] font-medium text-[#0065ff] hover:underline">
                    Ver todos
                </Link>
            )}
        </div>
    )
}

function Pastilla({ texto, clase }: { texto: string; clase: string }) {
    return (
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${clase}`}>
            {texto}
        </span>
    )
}

/**
 * Columna de contexto: qué vence pronto y qué se movió últimamente.
 *
 * Las dos cosas responden a la misma pregunta —"¿de qué me tengo que ocupar
 * ahora?"— que la tabla de proyectos, ordenada por lo que uno elija, no
 * contesta sola.
 */
export function PanelLateral({ proyectos, tareas }: {
    proyectos: Project[]
    tareas: TareaConProyecto[]
}) {
    const [actividad, setActividad] = useState<Registro[]>([])

    useEffect(() => {
        // La guarda evita dejar estado después de desmontar: el panel se
        // desmonta al navegar, y la consulta puede volver después.
        let vigente = true

        ;(async () => {
            const { data, error } = await supabase
                .from('activity_log')
                .select('id, entity_type, entity_id, action, field, new_value, changed_at, profiles(full_name)')
                .order('changed_at', { ascending: false })
                .limit(40)

            if (!vigente) return
            if (error) {
                console.error('Error cargando la actividad reciente:', error)
                return
            }
            setActividad((data ?? []) as unknown as Registro[])
        })()

        return () => { vigente = false }
    }, [])

    // --- próximos vencimientos: proyectos y tareas mezclados por fecha ---
    const vencimientos = useMemo(() => {
        const filas: {
            id: string; fecha: string; titulo: string; subtitulo: string
            pastilla: { texto: string; clase: string }; href: string
        }[] = []

        for (const p of proyectos) {
            if (!p.deadline || p.completed_at) continue
            const vencido = new Date(p.deadline + 'T00:00:00') < new Date(new Date().toDateString())
            filas.push({
                id: `p-${p.id}`,
                fecha: p.deadline,
                titulo: p.title,
                subtitulo: p.description || p.area || 'Proyecto',
                href: `/projects/${p.id}`,
                pastilla: vencido
                    ? { texto: 'Vencido', clase: 'bg-red-50 text-red-700' }
                    : p.priority === 'Urgente'
                        ? { texto: 'Urgente', clase: 'bg-amber-50 text-amber-700' }
                        : { texto: 'Activo', clase: 'bg-emerald-50 text-emerald-700' },
            })
        }

        for (const t of tareas) {
            if (!t.deadline || isTerminalStatus(t.status) || t.projects?.completed_at) continue
            const estado = getDeadlineState(t.deadline, t.status)
            filas.push({
                id: `t-${t.id}`,
                fecha: t.deadline,
                titulo: t.title,
                subtitulo: t.projects?.title ?? 'Sin proyecto',
                href: t.project_id ? `/projects/${t.project_id}` : '/',
                pastilla: estado === 'vencida'
                    ? { texto: 'Vencida', clase: 'bg-red-50 text-red-700' }
                    : { texto: t.status ?? 'Tarea', clase: getStatusColor(t.status) },
            })
        }

        return filas.sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 6)
    }, [proyectos, tareas])

    // --- actividad legible ---
    const movimientos = useMemo(() => {
        const nombreProyecto = new Map(proyectos.map(p => [p.id, p.title]))
        const nombreTarea = new Map(tareas.map(t => [t.id, t.title]))

        return actividad
            .map(r => {
                const esProyecto = r.entity_type === 'project'
                const nombre = esProyecto ? nombreProyecto.get(r.entity_id) : nombreTarea.get(r.entity_id)
                if (!nombre) return null

                const quien = r.profiles?.full_name || 'Sistema'
                let accion: string
                if (r.action === 'insert') accion = esProyecto ? 'creó el proyecto' : 'creó la tarea'
                else if (r.action === 'delete') accion = esProyecto ? 'eliminó el proyecto' : 'eliminó la tarea'
                else if (r.field === 'status') accion = `cambió el estado a ${r.new_value ?? '—'} en`
                else if (r.field === 'habilita') accion = r.new_value === '0' ? 'dio de baja' : 'reactivó'
                else if (r.field && CAMPOS_LEGIBLES[r.field]) accion = `actualizó ${CAMPOS_LEGIBLES[r.field]} de`
                else return null

                return { id: r.id, quien, accion, nombre, cuando: r.changed_at, esProyecto, entityId: r.entity_id }
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
            .slice(0, 6)
    }, [actividad, proyectos, tareas])

    return (
        <div className="flex flex-col gap-4">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <Encabezado titulo="Próximos vencimientos" href="/assignments" />
                {vencimientos.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-slate-400">Nada por vencer.</p>
                ) : (
                    <ul className="divide-y divide-slate-50 dark:divide-slate-800">
                        {vencimientos.map(v => {
                            const { dia, mes } = diaYMes(v.fecha)
                            return (
                                <li key={v.id}>
                                    <Link href={v.href} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60">
                                        <span className="flex w-8 shrink-0 flex-col items-center leading-none">
                                            <span className="text-base font-semibold text-slate-800 tabular-nums dark:text-slate-100">{dia}</span>
                                            <span className="mt-0.5 text-[9px] font-medium text-slate-400">{mes}</span>
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-xs font-medium text-slate-800 dark:text-slate-100">{v.titulo}</span>
                                            <span className="block truncate text-[11px] text-slate-400">{v.subtitulo}</span>
                                        </span>
                                        <Pastilla texto={v.pastilla.texto} clase={v.pastilla.clase} />
                                    </Link>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <Encabezado titulo="Actividad reciente" />
                {movimientos.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-slate-400">Todavía no hay movimientos.</p>
                ) : (
                    <ul className="divide-y divide-slate-50 dark:divide-slate-800">
                        {movimientos.map(m => (
                            <li key={m.id} className="flex items-start gap-2.5 px-4 py-2.5">
                                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${tonoAvatar(m.quien)}`}>
                                    {iniciales(m.quien)}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                                        <span className="font-medium text-slate-800 dark:text-slate-100">{m.quien}</span>{' '}
                                        {m.accion}{' '}
                                        {m.esProyecto ? (
                                            <Link href={`/projects/${m.entityId}`} className="font-medium text-slate-800 hover:text-[#0065ff] dark:text-slate-100">
                                                {m.nombre}
                                            </Link>
                                        ) : (
                                            <span className="font-medium text-slate-800 dark:text-slate-100">{m.nombre}</span>
                                        )}
                                    </span>
                                    <span className="mt-0.5 block text-[10px] text-slate-400">{tiempoRelativo(m.cuando)}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    )
}
