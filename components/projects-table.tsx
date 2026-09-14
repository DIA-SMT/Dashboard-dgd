'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUp, ArrowDown, MoreVertical, ChevronLeft, ChevronRight, Trash2, Eye, Upload } from 'lucide-react'
import type { Project } from '@/types'
import { iniciales, tonoAvatar, tiempoRelativo, fechaCorta } from '@/lib/ui'

const POR_PAGINA = 10

type Columna = 'title' | 'estado' | 'progreso' | 'responsable' | 'deadline' | 'actualizacion'

const COLOR_PRIORIDAD: Record<string, string> = {
    Urgente: 'bg-red-50 text-red-700',
    Alta: 'bg-amber-50 text-amber-700',
    Media: 'bg-slate-100 text-slate-600',
    Baja: 'bg-slate-50 text-slate-500',
}

/**
 * Estado que se muestra en la tabla.
 *
 * `projects.status` sólo distingue "Pendiente" de "Completado", que dice muy
 * poco. Lo que interesa en una lista de seguimiento es en qué situación está:
 * si venció, si nadie lo tocó todavía, si ya está listo para cerrar.
 */
function situacion(p: Project, avance: number): { texto: string; clase: string } {
    if (p.completed_at) return { texto: 'Finalizado', clase: 'bg-slate-100 text-slate-600' }
    if (avance === 100) return { texto: 'Para aprobación', clase: 'bg-violet-50 text-violet-700' }

    if (p.deadline) {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
        if (new Date(p.deadline + 'T00:00:00') < hoy) return { texto: 'Vencido', clase: 'bg-red-50 text-red-700' }
    }
    if (p.priority === 'Urgente') return { texto: 'Urgente', clase: 'bg-amber-50 text-amber-700' }
    if (avance === 0) return { texto: 'Pendiente', clase: 'bg-slate-100 text-slate-600' }
    return { texto: 'Activo', clase: 'bg-emerald-50 text-emerald-700' }
}

