'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { Project, Task, TaskAssignee } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TaskForm } from '@/components/task-form'
import { TaskEditForm } from '@/components/task-edit-form'
import { ProjectCompletionModal } from '@/components/project-completion-modal'
import { TaskCompletionModal } from '@/components/task-completion-modal'
import { ArrowLeft, Calendar, CheckCircle2, Circle, Clock, Pencil, Check, X, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'

type TaskWithAssignees = Task & {
    assignees: TaskAssignee[]
}

export function ProjectDetailView({ projectId }: { projectId: string }) {
    const router = useRouter()
    const { role } = useAuth()
    const [project, setProject] = useState<Project | null>(null)
    const [tasks, setTasks] = useState<TaskWithAssignees[]>([])
    const [loading, setLoading] = useState(true)
    const [showCompletionModal, setShowCompletionModal] = useState(false)
    const [activeTaskForCompletion, setActiveTaskForCompletion] = useState<TaskWithAssignees | null>(null)
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [editedTitle, setEditedTitle] = useState('')
    const [isEditingDeadline, setIsEditingDeadline] = useState(false)
    const [editedDeadline, setEditedDeadline] = useState('')

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

    const completedTasks = tasks.filter(t => t.status === 'Terminada').length
    const progress = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0

    const getStatusIcon = (status: string | null) => {
        switch (status) {
            case 'Terminada':
                return <CheckCircle2 className="w-5 h-5 text-green-600" />
            case 'En desarrollo':
                return <Clock className="w-5 h-5 text-blue-600" />
            default:
                return <Circle className="w-5 h-5 text-slate-400" />
        }
    }

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

    const getStatusColor = (status: string | null) => {
        switch (status) {
            case 'Terminada':
                return 'bg-green-100 text-green-800'
            case 'En desarrollo':
                return 'bg-blue-100 text-blue-800'
            default:
                return 'bg-slate-100 text-slate-600'
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
                        {/* Progress Bar */}
                        <div className="mb-2">
                            <div className="flex justify-between text-sm text-slate-600 mb-2">
                                <span className="font-semibold">Progreso del proyecto</span>
                                <span className="font-bold text-lg">{progress}%</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-3">
                                <div
                                    className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-xs text-slate-500 mt-1">
                                <span>{completedTasks} de {tasks.length} tareas completadas</span>
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
                        {tasks.map((task) => (
                            <Card key={task.id} className="hover:shadow-md transition-shadow">
                                <CardContent className="p-4">
                                    <div className="flex items-start gap-4">
                                        <div className="mt-1">
                                            {getStatusIcon(task.status)}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-2 mb-2">
                                                <h3 className="font-semibold text-lg">{task.title}</h3>
                                                <div className="flex gap-2 items-center w-full md:w-auto">
                                                    <Select
                                                        disabled={!!project.completed_at}
                                                        value={task.status || 'Sin empezar'}
                                                        onValueChange={async (newStatus) => {
                                                            if (newStatus === 'Terminada') {
                                                                setActiveTaskForCompletion(task)
                                                                return
                                                            }

                                                            // Optimistic update for non-terminal statuses
                                                            const previousTasks = [...tasks]
                                                            setTasks(tasks.map(t =>
                                                                t.id === task.id ? { ...t, status: newStatus } : t
                                                            ))

                                                            try {
                                                                const { error } = await supabase
                                                                    .from('tasks')
                                                                    .update({ status: newStatus })
                                                                    .eq('id', task.id)

                                                                if (error) throw error

                                                                // Refresh to ensure consistency (e.g. completion modal)
                                                                fetchProjectData()
                                                            } catch (error) {
                                                                console.error('Error updating task status:', error)
                                                                alert('No se pudo actualizar el estado de la tarea')
                                                                // Revert on error
                                                                setTasks(previousTasks)
                                                            }
                                                        }}
                                                    >
                                                        <SelectTrigger className="w-full md:w-[140px]">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="Sin empezar">Sin empezar</SelectItem>
                                                            <SelectItem value="En desarrollo">En desarrollo</SelectItem>
                                                            <SelectItem value="Terminada">Terminada</SelectItem>
                                                        </SelectContent>
                                                    </Select>

                                                    {!project.completed_at && (
                                                        <TaskEditForm
                                                            task={task}
                                                            onTaskUpdated={fetchProjectData}
                                                            onTaskDeleted={fetchProjectData}
                                                        />
                                                    )}
                                                </div>
                                            </div>

                                            {task.assignees.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mb-2">
                                                    {task.assignees.map((assignee) => (
                                                        <Badge key={assignee.id} variant="outline" className="text-xs">
                                                            {assignee.assignee_name}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}

                                            {task.deadline && (
                                                <div className="flex items-center gap-1.5 text-sm text-slate-600 mb-2">
                                                    <Calendar className="w-4 h-4" />
                                                    <span>Vence: {new Date(task.deadline + 'T00:00:00').toLocaleDateString()}</span>
                                                </div>
                                            )}

                                            {task.notes && (
                                                <p className="text-sm text-slate-600 mb-2">{task.notes}</p>
                                            )}

                                            {task.link && (
                                                <a
                                                    href={task.link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm text-blue-600 hover:underline"
                                                >
                                                    Ver enlace →
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

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
                                const { error } = await supabase
                                    .from('tasks')
                                    .update({
                                        status: 'Terminada',
                                        notes: notes || null
                                    })
                                    .eq('id', activeTaskForCompletion.id)

                                if (error) throw error
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
