'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { Project } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TaskForm } from '@/components/task-form'
import { TaskCard, type TaskWithAssignees } from '@/components/task-card'
import { listarAdjuntos, type Adjunto } from '@/lib/adjuntos'
import { ActivityLogView } from '@/components/activity-log-view'
import { ProjectCompletionModal } from '@/components/project-completion-modal'
import { TaskCompletionModal } from '@/components/task-completion-modal'
import { ArrowLeft, Calendar, CalendarPlus, CheckCircle2, History, ChevronDown, Pencil, Check, X, Trash2, User as UserIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { computeProgress, avanceEfectivo, getStatusColor } from '@/lib/task-status'

/**
 * Bloque de texto largo con edición en línea.
 *
 * Objetivos y alcance necesitaban exactamente el mismo comportamiento que ya
 * tenían el título y la fecha límite, pero repetir esa maquinaria por cada
 * campo eran treinta líneas más cada vez. El componente maneja su propio
 * estado de edición y le deja al padre sólo el guardado.
 */
function CampoTextoEditable({ etiqueta, valor, editable, placeholder, onGuardar }: {
    etiqueta: string
    valor: string | null
    editable: boolean
    placeholder: string
    onGuardar: (nuevo: string | null) => Promise<void>
}) {
    const [editando, setEditando] = useState(false)
    const [borrador, setBorrador] = useState(valor ?? '')
    const [guardando, setGuardando] = useState(false)

    // Si no hay nada cargado y tampoco se puede editar, el bloque no aporta.
    if (!valor && !editable) return null

    async function guardar() {
        setGuardando(true)
        try {
            await onGuardar(borrador.trim() || null)
            setEditando(false)
        } finally {
            setGuardando(false)
        }
    }

    return (
        <div className="mb-4">
            <div className="mb-1 flex items-center gap-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{etiqueta}</h3>
                {editable && !editando && (
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setBorrador(valor ?? ''); setEditando(true) }}
                        className="h-6 px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                        <Pencil className="h-3 w-3" />
                    </Button>
                )}
            </div>

            {editando ? (
                <div className="space-y-2">
                    <Textarea
                        value={borrador}
                        onChange={(e) => setBorrador(e.target.value)}
                        placeholder={placeholder}
                        rows={3}
                        autoFocus
                    />
                    <div className="flex gap-1">
                        <Button size="sm" onClick={guardar} disabled={guardando}>
                            <Check className="mr-1 h-3.5 w-3.5" />
                            Guardar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditando(false)} disabled={guardando}>
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            ) : (
                <p className={`whitespace-pre-wrap text-sm ${valor ? 'text-slate-600' : 'italic text-slate-400'}`}>
                    {valor || 'Sin cargar'}
                </p>
            )}
        </div>
    )
}



