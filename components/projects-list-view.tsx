'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { Project } from '@/types'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ProjectForm } from '@/components/project-form'
import { ProjectSummary, type Filtro } from '@/components/project-summary'
import { ProjectProgressChart } from '@/components/project-progress-chart'
import { ProjectCompletionModal } from '@/components/project-completion-modal'
import { TaskSummary, type TareaConProyecto } from '@/components/task-summary'
import { ProjectsTable } from '@/components/projects-table'
import { PanelLateral } from '@/components/panel-lateral'
import { Search, LayoutGrid, List, AlertCircle, Loader2, MoreVertical, Trash2, Upload, Eye } from 'lucide-react'
import { countsTowardProgress, avanceEfectivo } from '@/lib/task-status'
import { iniciales, tonoAvatar, fechaCorta, tiempoRelativo } from '@/lib/ui'

const ESTADOS: { valor: Filtro; etiqueta: string }[] = [
    { valor: 'active', etiqueta: 'Activos' },
    { valor: 'pending', etiqueta: 'Pendientes' },
    { valor: 'urgent', etiqueta: 'Urgentes' },
    { valor: 'due_soon', etiqueta: 'Vencen esta semana' },
    { valor: 'ready', etiqueta: 'Para aprobación' },
    { valor: 'completed', etiqueta: 'Finalizados' },
]

