'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, AlertCircle, CheckCircle2, CalendarX, ListChecks, HelpCircle } from 'lucide-react'
import {
    resumir, filtrarPorPeriodo, colorCumplimiento,
    type TareaMedible, type Resumen,
} from '@/lib/cumplimiento'

type Tarea = TareaMedible & { title: string }
type Proyecto = { id: string; title: string; deadline: string | null; completed_at: string | null }
type Asignacion = { task_id: string; assignee_name: string }

const PERIODOS = [
    { valor: '30', etiqueta: 'Últimos 30 días' },
    { valor: '90', etiqueta: 'Últimos 90 días' },
    { valor: 'todo', etiqueta: 'Todo el historial' },
]

function Porcentaje({ valor }: { valor: number | null }) {
    if (valor === null) {
        return (
            <span className="inline-flex items-center gap-1 text-sm text-slate-400">
                <HelpCircle className="h-3.5 w-3.5" />
                sin medir
            </span>
        )
    }
    return <span className={`font-semibold tabular-nums ${colorCumplimiento(valor)}`}>{valor}%</span>
}

function Tarjeta({ icono: Icono, tono, etiqueta, valor, detalle }: {
    icono: typeof CheckCircle2
    tono: string
    etiqueta: string
    valor: string | number
    detalle?: string
}) {
    return (
        <div className="flex items-center gap-3 bg-white px-4 py-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${tono}`}>
                <Icono className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">{etiqueta}</span>
                <span className="block text-xl font-semibold leading-tight text-slate-900 tabular-nums">{valor}</span>
                {detalle && <span className="block text-[11px] text-slate-400">{detalle}</span>}
            </span>
        </div>
    )
}

/**
 * Indicadores de cumplimiento y productividad (R15, D9).
 *
 * "Cumplimiento" es una sola cosa: qué proporción de las tareas terminadas se
 * cerró dentro de su fecha límite. Las que nunca tuvieron fecha se cuentan
 * aparte y no entran en el porcentaje: no se puede incumplir un plazo que no
 * se fijó, y meterlas bajaría el número sin que nadie haya llegado tarde.
 */
