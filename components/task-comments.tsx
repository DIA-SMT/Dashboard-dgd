'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, MessageSquare, Trash2 } from 'lucide-react'

type Comentario = {
    id: string
    task_id: string
    author_id: string | null
    author_name: string | null
    content: string
    created_at: string | null
}

function formatearFecha(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    const hoy = new Date()
    const mismoDia = d.toDateString() === hoy.toDateString()
    return mismoDia
        ? `hoy ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
        : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
          ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Hilo de comentarios de una tarea.
 *
 * `tasks.notes` ya existía, pero es un campo único que se pisa a sí mismo: no
 * sirve para dejar constancia de quién dijo qué y cuándo. El expediente pide
 * "observaciones y comentarios", en plural, así que acá se acumulan con autor
 * y fecha. El campo de notas queda como estaba.
 *
 * El borrado es lógico (habilita = 0) como en el resto de la aplicación, y
 * sólo puede borrar cada uno lo suyo —o un admin cualquiera—, según las
 * políticas de db/02_pedido.sql.
 */
export function TaskComments({ taskId, onCantidad }: {
    taskId: string
    onCantidad?: (n: number) => void
}) {
    const { user, role } = useAuth()
    const [comentarios, setComentarios] = useState<Comentario[]>([])
    const [texto, setTexto] = useState('')
    const [cargando, setCargando] = useState(true)
    const [enviando, setEnviando] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const cargar = useCallback(async () => {
        const { data, error: err } = await supabase
            .from('task_comments')
            .select('id, task_id, author_id, author_name, content, created_at')
            .eq('task_id', taskId)
            .eq('habilita', 1)
            .order('created_at', { ascending: true })

        if (err) {
            console.error('Error cargando comentarios:', err)
            setError('No se pudieron cargar los comentarios')
        } else {
            setComentarios(data ?? [])
            onCantidad?.(data?.length ?? 0)
        }
        setCargando(false)
    }, [taskId, onCantidad])

    useEffect(() => { cargar() }, [cargar])

    async function publicar(e: React.FormEvent) {
        e.preventDefault()
        const contenido = texto.trim()
        if (!contenido || !user) return

        setEnviando(true)
        setError(null)
        try {
            const nombre =
                (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'Sin nombre'

            const { error: err } = await supabase.from('task_comments').insert({
                task_id: taskId,
                author_id: user.id,
                author_name: nombre,
                content: contenido,
            })
            if (err) throw err

            setTexto('')
            await cargar()
        } catch (err) {
            console.error('Error publicando comentario:', err)
            setError(err instanceof Error ? err.message : 'No se pudo publicar el comentario')
        } finally {
            setEnviando(false)
        }
    }

    async function borrar(id: string) {
        if (!confirm('¿Borrar este comentario?')) return
        const { error: err } = await supabase
            .from('task_comments')
            .update({ habilita: 0 })
            .eq('id', id)

        if (err) {
            console.error('Error borrando comentario:', err)
            alert('No se pudo borrar el comentario')
            return
        }
        await cargar()
    }

    return (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
            {cargando ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : (
                <>
                    {comentarios.length === 0 ? (
                        <p className="mb-3 text-xs italic text-slate-400">
                            Todavía no hay comentarios en esta tarea.
                        </p>
                    ) : (
                        <ul className="mb-3 space-y-2.5">
                            {comentarios.map((c) => {
                                const puedeBorrar = c.author_id === user?.id || role === 'admin'
                                return (
                                    <li key={c.id} className="group text-sm">
                                        <div className="flex items-baseline gap-2">
                                            <span className="font-medium text-slate-800">
                                                {c.author_name || 'Sin nombre'}
                                            </span>
                                            <span className="text-[11px] text-slate-400">
                                                {formatearFecha(c.created_at)}
                                            </span>
                                            {puedeBorrar && (
                                                <button
                                                    onClick={() => borrar(c.id)}
                                                    title="Borrar comentario"
                                                    className="ml-auto text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                        </div>
                                        <p className="whitespace-pre-wrap text-slate-600">{c.content}</p>
                                    </li>
                                )
                            })}
                        </ul>
                    )}

                    <form onSubmit={publicar} className="space-y-2">
                        <Textarea
                            value={texto}
                            onChange={(e) => setTexto(e.target.value)}
                            placeholder="Escribí un comentario..."
                            rows={2}
                            className="bg-white text-sm"
                        />
                        {error && <p className="text-xs text-red-600">{error}</p>}
                        <Button type="submit" size="sm" disabled={enviando || !texto.trim()}>
                            {enviando ? (
                                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Publicando...</>
                            ) : (
                                <><MessageSquare className="mr-1.5 h-3.5 w-3.5" />Comentar</>
                            )}
                        </Button>
                    </form>
                </>
            )}
        </div>
    )
}
