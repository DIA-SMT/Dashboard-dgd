'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TaskEditForm } from '@/components/task-edit-form'
import { TaskForm } from '@/components/task-form'
import { TaskComments } from '@/components/task-comments'
import { TaskFiles } from '@/components/task-files'
import type { Adjunto } from '@/lib/adjuntos'
import {
    Calendar, CheckCircle2, Circle, Clock, PauseCircle, Ban,
    AlertTriangle, MessageSquare, CornerDownRight,
} from 'lucide-react'
import type { Task, TaskAssignee } from '@/types'
import {
    TASK_STATUSES,
    DEFAULT_TASK_STATUS,
    isCompletedStatus,
    countsTowardProgress,
    getStatusColor,
    getDeadlineState,
    getDeadlineLabel,
    getDeadlineColor,
} from '@/lib/task-status'

export type TaskWithAssignees = Task & {
    assignees: TaskAssignee[]
}

function iconoDeEstado(status: string | null) {
    switch (status) {
        case 'Terminada':
            return <CheckCircle2 className="h-5 w-5 text-green-600" />
        case 'En desarrollo':
            return <Clock className="h-5 w-5 text-blue-600" />
        case 'Pausada':
            return <PauseCircle className="h-5 w-5 text-amber-600" />
        case 'Cancelada':
            return <Ban className="h-5 w-5 text-rose-500" />
        default:
            return <Circle className="h-5 w-5 text-slate-400" />
    }
}

/**
 * Tarjeta de una tarea, con sus subtareas anidadas y su hilo de comentarios.
 *
 * Estaba escrita en línea dentro de project-detail-view, con más de cien
 * líneas de JSX anidado. Extraerla es lo que hace tratable la jerarquía del
 * expediente (R5): la tarjeta se renderiza a sí misma y después a sus hijas.
 *
 * La anidación es de un solo nivel a propósito: el expediente pide "tareas y
 * subtareas", no un árbol de profundidad arbitraria, y un nivel se lee de un
 * vistazo. Por eso una subtarea no ofrece el botón de agregar subtarea.
 */
