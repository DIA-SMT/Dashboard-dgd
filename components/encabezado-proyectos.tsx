'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Search, Bell } from 'lucide-react'
import type { Project } from '@/types'
import type { TareaConProyecto } from '@/components/task-summary'
import { daysUntil, getDeadlineState, isTerminalStatus } from '@/lib/task-status'
import { diaYMes } from '@/lib/ui'

/** Lema institucional, en la columna angosta de la derecha. */
const LEMA = ['Planificación', 'Datos', 'Resultados', 'Para tu ciudad']

/**
 * La acuarela va centrada y se desvanece hacia los dos costados.
 *
 * Sin el velo, el título queda sobre los árboles y los controles de la derecha
 * sobre la torre: se lee mal de los dos lados. Así la ilustración se ve entera
 * en el medio y los extremos quedan de lienzo limpio.
 */
const CELESTE = '238,244,252'
const FONDO = {
    backgroundImage:
        `linear-gradient(to right,`
        + ` rgb(${CELESTE}) 0%,`
        + ` rgba(${CELESTE},0.92) 20%,`
        + ` rgba(${CELESTE},0.12) 40%,`
        + ` rgba(${CELESTE},0.12) 58%,`
        + ` rgba(${CELESTE},0.92) 78%,`
        + ` rgb(${CELESTE}) 100%),`
        + ` url(/fondo-proyectos.webp)`,
    backgroundSize: 'auto, cover',
    backgroundPosition: 'center, center',
    backgroundRepeat: 'no-repeat, no-repeat',
} as const

type Aviso = {
    id: string
    titulo: string
    detalle: string
    fecha: string
    href: string
    vencida: boolean
}

/**
 * Encabezado de la pantalla de proyectos.
 *
 * Junta en una sola franja lo que estaba repartido: el título, el buscador
 * —que antes vivía más abajo y quedaba duplicado acá— y el botón de alta. La
 * campana no inventa notificaciones: lee los vencimientos de los proyectos y
 * las tareas que la pantalla ya cargó.
 */
