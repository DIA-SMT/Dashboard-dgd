'use client'

import { Card, CardContent } from "@/components/ui/card"
import { FolderKanban, AlertTriangle, CalendarClock, ClipboardCheck, CheckCircle2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Project } from "@/types"

type Filtro = 'active' | 'urgent' | 'due_soon' | 'completed' | 'ready'

interface ProjectSummaryProps {
    projects: Project[]
    currentFilter: Filtro
    onFilterChange: (filter: Filtro) => void
    projectProgress: Record<string, number>
}

/**
 * Un indicador del encabezado.
 *
 * Antes cada uno repetía el mismo bloque con un emoji distinto. El ícono
 * ahora es un trazo monocromo sobre un fondo tenue del mismo tono: se lee
 * igual de rápido, pero no desentona con un tablero institucional.
 */
function Indicador({ icono: Icono, etiqueta, valor, tono, activo, onClick }: {
    icono: LucideIcon
    etiqueta: string
    valor: number
    tono: string
    activo: boolean
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            aria-pressed={activo}
            className={`flex w-full flex-1 items-center gap-3 px-4 py-3 text-left transition-colors ${
                activo ? 'bg-slate-50 ring-1 ring-inset ring-slate-200' : 'hover:bg-slate-50/70'
            }`}
        >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${tono}`}>
                <Icono className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {etiqueta}
                </span>
                <span className="block text-xl font-semibold leading-tight text-slate-900 tabular-nums">
                    {valor}
                </span>
            </span>
        </button>
    )
}


export function ProjectSummary({ projects, currentFilter, onFilterChange, projectProgress }: ProjectSummaryProps) {

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

    const indicadores: { filtro: Filtro; icono: LucideIcon; etiqueta: string; valor: number; tono: string }[] = [
        { filtro: 'active', icono: FolderKanban, etiqueta: 'Activos', valor: activeProjects, tono: 'bg-blue-50 text-blue-700' },
        { filtro: 'urgent', icono: AlertTriangle, etiqueta: 'Urgentes', valor: urgentProjects, tono: 'bg-red-50 text-red-700' },
        { filtro: 'due_soon', icono: CalendarClock, etiqueta: 'Vencen esta semana', valor: dueSoonProjects, tono: 'bg-amber-50 text-amber-700' },
        { filtro: 'ready', icono: ClipboardCheck, etiqueta: 'Para aprobación', valor: readyProjects, tono: 'bg-violet-50 text-violet-700' },
        { filtro: 'completed', icono: CheckCircle2, etiqueta: 'Finalizados', valor: completedProjects, tono: 'bg-emerald-50 text-emerald-700' },
    ]

    return (
        <Card className="mb-6 overflow-hidden border-slate-200 bg-white shadow-sm">
            <CardContent className="p-0">
                <div className="flex flex-col divide-y divide-slate-100 md:flex-row md:divide-x md:divide-y-0">
                    {indicadores.map((ind) => (
                        <Indicador
                            key={ind.filtro}
                            icono={ind.icono}
                            etiqueta={ind.etiqueta}
                            valor={ind.valor}
                            tono={ind.tono}
                            activo={currentFilter === ind.filtro}
                            onClick={() => onFilterChange(ind.filtro)}
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