export function TaskCard({
    task,
    subtasks,
    projectId,
    proyectoCerrado,
    onPedirCompletar,
    onCambio,
    comentariosPorTarea = {},
    adjuntosPorTarea = {},
    esSubtarea = false,
}: {
    task: TaskWithAssignees
    subtasks: TaskWithAssignees[]
    projectId: string
    proyectoCerrado: boolean
    onPedirCompletar: (task: TaskWithAssignees) => void
    onCambio: () => void
    /**
     * Cuántas observaciones tiene cada tarea, contadas desde el proyecto en una
     * sola consulta. Si cada tarjeta lo preguntara sola no se sabría que hay
     * algo escrito hasta abrir el hilo, que es justo lo que había que evitar.
     * Viaja el mapa entero, no el número, porque la tarjeta también dibuja sus
     * subtareas.
     */
    comentariosPorTarea?: Record<string, number>
    /**
     * Los archivos de cada tarea, traídos desde el proyecto en una sola
     * consulta. Mismo criterio que el conteo de observaciones: si cada tarjeta
     * los pidiera sola, abrir un proyecto con veinte tareas serían veinte
     * consultas.
     */
    adjuntosPorTarea?: Record<string, Adjunto[]>
    esSubtarea?: boolean
}) {
    const [estadoOptimista, setEstadoOptimista] = useState<string | null>(null)
    const [verComentarios, setVerComentarios] = useState(false)
    const [cantComentarios, setCantComentarios] = useState<number | null>(null)

    // El del padre vale hasta que el hilo, ya abierto, informe el suyo. Pero si
    // el proyecto vuelve a contar y le da otro número, ese es más nuevo que el
    // que dejó el hilo la última vez: se descarta el local y manda el del padre.
    const delPadre = comentariosPorTarea[task.id] ?? 0
    const [ultimoDelPadre, setUltimoDelPadre] = useState(delPadre)
    if (delPadre !== ultimoDelPadre) {
        setUltimoDelPadre(delPadre)
        setCantComentarios(null)
    }
    const cuantos = cantComentarios ?? delPadre

    const estado = estadoOptimista ?? task.status
    const vencimiento = getDeadlineState(task.deadline, estado)

    // Avance de las subtareas: informa sin imponer. El estado de la tarea madre
    // se sigue manejando a mano — forzarlo desde las hijas sorprendería a quien
    // quiere cerrar una tarea dando por descontado lo que quedó afuera.
    const subtareasComputables = subtasks.filter(s => countsTowardProgress(s.status))
    const subtareasHechas = subtareasComputables.filter(s => isCompletedStatus(s.status)).length

    async function cambiarEstado(nuevo: string) {
        if (nuevo === 'Terminada') {
            onPedirCompletar(task)
            return
        }

        const anterior = task.status
        setEstadoOptimista(nuevo)

        // El .select() no es decorativo: si RLS no deja tocar la fila, PostgREST
        // no devuelve error, devuelve cero filas. Sin este control el cambio
        // quedaba en pantalla y se perdía al recargar.
        const { data, error } = await supabase
            .from('tasks')
            .update({ status: nuevo })
            .eq('id', task.id)
            .select('id')

        if (error || !data || data.length === 0) {
            console.error('No se pudo actualizar el estado de la tarea:', error)
            alert(
                error
                    ? 'No se pudo actualizar el estado de la tarea'
                    : 'No tenés permiso para cambiar el estado de esta tarea. Sólo pueden hacerlo sus responsables o un administrador.'
            )
            setEstadoOptimista(anterior)
            return
        }
        setEstadoOptimista(null)
        onCambio()
    }

    return (
        <div>
            <Card className={`transition-shadow hover:shadow-md ${esSubtarea ? 'border-slate-200 bg-slate-50/50' : ''}`}>
                <CardContent className={esSubtarea ? 'p-3' : 'p-4'}>
                    <div className="flex items-start gap-3">
                        <div className="mt-1 shrink-0">{iconoDeEstado(estado)}</div>

                        <div className="min-w-0 flex-1">
                            <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div className="min-w-0">
                                    <h3 className={`font-semibold ${esSubtarea ? 'text-sm' : 'text-lg'}`}>
                                        {task.title}
                                    </h3>
                                    {subtasks.length > 0 && (
                                        <span className="text-xs text-slate-500">
                                            {subtareasHechas} de {subtareasComputables.length} subtareas terminadas
                                        </span>
                                    )}
                                </div>

                                <div className="flex w-full items-center gap-2 md:w-auto">
                                    <Select
                                        disabled={proyectoCerrado}
                                        value={estado || DEFAULT_TASK_STATUS}
                                        onValueChange={cambiarEstado}
                                    >
                                        <SelectTrigger className={`w-full md:w-[140px] ${esSubtarea ? 'h-8 text-xs' : ''}`}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {TASK_STATUSES.map((e) => (
                                                <SelectItem key={e} value={e}>{e}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {!proyectoCerrado && (
                                        <TaskEditForm
                                            task={task}
                                            onTaskUpdated={onCambio}
                                            onTaskDeleted={onCambio}
                                        />
                                    )}
                                </div>
                            </div>

                            {task.assignees.length > 0 && (
                                <div className="mb-2 flex flex-wrap gap-1">
                                    {task.assignees.map((a) => (
                                        <Badge key={a.id} variant="outline" className="text-xs">
                                            {a.assignee_name}
                                        </Badge>
                                    ))}
                                </div>
                            )}

                            {task.deadline && (
                                <div className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
                                    <Calendar className="h-4 w-4" />
                                    <span>Vence: {new Date(task.deadline + 'T00:00:00').toLocaleDateString()}</span>
                                    {vencimiento && (
                                        <Badge variant="outline" className={`gap-1 ${getDeadlineColor(vencimiento)}`}>
                                            <AlertTriangle className="h-3 w-3" />
                                            {getDeadlineLabel(task.deadline, vencimiento)}
                                        </Badge>
                                    )}
                                </div>
                            )}

                            {task.notes && <p className="mb-2 text-sm text-slate-600">{task.notes}</p>}

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

                            <TaskFiles
                                taskId={task.id}
                                adjuntos={adjuntosPorTarea[task.id] ?? []}
                                puedeSubir={!proyectoCerrado}
                                onCambio={onCambio}
                            />

                            <div className="mt-2 flex flex-wrap items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setVerComentarios(!verComentarios)}
                                    aria-expanded={verComentarios}
                                    title={cuantos > 0
                                        ? `${cuantos} ${cuantos === 1 ? 'observación' : 'observaciones'} en esta tarea`
                                        : 'Agregar una observación'}
                                    className={`relative h-7 gap-1 px-2 text-xs ${
                                        cuantos > 0
                                            ? 'font-medium text-[#0065ff] hover:text-[#0065ff] dark:text-blue-400 dark:hover:text-blue-400'
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    <span className="relative">
                                        <MessageSquare className="h-3.5 w-3.5" />
                                        {cuantos > 0 && !verComentarios && (
                                            <span
                                                aria-hidden="true"
                                                className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#0065ff] ring-2 ring-white dark:ring-slate-900"
                                            />
                                        )}
                                    </span>
                                    {cuantos > 0 ? `Observaciones (${cuantos})` : 'Agregar observación'}
                                </Button>

                                {!esSubtarea && !proyectoCerrado && (
                                    <TaskForm
                                        onTaskCreated={onCambio}
                                        projectId={projectId}
                                        parentTaskId={task.id}
                                    />
                                )}

                                <Badge className={`ml-auto text-xs ${getStatusColor(estado)}`}>{estado}</Badge>
                            </div>

                            {verComentarios && (
                                <TaskComments taskId={task.id} onCantidad={setCantComentarios} autoFoco />
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {subtasks.length > 0 && (
                <div className="mt-2 space-y-2 border-l-2 border-slate-200 pl-4 md:ml-6">
                    {subtasks.map((sub) => (
                        <div key={sub.id} className="relative">
                            <CornerDownRight className="absolute -left-[22px] top-4 h-3.5 w-3.5 text-slate-300" />
                            <TaskCard
                                task={sub}
                                subtasks={[]}
                                projectId={projectId}
                                proyectoCerrado={proyectoCerrado}
                                onPedirCompletar={onPedirCompletar}
                                onCambio={onCambio}
                                comentariosPorTarea={comentariosPorTarea}
                                adjuntosPorTarea={adjuntosPorTarea}
                                esSubtarea
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
