'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TaskCompletionModal } from '@/components/task-completion-modal'
import {
    Search, ChevronDown, Loader2, AlertCircle, CornerDownRight,
    CheckCircle2, Circle, Clock, PauseCircle, Ban, AlertTriangle, ExternalLink,
} from 'lucide-react'
import type { Project, Task } from '@/types'
import {
    TASK_STATUSES, DEFAULT_TASK_STATUS, isTerminalStatus, isCompletedStatus,
    countsTowardProgress, getStatusColor, getDeadlineState, getDeadlineLabel, getDeadlineColor,
} from '@/lib/task-status'
import { iniciales, tonoAvatar, fechaCorta } from '@/lib/ui'

type Asignado = { id: string; assignee_name: string; member_id: string | null }
type Tarea = Task & { projects: Pick<Project, 'id' | 'title' | 'completed_at'> | null; task_assignees: Asignado[] }

function icono(estado: string | null) {
    switch (estado) {
        case 'Terminada': return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        case 'En desarrollo': return <Clock className="h-4 w-4 text-blue-600" />
        case 'Pausada': return <PauseCircle className="h-4 w-4 text-amber-600" />
        case 'Cancelada': return <Ban className="h-4 w-4 text-rose-500" />
        default: return <Circle className="h-4 w-4 text-slate-300" />
    }
}

/** Una tarea de la lista: estado, responsables y vencimiento. */
function Fila({ t, esSub, titulos, alCambiarEstado }: {
    t: Tarea
    esSub: boolean
    titulos: Map<string, string>
    alCambiarEstado: (t: Tarea, estado: string) => void
}) {
    const venc = getDeadlineState(t.deadline, t.status)
    const proyectoCerrado = !!t.projects?.completed_at
    // Una subtarea cuya madre quedó fuera del filtro se dibuja en el primer
    // nivel; sin este rótulo parecería una tarea suelta del proyecto.
    const madre = !esSub && t.parent_task_id ? titulos.get(t.parent_task_id) : undefined
    return (
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${esSub ? 'pl-11' : ''}`}>
            {esSub && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
            <span className="shrink-0">{icono(t.status)}</span>

            <span className="min-w-0 flex-1">
                <span className={`block truncate ${esSub ? 'text-xs' : 'text-sm'} font-medium text-slate-800 dark:text-slate-100`}>
                    {t.title}
                </span>
                {madre && <span className="block truncate text-[11px] text-slate-400">Subtarea de {madre}</span>}
                {!madre && t.notes && <span className="block truncate text-[11px] text-slate-400">{t.notes}</span>}
            </span>

            <span className="flex shrink-0 flex-wrap items-center gap-1">
                {(t.task_assignees ?? []).length === 0 ? (
                    <span className="text-[11px] italic text-slate-300">sin asignar</span>
                ) : (
                    (t.task_assignees ?? []).map(a => (
                        <span key={a.id} className="flex items-center gap-1 rounded-full bg-slate-50 py-0.5 pl-0.5 pr-2 dark:bg-slate-800">
                            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold ${tonoAvatar(a.assignee_name)}`}>
                                {iniciales(a.assignee_name)}
                            </span>
                            <span className="text-[11px] text-slate-600 dark:text-slate-300">{a.assignee_name}</span>
                        </span>
                    ))
                )}
            </span>

            {t.deadline && (
                <span className="flex shrink-0 items-center gap-1.5">
                    <span className="whitespace-nowrap text-[11px] text-slate-500">{fechaCorta(t.deadline)}</span>
                    {venc && (
                        <Badge variant="outline" className={`gap-1 whitespace-nowrap text-[10px] ${getDeadlineColor(venc)}`}>
                            <AlertTriangle className="h-2.5 w-2.5" />
                            {getDeadlineLabel(t.deadline, venc)}
                        </Badge>
                    )}
                </span>
            )}

            <Select
                value={t.status || DEFAULT_TASK_STATUS}
                disabled={proyectoCerrado}
                onValueChange={(v) => alCambiarEstado(t, v)}
            >
                <SelectTrigger className={`h-7 w-[136px] shrink-0 text-xs ${getStatusColor(t.status)} border-0`}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {TASK_STATUSES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
    )
}

