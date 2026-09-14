'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { Project, Task } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProjectForm } from '@/components/project-form'
import { Input } from '@/components/ui/input'
import { ProjectSummary } from '@/components/project-summary'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar, FolderKanban, Users, Search, ArrowLeft, CheckCircle2, LayoutGrid, List, Trash2, StickyNote, Flame, Clock3 } from 'lucide-react'
import { ProjectProgressChart } from '@/components/project-progress-chart'
import { ProjectCompletionModal } from '@/components/project-completion-modal'
import { DailyNotesPanel } from '@/components/daily-notes-panel'

type ProjectProgress = {
    name: string
    completed: number
    remaining: number
    total: number
}

export function ProjectsListView() {
    const router = useRouter()
    const [projects, setProjects] = useState<Project[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [filter, setFilter] = useState<'active' | 'urgent' | 'due_soon' | 'completed' | 'ready'>('active')
    const [searchQuery, setSearchQuery] = useState('')
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [sortBy, setSortBy] = useState<'priority' | 'deadline'>('deadline')
    const [chartData, setChartData] = useState<ProjectProgress[]>([])
    const [activeCompletionProjectId, setActiveCompletionProjectId] = useState<string | null>(null)
    const [projectProgress, setProjectProgress] = useState<Record<string, number>>({})
    const [deleteLoading, setDeleteLoading] = useState<string | null>(null)
    const [dailyNotesOpen, setDailyNotesOpen] = useState(false)
    const [notesCount, setNotesCount] = useState(0)
    const { role, user, loading: authLoading } = useAuth()

    const fetchNotesCount = useCallback(async () => {
        try {
            const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000)
            const { count, error } = await supabase
                .from('daily_notes')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', seventyTwoHoursAgo.toISOString())
                .eq('habilita', 1)

            if (!error && count !== null) {
                setNotesCount(count)
            }
        } catch (error) {
            console.error('Error fetching notes count:', error)
        }
    }, [])

    useEffect(() => {
        if (authLoading) return
        if (!user) {
            router.replace('/login')
            return
        }

        setLoading(true)
        setLoadError(null)

        const t = window.setTimeout(() => {
            setLoading(false)
            setLoadError('La carga tardó demasiado. Reintentá.')
        }, 12000)

        Promise.all([fetchProjects(), fetchTasksAndProgress(), fetchNotesCount()]).finally(() => window.clearTimeout(t))

        // Suscripción a cambios en tiempo real de la tabla projects
        const projectsChannel = supabase
            .channel('projects-changes')
            .on(
                'postgres_changes',
                {
                    event: '*', // Escucha INSERT, UPDATE y DELETE
                    schema: 'public',
                    table: 'projects'
                },
                (payload) => {
                    console.log('Cambio detectado en projects:', payload)

                    // Recargar proyectos y progreso cuando hay cambios
                    fetchProjects()
                    fetchTasksAndProgress()
                }
            )
            .subscribe()

        // Suscripción a cambios en tiempo real de la tabla tasks
        const tasksChannel = supabase
            .channel('tasks-changes')
            .on(
                'postgres_changes',
                {
                    event: '*', // Escucha INSERT, UPDATE y DELETE
                    schema: 'public',
                    table: 'tasks'
                },
                (payload) => {
                    console.log('Cambio detectado en tasks:', payload)

                    // Recargar progreso cuando hay cambios en tareas
                    fetchTasksAndProgress()
                }
            )
            .subscribe()

        // Suscripción a cambios en tiempo real de la tabla daily_notes
        const notesChannel = supabase
            .channel('daily-notes-count-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'daily_notes'
                },
                () => {
                    fetchNotesCount()
                }
            )
            .subscribe()

        // Cleanup: cancelar suscripción cuando el componente se desmonta
        return () => {
            supabase.removeChannel(projectsChannel)
            supabase.removeChannel(tasksChannel)
            supabase.removeChannel(notesChannel)
        }
    }, [authLoading, user?.id, fetchNotesCount])

    const fetchProjects = useCallback(async () => {
        try {
            setLoadError(null)
            const query = supabase
                .from('projects')
                .select('*')
                .eq('habilita', 1)
                .order('deadline', { ascending: true })

            const { data } = await query

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
            const { data: allTasks } = await supabase
                .from('tasks')
                .select('*, projects(*)')
                .eq('habilita', 1)

            const progressMap = new Map<string, ProjectProgress>()
            const progressState: Record<string, number> = {}

            if (allTasks) {
                // Define a type for the joined query result
                type TaskWithProject = Task & { projects: Project | null }

                (allTasks as unknown as TaskWithProject[]).forEach((task) => {
                    const projectId = task.project_id
                    const projectName = task.projects?.title || 'Sin Proyecto'

                    // Chart Data Calculation
                    if (!progressMap.has(projectName)) {
                        progressMap.set(projectName, {
                            name: projectName,
                            completed: 0,
                            remaining: 0,
                            total: 0
                        })
                    }

                    const stats = progressMap.get(projectName)!
                    stats.total++
                    if (task.status === 'Terminada') {
                        stats.completed++
                    } else {
                        stats.remaining++
                    }

                    // Progress State Calculation (per project ID)
                    if (projectId) {
                        if (!progressState[projectId]) {
                            // Initialize with temporary count to compute percentage later
                            // We'll store: { total: count, completed: count } temporarily in a Map?
                            // No, let's better rebuild strictly for IDs.
                        }
                    }
                })

                // Cleaner approach: Calculate per-projectID progress
                const projectStats: Record<string, { total: number, completed: number }> = {}

                allTasks.forEach((task) => {
                    if (!task.project_id) return
                    if (!projectStats[task.project_id]) {
                        projectStats[task.project_id] = { total: 0, completed: 0 }
                    }
                    projectStats[task.project_id].total++
                    if (task.status === 'Terminada') {
                        projectStats[task.project_id].completed++
                    }
                })

                Object.keys(projectStats).forEach(projectId => {
                    const stats = projectStats[projectId]
                    progressState[projectId] = Math.round((stats.completed / stats.total) * 100)
                })
            }

            setChartData(Array.from(progressMap.values()).sort((a, b) => b.total - a.total))
            setProjectProgress(progressState)
        } catch (error) {
            console.error('Error fetching tasks and progress:', error)
            setLoadError('No se pudieron cargar los datos de progreso.')
        }
    }, [])


    const markProjectAsCompleted = (e: React.MouseEvent, projectId: string) => {
        e.stopPropagation()
        setActiveCompletionProjectId(projectId)
    }

    const updateProjectPriority = async (projectId: string, newPriority: string) => {
        // Optimistic update
        const oldProjects = [...projects]
        setProjects(projects.map(p =>
            p.id === projectId ? { ...p, priority: newPriority } : p
        ))

        const { error } = await supabase
            .from('projects')
            .update({ priority: newPriority })
            .eq('id', projectId)

        if (error) {
            console.error('Error updating priority:', error)
            setProjects(oldProjects) // Revert
            // Could add a toast here
        }
    }

    const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
        e.stopPropagation()
        if (!confirm('¿Estás seguro de que quieres eliminar este proyecto?')) return

        setDeleteLoading(projectId)
        try {
            const { error } = await supabase
                .from('projects')
                .update({ habilita: 0 })
                .eq('id', projectId)

            if (error) throw error

            // Cascading delete for tasks
            const { error: tasksError } = await supabase
                .from('tasks')
                .update({ habilita: 0 })
                .eq('project_id', projectId)

            if (tasksError) throw tasksError

            fetchProjects()
        } catch (error) {
            console.error('Error deleting project:', error)
            alert('Error al eliminar el proyecto')
        } finally {
            setDeleteLoading(null)
        }
    }

    const filteredProjects = projects.filter(project => {
        const matchesSearch =
            project.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (project.area && project.area.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (project.description && project.description.toLowerCase().includes(searchQuery.toLowerCase()))

        let matchesFilter = false

        if (filter === 'active') {
            matchesFilter = project.completed_at === null && (projectProgress[project.id] || 0) < 100
        } else if (filter === 'completed') {
            matchesFilter = project.completed_at !== null
        } else if (filter === 'ready') {
            matchesFilter = project.completed_at === null && (projectProgress[project.id] || 0) === 100
        } else if (filter === 'urgent') {
            matchesFilter = project.completed_at === null && project.priority === 'Urgente' && (projectProgress[project.id] || 0) < 100
        } else if (filter === 'due_soon') {
            if (project.completed_at || !project.deadline) {
                matchesFilter = false
            } else if ((projectProgress[project.id] || 0) === 100) {
                matchesFilter = false
            } else {
                const today = new Date()
                const currentDay = today.getDay()
                const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1
                const monday = new Date(today)
                monday.setDate(today.getDate() - distanceToMonday)
                monday.setHours(0, 0, 0, 0)
                const sunday = new Date(monday)
                sunday.setDate(monday.getDate() + 6)
                sunday.setHours(23, 59, 59, 999)
                const deadline = new Date(project.deadline)
                matchesFilter = deadline >= monday && deadline <= sunday
            }
        }

        return matchesSearch && matchesFilter
    })

    const priorityOrder: Record<string, number> = { Urgente: 0, Alta: 1, Media: 2, Baja: 3 }

    const isProjectExpired = (p: Project) => {
        if (p.completed_at) return false
        if (!p.deadline) return false
        const limit = new Date(p.deadline)
        limit.setHours(23, 59, 59, 999)
        return new Date() > limit
    }

    const sortedProjects = [...filteredProjects].sort((a, b) => {
        if (sortBy === 'priority') {
            return (priorityOrder[a.priority ?? 'Baja'] ?? 3) - (priorityOrder[b.priority ?? 'Baja'] ?? 3)
        }
        // deadline (default)
        if (!a.deadline && !b.deadline) return 0
        if (!a.deadline) return 1
        if (!b.deadline) return -1
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    })

    if (authLoading) return <div className="p-8">Cargando sesión...</div>
    if (!user) return null
    if (loading) return <div className="p-8">Cargando proyectos...</div>
    if (loadError) {
        return (
            <div className="p-8">
                <div className="mb-3 font-medium text-slate-700">{loadError}</div>
                <Button
                    variant="outline"
                    onClick={() => {
                        setLoading(true)
                        setLoadError(null)
                        fetchProjects()
                        fetchTasksAndProgress()
                    }}
                >
                    Reintentar
                </Button>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
            <div className="max-w-7xl mx-auto">
                {filter !== 'active' && (
                    <Button
                        variant="ghost"
                        onClick={() => setFilter('active')}
                        className="mb-4"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Volver a activos
                    </Button>
                )}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-4xl font-bold text-slate-900 mb-2">Proyectos</h1>
                        <p className="text-slate-600">Gestiona y da seguimiento a tus proyectos</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                        <Button variant="outline" onClick={() => router.push('/assignments')} className="w-full sm:w-auto">
                            <Users className="w-4 h-4 mr-2" />
                            Asignaciones
                        </Button>
                        {role === 'admin' && (
                            <Button variant="outline" onClick={() => router.push('/members')} className="w-full sm:w-auto">
                                <Users className="w-4 h-4 mr-2" />
                                Miembros
                            </Button>
                        )}
                        <div className="w-full sm:w-auto">
                            <ProjectForm onProjectCreated={fetchProjects} />
                        </div>
                    </div>
                </div>

                {/* Project Summary Dashboard */}
                <ProjectSummary
                    projects={projects}
                    currentFilter={filter}
                    onFilterChange={setFilter}
                    projectProgress={projectProgress}
                />

                {/* View Toggle and Search */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6 justify-between items-center">
                    <div className="relative w-full sm:w-96">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <Input
                            placeholder="Buscar por nombre, área o descripción..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 bg-white"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Sort controls */}
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                            <button
                                title="Ordenar por prioridad"
                                onClick={() => setSortBy('priority')}
                                className={`h-8 px-2.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${sortBy === 'priority'
                                    ? 'bg-white shadow-sm text-slate-900'
                                    : 'text-slate-500 hover:bg-white/60'
                                    }`}
                            >
                                <Flame className="w-3.5 h-3.5" />
                                <span>Prioridad</span>
                            </button>
                            <button
                                title="Ordenar por fecha límite"
                                onClick={() => setSortBy('deadline')}
                                className={`h-8 px-2.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${sortBy === 'deadline'
                                    ? 'bg-white shadow-sm text-slate-900'
                                    : 'text-slate-500 hover:bg-white/60'
                                    }`}
                            >
                                <Clock3 className="w-3.5 h-3.5" />
                                <span>Fecha</span>
                            </button>
                        </div>

                        {/* View mode toggle */}
                        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setViewMode('grid')}
                                className={`h-8 w-8 p-0 hover:bg-white ${viewMode === 'grid' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setViewMode('list')}
                                className={`h-8 w-8 p-0 hover:bg-white ${viewMode === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
                            >
                                <List className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {filteredProjects.length === 0 ? (
                    <div className="text-center py-16">
                        <FolderKanban className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                        <h3 className="text-xl font-semibold text-slate-700 mb-2">
                            {searchQuery ? 'No se encontraron proyectos' : (filter === 'completed' ? 'No hay proyectos completados' : filter === 'ready' ? 'No hay proyectos listos para publicar' : 'No hay proyectos')}
                        </h3>
                        <p className="text-slate-500 mb-6">
                            {searchQuery ? 'Intenta con otros términos de búsqueda' : (filter === 'completed' ? 'Completa tareas para terminar proyectos' : filter === 'ready' ? 'Completa todas las tareas para mover proyectos aquí' : 'Comienza creando tu primer proyecto')}
                        </p>
                        {filter === 'active' && !searchQuery && <ProjectForm onProjectCreated={fetchProjects} />}
                    </div>
                ) : (
                    <>
                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {sortedProjects.map((project) => (
                                    <Card
                                        key={project.id}
                                        className={`relative overflow-hidden hover:shadow-xl transition-all cursor-pointer hover:scale-105 border-l-4 ${project.priority === 'Urgente' ? 'bg-red-100 hover:bg-red-200 border-l-red-500 dark:bg-red-950 dark:hover:bg-red-900 dark:border-l-red-400' :
                                            project.priority === 'Alta' ? 'bg-orange-100 hover:bg-orange-200 border-l-orange-500 dark:bg-orange-950 dark:hover:bg-orange-900 dark:border-l-orange-400' :
                                                project.priority === 'Media' ? 'bg-amber-100 hover:bg-amber-200 border-l-amber-500 dark:bg-amber-950 dark:hover:bg-amber-900 dark:border-l-amber-400' :
                                                    'bg-emerald-100 hover:bg-emerald-200 border-l-emerald-500 dark:bg-emerald-950 dark:hover:bg-emerald-900 dark:border-l-emerald-400'
                                            }`}
                                        onClick={() => router.push(`/projects/${project.id}`)}
                                    >
                                        {isProjectExpired(project) && (
                                            <div className="absolute top-4 -left-10 w-36 transform -rotate-45 bg-red-600/80 backdrop-blur-sm text-white text-center text-[9px] font-bold py-0.5 shadow-sm uppercase tracking-wider z-10 pointer-events-none">
                                                Vencido
                                            </div>
                                        )}
                                        <CardHeader className="pb-3">
                                            <div className="flex justify-between items-start mb-2">
                                                <CardTitle className="text-lg font-bold line-clamp-2">
                                                    {project.title}
                                                </CardTitle>
                                                {role === 'admin' ? (
                                                    <div onClick={(e) => e.stopPropagation()} className="flex gap-1 items-center">
                                                        <Select
                                                            value={project.priority || 'Media'}
                                                            onValueChange={(value) => updateProjectPriority(project.id, value)}
                                                        >
                                                            <SelectTrigger className={`w-[110px] h-8 ml-2 font-semibold ${project.priority === 'Urgente' ? 'bg-red-200 text-red-900 border-red-400 dark:bg-red-700 dark:text-red-100 dark:border-red-500' :
                                                                project.priority === 'Alta' ? 'bg-orange-200 text-orange-900 border-orange-400 dark:bg-orange-700 dark:text-orange-100 dark:border-orange-500' :
                                                                    project.priority === 'Media' ? 'bg-amber-200 text-amber-900 border-amber-400 dark:bg-amber-700 dark:text-amber-100 dark:border-amber-500' :
                                                                        'bg-emerald-200 text-emerald-900 border-emerald-400 dark:bg-emerald-700 dark:text-emerald-100 dark:border-emerald-500'
                                                                }`}>
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="Baja">Baja</SelectItem>
                                                                <SelectItem value="Media">Media</SelectItem>
                                                                <SelectItem value="Alta">Alta</SelectItem>
                                                                <SelectItem value="Urgente">Urgente</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                                                            disabled={deleteLoading === project.id}
                                                            onClick={(e) => handleDeleteProject(e, project.id)}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Badge
                                                        className={`ml-2 shrink-0 font-semibold border ${project.priority === 'Urgente' ? 'bg-red-200 text-red-900 border-red-400 dark:bg-red-700 dark:text-red-100 dark:border-red-500' :
                                                            project.priority === 'Alta' ? 'bg-orange-200 text-orange-900 border-orange-400 dark:bg-orange-700 dark:text-orange-100 dark:border-orange-500' :
                                                                project.priority === 'Media' ? 'bg-amber-200 text-amber-900 border-amber-400 dark:bg-amber-700 dark:text-amber-100 dark:border-amber-500' :
                                                                    'bg-emerald-200 text-emerald-900 border-emerald-400 dark:bg-emerald-700 dark:text-emerald-100 dark:border-emerald-500'
                                                            }`}
                                                    >
                                                        {project.priority}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex gap-2 text-xs text-slate-500">
                                                {project.area && <span className="bg-slate-100 px-2 py-1 rounded">{project.area}</span>}
                                                {project.type && <span className="bg-slate-100 px-2 py-1 rounded">{project.type}</span>}
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            {project.description && (
                                                <p className="text-sm text-slate-600 mb-4 line-clamp-2">{project.description}</p>
                                            )}

                                            {/* Progress Bar */}
                                            <div className="mb-3">
                                                <div className="flex justify-between text-xs text-slate-600 mb-1">
                                                    <span>Progreso</span>
                                                    <span className="font-semibold">{projectProgress[project.id] || 0}%</span>
                                                </div>
                                                <div className="w-full bg-slate-200 rounded-full h-2">
                                                    <div
                                                        className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all"
                                                        style={{ width: `${projectProgress[project.id] || 0}%` }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${project.status === 'En Progreso' ? 'bg-green-100 text-green-800' :
                                                        project.status === 'Completado' ? 'bg-blue-100 text-blue-800' :
                                                            'bg-yellow-100 text-yellow-800'
                                                        }`}>
                                                        {project.status}
                                                    </span>
                                                </div>
                                                {project.deadline && (
                                                    <div className="flex items-center gap-1 text-slate-500">
                                                        <Calendar className="w-4 h-4" />
                                                        <span className="text-xs">
                                                            {new Date(project.deadline).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Finalized Project Link */}
                                            {project.completed_at && project.upload_link && (
                                                <div className="mt-3 pt-3 border-t border-slate-200">
                                                    <a
                                                        href={project.upload_link}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-blue-600 hover:text-blue-800 font-bold underline flex items-center gap-1"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <CheckCircle2 className="w-3 h-3" />
                                                        Ver material finalizado →
                                                    </a>
                                                </div>
                                            )}

                                            {/* Action Buttons */}
                                            {(projectProgress[project.id] || 0) === 100 && !project.completed_at && role === 'admin' && (
                                                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                                                    <Button
                                                        size="sm"
                                                        className="bg-purple-600 hover:bg-purple-700 text-white w-full sm:w-auto"
                                                        onClick={(e) => markProjectAsCompleted(e, project.id)}
                                                    >
                                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                                        Publicar / Finalizar
                                                    </Button>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                                {sortedProjects.map((project, index) => (
                                    <div
                                        key={project.id}
                                        onClick={() => router.push(`/projects/${project.id}`)}
                                        className={`relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 cursor-pointer transition-colors border-l-4 ${index !== filteredProjects.length - 1 ? 'border-b border-slate-100' : ''} ${project.priority === 'Urgente' ? 'bg-red-50 hover:bg-red-100 border-l-red-500 dark:bg-red-950/60 dark:hover:bg-red-900/60 dark:border-l-red-400' :
                                            project.priority === 'Alta' ? 'bg-orange-50 hover:bg-orange-100 border-l-orange-500 dark:bg-orange-950/60 dark:hover:bg-orange-900/60 dark:border-l-orange-400' :
                                                project.priority === 'Media' ? 'bg-amber-50 hover:bg-amber-100 border-l-amber-500 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 dark:border-l-amber-400' :
                                                    'bg-emerald-50 hover:bg-emerald-100 border-l-emerald-500 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 dark:border-l-emerald-400'
                                            }`}
                                    >
                                        {isProjectExpired(project) && (
                                            <div className="absolute top-2 -left-10 w-32 transform -rotate-45 bg-red-600/80 backdrop-blur-sm text-white text-center text-[9px] font-bold py-0.5 shadow-sm uppercase tracking-wider z-10 pointer-events-none">
                                                Vencido
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0 mr-4 mb-3 sm:mb-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-semibold text-slate-900 truncate">{project.title}</h3>
                                                {project.area && (
                                                    <span className="hidden sm:inline-block px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
                                                        {project.area}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-slate-500">
                                                {project.deadline && (
                                                    <div className="flex items-center gap-1">
                                                        <Calendar className="w-3 h-3" />
                                                        <span>{new Date(project.deadline).toLocaleDateString()}</span>
                                                    </div>
                                                )}
                                                <span className={`${project.status === 'En Progreso' ? 'text-green-600' :
                                                    project.status === 'Completado' ? 'text-blue-600' :
                                                        'text-yellow-600'
                                                    }`}>
                                                    {project.status}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                                            {/* Progress (Mini) */}
                                            <div className="flex items-center gap-2 w-24">
                                                <div className="w-full bg-slate-200 rounded-full h-1.5">
                                                    <div
                                                        className="bg-blue-600 h-1.5 rounded-full"
                                                        style={{ width: `${projectProgress[project.id] || 0}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs font-medium text-slate-600 text-right w-8">
                                                    {projectProgress[project.id] || 0}%
                                                </span>
                                            </div>

                                            {/* Priority Selector (Admin) or Badge */}
                                            {role === 'admin' ? (
                                                <div onClick={(e) => e.stopPropagation()} className="flex gap-2 items-center">
                                                    <Select
                                                        value={project.priority || 'Media'}
                                                        onValueChange={(value) => updateProjectPriority(project.id, value)}
                                                    >
                                                        <SelectTrigger className={`w-[100px] h-8 text-xs font-semibold ${project.priority === 'Urgente' ? 'bg-red-200 text-red-900 border-red-400 dark:bg-red-700 dark:text-red-100 dark:border-red-500' :
                                                            project.priority === 'Alta' ? 'bg-orange-200 text-orange-900 border-orange-400 dark:bg-orange-700 dark:text-orange-100 dark:border-orange-500' :
                                                                project.priority === 'Media' ? 'bg-amber-200 text-amber-900 border-amber-400 dark:bg-amber-700 dark:text-amber-100 dark:border-amber-500' :
                                                                    'bg-emerald-200 text-emerald-900 border-emerald-400 dark:bg-emerald-700 dark:text-emerald-100 dark:border-emerald-500'
                                                            }`}>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="Baja">Baja</SelectItem>
                                                            <SelectItem value="Media">Media</SelectItem>
                                                            <SelectItem value="Alta">Alta</SelectItem>
                                                            <SelectItem value="Urgente">Urgente</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                                                        disabled={deleteLoading === project.id}
                                                        onClick={(e) => handleDeleteProject(e, project.id)}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Badge
                                                    className={`ml-2 shrink-0 font-semibold border ${project.priority === 'Urgente' ? 'bg-red-200 text-red-900 border-red-400 dark:bg-red-700 dark:text-red-100 dark:border-red-500' :
                                                        project.priority === 'Alta' ? 'bg-orange-200 text-orange-900 border-orange-400 dark:bg-orange-700 dark:text-orange-100 dark:border-orange-500' :
                                                            project.priority === 'Media' ? 'bg-amber-200 text-amber-900 border-amber-400 dark:bg-amber-700 dark:text-amber-100 dark:border-amber-500' :
                                                                'bg-emerald-200 text-emerald-900 border-emerald-400 dark:bg-emerald-700 dark:text-emerald-100 dark:border-emerald-500'
                                                        }`}
                                                >
                                                    {project.priority}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Project Progress Chart */}
            <div className="max-w-7xl mx-auto mt-12 pb-12">
                <ProjectProgressChart data={chartData} />
            </div>

            {/* Completion Modal */}
            {activeCompletionProjectId && (
                <ProjectCompletionModal
                    projectId={activeCompletionProjectId}
                    onClose={() => {
                        setActiveCompletionProjectId(null)
                        fetchProjects()
                    }}
                />
            )}

            {/* Daily Notes Panel */}
            <DailyNotesPanel open={dailyNotesOpen} onOpenChange={setDailyNotesOpen} />

            {/* Floating Daily Notes Button */}
            {!dailyNotesOpen && (
                <div className="fixed bottom-4 left-4 z-50">
                    <Button
                        onClick={() => setDailyNotesOpen(true)}
                        size="lg"
                        className="relative h-14 w-14 rounded-full shadow-lg bg-amber-400 hover:bg-amber-500 text-amber-900 transition-transform hover:scale-110 border-2 border-white/20"
                        title="Notas del Día"
                    >
                        <StickyNote className="h-6 w-6" />
                        {notesCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border-2 border-slate-50 shadow-sm animate-in fade-in zoom-in duration-300">
                                {notesCount}
                            </span>
                        )}
                    </Button>
                </div>
            )}
        </div>
    )
}