export function IndicadoresView() {
    const [tareas, setTareas] = useState<Tarea[]>([])
    const [proyectos, setProyectos] = useState<Proyecto[]>([])
    const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
    const [periodo, setPeriodo] = useState('90')
    const [cargando, setCargando] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const cargar = useCallback(async () => {
        setCargando(true)
        setError(null)
        try {
            const [t, p, a] = await Promise.all([
                supabase.from('tasks').select('id, title, status, deadline, completed_at, project_id').eq('habilita', 1),
                supabase.from('projects').select('id, title, deadline, completed_at').eq('habilita', 1),
                supabase.from('task_assignees').select('task_id, assignee_name').eq('habilita', 1),
            ])
            if (t.error) throw t.error
            if (p.error) throw p.error
            if (a.error) throw a.error

            setTareas((t.data ?? []) as Tarea[])
            setProyectos((p.data ?? []) as Proyecto[])
            setAsignaciones((a.data ?? []) as Asignacion[])
        } catch (e) {
            console.error('Error cargando indicadores:', e)
            setError(e instanceof Error ? e.message : 'No se pudieron cargar los indicadores')
        } finally {
            setCargando(false)
        }
    }, [])

    useEffect(() => { cargar() }, [cargar])

    const dias = periodo === 'todo' ? null : Number(periodo)
    const enPeriodo = useMemo(() => filtrarPorPeriodo(tareas, dias), [tareas, dias])
    const global = useMemo(() => resumir(enPeriodo), [enPeriodo])

    const porResponsable = useMemo(() => {
        const porTarea = new Map(enPeriodo.map(t => [t.id, t]))
        const acum = new Map<string, TareaMedible[]>()

        for (const a of asignaciones) {
            const t = porTarea.get(a.task_id)
            if (!t) continue
            if (!acum.has(a.assignee_name)) acum.set(a.assignee_name, [])
            acum.get(a.assignee_name)!.push(t)
        }

        return [...acum.entries()]
            .map(([nombre, ts]) => ({ nombre, ...resumir(ts) }))
            .sort((x, y) => y.terminadas - x.terminadas || x.nombre.localeCompare(y.nombre))
    }, [enPeriodo, asignaciones])

    const porProyecto = useMemo(() => {
        return proyectos
            .map(p => {
                const ts = enPeriodo.filter(t => t.project_id === p.id)
                const r: Resumen = resumir(ts)
                // Cumplimiento del proyecto en sí: se cerró antes de su fecha o no.
                let cierre: 'en-plazo' | 'fuera-de-plazo' | null = null
                if (p.completed_at && p.deadline) {
                    const fin = new Date(p.completed_at); fin.setHours(0, 0, 0, 0)
                    const lim = new Date(p.deadline + 'T00:00:00'); lim.setHours(0, 0, 0, 0)
                    cierre = fin <= lim ? 'en-plazo' : 'fuera-de-plazo'
                }
                return { ...p, ...r, cierre }
            })
            .filter(p => p.total > 0)
            .sort((a, b) => (a.porcentaje ?? 101) - (b.porcentaje ?? 101))
    }, [proyectos, enPeriodo])

    if (cargando) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
        )
    }

    if (error) {
        return (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500">
                    Sobre las tareas terminadas: cuántas se cerraron dentro de su fecha límite.
                </p>
                <Select value={periodo} onValueChange={setPeriodo}>
                    <SelectTrigger className="w-[190px] bg-white">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {PERIODOS.map(p => (
                            <SelectItem key={p.valor} value={p.valor}>{p.etiqueta}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <Card className="overflow-hidden border-slate-200 shadow-sm">
                <CardContent className="p-0">
                    <div className="grid grid-cols-2 gap-px bg-slate-200 lg:grid-cols-4">
                        <Tarjeta
                            icono={ListChecks} tono="bg-blue-50 text-blue-700"
                            etiqueta="Tareas terminadas" valor={global.terminadas}
                            detalle={`${global.pendientes} pendientes`}
                        />
                        <Tarjeta
                            icono={CheckCircle2} tono="bg-emerald-50 text-emerald-700"
                            etiqueta="Cerradas en plazo" valor={global.enPlazo}
                        />
                        <Tarjeta
                            icono={CalendarX} tono="bg-red-50 text-red-700"
                            etiqueta="Fuera de plazo" valor={global.fueraDePlazo}
                        />
                        <Tarjeta
                            icono={HelpCircle} tono="bg-slate-100 text-slate-600"
                            etiqueta="Nivel de cumplimiento"
                            valor={global.porcentaje === null ? '—' : `${global.porcentaje}%`}
                            detalle={global.sinFecha > 0 ? `${global.sinFecha} sin fecha límite, no medibles` : undefined}
                        />
                    </div>
                </CardContent>
            </Card>

            <section>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Por responsable
                </h2>
                <div className="rounded-lg border border-slate-200 bg-white">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Responsable</TableHead>
                                <TableHead className="text-right">Asignadas</TableHead>
                                <TableHead className="text-right">Terminadas</TableHead>
                                <TableHead className="text-right">En plazo</TableHead>
                                <TableHead className="text-right">Fuera</TableHead>
                                <TableHead className="text-right">Cumplimiento</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {porResponsable.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                                        No hay tareas asignadas en este período.
                                    </TableCell>
                                </TableRow>
                            )}
                            {porResponsable.map(r => (
                                <TableRow key={r.nombre}>
                                    <TableCell className="font-medium">{r.nombre}</TableCell>
                                    <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                                    <TableCell className="text-right tabular-nums">{r.terminadas}</TableCell>
                                    <TableCell className="text-right tabular-nums text-emerald-700">{r.enPlazo}</TableCell>
                                    <TableCell className="text-right tabular-nums text-red-700">{r.fueraDePlazo}</TableCell>
                                    <TableCell className="text-right"><Porcentaje valor={r.porcentaje} /></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </section>

            <section>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Por proyecto
                </h2>
                <div className="rounded-lg border border-slate-200 bg-white">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Proyecto</TableHead>
                                <TableHead className="text-right">Tareas</TableHead>
                                <TableHead className="text-right">Terminadas</TableHead>
                                <TableHead className="text-right">En plazo</TableHead>
                                <TableHead className="text-right">Fuera</TableHead>
                                <TableHead className="text-right">Cumplimiento</TableHead>
                                <TableHead>Cierre</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {porProyecto.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                                        No hay proyectos con tareas en este período.
                                    </TableCell>
                                </TableRow>
                            )}
                            {porProyecto.map(p => (
                                <TableRow key={p.id}>
                                    <TableCell className="font-medium">
                                        <Link href={`/projects/${p.id}`} className="hover:text-[#0065ff] hover:underline">
                                            {p.title}
                                        </Link>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{p.total}</TableCell>
                                    <TableCell className="text-right tabular-nums">{p.terminadas}</TableCell>
                                    <TableCell className="text-right tabular-nums text-emerald-700">{p.enPlazo}</TableCell>
                                    <TableCell className="text-right tabular-nums text-red-700">{p.fueraDePlazo}</TableCell>
                                    <TableCell className="text-right"><Porcentaje valor={p.porcentaje} /></TableCell>
                                    <TableCell>
                                        {p.cierre === 'en-plazo' && (
                                            <Badge className="bg-emerald-100 text-xs text-emerald-800">en plazo</Badge>
                                        )}
                                        {p.cierre === 'fuera-de-plazo' && (
                                            <Badge className="bg-red-100 text-xs text-red-800">fuera de plazo</Badge>
                                        )}
                                        {p.cierre === null && <span className="text-xs text-slate-400">abierto</span>}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </section>

            {global.sinFecha > 0 && (
                <p className="text-xs text-slate-500">
                    {global.sinFecha} {global.sinFecha === 1 ? 'tarea terminada no tiene' : 'tareas terminadas no tienen'} fecha
                    límite cargada, así que no {global.sinFecha === 1 ? 'entra' : 'entran'} en el porcentaje de
                    cumplimiento. Cargar la fecha al crear la tarea es lo que hace medible el indicador.
                </p>
            )}
        </div>
    )
}