/**
 * Todas las tareas, agrupadas por proyecto.
 *
 * Un administrador ve las de todo el equipo; el resto, sólo aquellas donde
 * figura como responsable. Antes esto vivía en un panel lateral, que servía
 * para una lista corta pero no para revisar el trabajo de la Dirección entera.
 */
export function TareasView() {
    const { user, role } = useAuth()
    const esAdmin = role === 'admin'

    const [tareas, setTareas] = useState<Tarea[]>([])
    const [cargando, setCargando] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [busqueda, setBusqueda] = useState('')
    const [filtroEstado, setFiltroEstado] = useState('__PENDIENTES__')
    const [filtroResponsable, setFiltroResponsable] = useState('__TODOS__')
    const [cerrados, setCerrados] = useState<Set<string>>(new Set())
    const [aCompletar, setACompletar] = useState<Tarea | null>(null)

    const cargar = useCallback(async () => {
        setCargando(true)
        setError(null)
        try {
            let idsPropias: string[] | null = null

            // Un usuario común sólo ve lo suyo. El vínculo es
            // members.user_id, que es lo que ata la cuenta a la nómina.
            if (!esAdmin && user) {
                const { data: miembro } = await supabase
                    .from('members').select('id').eq('user_id', user.id).maybeSingle()

                if (!miembro) { setTareas([]); setCargando(false); return }

                const { data: asignaciones } = await supabase
                    .from('task_assignees').select('task_id').eq('member_id', miembro.id)

                idsPropias = (asignaciones ?? []).map(a => a.task_id).filter(Boolean) as string[]
                if (idsPropias.length === 0) { setTareas([]); setCargando(false); return }
            }

            let consulta = supabase
                .from('tasks')
                .select('*, projects(id, title, completed_at), task_assignees(id, assignee_name, member_id)')
                .eq('habilita', 1)

            if (idsPropias) consulta = consulta.in('id', idsPropias)

            const { data, error: err } = await consulta.order('deadline', { ascending: true, nullsFirst: false })
            if (err) throw err

            setTareas((data ?? []) as unknown as Tarea[])
        } catch (e) {
            console.error('Error cargando las tareas:', e)
            setError(e instanceof Error ? e.message : 'No se pudieron cargar las tareas')
        } finally {
            setCargando(false)
        }
    }, [esAdmin, user])

    useEffect(() => { cargar() }, [cargar])

    const titulos = useMemo(() => new Map(tareas.map(t => [t.id, t.title])), [tareas])

    const responsables = useMemo(() => {
        const set = new Set<string>()
        for (const t of tareas) for (const a of t.task_assignees ?? []) set.add(a.assignee_name)
        return [...set].sort((a, b) => a.localeCompare(b))
    }, [tareas])

    const filtradas = useMemo(() => tareas.filter(t => {
        const q = busqueda.toLowerCase()
        if (q && !t.title.toLowerCase().includes(q) && !(t.projects?.title.toLowerCase().includes(q) ?? false)) return false

        if (filtroEstado === '__PENDIENTES__') { if (isTerminalStatus(t.status)) return false }
        else if (filtroEstado !== '__TODOS__' && t.status !== filtroEstado) return false

        if (filtroResponsable === '__SIN__') {
            if ((t.task_assignees ?? []).length > 0) return false
        } else if (filtroResponsable !== '__TODOS__') {
            if (!(t.task_assignees ?? []).some(a => a.assignee_name === filtroResponsable)) return false
        }
        return true
    }), [tareas, busqueda, filtroEstado, filtroResponsable])

    /**
     * Agrupa por proyecto y anida las subtareas bajo su madre.
     *
     * Una subtarea cuya madre quedó fuera del filtro se muestra igual, en el
     * primer nivel: ocultarla haría desaparecer trabajo asignado sin aviso.
     */
    const porProyecto = useMemo(() => {
        const enFiltro = new Set(filtradas.map(t => t.id))
        const grupos = new Map<string, { titulo: string; proyectoId: string | null; cerrado: boolean; raiz: Tarea[]; hijasDe: Map<string, Tarea[]> }>()
        const avance = new Map<string, { hechas: number; total: number }>()

        // El contador del encabezado se calcula sobre TODAS las tareas del
        // proyecto, no sobre las que dejó pasar el filtro: si no, con el filtro
        // en "Pendientes" todo proyecto mostraría siempre "0 de N".
        for (const t of tareas) {
            if (!countsTowardProgress(t.status)) continue
            const clave = t.projects?.id ?? '__sin__'
            const a = avance.get(clave) ?? { hechas: 0, total: 0 }
            a.total += 1
            if (isCompletedStatus(t.status)) a.hechas += 1
            avance.set(clave, a)
        }

        for (const t of filtradas) {
            const clave = t.projects?.id ?? '__sin__'
            if (!grupos.has(clave)) {
                grupos.set(clave, {
                    titulo: t.projects?.title ?? 'Sin proyecto',
                    proyectoId: t.projects?.id ?? null,
                    cerrado: !!t.projects?.completed_at,
                    raiz: [], hijasDe: new Map(),
                })
            }
            const g = grupos.get(clave)!
            if (t.parent_task_id && enFiltro.has(t.parent_task_id)) {
                if (!g.hijasDe.has(t.parent_task_id)) g.hijasDe.set(t.parent_task_id, [])
                g.hijasDe.get(t.parent_task_id)!.push(t)
            } else {
                g.raiz.push(t)
            }
        }

        return [...grupos.entries()]
            .map(([clave, g]) => ({ clave, ...g, avance: avance.get(clave) ?? { hechas: 0, total: 0 } }))
            .sort((a, b) => a.titulo.localeCompare(b.titulo))
    }, [filtradas, tareas])

    function alternarGrupo(clave: string) {
        setCerrados(prev => {
            const s = new Set(prev)
            if (s.has(clave)) s.delete(clave); else s.add(clave)
            return s
        })
    }

    async function cambiarEstado(t: Tarea, nuevo: string) {
        if (nuevo === 'Terminada') { setACompletar(t); return }

        const { data, error: err } = await supabase
            .from('tasks').update({ status: nuevo }).eq('id', t.id).select('id')

        if (err || !data || data.length === 0) {
            alert(err
                ? 'No se pudo actualizar el estado de la tarea'
                : 'No tenés permiso para cambiar el estado de esta tarea. Sólo pueden hacerlo sus responsables o un administrador.')
            return
        }
        cargar()
    }

    if (cargando) {
        return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
    }

    // El resumen mira el total, no lo filtrado: si contara sólo lo visible,
    // con el filtro en "Pendientes" siempre diría "0 terminadas".
    const mostradas = filtradas.length
    const total = tareas.length
    const terminadas = tareas.filter(t => isCompletedStatus(t.status)).length
    const vencidas = tareas.filter(t => getDeadlineState(t.deadline, t.status) === 'vencida').length

    return (
        <div className="px-5 py-6 lg:px-7">
            <div className="mb-5">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                    {esAdmin ? 'Todas las tareas' : 'Mis tareas'}
                </h1>
                <p className="mt-0.5 text-sm text-slate-500">
                    {esAdmin
                        ? 'El trabajo de toda la Dirección, agrupado por proyecto.'
                        : 'Las tareas donde figurás como responsable.'}
                    {' '}
                    <span className="text-slate-400">
                        {mostradas === total
                            ? `${total} ${total === 1 ? 'tarea' : 'tareas'}`
                            : `${mostradas} de ${total} tareas`}
                        {' · '}{terminadas} {terminadas === 1 ? 'terminada' : 'terminadas'}
                        {vencidas > 0 && <span className="text-red-500"> · {vencidas} vencidas</span>}
                    </span>
                </p>
            </div>

            {error && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                    <AlertCircle className="h-4 w-4 shrink-0" />{error}
                </div>
            )}

            <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                        placeholder="Buscar por tarea o proyecto..."
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        className="border-slate-200 bg-white pl-9 dark:bg-slate-900"
                    />
                </div>

                <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                    <SelectTrigger className="w-[180px] border-slate-200 bg-white dark:bg-slate-900"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__PENDIENTES__">Pendientes</SelectItem>
                        <SelectItem value="__TODOS__">Todos los estados</SelectItem>
                        {TASK_STATUSES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                </Select>

                {esAdmin && (
                    <Select value={filtroResponsable} onValueChange={setFiltroResponsable}>
                        <SelectTrigger className="w-[190px] border-slate-200 bg-white dark:bg-slate-900">
                            <SelectValue placeholder="Responsable" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__TODOS__">Todos los responsables</SelectItem>
                            <SelectItem value="__SIN__">Sin asignar</SelectItem>
                            {responsables.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                    </Select>
                )}
            </div>

            {porProyecto.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white py-16 text-center dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-sm text-slate-500">
                        {esAdmin ? 'No hay tareas que coincidan con los filtros.' : 'No tenés tareas asignadas con esos filtros.'}
                    </p>
                    {!esAdmin && (
                        <p className="mt-1 text-xs text-slate-400">
                            Si esperabas ver tareas acá, pedile a un administrador que verifique tu ficha en Miembros.
                        </p>
                    )}
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {porProyecto.map(g => {
                        const abierto = !cerrados.has(g.clave)
                        return (
                            <section key={g.clave} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                                <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
                                    <button
                                        onClick={() => alternarGrupo(g.clave)}
                                        aria-expanded={abierto}
                                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                    >
                                        <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? '' : '-rotate-90'}`} />
                                    </button>

                                    {g.proyectoId ? (
                                        <Link href={`/projects/${g.proyectoId}`} className="group flex min-w-0 items-center gap-1.5">
                                            <span className="truncate text-sm font-semibold text-slate-800 group-hover:text-[#0065ff] dark:text-slate-100">
                                                {g.titulo}
                                            </span>
                                            <ExternalLink className="h-3 w-3 shrink-0 text-slate-300 group-hover:text-[#0065ff]" />
                                        </Link>
                                    ) : (
                                        <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{g.titulo}</span>
                                    )}

                                    {g.cerrado && (
                                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">finalizado</span>
                                    )}

                                    <span
                                        className="ml-auto shrink-0 text-[11px] text-slate-400 tabular-nums"
                                        title="Tareas terminadas sobre el total del proyecto (sin contar las canceladas)"
                                    >
                                        {g.avance.hechas} de {g.avance.total} terminadas
                                    </span>
                                </div>

                                {abierto && (
                                    <div className="divide-y divide-slate-50 dark:divide-slate-800">
                                        {g.raiz.map(t => (
                                            <div key={t.id}>
                                                <Fila t={t} esSub={false} titulos={titulos} alCambiarEstado={cambiarEstado} />
                                                {(g.hijasDe.get(t.id) ?? []).map(s => (
                                                    <div key={s.id} className="border-t border-slate-50 dark:border-slate-800">
                                                        <Fila t={s} esSub titulos={titulos} alCambiarEstado={cambiarEstado} />
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )
                    })}
                </div>
            )}

            {aCompletar && (
                <TaskCompletionModal
                    isOpen
                    taskTitle={aCompletar.title}
                    existingNotes={aCompletar.notes}
                    onClose={() => setACompletar(null)}
                    onConfirm={async (notas: string) => {
                        const { data, error: err } = await supabase
                            .from('tasks')
                            .update({ status: 'Terminada', notes: notas || aCompletar.notes })
                            .eq('id', aCompletar.id)
                            .select('id')

                        if (err || !data || data.length === 0) {
                            alert(err
                                ? 'No se pudo cerrar la tarea'
                                : 'No tenés permiso para cerrar esta tarea. Sólo pueden hacerlo sus responsables o un administrador.')
                        }
                        setACompletar(null)
                        cargar()
                    }}
                />
            )}
        </div>
    )
}
