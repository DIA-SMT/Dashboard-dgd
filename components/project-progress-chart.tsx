'use client'

import { useMemo, useState } from 'react'
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TASK_STATUSES, computeProgress, getDeadlineState } from '@/lib/task-status'
import type { Project, Task } from '@/types'

export type TareaDelGrafico = Task & {
    projects: Project | null
    task_assignees?: { assignee_name: string }[] | null
}

/** Mismos tonos que los badges de estado, para que se lean como lo mismo. */
const COLOR_ESTADO: Record<string, string> = {
    'Terminada': '#10b981',
    'En desarrollo': '#3b82f6',
    'Pausada': '#f59e0b',
    'Sin empezar': '#cbd5e1',
    'Cancelada': '#fda4af',
}

// De hecho a no hecho, para que la barra se lea como una línea de avance.
const ORDEN_ESTADOS = ['Terminada', 'En desarrollo', 'Pausada', 'Sin empezar', 'Cancelada'] as const

const MAXIMO_FILAS = 12

/**
 * Etiqueta del eje: nombre arriba, total y avance abajo.
 *
 * El porcentaje sólo vivía en el tooltip, o sea que había que apuntar con el
 * mouse a cada barra para saber cómo venía. Acá se lee de un vistazo.
 */
function TickEje({ x, y, payload, filas }: {
    x?: number
    y?: number
    payload?: { value?: string }
    filas: Fila[]
}) {
    const fila = filas.find(f => f.nombre === payload?.value)
    if (!fila) return null

    const nombre = fila.nombre.length > 30 ? fila.nombre.slice(0, 29) + '…' : fila.nombre

    return (
        <g transform={`translate(${x ?? 0},${y ?? 0})`}>
            <text x={-8} y={-3} textAnchor="end" fontSize={11} fill="#334155">{nombre}</text>
            <text x={-8} y={10} textAnchor="end" fontSize={10} fill="#94a3b8">
                {fila.total} {fila.total === 1 ? 'tarea' : 'tareas'} · {fila.avance}%
            </text>
        </g>
    )
}

type Fila = {
    nombre: string
    total: number
    avance: number
    vencidas: number
} & Record<string, string | number>

function Etiqueta({ activePayload }: { activePayload?: { payload?: Fila }[] }) {
    const f = activePayload?.[0]?.payload
    if (!f) return null

    return (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
            <p className="mb-1.5 font-semibold text-slate-800">{f.nombre}</p>
            <p className="mb-1 text-slate-500">
                {f.total} {f.total === 1 ? 'tarea' : 'tareas'} · {f.avance}% de avance
            </p>
            {ORDEN_ESTADOS.map(e => {
                const v = Number(f[e] ?? 0)
                if (!v) return null
                return (
                    <p key={e} className="flex items-center gap-1.5 text-slate-600">
                        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: COLOR_ESTADO[e] }} />
                        {e}: <span className="font-medium">{v}</span>
                    </p>
                )
            })}
            {f.vencidas > 0 && (
                <p className="mt-1.5 border-t border-slate-100 pt-1.5 font-medium text-red-600">
                    {f.vencidas} {f.vencidas === 1 ? 'vencida' : 'vencidas'}
                </p>
            )}
        </div>
    )
}

/**
 * Desglose de tareas por proyecto o por responsable.
 *
 * Antes eran dos series —completadas y pendientes— apiladas en vertical. Con
 * cinco estados, "pendiente" mezclaba cosas muy distintas: una tarea pausada,
 * una sin empezar y una cancelada no son lo mismo. Y en vertical los nombres
 * de proyecto se cortaban o se superponían; en horizontal entran enteros.
 */
