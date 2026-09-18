'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Loader2, Paperclip, Trash2, FileText, Download } from 'lucide-react'
import {
    type Adjunto, esImagen, tamanoLegible, TOPE_BYTES,
    listarAdjuntos, subirAdjunto, borrarAdjunto, enlacesFirmados, enlaceFirmado,
} from '@/lib/adjuntos'

/** Lo que el selector de archivos deja elegir. Refleja el tope del depósito. */
export const TIPOS_ACEPTADOS = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv'

/**
 * Archivos adjuntos de una tarea.
 *
 * Las imágenes se ven en miniatura ahí mismo, que es de lo que se trataba el
 * pedido: que la foto quede a la vista sin tener que descargarla. El resto se
 * muestra como una fila con su nombre y su peso.
 *
 * Los enlaces son firmados y vencen en una hora, así que se piden al cargar la
 * lista y no se guardan en ningún lado.
 */
export function TaskFiles({ taskId, adjuntos: iniciales, puedeSubir = true, onCambio }: {
    taskId: string
    /** Si el padre ya los trajo, evita una consulta por tarjeta. */
    adjuntos?: Adjunto[]
    puedeSubir?: boolean
    onCambio?: () => void
}) {
    const { user, role } = useAuth()
    const [adjuntos, setAdjuntos] = useState<Adjunto[]>(iniciales ?? [])
    const [enlaces, setEnlaces] = useState<Record<string, string>>({})
    const [cargando, setCargando] = useState(!iniciales)
    const [subiendo, setSubiendo] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const entrada = useRef<HTMLInputElement>(null)

    const pedirEnlaces = useCallback(async (lista: Adjunto[]) => {
        const rutas = lista.filter(a => esImagen(a.tipo)).map(a => a.ruta)
        setEnlaces(await enlacesFirmados(rutas))
    }, [])

    const cargar = useCallback(async () => {
        const lista = await listarAdjuntos([taskId])
        setAdjuntos(lista)
        await pedirEnlaces(lista)
        setCargando(false)
    }, [taskId, pedirEnlaces])

    useEffect(() => {
        if (iniciales) {
            setAdjuntos(iniciales)
            pedirEnlaces(iniciales)
            setCargando(false)
        } else {
            cargar()
        }
        // `iniciales` se compara por contenido: el padre arma un array nuevo en
        // cada render y ponerlo en las dependencias dispararía un bucle.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskId, (iniciales ?? []).map(a => a.id).join(',')])

    async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
        const archivos = Array.from(e.target.files ?? [])
        // El input se limpia enseguida para poder volver a elegir el MISMO
        // archivo: si no, el navegador no dispara el evento la segunda vez.
        e.target.value = ''
        if (archivos.length === 0 || !user) return

        setSubiendo(true)
        setError(null)
        const nombre = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'Sin nombre'
        const fallas: string[] = []

        for (const archivo of archivos) {
            const r = await subirAdjunto(taskId, archivo, { id: user.id, nombre })
            if (!r.ok) fallas.push(r.error)
        }

        if (fallas.length > 0) setError(fallas.join(' '))
        await cargar()
        setSubiendo(false)
        onCambio?.()
    }

    async function abrir(a: Adjunto, descargar: boolean) {
        const url = await enlaceFirmado(a.ruta, descargar ? a.nombre : undefined)
        if (!url) { setError('No se pudo abrir el archivo. Probá de nuevo.'); return }
        window.open(url, '_blank', 'noopener,noreferrer')
    }

    async function quitar(a: Adjunto) {
        if (!confirm(`¿Borrar "${a.nombre}"?`)) return
        const r = await borrarAdjunto(a)
        if (!r.ok) { alert(r.error); return }
        await cargar()
        onCambio?.()
    }

    const puedeBorrar = (a: Adjunto) => a.subido_por === user?.id || role === 'admin'

    if (cargando) {
        return <Loader2 className="my-2 h-4 w-4 animate-spin text-slate-400" />
    }

    if (adjuntos.length === 0 && !puedeSubir) return null

    return (
        <div className="mt-2">
            {adjuntos.length > 0 && (
                <ul className="mb-2 flex flex-wrap gap-2">
                    {adjuntos.map(a => {
                        const imagen = esImagen(a.tipo)
                        const url = enlaces[a.ruta]
                        return (
                            <li key={a.id} className="group relative">
                                <button
                                    type="button"
                                    onClick={() => abrir(a, !imagen)}
                                    title={`${a.nombre}${a.subido_por_nombre ? ` — subió ${a.subido_por_nombre}` : ''}`}
                                    className="flex items-center gap-2 overflow-hidden rounded-lg border border-slate-200 bg-white text-left transition-colors hover:border-[#0065ff] dark:border-slate-700 dark:bg-slate-900"
                                >
                                    {imagen ? (
                                        url ? (
                                            // Miniatura del depósito privado: no se
                                            // puede usar next/image porque la URL
                                            // firmada cambia en cada carga.
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={url}
                                                alt={a.nombre}
                                                className="h-20 w-20 shrink-0 object-cover"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <span className="flex h-20 w-20 shrink-0 items-center justify-center bg-slate-50 dark:bg-slate-800">
                                                <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                                            </span>
                                        )
                                    ) : (
                                        <span className="flex items-center gap-2 px-3 py-2">
                                            <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                                            <span className="flex min-w-0 flex-col leading-tight">
                                                <span className="max-w-[170px] truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                                                    {a.nombre}
                                                </span>
                                                <span className="text-[10px] text-slate-400">
                                                    {tamanoLegible(a.tamano)}
                                                </span>
                                            </span>
                                            <Download className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                                        </span>
                                    )}
                                </button>

                                {puedeBorrar(a) && (
                                    <button
                                        type="button"
                                        onClick={() => quitar(a)}
                                        aria-label={`Borrar ${a.nombre}`}
                                        title={`Borrar ${a.nombre}`}
                                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 opacity-0 shadow-sm transition-opacity hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:border-slate-600 dark:bg-slate-800"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                )}
                            </li>
                        )
                    })}
                </ul>
            )}

            {puedeSubir && (
                <>
                    <input
                        ref={entrada}
                        type="file"
                        multiple
                        accept={TIPOS_ACEPTADOS}
                        onChange={alElegir}
                        className="hidden"
                        aria-hidden="true"
                        tabIndex={-1}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={subiendo}
                        onClick={() => entrada.current?.click()}
                        className="h-7 gap-1 px-2 text-xs text-slate-500 hover:text-slate-700"
                    >
                        {subiendo
                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Subiendo...</>
                            : <><Paperclip className="h-3.5 w-3.5" />Adjuntar archivo</>}
                    </Button>
                </>
            )}

            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
    )
}

/**
 * Selector de archivos para una tarea que TODAVÍA no existe.
 *
 * En el alta no hay a qué tarea colgarlos, así que los guarda en memoria y el
 * formulario los sube recién cuando la tarea quedó creada. Subirlos antes
 * dejaría archivos huérfanos cada vez que alguien abre el formulario y lo
 * cierra sin guardar.
 */
export function SelectorArchivosPendientes({ archivos, onCambio }: {
    archivos: File[]
    onCambio: (archivos: File[]) => void
}) {
    const entrada = useRef<HTMLInputElement>(null)
    const [error, setError] = useState<string | null>(null)

    function agregar(e: React.ChangeEvent<HTMLInputElement>) {
        const nuevos = Array.from(e.target.files ?? [])
        e.target.value = ''
        if (nuevos.length === 0) return

        const pesados = nuevos.filter(a => a.size > TOPE_BYTES)
        setError(pesados.length > 0
            ? `${pesados.map(a => `"${a.name}"`).join(', ')} ${pesados.length === 1 ? 'supera' : 'superan'} los 10 MB y no se ${pesados.length === 1 ? 'va' : 'van'} a subir.`
            : null)

        onCambio([...archivos, ...nuevos.filter(a => a.size <= TOPE_BYTES)])
    }

    return (
        <div>
            <input
                ref={entrada}
                type="file"
                multiple
                accept={TIPOS_ACEPTADOS}
                onChange={agregar}
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
            />
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => entrada.current?.click()}
                className="h-8 gap-1.5 text-xs"
            >
                <Paperclip className="h-3.5 w-3.5" />
                Adjuntar archivo
            </Button>

            {archivos.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                    {archivos.map((a, i) => (
                        <li
                            key={`${a.name}-${i}`}
                            className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 dark:bg-slate-800"
                        >
                            {esImagen(a.type)
                                ? <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                : <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                            <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-200">{a.name}</span>
                            <span className="shrink-0 text-[10px] text-slate-400">{tamanoLegible(a.size)}</span>
                            <button
                                type="button"
                                onClick={() => onCambio(archivos.filter((_, j) => j !== i))}
                                aria-label={`Quitar ${a.name}`}
                                className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {error && <p className="mt-1 text-xs text-amber-700">{error}</p>}
        </div>
    )
}
