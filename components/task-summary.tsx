'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, AlertTriangle, CalendarClock, ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Project, Task } from '@/types'
import {
    getDeadlineState,
    getDeadlineLabel,
    getDeadlineColor,
    getStatusColor,
    DEFAULT_TASK_STATUS,
} from '@/lib/task-status'

export type TareaConProyecto = Task & { projects: Project | null }

type Grupo = 'en_proceso' | 'vencidas' | 'por_vencer'

/**
 * Indicadores de tareas del tablero.
 *
 * El expediente pide ver tareas en proceso, vencidas y próximas a vencer, y
 * hasta ahora el tablero sólo contaba proyectos. Un número suelto no sirve de
 * mucho —saber que hay 7 vencidas sin saber cuáles no permite hacer nada—,
 * así que cada indicador despliega su lista.
 */
export function TaskSummary({ tasks }: { tasks: TareaConProyecto[] }) {
    const [abierto, setAbierto] = useState<Grupo | null>(null)

    const grupos = useMemo(() => {
        // Una tarea de un proyecto ya cerrado no es trabajo pendiente, por más
        // que su fecha haya pasado.
        const vigentes = tasks.filter(t => !t.projects?.completed_at)

        return {
            en_proceso: vigentes.filter(t => t.status === 'En desarrollo'),
            vencidas: vigentes.filter(t => getDeadlineState(t.deadline, t.status) === 'vencida'),
            por_vencer: vigentes.filter(t => getDeadlineState(t.deadline, t.status) === 'por-vencer'),
        }
    }, [tasks])

    const indicadores: { grupo: Grupo; icono: LucideIcon; etiqueta: string; tono: string }[] = [
        { grupo: 'en_proceso', icono: Clock, etiqueta: 'Tareas en proceso', tono: 'bg-blue-50 text-blue-700' },
        { grupo: 'vencidas', icono: AlertTriangle, etiqueta: 'Tareas vencidas', tono: 'bg-red-50 text-red-700' },
        { grupo: 'por_vencer', icono: CalendarClock, etiqueta: 'Próximas a vencer', tono: 'bg-amber-50 text-amber-700' },
    ]

    const listaAbierta = abierto ? grupos[abierto] : []

    return (
        <Card className="mb-6 overflow-hidden border-slate-200 bg-white shadow-sm">
            <CardContent className="p-0">
                <div className="grid grid-cols-1 gap-px bg-slate-200 sm:grid-cols-3">
                    {indicadores.map(({ grupo, icono: Icono, etiqueta, tono }) => {
                        const cantidad = grupos[grupo].length
                        const activo = abierto === grupo
                        return (
                            <button
                                key={grupo}
                                onClick={() => setAbierto(activo ? null : grupo)}
                                aria-expanded={activo}
                                disabled={cantidad === 0}
                                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                                    activo ? 'bg-slate-50 ring-1 ring-inset ring-slate-200' : 'bg-white hover:bg-slate-50/70'
                                } ${cantidad === 0 ? 'cursor-default opacity-60' : ''}`}
                            >
                                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${tono}`}>
                                    <Icono className="h-[17px] w-[17px]" strokeWidth={1.75} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                                        {etiqueta}
                                    </span>
                                    <span className="block text-lg font-semibold leading-tight text-slate-900 tabular-nums">
                                        {cantidad}
                                    </span>
                                </span>
                                {cantidad > 0 && (
                                    <ChevronDown
                                        className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${activo ? 'rotate-180' : ''}`}
                                    />
                                )}
                            </button>
                        )
                    })}
                </div>

                {abierto && listaAbierta.length > 0 && (
                    <div className="max-h-72 overflow-y-auto border-t border-slate-200 bg-slate-50/60">
                        <ul className="divide-y divide-slate-100">
                            {listaAbierta.map((t) => {
                                const vencimiento = getDeadlineState(t.deadline, t.status)
                                return (
                                    <li key={t.id} className="px-4 py-2.5">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-slate-800">{t.title}</p>
                                                {t.projects && (
                                                    <Link
                                                        href={`/projects/${t.projects.id}`}
                                                        className="text-xs text-slate-500 hover:text-[#0065ff] hover:underline"
                                                    >
                                                        {t.projects.title}
                                                    </Link>
                                                )}
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1.5">
                                                {t.deadline && vencimiento && (
                                                    <Badge variant="outline" className={`text-xs ${getDeadlineColor(vencimiento)}`}>
                                                        {getDeadlineLabel(t.deadline, vencimiento)}
                                                    </Badge>
                                                )}
                                                <Badge className={`text-xs ${getStatusColor(t.status)}`}>
                                                    {t.status || DEFAULT_TASK_STATUS}
                                                </Badge>
                                            </div>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
