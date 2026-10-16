'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import type { Member } from '@/types'

/** Alto máximo de la lista. Se usa también para decidir si abre hacia arriba. */
const ALTO_LISTA = 192

type Posicion = { left: number; top: number; width: number; haciaArriba: boolean }

/**
 * Buscador de responsables de una tarea.
 *
 * Estaba duplicado en el alta y en la edición de tareas, con la lista de
 * sugerencias como un `div` absoluto dentro del formulario. Desde que los
 * diálogos tienen `overflow-y-auto` para no pasarse del alto de la pantalla,
 * esa lista quedaba RECORTADA en el borde del diálogo en vez de flotar por
 * encima: el contenedor con scroll recorta a sus hijos posicionados.
 *
 * Por eso la lista se dibuja en el `body`, fuera del diálogo, y se ancla a mano
 * al casillero. Es el mismo motivo por el que los selectores de Radix que usa
 * el resto de la aplicación nunca tuvieron el problema.
 *
 * Quién se puede agregar y quién se puede sacar lo decide el formulario: la
 * edición, por ejemplo, no deja quitar al último responsable.
 */
export function SelectorMiembros({ id, disponibles, elegidos, onAgregar, onQuitar }: {
    id?: string
    disponibles: Member[]
    elegidos: Member[]
    onAgregar: (m: Member) => void
    onQuitar: (memberId: string) => void
}) {
    const [texto, setTexto] = useState('')
    const [abierta, setAbierta] = useState(false)
    const [posicion, setPosicion] = useState<Posicion | null>(null)
    const ancla = useRef<HTMLDivElement>(null)
    const lista = useRef<HTMLDivElement>(null)

    const sugerencias = disponibles.filter(m =>
        m.full_name.toLowerCase().includes(texto.toLowerCase()) &&
        !elegidos.some(e => e.id === m.id)
    )

    /**
     * Mide el casillero y deja la lista anclada a él.
     *
     * Se llama desde los manejadores —al abrir, al tipear, al scrollear— y no
     * desde el cuerpo de un efecto: medir exige que el casillero ya esté
     * dibujado, pero setear el estado en el efecto encadena un render de más.
     */
    const ubicar = useCallback(() => {
        const caja = ancla.current?.getBoundingClientRect()
        if (!caja) return
        // Hacia arriba sólo si abajo no entra y arriba sí: si no entra en
        // ningún lado, abajo al menos queda a la vista el principio de la lista.
        const abajo = window.innerHeight - caja.bottom
        const haciaArriba = abajo < ALTO_LISTA && caja.top > abajo
        setPosicion({
            left: caja.left,
            top: haciaArriba ? caja.top - 4 : caja.bottom + 4,
            width: caja.width,
            haciaArriba,
        })
    }, [])

    useEffect(() => {
        if (!abierta) return

        // `true` para capturar también el scroll del diálogo, que no burbujea.
        const alMover = () => ubicar()
        window.addEventListener('scroll', alMover, true)
        window.addEventListener('resize', alMover)

        function alClic(e: MouseEvent) {
            const destino = e.target as Node
            if (ancla.current?.contains(destino) || lista.current?.contains(destino)) return
            setAbierta(false)
        }
        function alTeclado(e: KeyboardEvent) {
            if (e.key === 'Escape') setAbierta(false)
        }
        document.addEventListener('mousedown', alClic)
        document.addEventListener('keydown', alTeclado)

        return () => {
            window.removeEventListener('scroll', alMover, true)
            window.removeEventListener('resize', alMover)
            document.removeEventListener('mousedown', alClic)
            document.removeEventListener('keydown', alTeclado)
        }
    }, [abierta, ubicar])

    function abrir() {
        ubicar()
        setAbierta(true)
    }

    function agregar(m: Member) {
        onAgregar(m)
        setTexto('')
        setAbierta(false)
    }

    return (
        <>
            <div ref={ancla}>
                <Input
                    id={id}
                    value={texto}
                    onChange={(e) => { setTexto(e.target.value); abrir() }}
                    onFocus={abrir}
                    onKeyDown={(e) => {
                        // Enter en este campo enviaba el formulario entero.
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            if (sugerencias.length === 1) agregar(sugerencias[0])
                        }
                    }}
                    placeholder="Buscar miembro..."
                    autoComplete="off"
                />
            </div>

            {abierta && posicion && sugerencias.length > 0 && createPortal(
                <div
                    ref={lista}
                    role="listbox"
                    aria-label="Miembros"
                    style={{
                        position: 'fixed',
                        // Radix apaga los eventos del puntero en el `body` mientras
                        // el diálogo está abierto. Sin esto la lista se ve pero no
                        // se puede tocar: los clics la atraviesan y caen en el
                        // formulario de atrás. Es lo mismo que hacen los selectores
                        // de Radix con sus propias listas.
                        pointerEvents: 'auto',
                        left: posicion.left,
                        width: posicion.width,
                        maxHeight: ALTO_LISTA,
                        ...(posicion.haciaArriba
                            ? { bottom: window.innerHeight - posicion.top }
                            : { top: posicion.top }),
                    }}
                    className="z-[60] overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
                >
                    {sugerencias.map(m => (
                        <button
                            key={m.id}
                            type="button"
                            role="option"
                            aria-selected={false}
                            onClick={() => agregar(m)}
                            className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                            {m.full_name}
                        </button>
                    ))}
                </div>,
                document.body
            )}

            {elegidos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                    {elegidos.map(m => (
                        <Badge key={m.id} variant="secondary" className="gap-1">
                            {m.full_name}
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onQuitar(m.id) }}
                                aria-label={`Quitar a ${m.full_name}`}
                                className="rounded-full p-0.5 transition-colors hover:bg-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:hover:bg-slate-600"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}
        </>
    )
}
