'use client'

import { Card, CardContent } from "@/components/ui/card"
import { Project } from "@/types"

interface ProjectSummaryProps {
    projects: Project[]
    currentFilter: 'active' | 'urgent' | 'due_soon' | 'completed' | 'ready'
    onFilterChange: (filter: 'active' | 'urgent' | 'due_soon' | 'completed' | 'ready') => void
    projectProgress: Record<string, number>
}

export function ProjectSummary({ projects, currentFilter, onFilterChange, projectProgress }: ProjectSummaryProps) {
    const totalProjects = projects.length

    // Active: Not completed AND progress < 100
    const activeProjects = projects.filter(p => !p.completed_at && (projectProgress[p.id] || 0) < 100).length

    // Ready: Not completed AND progress === 100
    const readyProjects = projects.filter(p => !p.completed_at && (projectProgress[p.id] || 0) === 100).length

    // Completed: Has completed_at date
    const completedProjects = projects.filter(p => p.completed_at).length

    // Urgente: Active AND Priority is Urgent (ignoring Overdue) AND progress < 100
    const urgentProjects = projects.filter(p => {
        return !p.completed_at && p.priority === 'Urgente' && (projectProgress[p.id] || 0) < 100
    }).length

    // Vencen esta semana: Active AND Deadline is within current calendar week (Mon-Sun) AND progress < 100
    const dueSoonProjects = projects.filter(p => {
        if (p.completed_at || !p.deadline) return false
        if ((projectProgress[p.id] || 0) === 100) return false

        const today = new Date()
        const currentDay = today.getDay() // 0 = Sunday, 1 = Monday...
        const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1

        const monday = new Date(today)
        monday.setDate(today.getDate() - distanceToMonday)
        monday.setHours(0, 0, 0, 0)

        const sunday = new Date(monday)
        sunday.setDate(monday.getDate() + 6)
        sunday.setHours(23, 59, 59, 999)

        const deadline = new Date(p.deadline)
        // Check if deadline is within the current week window
        return deadline >= monday && deadline <= sunday
    }).length

    const getActiveStyle = (filter: string) => {
        return currentFilter === filter ? 'bg-slate-100 ring-2 ring-inset ring-slate-200' : 'hover:bg-slate-50'
    }

    return (
        <Card className="bg-white shadow-md border-slate-200 mb-6 overflow-hidden">
            <CardContent className="p-0">
                <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100 text-left">
                    <button
                        onClick={() => onFilterChange('active')}
                        className={`flex-1 flex items-center py-2 px-4 transition-all cursor-pointer text-left w-full ${getActiveStyle('active')}`}
                    >
                        <span className="text-2xl mr-3 shrink-0">🤪</span>
                        <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0">Activos</p>
                            <h3 className="text-lg font-bold text-slate-800 leading-none">{activeProjects}</h3>
                        </div>
                    </button>

                    <button
                        onClick={() => onFilterChange('urgent')}
                        className={`flex-1 flex items-center py-2 px-4 transition-all cursor-pointer text-left w-full ${getActiveStyle('urgent')}`}
                    >
                        <span className="text-2xl mr-3 shrink-0">🔥</span>
                        <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0">Urgente</p>
                            <h3 className="text-lg font-bold text-slate-800 leading-none">{urgentProjects}</h3>
                        </div>
                    </button>

                    <button
                        onClick={() => onFilterChange('due_soon')}
                        className={`flex-1 flex items-center py-2 px-4 transition-all cursor-pointer text-left w-full ${getActiveStyle('due_soon')}`}
                    >
                        <span className="text-2xl mr-3 shrink-0">⏰</span>
                        <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0">Vencen esta semana</p>
                            <h3 className="text-lg font-bold text-slate-800 leading-none">{dueSoonProjects}</h3>
                        </div>
                    </button>

                    <button
                        onClick={() => onFilterChange('ready')}
                        className={`flex-1 flex items-center py-2 px-4 transition-all cursor-pointer text-left w-full ${getActiveStyle('ready')}`}
                    >
                        <span className="text-2xl mr-3 shrink-0">👀</span>
                        <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0">Para aprobación</p>
                            <h3 className="text-lg font-bold text-slate-800 leading-none">{readyProjects}</h3>
                        </div>
                    </button>

                    <button
                        onClick={() => onFilterChange('completed')}
                        className={`flex-1 flex items-center py-2 px-4 transition-all cursor-pointer text-left w-full ${getActiveStyle('completed')}`}
                    >
                        <span className="text-2xl mr-3 shrink-0">😎</span>
                        <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0">Finalizados</p>
                            <h3 className="text-lg font-bold text-slate-800 leading-none">{completedProjects}</h3>
                        </div>
                    </button>
                </div>
            </CardContent>
        </Card>
    )
}