export function ProjectDetailView({ projectId }: { projectId: string }) {
    const router = useRouter()
    const { role } = useAuth()
    const [project, setProject] = useState<Project | null>(null)
    const [tasks, setTasks] = useState<TaskWithAssignees[]>([])
    const [comentariosPorTarea, setComentariosPorTarea] = useState<Record<string, number>>({})
    const [adjuntosPorTarea, setAdjuntosPorTarea] = useState<Record<string, Adjunto[]>>({})
    const [loading, setLoading] = useState(true)
    const [showCompletionModal, setShowCompletionModal] = useState(false)
    const [activeTaskForCompletion, setActiveTaskForCompletion] = useState<TaskWithAssignees | null>(null)
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [editedTitle, setEditedTitle] = useState('')
    const [isEditingDeadline, setIsEditingDeadline] = useState(false)
    const [editedDeadline, setEditedDeadline] = useState('')
    const [verHistorial, setVerHistorial] = useState(false)
    const [members, setMembers] = useState<{ id: string; full_name: string }[]>([])
    const [editandoAvance, setEditandoAvance] = useState(false)
    const [avanceEditado, setAvanceEditado] = useState('')
    const [isEditingStartDate, setIsEditingStartDate] = useState(false)
    const [editedStartDate, setEditedStartDate] = useState('')

    const fetchProjectData = useCallback(async () => {
        try {
            // Fetch project
            const { data: projectData } = await supabase
                .from('projects')
                .select('*')
                .eq('id', projectId)
                .eq('habilita', 1)
                .single()

            if (projectData) setProject(projectData)

            // Fetch tasks with assignees using a join
            const { data: tasksData } = await supabase
                .from('tasks')
                .select('*, task_assignees(id, assignee_name)') // Select specific fields from task_assignees
                .eq('project_id', projectId)
                .eq('habilita', 1)
                .order('created_at', { ascending: true })

            if (tasksData) {
                // Transform data to match TaskWithAssignees type
                // task_assignees returns an array of objects { id, assignee_name }
                // We map this to match our TaskAssignee type roughly or just cast/use as is
                const tasksWithAssigneesFormatted = tasksData.map((task: any) => ({
                    ...task,
                    assignees: task.task_assignees || []
                }))

                setTasks(tasksWithAssigneesFormatted)

                // Cuántas observaciones tiene cada tarea, de una sola consulta.
                // Es lo que permite mostrar el punto en la tarjeta sin abrir el
                // hilo de a una. PostgREST no expone un count agrupado, así que
                // se traen los task_id y se cuentan acá; son pocas filas por
                // proyecto y el índice task_comments_task_id_idx las resuelve.
                const ids = tasksWithAssigneesFormatted.map((t: TaskWithAssignees) => t.id)
                if (ids.length > 0) {
                    const { data: comentarios, error: errorComentarios } = await supabase
                        .from('task_comments')
                        .select('task_id')
                        .eq('habilita', 1)
                        .in('task_id', ids)

                    if (errorComentarios) {
                        console.error('Error contando las observaciones:', errorComentarios)
                    } else {
                        const cuenta: Record<string, number> = {}
                        for (const c of comentarios ?? []) {
                            if (c.task_id) cuenta[c.task_id] = (cuenta[c.task_id] ?? 0) + 1
                        }
                        setComentariosPorTarea(cuenta)
                    }
                } else {
                    setComentariosPorTarea({})
                }

                // Los adjuntos, también de una sola consulta para todo el proyecto.
                if (ids.length > 0) {
                    const archivos = await listarAdjuntos(ids)
                    const porTarea: Record<string, Adjunto[]> = {}
                    for (const a of archivos) {
                        (porTarea[a.task_id] ??= []).push(a)
                    }
                    setAdjuntosPorTarea(porTarea)
                } else {
                    setAdjuntosPorTarea({})
                }

                // Check if all tasks are completed
                // We no longer auto-show the modal here. The flow is: 
                // All tasks done -> Project moves to "Listo PP" in list view -> User clicks "Publicar" in list view -> Modal opens.
                /*
                const allCompleted = tasksWithAssigneesFormatted.length > 0 &&
                    tasksWithAssigneesFormatted.every((t: Task) => t.status === 'Terminada')

                if (allCompleted && !projectData?.completed_at) {
                    setShowCompletionModal(true)
                }
                */
            }
        } catch (error) {
            console.error('Error fetching project data:', error)
        } finally {
            setLoading(false)
        }
    }, [projectId])

    useEffect(() => {
        fetchProjectData()
    }, [fetchProjectData])

    // R14: la nómina, para poder elegir el responsable del proyecto.
    useEffect(() => {
        supabase.from('members').select('id, full_name').eq('habilita', 1).order('full_name')
            .then(({ data }) => { if (data) setMembers(data) })
    }, [])

    // R5: la lista se arma por jerarquía. Una tarea sin parent_task_id es de
    // primer nivel; las demás cuelgan de ella. El avance sigue contando todas
    // por igual —madres y subtareas— porque cada una es trabajo real.
    const tareasRaiz = tasks.filter(t => !t.parent_task_id)
    const subtareasDe = (id: string) => tasks.filter(t => t.parent_task_id === id)

    const completedTasks = tasks.filter(t => t.status === 'Terminada').length
    const avanceCalculado = computeProgress(tasks)
    const progress = avanceEfectivo(project?.progress, avanceCalculado)
    const avanceEsManual = project?.progress !== null && project?.progress !== undefined


    const updateProjectTitle = async () => {
        if (!editedTitle.trim()) {
            alert('El título no puede estar vacío')
            return
        }

        if (editedTitle === project?.title) {
            setIsEditingTitle(false)
            return
        }

        const oldTitle = project?.title

        // Optimistic update
        if (project) {
            setProject({ ...project, title: editedTitle })
        }
        setIsEditingTitle(false)

        try {
            const { error } = await supabase
                .from('projects')
                .update({ title: editedTitle })
                .eq('id', projectId)

            if (error) throw error
        } catch (error) {
            console.error('Error updating project title:', error)
            alert('No se pudo actualizar el título del proyecto')
            // Rollback
            if (project && oldTitle) {
                setProject({ ...project, title: oldTitle })
            }
        }
    }

    const handleUpdateDeadline = async () => {
        if (!project) return

        if (!editedDeadline) {
            alert('Ingresá una fecha límite')
            return
        }

        const oldDeadline = project.deadline

        // Optimistic update
        setProject({ ...project, deadline: editedDeadline })
        setIsEditingDeadline(false)

        try {
            const { error } = await supabase
                .from('projects')
                .update({ deadline: editedDeadline })
                .eq('id', projectId)

            if (error) throw error
        } catch (error) {
            console.error('Error updating project deadline:', error)
            alert('No se pudo actualizar la fecha límite del proyecto')
            // Rollback
            setProject({ ...project, deadline: oldDeadline })
        }
    }

    /**
     * Guarda un campo del proyecto con actualización optimista y rollback.
     *
     * Sigue el patrón de updateProjectTitle y handleUpdateDeadline, pero sin
     * repetirlo por cada campo nuevo: objetivos, alcance y fecha de inicio
     * pasan todos por acá.
     */
    const actualizarCampo = async (campo: 'objectives' | 'scope' | 'start_date' | 'owner_id', valor: string | null) => {
        if (!project) return
        const anterior = project[campo]

        setProject({ ...project, [campo]: valor })

        const { data, error } = await supabase
            .from('projects')
            .update({ [campo]: valor })
            .eq('id', projectId)
            .select('id')

        // Cero filas sin error significa que RLS filtró el update.
        if (error || !data || data.length === 0) {
            console.error(`No se pudo actualizar ${campo}:`, error)
            alert(error ? 'No se pudo guardar el cambio' : 'No tenés permiso para modificar este proyecto')
            setProject({ ...project, [campo]: anterior })
        }
    }

    /** R11: avance cargado a mano. null devuelve el control al cálculo por tareas. */
    const actualizarAvance = async (valor: number | null) => {
        if (!project) return
        const anterior = project.progress

        setProject({ ...project, progress: valor })

        const { data, error } = await supabase
            .from('projects')
            .update({ progress: valor })
            .eq('id', projectId)
            .select('id')

        if (error || !data || data.length === 0) {
            console.error('No se pudo actualizar el avance:', error)
            alert(error ? 'No se pudo guardar el avance' : 'No tenés permiso para modificar este proyecto')
            setProject({ ...project, progress: anterior })
        }
    }

    const handleDeleteProject = async () => {
        if (!confirm('¿Estás seguro de que quieres eliminar este proyecto?')) return

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

            router.replace('/')
        } catch (error) {
            console.error('Error deleting project:', error)
            alert('Error al eliminar el proyecto')
        }
    }

    const isProjectExpired = (p: Project) => {
        if (p.completed_at) return false
        if (!p.deadline) return false
        const limit = new Date(p.deadline)
        limit.setHours(23, 59, 59, 999)
        return new Date() > limit
    }

    if (loading) return <div className="p-8">Cargando proyecto...</div>
    if (!project) return <div className="p-8">Proyecto no encontrado</div>

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <Button
                    variant="ghost"
                    onClick={() => router.push('/')}
                    className="mb-4"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Volver a proyectos
                </Button>

                {/* Completion Analysis - Highly Visible */}
                {project.completion_analysis && (
                    <Card className="mb-6 bg-amber-50 border-amber-200 shadow-md">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xl font-bold text-amber-900 flex items-center gap-2">
                                <CheckCircle2 className="w-6 h-6" />
                                Análisis de Finalización
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-amber-900/80 leading-relaxed whitespace-pre-wrap font-medium">
                                {project.completion_analysis}
                            </p>
                            {project.upload_link && (
                                <div className="pt-2 border-t border-amber-200">
                                    <a
                                        href={project.upload_link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 text-amber-700 hover:text-amber-900 font-bold underline transition-colors"
                                    >
                                        <CheckCircle2 className="w-4 h-4" />
                                        Ver material del proyecto (Drive/Enlace) →
                                    </a>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Project Info Card */}
                <Card className="relative overflow-hidden mb-6 border-l-4" style={{
                    borderLeftColor:
                        project.priority === 'Urgente' ? '#ef4444' :
                            project.priority === 'Alta' ? '#f97316' :
                                project.priority === 'Media' ? '#eab308' :
                                    '#10b981'
                }}>
                    {isProjectExpired(project) && (
                        <div className="absolute top-5 -left-12 w-44 transform -rotate-45 bg-red-600/80 backdrop-blur-sm text-white text-center text-[10px] font-bold py-1 shadow-sm uppercase tracking-wider z-10 pointer-events-none">
                            Vencido
                        </div>
                    )}
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div className="flex-1">
                                {/* Editable Title */}
                                {isEditingTitle ? (
                                    <div className="flex items-center gap-2 mb-2">
                                        <Input
                                            value={editedTitle}
                                            onChange={(e) => setEditedTitle(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    updateProjectTitle()
                                                } else if (e.key === 'Escape') {
                                                    setIsEditingTitle(false)
                                                    setEditedTitle(project.title)
                                                }
                                            }}
                                            className="text-3xl font-bold h-auto py-2"
                                            autoFocus
                                        />
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={updateProjectTitle}
                                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                        >
                                            <Check className="w-5 h-5" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => {
                                                setIsEditingTitle(false)
                                                setEditedTitle(project.title)
                                            }}
                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                        >
                                            <X className="w-5 h-5" />
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 mb-2">
                                        <CardTitle className="text-3xl font-bold">{project.title}</CardTitle>
                                        {role === 'admin' && !project.completed_at && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                    setIsEditingTitle(true)
                                                    setEditedTitle(project.title)
                                                }}
                                                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </Button>
                                        )}
                                        {role === 'admin' && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={handleDeleteProject}
                                                className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                )}

                                {project.description && (
                                    <p className="text-slate-600 mb-4">{project.description}</p>
                                )}

                                <CampoTextoEditable
                                    etiqueta="Objetivos"
                                    valor={project.objectives}
                                    editable={role === 'admin' && !project.completed_at}
                                    placeholder="Qué se busca lograr con el proyecto"
                                    onGuardar={(v) => actualizarCampo('objectives', v)}
                                />
                                <CampoTextoEditable
                                    etiqueta="Alcance"
                                    valor={project.scope}
                                    editable={role === 'admin' && !project.completed_at}
                                    placeholder="Qué incluye y qué queda afuera"
                                    onGuardar={(v) => actualizarCampo('scope', v)}
                                />
                                {/* R14: responsable del proyecto. */}
                                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                                    <UserIcon className="h-4 w-4 shrink-0" />
                                    <span>Responsable:</span>
                                    {role === 'admin' && !project.completed_at ? (
                                        <Select
                                            value={project.owner_id || '__SIN__'}
                                            onValueChange={(val) => actualizarCampo('owner_id', val === '__SIN__' ? null : val)}
                                        >
                                            <SelectTrigger className="h-8 w-[200px]">
                                                <SelectValue placeholder="Sin asignar" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__SIN__">Sin asignar</SelectItem>
                                                {members.map((m) => (
                                                    <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <span className={project.owner_id ? 'font-medium text-slate-800' : 'italic text-slate-400'}>
                                            {members.find(m => m.id === project.owner_id)?.full_name ?? 'sin asignar'}
                                        </span>
                                    )}
                                </div>

                                <div className="flex flex-wrap gap-2 mb-4">
                                    {project.area && (
                                        <Badge variant="outline">{project.area}</Badge>
                                    )}
                                    {project.type && (
                                        <Badge variant="outline">{project.type}</Badge>
                                    )}
                                    <Badge variant={project.priority === 'Urgente' ? 'destructive' : 'secondary'}>
                                        {project.priority}
                                    </Badge>
                                    <Badge className={getStatusColor(project.status)}>
                                        {project.status}
                                    </Badge>
                                </div>
                                {(project.start_date || (role === 'admin' && !project.completed_at)) && (
                                    <div className="mb-1 flex items-center gap-2 text-slate-600">
                                        <CalendarPlus className="w-4 h-4 shrink-0" />
                                        {isEditingStartDate ? (
                                            <div className="flex items-center gap-1">
                                                <Input
                                                    type="date"
                                                    value={editedStartDate}
                                                    max={project.deadline ? project.deadline.slice(0, 10) : undefined}
                                                    onChange={(e) => setEditedStartDate(e.target.value)}
                                                    className="h-8 w-[150px]"
                                                    autoFocus
                                                />
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 px-2"
                                                    onClick={async () => {
                                                        await actualizarCampo('start_date', editedStartDate || null)
                                                        setIsEditingStartDate(false)
                                                    }}
                                                >
                                                    <Check className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 px-2"
                                                    onClick={() => setIsEditingStartDate(false)}
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <>
                                                <span className="text-sm">
                                                    Inicio: {project.start_date
                                                        ? new Date(project.start_date + 'T00:00:00').toLocaleDateString()
                                                        : <span className="italic text-slate-400">sin cargar</span>}
                                                </span>
                                                {role === 'admin' && !project.completed_at && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => {
                                                            setEditedStartDate(project.start_date ? project.start_date.slice(0, 10) : '')
                                                            setIsEditingStartDate(true)
                                                        }}
                                                        className="h-7 px-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}

                                {(project.deadline || (role === 'admin' && !project.completed_at)) && (
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <Calendar className="w-4 h-4 shrink-0" />
                                        {isEditingDeadline ? (
                                            <div className="flex items-center gap-1">
                                                <Input
                                                    type="date"
                                                    value={editedDeadline}
                                                    onChange={(e) => setEditedDeadline(e.target.value)}
                                                    className="h-8 w-[150px]"
                                                    autoFocus
                                                />
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={handleUpdateDeadline}
                                                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                                >
                                                    <Check className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => setIsEditingDeadline(false)}
                                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    <X className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <>
                                                <span className="text-sm">
                                                    Fecha límite: {project.deadline
                                                        ? new Date(project.deadline.slice(0, 10) + 'T00:00:00').toLocaleDateString()
                                                        : 'sin definir'}
                                                </span>
                                                {role === 'admin' && !project.completed_at && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => {
                                                            setEditedDeadline(project.deadline ? project.deadline.slice(0, 10) : '')
                                                            setIsEditingDeadline(true)
                                                        }}
                                                        className="h-7 px-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </Button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {/* R11: el avance puede cargarse a mano; si no, sale de las tareas. */}
                        <div className="mb-2">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                                <span className="font-semibold">Progreso del proyecto</span>

                                {editandoAvance ? (
                                    <div className="flex items-center gap-1">
                                        <Input
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={avanceEditado}
                                            onChange={(e) => setAvanceEditado(e.target.value)}
                                            className="h-8 w-20"
                                            autoFocus
                                        />
                                        <span className="text-xs text-slate-400">%</span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 px-2"
                                            onClick={async () => {
                                                const n = Number(avanceEditado)
                                                if (avanceEditado !== '' && (!Number.isFinite(n) || n < 0 || n > 100)) {
                                                    alert('El avance tiene que ser un número entre 0 y 100')
                                                    return
                                                }
                                                await actualizarAvance(avanceEditado === '' ? null : Math.round(n))
                                                setEditandoAvance(false)
                                            }}
                                        >
                                            <Check className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditandoAvance(false)}>
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        {avanceEsManual && (
                                            <Badge variant="outline" className="text-[10px] font-normal text-slate-500">
                                                cargado a mano
                                            </Badge>
                                        )}
                                        <span className="text-lg font-bold">{progress}%</span>
                                        {role === 'admin' && !project.completed_at && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                    setAvanceEditado(project.progress === null || project.progress === undefined ? '' : String(project.progress))
                                                    setEditandoAvance(true)
                                                }}
                                                className="h-7 px-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    </span>
                                )}
                            </div>

                            <div className="h-3 w-full rounded-full bg-slate-200">
                                <div
                                    className="h-3 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>

                            <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                                <span>{completedTasks} de {tasks.length} tareas completadas</span>
                                {avanceEsManual && (
                                    <span className="text-slate-400">
                                        Según las tareas sería {avanceCalculado}%. Dejá el campo vacío para volver al automático.
                                    </span>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Tasks Section */}
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-slate-900">Tareas</h2>
                    {!project.completed_at && (
                        <TaskForm onTaskCreated={fetchProjectData} projectId={projectId} />
                    )}
                </div>

                {tasks.length === 0 ? (
                    <Card className="p-8 text-center">
                        <p className="text-slate-500 mb-4">No hay tareas en este proyecto</p>
                        {!project.completed_at && (
                            <TaskForm onTaskCreated={fetchProjectData} projectId={projectId} />
                        )}
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {tareasRaiz.map((task) => (
                            <TaskCard
                                key={task.id}
                                task={task}
                                subtasks={subtareasDe(task.id)}
                                projectId={projectId}
                                proyectoCerrado={!!project.completed_at}
                                onPedirCompletar={setActiveTaskForCompletion}
                                onCambio={fetchProjectData}
                                comentariosPorTarea={comentariosPorTarea}
                                adjuntosPorTarea={adjuntosPorTarea}
                            />
                        ))}
                    </div>
                )}

                {/* R13: historial de modificaciones. Los registros los escriben los
                    triggers de activity_log, así que esto es sólo lectura. */}
                <section className="mt-8">
                    <button
                        onClick={() => setVerHistorial(!verHistorial)}
                        aria-expanded={verHistorial}
                        className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50"
                    >
                        <History className="h-4 w-4 text-slate-500" />
                        <span className="text-sm font-semibold text-slate-700">Historial de modificaciones</span>
                        <ChevronDown className={`ml-auto h-4 w-4 text-slate-400 transition-transform ${verHistorial ? 'rotate-180' : ''}`} />
                    </button>

                    {verHistorial && (
                        <div className="rounded-b-lg border border-t-0 border-slate-200 bg-white px-4 pb-2">
                            <ActivityLogView
                                projectId={projectId}
                                tareas={Object.fromEntries(tasks.map(t => [t.id, t.title]))}
                            />
                        </div>
                    )}
                </section>

                {/* Completion Modal */}
                {showCompletionModal && (
                    <ProjectCompletionModal
                        projectId={projectId}
                        onClose={() => {
                            setShowCompletionModal(false)
                            fetchProjectData()
                        }}
                    />
                )}

                {/* Task Completion Modal (Comments) */}
                {activeTaskForCompletion && (
                    <TaskCompletionModal
                        taskTitle={activeTaskForCompletion.title}
                        existingNotes={activeTaskForCompletion.notes}
                        isOpen={true}
                        onClose={() => setActiveTaskForCompletion(null)}
                        onConfirm={async (notes) => {
                            try {
                                // El .select() detecta el rechazo de RLS, que
                                // no llega como error sino como cero filas. Sin
                                // esto la tarea parecía cerrarse y volvía atrás
                                // al recargar.
                                const { data, error } = await supabase
                                    .from('tasks')
                                    .update({
                                        status: 'Terminada',
                                        notes: notes || null
                                    })
                                    .eq('id', activeTaskForCompletion.id)
                                    .select('id')

                                if (error) throw error
                                if (!data || data.length === 0) {
                                    alert('No tenés permiso para cerrar esta tarea. Sólo pueden hacerlo sus responsables o un administrador.')
                                    setActiveTaskForCompletion(null)
                                    return
                                }
                                fetchProjectData()
                            } catch (error) {
                                console.error('Error finalizando tarea:', error)
                                alert('Error al finalizar la tarea')
                            }
                        }}
                    />
                )}
            </div>
        </div>
    )
}
