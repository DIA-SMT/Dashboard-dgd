'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, AlertCircle, Plus, Pencil, Trash2, History } from 'lucide-react'
import {
    type RegistroActividad, describirAccion, fechaHora, etiquetaDeDia,
} from '@/lib/actividad'
import { iniciales, tonoAvatar } from '@/lib/ui'

/** Cuántos movimientos trae cada tanda. */
const POR_TANDA = 50

type Entidad = { nombre: string; proyectoId: string | null; proyecto: string | null }

/**
 * Historial completo de movimientos.
 *
 * La columna de "Actividad reciente" del tablero muestra sólo los últimos seis,
 * que alcanzan para saber si pasó algo pero no para buscar cuándo se cambió una
 * fecha o quién cerró una tarea. Acá está todo, de a tandas.
 *
 * Los nombres de los proyectos y las tareas no salen del historial: el registro
 * guarda el id, no el título. Se resuelven con una consulta aparte, una sola vez
 * para toda la pantalla.
 */
export function ActividadView() {
    const [registros, setRegistros] = useState<RegistroActividad[]>([])
    const [entidades, setEntidades] = useState<Record<string, Entidad>>({})
    const [cargando, setCargando] = useState(true)
    const [trayendoMas, setTrayendoMas] = useState(false)
    const [hayMas, setHayMas] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [quien, setQuien] = useState('__TODOS__')
    const [queCosa, setQueCosa] = useState('__TODO__')

    // Los nombres se traen una vez: cambian poquísimo comparado con el historial.
    useEffect(() => {
        let vigente = true
        ;(async () => {
            const [{ data: proyectos }, { data: tareas }] = await Promise.all([
                supabase.from('projects').select('id, title'),
                supabase.from('tasks').select('id, title, project_id'),
            ])
            if (!vigente) return

            const mapa: Record<string, Entidad> = {}
            for (const p of proyectos ?? []) {
                mapa['project:' + p.id] = { nombre: p.title, proyectoId: p.id, proyecto: null }
            }
            const titulo = new Map((proyectos ?? []).map(p => [p.id, p.title]))
            for (const t of tareas ?? []) {
                mapa['task:' + t.id] = {
                    nombre: t.title,
                    proyectoId: t.project_id,
                    proyecto: t.project_id ? titulo.get(t.project_id) ?? null : null,
                }
            }
            setEntidades(mapa)
        })()
        return () => { vigente = false }
    }, [])

    const traer = useCallback(async (desde: number) => {
        const { data, error: err } = await supabase
            .from('activity_log')
            .select('id, entity_type, entity_id, action, field, old_value, new_value, changed_by, changed_at, profiles(full_name)')
            .order('changed_at', { ascending: false })
            .range(desde, desde + POR_TANDA - 1)

        if (err) throw err
        const tanda = (data ?? []) as unknown as RegistroActividad[]
        // Si volvió la tanda completa, es probable que haya más. Es la forma
        // barata: pedir el total exacto es otra consulta y no cambia nada.
        setHayMas(tanda.length === POR_TANDA)
        return tanda
    }, [])

    useEffect(() => {
        let vigente = true
        ;(async () => {
            try {
                const tanda = await traer(0)
                if (vigente) setRegistros(tanda)
            } catch (e) {
                console.error('Error cargando el historial:', e)
                if (vigente) setError(e instanceof Error ? e.message : 'No se pudo cargar el historial')
            } finally {
                if (vigente) setCargando(false)
            }
        })()
        return () => { vigente = false }
    }, [traer])

    async function verMas() {
        setTrayendoMas(true)
        try {
            const tanda = await traer(registros.length)
            setRegistros(r => [...r, ...tanda])
        } catch (e) {
            console.error('Error trayendo más movimientos:', e)
            setError('No se pudieron traer más movimientos')
        } finally {
            setTrayendoMas(false)
        }
    }

    const nombreDe = useCallback(
        (tipo: string, id: string) => entidades[tipo + ':' + id]?.nombre,
        [entidades]
    )

    const personas = useMemo(() => {
        const set = new Set<string>()
        for (const r of registros) if (r.profiles?.full_name) set.add(r.profiles.full_name)
        return [...set].sort((a, b) => a.localeCompare(b))
    }, [registros])

    /** Los movimientos que se muestran, ya traducidos y agrupados por día. */
    const porDia = useMemo(() => {
        const filas = registros
            .filter(r => {
                if (quien === '__TODOS__') return true
                if (quien === '__SISTEMA__') return !r.profiles?.full_name
                return r.profiles?.full_name === quien
            })
            .filter(r => queCosa === '__TODO__' || r.entity_type === queCosa)
            .map(r => ({ r, texto: describirAccion(r, nombreDe) }))
            .filter((x): x is { r: RegistroActividad; texto: string } => x.texto !== null)

        const grupos: { dia: string; filas: typeof filas }[] = []
        for (const f of filas) {
            const dia = etiquetaDeDia(f.r.changed_at)
            const ultimo = grupos[grupos.length - 1]
            if (ultimo && ultimo.dia === dia) ultimo.filas.push(f)
            else grupos.push({ dia, filas: [f] })
        }
        return grupos
    }, [registros, quien, queCosa, nombreDe])

    const mostrados = porDia.reduce((a, g) => a + g.filas.length, 0)

    if (cargando) {
        return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
    }

    return (
        <div className="px-5 py-6 lg:px-7">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                        <History className="h-6 w-6 text-slate-400" strokeWidth={1.8} />
                        Actividad
                    </h1>
                    <p className="mt-0.5 text-sm text-slate-500">
                        Todos los movimientos de los proyectos y las tareas, del más nuevo al más viejo.
                        {' '}
                        <span className="text-slate-400">
                            {mostrados} {mostrados === 1 ? 'movimiento' : 'movimientos'}
                            {hayMas ? ' y contando' : ''}
                        </span>
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Select value={queCosa} onValueChange={setQueCosa}>
                        <SelectTrigger className="w-[160px] border-slate-200 bg-white dark:bg-slate-900">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__TODO__">Todo</SelectItem>
                            <SelectItem value="project">Sólo proyectos</SelectItem>
                            <SelectItem value="task">Sólo tareas</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={quien} onValueChange={setQuien}>
                        <SelectTrigger className="w-[190px] border-slate-200 bg-white dark:bg-slate-900">
                            <SelectValue placeholder="Quién" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__TODOS__">Todas las personas</SelectItem>
                            <SelectItem value="__SISTEMA__">Sistema</SelectItem>
                            {personas.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {error && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                    <AlertCircle className="h-4 w-4 shrink-0" />{error}
                </div>
            )}

            {porDia.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white py-16 text-center dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-sm text-slate-500">No hay movimientos que coincidan con los filtros.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {porDia.map(g => (
                        <section
                            key={g.dia}
                            className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                        >
                            <p className="border-b border-slate-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 first-letter:uppercase dark:border-slate-800">
                                {g.dia}
                            </p>
                            <ul className="divide-y divide-slate-50 dark:divide-slate-800">
                                {g.filas.map(({ r, texto }) => {
                                    const quienLoHizo = r.profiles?.full_name || 'Sistema'
                                    const entidad = entidades[r.entity_type + ':' + r.entity_id]
                                    const Icono = r.action === 'insert' ? Plus : r.action === 'delete' ? Trash2 : Pencil
                                    const tono = r.action === 'insert'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : r.action === 'delete'
                                            ? 'bg-red-50 text-red-700'
                                            : 'bg-slate-100 text-slate-500'
                                    return (
                                        <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                                            <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${tonoAvatar(quienLoHizo)}`}>
                                                {iniciales(quienLoHizo)}
                                            </span>

                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm leading-snug text-slate-600 dark:text-slate-300">
                                                    <span className="font-medium text-slate-800 dark:text-slate-100">{quienLoHizo}</span>
                                                    {' '}{texto}
                                                </p>
                                                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
                                                    <span>{fechaHora(r.changed_at)}</span>
                                                    {entidad?.proyecto && entidad.proyectoId && (
                                                        <>
                                                            <span aria-hidden="true">·</span>
                                                            <Link
                                                                href={`/projects/${entidad.proyectoId}`}
                                                                className="truncate hover:text-[#0065ff] hover:underline"
                                                            >
                                                                {entidad.proyecto}
                                                            </Link>
                                                        </>
                                                    )}
                                                    {r.entity_type === 'project' && entidad?.proyectoId && (
                                                        <>
                                                            <span aria-hidden="true">·</span>
                                                            <Link
                                                                href={`/projects/${entidad.proyectoId}`}
                                                                className="hover:text-[#0065ff] hover:underline"
                                                            >
                                                                Ver proyecto
                                                            </Link>
                                                        </>
                                                    )}
                                                </p>
                                            </div>

                                            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded ${tono}`}>
                                                <Icono className="h-3.5 w-3.5" />
                                            </span>
                                        </li>
                                    )
                                })}
                            </ul>
                        </section>
                    ))}
                </div>
            )}

            {hayMas && (
                <div className="mt-4 flex justify-center">
                    <Button variant="outline" onClick={verMas} disabled={trayendoMas}>
                        {trayendoMas
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Trayendo...</>
                            : 'Ver más movimientos'}
                    </Button>
                </div>
            )}
        </div>
    )
}