export function ProjectProgressChart({ tasks }: { tasks: TareaDelGrafico[] }) {
    const [eje, setEje] = useState<'proyecto' | 'responsable'>('proyecto')

    const filas = useMemo<Fila[]>(() => {
        // Las tareas de proyectos ya cerrados no aportan al seguimiento.
        const vigentes = tasks.filter(t => !t.projects?.completed_at)
        const grupos = new Map<string, TareaDelGrafico[]>()

        for (const t of vigentes) {
            const claves = eje === 'proyecto'
                ? [t.projects?.title ?? 'Sin proyecto']
                : (t.task_assignees?.length
                    ? t.task_assignees.map(a => a.assignee_name)
                    : ['Sin asignar'])

            for (const c of claves) {
                if (!grupos.has(c)) grupos.set(c, [])
                grupos.get(c)!.push(t)
            }
        }

        return [...grupos.entries()]
            .map(([nombre, ts]) => {
                const fila: Fila = {
                    nombre,
                    total: ts.length,
                    avance: computeProgress(ts),
                    vencidas: ts.filter(t => getDeadlineState(t.deadline, t.status) === 'vencida').length,
                }
                for (const e of TASK_STATUSES) {
                    fila[e] = ts.filter(t => (t.status ?? 'Sin empezar') === e).length
                }
                return fila
            })
            .sort((a, b) => b.total - a.total)
    }, [tasks, eje])

    const visibles = filas.slice(0, MAXIMO_FILAS)
    const ocultas = filas.length - visibles.length
    const alto = Math.max(220, visibles.length * 38 + 60)

    return (
        <Card className="mb-8 border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                <CardTitle className="text-base">Tareas por {eje}</CardTitle>
                <Select value={eje} onValueChange={(v) => setEje(v as 'proyecto' | 'responsable')}>
                    <SelectTrigger className="w-[180px] bg-white">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="proyecto">Por proyecto</SelectItem>
                        <SelectItem value="responsable">Por responsable</SelectItem>
                    </SelectContent>
                </Select>
            </CardHeader>

            <CardContent>
                {visibles.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-500">
                        Todavía no hay tareas para graficar.
                    </p>
                ) : (
                    <>
                        <div style={{ height: alto }} className="w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={visibles}
                                    layout="vertical"
                                    margin={{ top: 4, right: 44, left: 8, bottom: 4 }}
                                    barCategoryGap="22%"
                                >
                                    <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                                    <XAxis
                                        type="number"
                                        allowDecimals={false}
                                        tick={{ fontSize: 11, fill: '#64748b' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        type="category"
                                        dataKey="nombre"
                                        width={190}
                                        tick={(props) => <TickEje {...props} filas={visibles} />}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        cursor={{ fill: '#f8fafc' }}
                                        content={({ active, payload }) =>
                                            active ? <Etiqueta activePayload={payload as never} /> : null
                                        }
                                    />
                                    {ORDEN_ESTADOS.map((estado, i) => (
                                        <Bar
                                            key={estado}
                                            dataKey={estado}
                                            name={estado}
                                            stackId="a"
                                            fill={COLOR_ESTADO[estado]}
                                            // Sólo se redondean los extremos de la barra apilada.
                                            radius={
                                                i === 0 ? [3, 0, 0, 3]
                                                    : i === ORDEN_ESTADOS.length - 1 ? [0, 3, 3, 0]
                                                        : 0
                                            }
                                        >
                                            {visibles.map((f) => (
                                                <Cell key={f.nombre} />
                                            ))}
                                        </Bar>
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Leyenda propia: la de recharts ordenaba los ítems por su
                            cuenta —salía alfabética— y no se correspondía con el orden
                            del apilado, que va de hecho a no hecho. */}
                        <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                            {ORDEN_ESTADOS.map(e => (
                                <span key={e} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_ESTADO[e] }} />
                                    {e}
                                </span>
                            ))}
                        </div>

                        {ocultas > 0 && (
                            <p className="mt-1 text-center text-xs text-slate-400">
                                Se muestran los {MAXIMO_FILAS} con más tareas; {ocultas}{' '}
                                {ocultas === 1 ? 'queda' : 'quedan'} fuera del gráfico.
                            </p>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    )
}
