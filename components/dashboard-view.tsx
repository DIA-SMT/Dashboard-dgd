'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Project, Task } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ProjectForm } from '@/components/project-form'
import { TaskForm } from '@/components/task-form'

export function DashboardView() {
    // Minimal local types as requested
    type TaskAssignee = { assignee_name: string | null }
    type LocalTask = Task & {
        task_assignees?: TaskAssignee[] | null
    }

    const [projects, setProjects] = useState<Project[]>([])
    const [tasks, setTasks] = useState<LocalTask[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchData()
        // Optional: Set up real-time subscription here
        const interval = setInterval(fetchData, 30000) // Refresh every 30s
        return () => clearInterval(interval)
    }, [])

    async function fetchData() {
        try {
            const { data: projectsData } = await supabase
                .from('projects')
                .select('*')
                .neq('status', 'Archivado')
                .eq('habilita', 1)
                .order('deadline', { ascending: true })

            const { data: tasksData } = await supabase
                .from('tasks')
                .select('*, task_assignees(assignee_name)')
                .not('status', 'in', '("Listo","Terminada")')
                .eq('habilita', 1) // Exclude both old and new completed statuses

            if (projectsData) setProjects(projectsData)
            if (tasksData) setTasks(tasksData as unknown as LocalTask[])
        } catch (error) {
            console.error('Error fetching data:', error)
        } finally {
            setLoading(false)
        }
    }

    // Group tasks by assignee
    const tasksByAssignee = tasks.reduce((acc, task) => {
        const assignees = task.task_assignees && task.task_assignees.length > 0
            ? task.task_assignees.map(a => a.assignee_name || 'Sin asignar')
            : ['Sin asignar']

        assignees.forEach(assigneeName => {
            if (!assigneeName) return
            if (!acc[assigneeName]) acc[assigneeName] = []
            acc[assigneeName].push(task)
        })
        return acc
    }, {} as Record<string, LocalTask[]>)

    if (loading) return <div className="p-8">Cargando dashboard...</div>

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-slate-900">Comuniquemos Dashboard</h1>
                <div className="flex gap-2">
                    <ProjectForm onProjectCreated={fetchData} />
                    <TaskForm onTaskCreated={fetchData} />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">

                {/* Projects Column */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                    <h2 className="text-2xl font-bold text-slate-800">Proyectos Activos</h2>
                    <ScrollArea className="h-full pr-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {projects.map((project) => (
                                <Card key={project.id} className="border-l-4 border-l-blue-500 shadow-sm">
                                    <CardHeader className="pb-2">
                                        <div className="flex justify-between items-start">
                                            <CardTitle className="text-lg font-semibold">{project.title}</CardTitle>
                                            <Badge variant={project.priority === 'Urgente' ? 'destructive' : 'secondary'}>
                                                {project.priority}
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-slate-500">{project.area} • {project.type}</p>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className={`px-2 py-1 rounded-full text-xs ${project.status === 'En Progreso' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                {project.status}
                                            </span>
                                            <span className="text-slate-500">
                                                {project.deadline ? `Vence: ${new Date(project.deadline).toLocaleDateString()}` : 'Sin fecha límite'}
                                            </span>
                                        </div>
                                        {/* Show tasks for this project briefly? */}
                                        <div className="mt-4 space-y-1">
                                            {tasks.filter(t => t.project_id === project.id).map(task => (
                                                <div key={task.id} className="text-xs flex justify-between items-center bg-slate-100 p-1 rounded">
                                                    <span>{task.title}</span>
                                                    <span className="text-slate-500">
                                                        {task.task_assignees?.map(a => a.assignee_name).join(', ') || 'Sin asignar'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </ScrollArea>
                </div>

                {/* Tasks by Assignee Column */}
                <div className="flex flex-col gap-4">
                    <h2 className="text-2xl font-bold text-slate-800">Tareas por Responsable</h2>
                    <ScrollArea className="h-full pr-4">
                        <div className="space-y-6">
                            {Object.entries(tasksByAssignee).map(([assignee, assigneeTasks]) => (
                                <Card key={assignee} className="shadow-sm">
                                    <CardHeader className="py-3 bg-slate-100">
                                        <CardTitle className="text-base font-medium">{assignee}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-4 space-y-2">
                                        {assigneeTasks.map(task => (
                                            <div key={task.id} className="flex items-start gap-2 text-sm border-b last:border-0 pb-2 last:pb-0">
                                                <div className={`w-2 h-2 mt-1.5 rounded-full ${['Listo', 'Terminada'].includes(task.status || '') ? 'bg-green-500' :
                                                    ['En Progreso', 'En desarrollo'].includes(task.status || '') ? 'bg-blue-500' : 'bg-slate-300'
                                                    }`} />
                                                <div className="flex-1">
                                                    <p className="font-medium leading-tight">{task.title}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                        {projects.find(p => p.id === task.project_id)?.title}
                                                    </p>
                                                </div>
                                                <Badge variant="outline" className="text-[10px] h-5">
                                                    {task.status}
                                                </Badge>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </ScrollArea>
                </div>

            </div>
        </div>
    )
}