export function ProjectsListView() {
    const router = useRouter()
    const { role, user, loading: authLoading } = useAuth()

    const [projects, setProjects] = useState<Project[]>([])
    const [allTasks, setAllTasks] = useState<TareaConProyecto[]>([])
    const [avanceCalculado, setAvanceCalculado] = useState<Record<string, number>>({})
    const [ultimaActividad, setUltimaActividad] = useState<Record<string, string>>({})
    const [members, setMembers] = useState<{ id: string; full_name: string }[]>([])

    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [filter, setFilter] = useState<Filtro>('active')
    const [searchQuery, setSearchQuery] = useState('')
    const [filtroResponsable, setFiltroResponsable] = useState('__TODOS__')
    const [viewMode, setViewMode] = useState<'tabla' | 'tarjetas'>('tabla')
    const [activeCompletionProjectId, setActiveCompletionProjectId] = useState<string | null>(null)

    const fetchProjects = useCallback(async () => {
        try {
            setLoadError(null)
            const { data } = await supabase
                .from('projects')
                .select('*')
                .eq('habilita', 1)
                .order('deadline', { ascending: true })
            if (data) setProjects(data)
        } catch (error) {
            console.error('Error fetching projects:', error)
            setLoadError('No se pudieron cargar los proyectos. Reintentá.')
        } finally {
            setLoading(false)
        }
    }, [])

    const fetchTasksAndProgress = useCallback(async () => {
        try {
            setLoadError(null)
            // Los responsables se traen para poder agrupar el gráfico por persona.
            const { data, error } = await supabase
                .from('tasks')
                .select('*, projects(*), task_assignees(assignee_name)')
                .eq('habilita', 1)
            if (error) throw error

            const tareas = (data ?? []) as unknown as TareaConProyecto[]

            // Avance por proyecto. Las canceladas quedan fuera del denominador.
            const acum: Record<string, { total: number; hechas: number }> = {}
            for (const t of tareas) {
                if (!t.project_id || !countsTowardProgress(t.status)) continue
                acum[t.project_id] ??= { total: 0, hechas: 0 }
                acum[t.project_id].total++
                if (t.status === 'Terminada') acum[t.project_id].hechas++
            }

            const avance: Record<string, number> = {}
            for (const [id, { total, hechas }] of Object.entries(acum)) {
                avance[id] = Math.round((hechas / total) * 100)
            }

            setAllTasks(tareas)
            setAvanceCalculado(avance)
        } catch (error) {
            console.error('Error fetching tasks and progress:', error)
            setLoadError('No se pudieron cargar los datos de progreso.')
        }
    }, [])

    /**
     * Última vez que se tocó cada proyecto.
     *
     * `projects` no tiene updated_at, pero activity_log guarda cada cambio. Se
     * traen los más recientes ordenados y se conserva el primero de cada
     * proyecto, que por el orden es el último movimiento.
     */
    const fetchActividad = useCallback(async () => {
        const { data } = await supabase
            .from('activity_log')
            .select('entity_id, entity_type, changed_at')
            .eq('entity_type', 'project')
            .order('changed_at', { ascending: false })
            .limit(400)

        const mapa: Record<string, string> = {}
        for (const r of data ?? []) {
            if (r.changed_at && !mapa[r.entity_id]) mapa[r.entity_id] = r.changed_at
        }
        setUltimaActividad(mapa)
    }, [])

    useEffect(() => {
        if (authLoading) return
        if (!user) { router.replace('/login'); return }

        setLoading(true)
        setLoadError(null)
        const t = window.setTimeout(() => {
            setLoading(false)
            setLoadError('La carga tardó demasiado. Reintentá.')
        }, 12000)

        Promise.all([fetchProjects(), fetchTasksAndProgress(), fetchActividad()])
            .finally(() => window.clearTimeout(t))

        const canalProyectos = supabase
            .channel('projects-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
                fetchProjects(); fetchTasksAndProgress(); fetchActividad()
            })
            .subscribe()

        const canalTareas = supabase
            .channel('tasks-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
                fetchTasksAndProgress()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(canalProyectos)
            supabase.removeChannel(canalTareas)
        }
    }, [authLoading, user?.id, router, fetchProjects, fetchTasksAndProgress, fetchActividad])

    useEffect(() => {
        supabase.from('members').select('id, full_name').eq('habilita', 1).order('full_name')
            .then(({ data }) => { if (data) setMembers(data) })
    }, [])

    const nombrePorMiembro = useMemo(
        () => Object.fromEntries(members.map(m => [m.id, m.full_name])),
        [members]
    )

    const projectProgress = useMemo(() => {
        const efectivo: Record<string, number> = { ...avanceCalculado }
        for (const p of projects) {
            efectivo[p.id] = avanceEfectivo(p.progress, avanceCalculado[p.id] ?? 0)
        }
        return efectivo
    }, [projects, avanceCalculado])

    async function eliminarProyecto(p: Project) {
        if (!confirm(`¿Eliminar el proyecto "${p.title}"? También se eliminan sus tareas.`)) return
        try {
            const { data, error } = await supabase
                .from('projects').update({ habilita: 0 }).eq('id', p.id).select('id')
            if (error) throw error
            if (!data || data.length === 0) throw new Error('No tenés permiso para eliminar este proyecto')

            const { error: errorTareas } = await supabase
                .from('tasks').update({ habilita: 0 }).eq('project_id', p.id)
            if (errorTareas) throw errorTareas

            fetchProjects()
        } catch (error) {
            console.error('Error eliminando el proyecto:', error)
            alert(error instanceof Error ? error.message : 'Error al eliminar el proyecto')
        }
    }

    const filtrados = useMemo(() => projects.filter(p => {
        const q = searchQuery.toLowerCase()
        const coincideBusqueda =
            p.title.toLowerCase().includes(q) ||
            (p.area?.toLowerCase().includes(q) ?? false) ||
            (p.description?.toLowerCase().includes(q) ?? false)
        if (!coincideBusqueda) return false

        const coincideResponsable =
            filtroResponsable === '__TODOS__' ||
            (filtroResponsable === '__SIN__' ? !p.owner_id : p.owner_id === filtroResponsable)
        if (!coincideResponsable) return false

        const avance = projectProgress[p.id] || 0

        switch (filter) {
            case 'active': return p.completed_at === null && avance < 100
            case 'pending': return p.completed_at === null && avance === 0
            case 'completed': return p.completed_at !== null
            case 'ready': return p.completed_at === null && avance === 100
            case 'urgent': return p.completed_at === null && p.priority === 'Urgente' && avance < 100
            case 'due_soon': {
                if (p.completed_at || !p.deadline || avance === 100) return false
                const hoy = new Date()
                const distanciaALunes = hoy.getDay() === 0 ? 6 : hoy.getDay() - 1
                const lunes = new Date(hoy)
                lunes.setDate(hoy.getDate() - distanciaALunes)
                lunes.setHours(0, 0, 0, 0)
                const domingo = new Date(lunes)
                domingo.setDate(lunes.getDate() + 6)
                domingo.setHours(23, 59, 59, 999)
                const limite = new Date(p.deadline + 'T00:00:00')
                return limite >= lunes && limite <= domingo
            }
        }
    }), [projects, searchQuery, filtroResponsable, filter, projectProgress])

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
        )
    }

    return (
        <div className="px-5 py-6 lg:px-7">
            {/* Encabezado + acción principal */}
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Proyectos</h1>
                    <p className="mt-0.5 text-sm text-slate-500">Gestiona y da seguimiento a tus proyectos</p>
                </div>
                <ProjectForm onProjectCreated={() => { fetchProjects(); fetchActividad() }} />
            </div>

            {loadError && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {loadError}
                </div>
            )}

            <ProjectSummary
                projects={projects}
                currentFilter={filter}
                onFilterChange={setFilter}
                projectProgress={projectProgress}
            />

            <TaskSummary tasks={allTasks} />

            {/* Contenido principal + columna de contexto */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_290px]">
                <div className="min-w-0">
                    {/* Buscador y filtros */}
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <div className="relative min-w-[200px] flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                placeholder="Buscar por nombre, área o descripción..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="border-slate-200 bg-white pl-9 dark:bg-slate-900"
                            />
                        </div>

                        <Select value={filtroResponsable} onValueChange={setFiltroResponsable}>
                            <SelectTrigger className="w-[190px] border-slate-200 bg-white dark:bg-slate-900">
                                <SelectValue placeholder="Responsable" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__TODOS__">Todos los responsables</SelectItem>
                                <SelectItem value="__SIN__">Sin responsable</SelectItem>
                                {members.map(m => (
                                    <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Mismo filtro que las tarjetas de arriba: se mantienen sincronizados. */}
                        <Select value={filter} onValueChange={(v) => setFilter(v as Filtro)}>
                            <SelectTrigger className="w-[180px] border-slate-200 bg-white dark:bg-slate-900">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {ESTADOS.map(e => (
                                    <SelectItem key={e.valor} value={e.valor}>{e.etiqueta}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-900">
                            <button
                                onClick={() => setViewMode('tabla')}
                                aria-pressed={viewMode === 'tabla'}
                                title="Vista de tabla"
                                className={`rounded-md p-1.5 transition-colors ${viewMode === 'tabla' ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                <List className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('tarjetas')}
                                aria-pressed={viewMode === 'tarjetas'}
                                title="Vista de tarjetas"
                                className={`rounded-md p-1.5 transition-colors ${viewMode === 'tarjetas' ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                <LayoutGrid className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {viewMode === 'tabla' ? (
                        <ProjectsTable
                            proyectos={filtrados}
                            avance={projectProgress}
                            responsables={nombrePorMiembro}
                            ultimaActividad={ultimaActividad}
                            esAdmin={role === 'admin'}
                            onEliminar={eliminarProyecto}
                            onPublicar={(p) => setActiveCompletionProjectId(p.id)}
                        />
                    ) : (
                        <TarjetasProyecto
                            proyectos={filtrados}
                            avance={projectProgress}
                            responsables={nombrePorMiembro}
                            ultimaActividad={ultimaActividad}
                            esAdmin={role === 'admin'}
                            onEliminar={eliminarProyecto}
                            onPublicar={(p) => setActiveCompletionProjectId(p.id)}
                        />
                    )}

                    <div className="mt-5">
                        <ProjectProgressChart tasks={allTasks} />
                    </div>
                </div>

                <aside className="min-w-0">
                    <PanelLateral proyectos={projects} tareas={allTasks} />
                </aside>
            </div>

            {activeCompletionProjectId && (
                <ProjectCompletionModal
                    projectId={activeCompletionProjectId}
                    onClose={() => {
                        setActiveCompletionProjectId(null)
                        fetchProjects()
                        fetchTasksAndProgress()
                    }}
                />
            )}
        </div>
    )
}

/**
 * Vista de tarjetas.
 *
 * Muestra lo mismo que la tabla. Se conserva porque con pocos proyectos la
 * grilla se recorre más rápido que una tabla de ocho columnas.
 */
function TarjetasProyecto({ proyectos, avance, responsables, ultimaActividad, esAdmin, onEliminar, onPublicar }: {
    proyectos: Project[]
    avance: Record<string, number>
    responsables: Record<string, string>
    ultimaActividad: Record<string, string>
    esAdmin: boolean
    onEliminar: (p: Project) => void
    onPublicar: (p: Project) => void
}) {
    const router = useRouter()
    const [menu, setMenu] = useState<string | null>(null)

    if (proyectos.length === 0) {
        return (
            <div className="rounded-xl border border-slate-200 bg-white py-14 text-center text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                No hay proyectos que coincidan con los filtros.
            </div>
        )
    }

    return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {proyectos.map(p => {
                const pct = avance[p.id] ?? 0
                const resp = responsables[p.owner_id ?? '']
                return (
                    <div key={p.id} className="relative rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-2 flex items-start justify-between gap-2">
                            <Link href={`/projects/${p.id}`} className="min-w-0">
                                <span className="block truncate text-sm font-medium text-slate-800 hover:text-[#0065ff] dark:text-slate-100">{p.title}</span>
                                <span className="block truncate text-xs text-slate-400">{p.description || p.area || '—'}</span>
                            </Link>
                            <button
                                onClick={() => setMenu(menu === p.id ? null : p.id)}
                                aria-label={`Acciones de ${p.title}`}
                                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                                <MoreVertical className="h-4 w-4" />
                            </button>
                        </div>

                        {menu === p.id && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} aria-hidden="true" />
                                <div className="absolute right-3 top-11 z-20 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                                    <button onClick={() => { setMenu(null); router.push(`/projects/${p.id}`) }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700">
                                        <Eye className="h-3.5 w-3.5" /> Ver detalle
                                    </button>
                                    {esAdmin && pct === 100 && !p.completed_at && (
                                        <button onClick={() => { setMenu(null); onPublicar(p) }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#0065ff] hover:bg-blue-50 dark:hover:bg-slate-700">
                                            <Upload className="h-3.5 w-3.5" /> Publicar
                                        </button>
                                    )}
                                    {esAdmin && (
                                        <button onClick={() => { setMenu(null); onEliminar(p) }} className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-xs text-red-600 hover:bg-red-50 dark:border-slate-700">
                                            <Trash2 className="h-3.5 w-3.5" /> Eliminar
                                        </button>
                                    )}
                                </div>
                            </>
                        )}

                        <div className="mb-3">
                            <div className="mb-1 flex items-center justify-between text-xs">
                                <span className="text-slate-400">Progreso</span>
                                <span className="font-medium text-slate-700 tabular-nums dark:text-slate-200">{pct}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                                <div className="h-1.5 rounded-full bg-[#0065ff] transition-all" style={{ width: `${pct}%` }} />
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-xs">
                            {resp ? (
                                <span className="flex min-w-0 items-center gap-1.5">
                                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${tonoAvatar(resp)}`}>
                                        {iniciales(resp)}
                                    </span>
                                    <span className="truncate text-slate-500">{resp}</span>
                                </span>
                            ) : (
                                <span className="italic text-slate-300">sin responsable</span>
                            )}
                            <span className="shrink-0 text-slate-400">{fechaCorta(p.deadline)}</span>
                        </div>

                        <p className="mt-2 border-t border-slate-50 pt-2 text-[11px] text-slate-400 dark:border-slate-800">
                            {tiempoRelativo(ultimaActividad[p.id] ?? p.created_at)}
                        </p>
                    </div>
                )
            })}
        </div>
    )
}
