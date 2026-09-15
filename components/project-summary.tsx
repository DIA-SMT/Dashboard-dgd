'use client'

import { FolderKanban, CircleDashed, AlertTriangle, CalendarClock, ClipboardCheck, CheckCircle2, ArrowUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Project } from '@/types'

export type Filtro = 'active' | 'pending' | 'urgent' | 'due_soon' | 'completed' | 'ready'

interface ProjectSummaryProps {
    projects: Project[]
    currentFilter: Filtro
    onFilterChange: (filter: Filtro) => void
    projectProgress: Record<string, number>
}

/** Días hacia atrás que cuenta el "nuevos esta semana" de cada tarjeta. */
const VENTANA_DIAS = 7

function haceMenosDe(iso: string | null | undefined, dias: number): boolean {
    if (!iso) return false
    const d = new Date(iso)
    if (isNaN(d.getTime())) return false
    return Date.now() - d.getTime() < dias * 24 * 60 * 60 * 1000
}

function Indicador({ icono: Icono, etiqueta, valor, nuevos, sufijoNuevos, tono, activo, onClick }: {
    icono: LucideIcon
    etiqueta: string
    valor: number
    nuevos: number
    sufijoNuevos: string
    tono: string
    activo: boolean
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            aria-pressed={activo}
            className={`flex items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 text-left transition-all dark:bg-slate-900 ${
                activo
                    ? 'border-[#0065ff] ring-1 ring-[#0065ff]/20'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-sm dark:border-slate-800'
            }`}
        >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tono}`}>
                <Icono className="h-[17px] w-[17px]" strokeWidth={1.8} />
            </span>

            <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{etiqueta}</span>
                <span className="block text-lg font-semibold leading-tight text-slate-900 tabular-nums dark:text-slate-50">
                    {valor}
                </span>
            </span>

            {nuevos > 0 && (
                <span
                    className="flex shrink-0 items-center gap-0.5 self-start rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                    title={`${nuevos} ${sufijoNuevos} en los últimos ${VENTANA_DIAS} días`}
                >
                    <ArrowUp className="h-2.5 w-2.5" />
                    +{nuevos}
                </span>
            )}
        </button>
    )
}

export function ProjectSummary({ projects, currentFilter, onFilterChange, projectProgress }: ProjectSummaryProps) {
    const avance = (p: Project) => projectProgress[p.id] || 0

    const activos = projects.filter(p => !p.completed_at && avance(p) < 100)
    const pendientes = projects.filter(p => !p.completed_at && avance(p) === 0)
    const urgentes = projects.filter(p => !p.completed_at && p.priority === 'Urgente' && avance(p) < 100)
    const listos = projects.filter(p => !p.completed_at && avance(p) === 100)
    const finalizados = projects.filter(p => p.completed_at)

    // Vencen esta semana: dentro de la semana calendario en curso (lunes a domingo).
    const vencenEstaSemana = projects.filter(p => {
        if (p.completed_at || !p.deadline || avance(p) === 100) return false
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
    })

    // El "+N" cuenta lo que entró hace poco, no una diferencia contra la semana
    // pasada: no guardamos fotos históricas, así que un delta sería inventado.
    const nuevos = (lista: Project[]) => lista.filter(p => haceMenosDe(p.created_at, VENTANA_DIAS)).length
    const cerradosReciente = finalizados.filter(p => haceMenosDe(p.completed_at, VENTANA_DIAS)).length

    const tarjetas: {
        filtro: Filtro; icono: LucideIcon; etiqueta: string; valor: number
        nuevos: number; sufijo: string; tono: string
    }[] = [
        { filtro: 'active', icono: FolderKanban, etiqueta: 'Activos', valor: activos.length, nuevos: nuevos(activos), sufijo: 'nuevos', tono: 'bg-blue-50 text-blue-600' },
        { filtro: 'pending', icono: CircleDashed, etiqueta: 'Pendientes', valor: pendientes.length, nuevos: nuevos(pendientes), sufijo: 'nuevos', tono: 'bg-slate-100 text-slate-500' },
        { filtro: 'urgent', icono: AlertTriangle, etiqueta: 'Urgentes', valor: urgentes.length, nuevos: nuevos(urgentes), sufijo: 'nuevos', tono: 'bg-red-50 text-red-600' },
        { filtro: 'due_soon', icono: CalendarClock, etiqueta: 'Vencen esta semana', valor: vencenEstaSemana.length, nuevos: 0, sufijo: '', tono: 'bg-amber-50 text-amber-600' },
        { filtro: 'ready', icono: ClipboardCheck, etiqueta: 'Para aprobación', valor: listos.length, nuevos: 0, sufijo: '', tono: 'bg-violet-50 text-violet-600' },
        { filtro: 'completed', icono: CheckCircle2, etiqueta: 'Finalizados', valor: finalizados.length, nuevos: cerradosReciente, sufijo: 'cerrados', tono: 'bg-emerald-50 text-emerald-600' },
    ]

    return (
        <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-3 2xl:grid-cols-6">
            {tarjetas.map(t => (
                <Indicador
                    key={t.filtro}
                    icono={t.icono}
                    etiqueta={t.etiqueta}
                    valor={t.valor}
                    nuevos={t.nuevos}
                    sufijoNuevos={t.sufijo}
                    tono={t.tono}
                    activo={currentFilter === t.filtro}
                    onClick={() => onFilterChange(t.filtro)}
                />
            ))}
        </div>
    )
}