export function EncabezadoProyectos({ busqueda, onBuscar, proyectos, tareas, accion }: {
    busqueda: string
    onBuscar: (valor: string) => void
    proyectos: Project[]
    tareas: TareaConProyecto[]
    /** El formulario de alta; lo arma la pantalla porque depende de sus recargas. */
    accion: React.ReactNode
}) {
    const [abierta, setAbierta] = useState(false)
    const campana = useRef<HTMLDivElement>(null)

    // Cerrar al hacer clic afuera: un panel flotante que se queda abierto tapa
    // la pantalla y obliga a volver al mismo botón para sacarlo.
    useEffect(() => {
        if (!abierta) return
        function alClic(e: MouseEvent) {
            if (campana.current && !campana.current.contains(e.target as Node)) setAbierta(false)
        }
        document.addEventListener('mousedown', alClic)
        return () => document.removeEventListener('mousedown', alClic)
    }, [abierta])

    const avisos = useMemo(() => {
        const filas: Aviso[] = []

        for (const p of proyectos) {
            if (!p.deadline || p.completed_at) continue
            const dias = daysUntil(p.deadline)
            if (dias > 7) continue
            filas.push({
                id: `p-${p.id}`,
                titulo: p.title,
                detalle: 'Proyecto',
                fecha: p.deadline,
                href: `/projects/${p.id}`,
                vencida: dias < 0,
            })
        }

        for (const t of tareas) {
            if (!t.deadline || isTerminalStatus(t.status) || t.projects?.completed_at) continue
            const estado = getDeadlineState(t.deadline, t.status)
            if (!estado) continue
            filas.push({
                id: `t-${t.id}`,
                titulo: t.title,
                detalle: t.projects?.title ?? 'Sin proyecto',
                fecha: t.deadline,
                href: t.project_id ? `/projects/${t.project_id}` : '/tareas',
                vencida: estado === 'vencida',
            })
        }

        return filas.sort((a, b) => a.fecha.localeCompare(b.fecha))
    }, [proyectos, tareas])

    const vencidas = avisos.filter(a => a.vencida)
    const porVencer = avisos.filter(a => !a.vencida)

    return (
        <header
            className="relative mb-5 rounded-2xl border border-slate-200/70 dark:border-slate-800"
            style={FONDO}
        >
            {/* En oscuro la acuarela clara no pega con nada, así que se apaga. */}
            <div className="absolute inset-0 hidden rounded-2xl bg-slate-900 dark:block" aria-hidden="true" />

            <div className="relative flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-6 py-5">
                <div className="min-w-0">
                    <p className="flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
                        Datos que impulsan una mejor ciudad
                        <span className="inline-block h-[2px] w-7 rounded-full bg-amber-400" aria-hidden="true" />
                    </p>
                    <h1 className="mt-1.5 text-[28px] font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-50">
                        Proyectos
                    </h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        Gestiona y da seguimiento a tus proyectos municipales
                    </p>
                </div>

                <div className="flex flex-col items-stretch gap-3 sm:items-end">
                    <div className="flex items-center gap-2">
                        <div className="relative w-full sm:w-[230px]">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                value={busqueda}
                                onChange={(e) => onBuscar(e.target.value)}
                                placeholder="Buscar en el sistema..."
                                aria-label="Buscar proyectos por nombre o descripción"
                                className="h-9 rounded-full border-slate-200 bg-white/90 pl-9 text-sm shadow-sm dark:bg-slate-900"
                            />
                        </div>

                        <div className="relative shrink-0" ref={campana}>
                            <button
                                onClick={() => setAbierta(v => !v)}
                                aria-expanded={abierta}
                                aria-label={
                                    avisos.length === 0
                                        ? 'Vencimientos: no hay nada por vencer'
                                        : `Vencimientos: ${vencidas.length} ${vencidas.length === 1 ? 'vencido' : 'vencidos'}`
                                          + ` y ${porVencer.length} por vencer`
                                }
                                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-sm transition-colors hover:text-[#0065ff] dark:border-slate-700 dark:bg-slate-900 dark:hover:text-blue-400"
                            >
                                <Bell className="h-[18px] w-[18px]" strokeWidth={1.9} />
                                {avisos.length > 0 && (
                                    <span
                                        aria-hidden="true"
                                        className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                                            vencidas.length > 0 ? 'bg-red-500' : 'bg-amber-400'
                                        }`}
                                    />
                                )}
                            </button>

                            {abierta && (
                                <div className="absolute right-0 top-11 z-30 w-[300px] overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-lg dark:border-slate-700 dark:bg-slate-800">
                                    <p className="border-b border-slate-100 px-4 py-2.5 text-[13px] font-semibold text-slate-800 dark:border-slate-700 dark:text-slate-100">
                                        Vencimientos
                                    </p>

                                    {avisos.length === 0 ? (
                                        <p className="px-4 py-6 text-center text-xs text-slate-400">
                                            No hay nada vencido ni por vencer.
                                        </p>
                                    ) : (
                                        <div className="max-h-[320px] overflow-y-auto">
                                            <ListaAvisos titulo="Vencidos" filas={vencidas} onIr={() => setAbierta(false)} />
                                            <ListaAvisos titulo="Por vencer" filas={porVencer} onIr={() => setAbierta(false)} />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-4">
                        <ul className="hidden leading-[1.35] md:block" aria-hidden="true">
                            {LEMA.map(l => (
                                <li
                                    key={l}
                                    className="text-[9px] font-medium uppercase tracking-[0.13em] text-slate-400 dark:text-slate-500"
                                >
                                    {l}
                                </li>
                            ))}
                        </ul>
                        {accion}
                    </div>
                </div>
            </div>
        </header>
    )
}

function ListaAvisos({ titulo, filas, onIr }: { titulo: string; filas: Aviso[]; onIr: () => void }) {
    if (filas.length === 0) return null
    return (
        <>
            <p className="bg-slate-50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-900/50">
                {titulo} ({filas.length})
            </p>
            <ul className="divide-y divide-slate-50 dark:divide-slate-700">
                {filas.map(a => {
                    const { dia, mes } = diaYMes(a.fecha)
                    const dias = daysUntil(a.fecha)
                    return (
                        <li key={a.id}>
                            <Link
                                href={a.href}
                                onClick={onIr}
                                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/60"
                            >
                                <span className="flex w-7 shrink-0 flex-col items-center leading-none">
                                    <span className="text-sm font-semibold text-slate-800 tabular-nums dark:text-slate-100">{dia}</span>
                                    <span className="mt-0.5 text-[9px] font-medium text-slate-400">{mes}</span>
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs font-medium text-slate-800 dark:text-slate-100">{a.titulo}</span>
                                    <span className="block truncate text-[11px] text-slate-400">{a.detalle}</span>
                                </span>
                                <span className={`shrink-0 whitespace-nowrap text-[10px] font-medium ${a.vencida ? 'text-red-600' : 'text-amber-600'}`}>
                                    {textoDeDias(dias)}
                                </span>
                            </Link>
                        </li>
                    )
                })}
            </ul>
        </>
    )
}

function textoDeDias(dias: number): string {
    if (dias < 0) {
        const atraso = Math.abs(dias)
        return atraso === 1 ? 'hace 1 día' : `hace ${atraso} días`
    }
    if (dias === 0) return 'hoy'
    if (dias === 1) return 'mañana'
    return `en ${dias} días`
}