function Cabecera({ etiqueta, campo, orden, onOrdenar, className = '' }: {
    etiqueta: string
    campo?: Columna
    orden: { campo: Columna; asc: boolean }
    onOrdenar: (c: Columna) => void
    className?: string
}) {
    if (!campo) {
        return <th className={`px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-slate-400 ${className}`}>{etiqueta}</th>
    }
    const activo = orden.campo === campo
    return (
        <th className={`px-4 py-2.5 ${className}`}>
            <button
                onClick={() => onOrdenar(campo)}
                className={`flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide transition-colors ${
                    activo ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 hover:text-slate-600'
                }`}
            >
                {etiqueta}
                {activo
                    ? (orden.asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                    : <ArrowDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-40" />}
            </button>
        </th>
    )
}

export function ProjectsTable({
    proyectos, avance, responsables, ultimaActividad, esAdmin, onEliminar, onPublicar,
}: {
    proyectos: Project[]
    avance: Record<string, number>
    /** id de miembro -> nombre, para resolver el responsable del proyecto. */
    responsables: Record<string, string>
    /** id de proyecto -> fecha del último movimiento registrado. */
    ultimaActividad: Record<string, string>
    esAdmin: boolean
    onEliminar: (p: Project) => void
    onPublicar: (p: Project) => void
}) {
    const router = useRouter()
    const [orden, setOrden] = useState<{ campo: Columna; asc: boolean }>({ campo: 'deadline', asc: true })
    const [pagina, setPagina] = useState(1)
    const [menuAbierto, setMenuAbierto] = useState<string | null>(null)

    function ordenarPor(campo: Columna) {
        setOrden(o => (o.campo === campo ? { campo, asc: !o.asc } : { campo, asc: true }))
        setPagina(1)
    }

    const ordenados = useMemo(() => {
        const valor = (p: Project): string | number => {
            switch (orden.campo) {
                case 'title': return p.title.toLowerCase()
                case 'estado': return situacion(p, avance[p.id] ?? 0).texto
                case 'progreso': return avance[p.id] ?? 0
                case 'responsable': return (responsables[p.owner_id ?? ''] ?? 'zzz').toLowerCase()
                case 'deadline': return p.deadline ?? '9999-12-31'
                case 'actualizacion': return ultimaActividad[p.id] ?? p.created_at ?? ''
            }
        }
        return [...proyectos].sort((a, b) => {
            const va = valor(a), vb = valor(b)
            const cmp = typeof va === 'number' && typeof vb === 'number'
                ? va - vb
                : String(va).localeCompare(String(vb))
            return orden.asc ? cmp : -cmp
        })
    }, [proyectos, orden, avance, responsables, ultimaActividad])

    const paginas = Math.max(1, Math.ceil(ordenados.length / POR_PAGINA))
    const paginaActual = Math.min(pagina, paginas)
    const visibles = ordenados.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA)

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
                <table className="w-full table-fixed border-collapse">
                    <thead className="group border-b border-slate-100 dark:border-slate-800">
                        <tr className="text-left">
                            <Cabecera etiqueta="Proyecto" campo="title" orden={orden} onOrdenar={ordenarPor} className="w-[26%]" />
                            <Cabecera etiqueta="Estado" campo="estado" orden={orden} onOrdenar={ordenarPor} className="w-[13%]" />
                            <Cabecera etiqueta="Prioridad" campo={undefined} orden={orden} onOrdenar={ordenarPor} className="hidden w-[10%] 2xl:table-cell" />
                            <Cabecera etiqueta="Progreso" campo="progreso" orden={orden} onOrdenar={ordenarPor} className="w-[13%]" />
                            <Cabecera etiqueta="Responsable" campo="responsable" orden={orden} onOrdenar={ordenarPor} className="w-[19%]" />
                            <Cabecera etiqueta="Fecha límite" campo="deadline" orden={orden} onOrdenar={ordenarPor} className="w-[13%]" />
                            <Cabecera etiqueta="Actualizado" campo="actualizacion" orden={orden} onOrdenar={ordenarPor} className="hidden w-[13%] xl:table-cell" />
                            <Cabecera etiqueta="" className="w-[7%]" orden={orden} onOrdenar={ordenarPor} />
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                        {visibles.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">
                                    No hay proyectos que coincidan con los filtros.
                                </td>
                            </tr>
                        )}

                        {visibles.map(p => {
                            const pct = avance[p.id] ?? 0
                            const sit = situacion(p, pct)
                            const resp = responsables[p.owner_id ?? '']
                            return (
                                <tr key={p.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                                    <td className="px-4 py-3">
                                        <Link href={`/projects/${p.id}`} className="block">
                                            <span className="block truncate text-sm font-medium text-slate-800 hover:text-[#0065ff] dark:text-slate-100">
                                                {p.title}
                                            </span>
                                            <span className="block truncate text-xs text-slate-400">
                                                {p.description || p.area || '—'}
                                            </span>
                                        </Link>
                                    </td>

                                    <td className="px-4 py-3">
                                        <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${sit.clase}`}>
                                            {sit.texto}
                                        </span>
                                    </td>

                                    <td className="hidden px-4 py-3 2xl:table-cell">
                                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${COLOR_PRIORIDAD[p.priority ?? 'Media'] ?? COLOR_PRIORIDAD.Media}`}>
                                            {p.priority ?? 'Media'}
                                        </span>
                                    </td>

                                    <td className="px-4 py-3">
                                        <div className="max-w-[92px]">
                                            <div className="mb-1 flex items-center justify-between">
                                                <span className="text-xs font-medium text-slate-700 tabular-nums dark:text-slate-200">{pct}%</span>
                                                {p.progress !== null && p.progress !== undefined && (
                                                    <span className="text-[9px] text-slate-400" title="Cargado a mano">manual</span>
                                                )}
                                            </div>
                                            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                                                <div
                                                    className="h-1.5 rounded-full bg-[#0065ff] transition-all"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    </td>

                                    <td className="px-4 py-3">
                                        {resp ? (
                                            <span className="flex items-center gap-2">
                                                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${tonoAvatar(resp)}`}>
                                                    {iniciales(resp)}
                                                </span>
                                                <span className="truncate text-xs text-slate-600 dark:text-slate-300">{resp}</span>
                                            </span>
                                        ) : (
                                            <span className="text-xs italic text-slate-300">sin asignar</span>
                                        )}
                                    </td>

                                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                                        {fechaCorta(p.deadline)}
                                    </td>

                                    <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-slate-400 xl:table-cell">
                                        {tiempoRelativo(ultimaActividad[p.id] ?? p.created_at)}
                                    </td>

                                    <td className="relative px-4 py-3 text-right">
                                        <button
                                            onClick={() => setMenuAbierto(menuAbierto === p.id ? null : p.id)}
                                            aria-label={`Acciones de ${p.title}`}
                                            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                                        >
                                            <MoreVertical className="h-4 w-4" />
                                        </button>

                                        {menuAbierto === p.id && (
                                            <>
                                                <div className="fixed inset-0 z-10" onClick={() => setMenuAbierto(null)} aria-hidden="true" />
                                                <div className="absolute right-4 top-10 z-20 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-lg dark:border-slate-700 dark:bg-slate-800">
                                                    <button
                                                        onClick={() => { setMenuAbierto(null); router.push(`/projects/${p.id}`) }}
                                                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                                                    >
                                                        <Eye className="h-3.5 w-3.5" />
                                                        Ver detalle
                                                    </button>
                                                    {esAdmin && pct === 100 && !p.completed_at && (
                                                        <button
                                                            onClick={() => { setMenuAbierto(null); onPublicar(p) }}
                                                            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#0065ff] hover:bg-blue-50 dark:hover:bg-slate-700"
                                                        >
                                                            <Upload className="h-3.5 w-3.5" />
                                                            Publicar
                                                        </button>
                                                    )}
                                                    {esAdmin && (
                                                        <button
                                                            onClick={() => { setMenuAbierto(null); onEliminar(p) }}
                                                            className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-xs text-red-600 hover:bg-red-50 dark:border-slate-700 dark:hover:bg-red-950/40"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                            Eliminar
                                                        </button>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
                <span className="text-xs text-slate-400">
                    Mostrando {visibles.length} de {ordenados.length} {ordenados.length === 1 ? 'proyecto' : 'proyectos'}
                </span>
                {paginas > 1 && (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setPagina(p => Math.max(1, p - 1))}
                            disabled={paginaActual === 1}
                            aria-label="Página anterior"
                            className="rounded-md border border-slate-200 p-1 text-slate-500 disabled:opacity-40 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        {Array.from({ length: paginas }, (_, i) => i + 1).map(n => (
                            <button
                                key={n}
                                onClick={() => setPagina(n)}
                                aria-current={n === paginaActual ? 'page' : undefined}
                                className={`h-7 min-w-[28px] rounded-md border px-1.5 text-xs tabular-nums transition-colors ${
                                    n === paginaActual
                                        ? 'border-[#0065ff] bg-[#0065ff] text-white'
                                        : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                                }`}
                            >
                                {n}
                            </button>
                        ))}
                        <button
                            onClick={() => setPagina(p => Math.min(paginas, p + 1))}
                            disabled={paginaActual === paginas}
                            aria-label="Página siguiente"
                            className="rounded-md border border-slate-200 p-1 text-slate-500 disabled:opacity-40 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                            <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
