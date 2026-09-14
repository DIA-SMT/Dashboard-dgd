'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Project, Task, TaskAssignee } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, ChevronUp, ArrowLeft, User } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'


type TaskWithProject = Task & {
    project: Project | null
}

type AssigneeWithTasks = {
    name: string
    tasks: TaskWithProject[]
}



export function AssignmentsView() {
    const router = useRouter()
    const [assignees, setAssignees] = useState<AssigneeWithTasks[]>([])
    const [statusFilter, setStatusFilter] = useState<string>('all')

    const [loading, setLoading] = useState(true)
    const [expandedAssignee, setExpandedAssignee] = useState<string | null>(null)

    useEffect(() => {
        fetchAssignments()
    }, [])

    async function fetchAssignments() {
        try {
            // Fetch everything in one go: Assignees -> Task -> Project
            const { data: taskAssignees, error } = await supabase
                .from('task_assignees')
                .select(`
                    *,
                    tasks (
                        *,
                        projects (*)
                    )
                `)
                .eq('habilita', 1)

            if (error) throw error
            if (!taskAssignees) return

            // Group by assignee name
            const assigneeMap = new Map<string, TaskWithProject[]>()

            for (const assignee of taskAssignees) {
                // The joined data comes in 'tasks' property (might be an array or object depending on relationship)
                // Assuming One-to-One from assignee row to task row based on FK
                const taskData = assignee.tasks as any

                if (!taskData || taskData.habilita !== 1) continue

                // Check if project exists in the nested data
                // It might be 'projects' (plural) or singular depending on the exact relation name
                // usually it matches the table name 'projects' unless aliased
                const projectData = taskData.projects

                const taskWithProject: TaskWithProject = {
                    ...taskData,
                    project: projectData || null
                }

                if (!assigneeMap.has(assignee.assignee_name)) {
                    assigneeMap.set(assignee.assignee_name, [])
                }
                assigneeMap.get(assignee.assignee_name)!.push(taskWithProject)
            }

            // Convert to array
            const assigneesList: AssigneeWithTasks[] = Array.from(assigneeMap.entries()).map(
                ([name, tasks]) => ({
                    name,
                    tasks: tasks.sort((a, b) => {
                        // Sort by project name, then task name
                        const projectA = a.project?.title || ''
                        const projectB = b.project?.title || ''
                        if (projectA !== projectB) {
                            return projectA.localeCompare(projectB)
                        }
                        return a.title.localeCompare(b.title)
                    })
                })
            )

            // Sort by assignee name
            assigneesList.sort((a, b) => a.name.localeCompare(b.name))

            setAssignees(assigneesList)
        } catch (error) {
            console.error('Error fetching assignments:', error)
        } finally {
            setLoading(false)
        }
    }

    const toggleAssignee = (name: string) => {
        setExpandedAssignee(prev => prev === name ? null : name)
    }

    const generateReport = (assigneeName: string, tasks: TaskWithProject[]) => {
        const doc = new jsPDF()

        // Header
        doc.setFontSize(20)
        doc.setTextColor(40, 40, 40)
        doc.text(`Informe de Tareas: ${assigneeName}`, 14, 22)

        doc.setFontSize(10)
        doc.setTextColor(100, 100, 100)
        doc.text(`Generado el: ${new Date().toLocaleDateString()}`, 14, 30)

        // Table
        const tableData = tasks.map(t => [
            t.project?.title || 'Sin Proyecto',
            t.title,
            t.status || 'Sin empezar',
            t.notes || '-'
        ])

        autoTable(doc, {
            head: [['Proyecto', 'Tarea', 'Estado', 'Notas']],
            body: tableData,
            startY: 40,
            styles: { fontSize: 10, cellPadding: 3 },
            headStyles: { fillColor: [59, 130, 246] }, // Blue-500
            alternateRowStyles: { fillColor: [248, 250, 252] } // Slate-50
        })

        // Save
        doc.save(`informe_tareas_${assigneeName.replace(/\s+/g, '_').toLowerCase()}.pdf`)
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

    if (loading) return <div className="p-8">Cargando asignaciones...</div>

    const filteredAssignees = assignees.map(assignee => {
        const filteredTasks = assignee.tasks.filter(task => {
            if (statusFilter === 'all') return true;
            const status = task.status || 'Sin empezar';
            if (statusFilter === 'Pendientes') return status === 'Sin empezar' || status === 'En desarrollo';
            return status === statusFilter;
        });
        return {
            ...assignee,
            tasks: filteredTasks
        };
    }).filter(assignee => assignee.tasks.length > 0);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* ... Header and Title ... */}
                <Button
                    variant="ghost"
                    onClick={() => router.push('/')}
                    className="mb-4"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Volver a proyectos
                </Button>

                <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-4xl font-bold text-slate-900 mb-2">Asignaciones</h1>
                        <p className="text-slate-600">Tareas asignadas por persona</p>
                    </div>
                    <div className="w-full sm:w-64">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="bg-white">
                                <SelectValue placeholder="Filtrar por estado" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas las tareas</SelectItem>
                                <SelectItem value="Pendientes">Pendientes</SelectItem>
                                <SelectItem value="Sin empezar">Sin empezar</SelectItem>
                                <SelectItem value="En desarrollo">En desarrollo</SelectItem>
                                <SelectItem value="Terminada">Terminadas</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {filteredAssignees.length === 0 ? (
                    // ... Empty State ...
                    <Card className="p-8 text-center">
                        <User className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                        <h3 className="text-xl font-semibold text-slate-700 mb-2">No hay asignaciones</h3>
                        <p className="text-slate-500">No se encontraron tareas con los filtros actuales</p>
                    </Card>
                ) : (
                    <div className="columns-1 lg:columns-2 gap-6 space-y-6">
                        {filteredAssignees.map((assignee) => {
                            const isExpanded = expandedAssignee === assignee.name
                            return (
                                <Card key={assignee.name} className="break-inside-avoid border-l-4 border-l-blue-500 transition-all duration-200">
                                    <CardHeader
                                        className="bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                                        onClick={() => toggleAssignee(assignee.name)}
                                    >
                                        <CardTitle className="flex flex-col sm:flex-row sm:items-center gap-2 select-none">
                                            <div className="flex items-center gap-2">
                                                <User className="w-5 h-5 text-slate-500" />
                                                <span>{assignee.name}</span>
                                            </div>
                                            <div className="sm:ml-auto flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                                                <Badge variant="secondary">
                                                    {assignee.tasks.length} {assignee.tasks.length === 1 ? 'tarea' : 'tareas'}
                                                </Badge>
                                                {isExpanded ? (
                                                    <ChevronUp className="w-5 h-5 text-slate-400" />
                                                ) : (
                                                    <ChevronDown className="w-5 h-5 text-slate-400" />
                                                )}
                                            </div>
                                        </CardTitle>
                                    </CardHeader>
                                    {isExpanded && (
                                        <CardContent className="pt-4 animate-in slide-in-from-top-2 duration-200">
                                            <div className="flex justify-end mb-4">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        generateReport(assignee.name, assignee.tasks)
                                                    }}
                                                >
                                                    📄 Descargar Informe
                                                </Button>
                                            </div>
                                            <div className="space-y-3">
                                                {assignee.tasks.map((task) => (
                                                    <div
                                                        key={task.id}
                                                        className="border rounded-lg p-3 hover:bg-slate-50 transition-colors cursor-pointer bg-white"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            if (task.project) router.push(`/projects/${task.project.id}`)
                                                        }}
                                                    >
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="flex-1">
                                                                <p className="font-semibold text-sm">{task.title}</p>
                                                                {task.project && (
                                                                    <p className="text-xs text-slate-500 mt-1">
                                                                        📁 {task.project.title}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <Badge className={`${getStatusColor(task.status)} text-xs ml-2`}>
                                                                {task.status || 'Sin empezar'}
                                                            </Badge>
                                                        </div>
                                                        {task.notes && (
                                                            <p className="text-xs text-slate-600 mt-2 line-clamp-2">{task.notes}</p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    )}
                                </Card>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
