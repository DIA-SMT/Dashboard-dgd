'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { DEFAULT_TASK_STATUS } from '@/lib/task-status'
import { avisarAsignacion } from '@/lib/notificaciones'

type Miembro = { id: string; full_name: string; email: string | null }

/** Una tarea cargada en el formulario, todavía sin guardar. */
type TareaNueva = {
    /** Sólo para la clave de React mientras se edita; no viaja a la base. */
    clave: number
    title: string
    deadline: string
    responsables: string[]
}

let proximaClave = 1

/**
 * Un uuid para una tarea que todavía no existe en la base.
 *
 * `crypto.randomUUID` sólo está definido en contexto seguro (https o
 * localhost). Si alguien abre la aplicación por http contra una IP interna del
 * municipio, no existe y el alta se caería entera. `getRandomValues` sí está
 * siempre, así que el respaldo arma la versión 4 a mano.
 */
function nuevoId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function ProjectForm({ onProjectCreated }: { onProjectCreated: () => void }) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const isSubmittingRef = useRef(false)
    const router = useRouter()
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        priority: 'Media',
        deadline: '',
        start_date: '',
        objectives: '',
        scope: '',
        owner_id: ''
    })
    const [tareas, setTareas] = useState<TareaNueva[]>([])
    const [claveAFocar, setClaveAFocar] = useState<number | null>(null)
    const [members, setMembers] = useState<Miembro[]>([])
    const { role } = useAuth()

    useEffect(() => {
        if (!open) return
        supabase
            .from('members')
            .select('id, full_name, email')
            .eq('habilita', 1)
            .order('full_name')
            .then(({ data }) => { if (data) setMembers(data) })
    }, [open])

    // El foco se mueve después de pintar el renglón nuevo: antes de eso el
    // campo todavía no existe en el documento.
    useEffect(() => {
        if (claveAFocar === null) return
        const campo = document.querySelector<HTMLInputElement>(`input[data-clave="${claveAFocar}"]`)
        campo?.focus()
        setClaveAFocar(null)
    }, [claveAFocar])

    const hayBorrador =
        Object.entries(formData).some(([k, v]) => v !== '' && !(k === 'priority' && v === 'Media'))
        || tareas.length > 0

    function limpiar() {
        setFormData({
            title: '', description: '', priority: 'Media', deadline: '',
            start_date: '', objectives: '', scope: '', owner_id: ''
        })
        setTareas([])
    }

    // --- tareas iniciales -----------------------------------------------------

    function agregarTarea() {
        const clave = proximaClave++
        setTareas(t => [...t, { clave, title: '', deadline: '', responsables: [] }])
        setClaveAFocar(clave)
    }

    function cambiarTarea(clave: number, cambios: Partial<TareaNueva>) {
        setTareas(t => t.map(x => x.clave === clave ? { ...x, ...cambios } : x))
    }

    function quitarTarea(clave: number) {
        setTareas(t => t.filter(x => x.clave !== clave))
    }

    function alternarResponsable(clave: number, memberId: string) {
        setTareas(t => t.map(x => x.clave !== clave ? x : {
            ...x,
            responsables: x.responsables.includes(memberId)
                ? x.responsables.filter(id => id !== memberId)
                : [...x.responsables, memberId],
        }))
    }

    /**
     * Crea las tareas cargadas en el formulario.
     *
     * Se llama DESPUÉS de que el proyecto quedó guardado, y a propósito no
     * deshace el proyecto si alguna tarea falla: perder el proyecto por un
     * renglón mal cargado sería peor que quedarse con el proyecto y cargar esa
     * tarea de nuevo. Devuelve el mensaje de lo que no se pudo guardar.
     */
    async function crearTareas(projectId: string, tituloProyecto: string): Promise<string | null> {
        const aCrear = tareas
            .map(t => ({ ...t, title: t.title.trim() }))
            .filter(t => t.title)

        if (aCrear.length === 0) return null

        // El id se genera acá y no en la base a propósito: hace falta saber qué
        // fila es cuál para colgarle sus responsables, y aparearlas por la
        // posición en que vuelven del insert sería confiar en un orden que
        // PostgREST no promete. Si se desordenara, los responsables irían a la
        // tarea equivocada sin que nada avise.
        const conId = aCrear.map(t => ({ ...t, id: nuevoId() }))

        const { data: creadas, error } = await supabase
            .from('tasks')
            .insert(conId.map(t => ({
                id: t.id,
                project_id: projectId,
                title: t.title,
                status: DEFAULT_TASK_STATUS,
                deadline: t.deadline || null,
            })))
            .select('id')

        if (error || !creadas) {
            console.error('Error creando las tareas del proyecto:', error)
            // El mensaje las nombra porque el formulario se cierra y se limpia:
            // decir "cargalas de nuevo" sin decir cuáles no sirve de nada.
            return 'El proyecto se creó, pero no se pudieron guardar estas tareas:\n\n'
                + aCrear.map(t => `• ${t.title}`).join('\n')
                + '\n\nCargalas desde el proyecto.'
        }

        const asignaciones = conId.flatMap(t =>
            t.responsables
                .map(id => members.find(m => m.id === id))
                .filter((m): m is Miembro => !!m)
                .map(m => ({ task_id: t.id, member_id: m.id, assignee_name: m.full_name }))
        )

        if (asignaciones.length === 0) return null

        const { error: errorAsignar } = await supabase.from('task_assignees').insert(asignaciones)
        if (errorAsignar) {
            console.error('Error asignando responsables:', errorAsignar)
            return 'Las tareas se crearon, pero no se pudieron asignar los responsables.'
        }

        // Los avisos no bloquean: la tarea ya está guardada.
        conId.forEach(t => {
            const destinatarios = t.responsables
                .map(id => members.find(m => m.id === id))
                .filter((m): m is Miembro => !!m)
            if (destinatarios.length > 0) {
                avisarAsignacion(destinatarios, { titulo: t.title, proyecto: tituloProyecto })
            }
        })

        return null
    }

    // --- envío ----------------------------------------------------------------

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (isSubmittingRef.current) return

        const { title, description, priority, deadline } = formData
        if (!title || !description || !priority || !deadline) {
            alert('Por favor, complete todos los campos obligatorios.')
            return
        }

        const sinTitulo = tareas.filter(t => !t.title.trim()).length
        if (sinTitulo > 0 && !confirm(
            sinTitulo === 1
                ? 'Hay una tarea sin nombre y no se va a crear. ¿Seguimos?'
                : `Hay ${sinTitulo} tareas sin nombre y no se van a crear. ¿Seguimos?`
        )) return

        isSubmittingRef.current = true
        setLoading(true)
        try {
            const { data, error } = await supabase.from('projects').insert([
                {
                    ...formData,
                    deadline: formData.deadline || null,
                    start_date: formData.start_date || null,
                    owner_id: formData.owner_id || null,
                    objectives: formData.objectives || null,
                    scope: formData.scope || null,
                    status: 'Pendiente'
                }
            ]).select().single()
            if (error) throw error

            if (data) {
                const aviso = await crearTareas(data.id, data.title)
                if (aviso) alert(aviso)

                router.push(`/projects/${data.id}`)
                onProjectCreated()
                setOpen(false)
                limpiar()
            } else {
                setOpen(false)
                onProjectCreated()
            }
        } catch (error) {
            console.error('Error creating project:', error)
            alert(`Error creating project: ${(error as any).message || 'Unknown error'}`)
        } finally {
            isSubmittingRef.current = false
            setLoading(false)
        }
    }

    if (role !== 'admin') return null

    return (
        <Dialog
            open={open}
            onOpenChange={(abierto) => {
                if (abierto) { setOpen(true); return }
                // Cerrar es cancelar: si el borrador sobreviviera, las tareas de
                // un intento abandonado se crearían con el proyecto siguiente.
                // Pero el diálogo también se cierra con Escape o con un clic
                // afuera, así que se pregunta antes de tirar lo cargado.
                if (hayBorrador && !confirm('Vas a perder lo que cargaste. ¿Cerrar el formulario igual?')) return
                setOpen(false)
                limpiar()
            }}
        >
            <DialogTrigger asChild>
                <Button>Nuevo Proyecto</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle>Crear Nuevo Proyecto</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="title">Título</Label>
                        <Input
                            id="title"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="description">Descripción</Label>
                        <Textarea
                            id="description"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="objectives">Objetivos</Label>
                        <Textarea
                            id="objectives"
                            value={formData.objectives}
                            onChange={(e) => setFormData({ ...formData, objectives: e.target.value })}
                            placeholder="Qué se busca lograr con el proyecto"
                            rows={3}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="scope">Alcance</Label>
                        <Textarea
                            id="scope"
                            value={formData.scope}
                            onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                            placeholder="Qué incluye y qué queda afuera"
                            rows={3}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="priority">Prioridad</Label>
                            <Select
                                value={formData.priority}
                                onValueChange={(val) => setFormData({ ...formData, priority: val })}
                            >
                                <SelectTrigger id="priority">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Baja">Baja</SelectItem>
                                    <SelectItem value="Media">Media</SelectItem>
                                    <SelectItem value="Alta">Alta</SelectItem>
                                    <SelectItem value="Urgente">Urgente</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="owner_id">Responsable</Label>
                            <Select
                                value={formData.owner_id || '__SIN__'}
                                onValueChange={(val) => setFormData({ ...formData, owner_id: val === '__SIN__' ? '' : val })}
                            >
                                <SelectTrigger id="owner_id">
                                    <SelectValue placeholder="Sin asignar" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__SIN__">Sin asignar</SelectItem>
                                    {members.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="start_date">Fecha de inicio</Label>
                            <Input
                                id="start_date"
                                type="date"
                                value={formData.start_date}
                                max={formData.deadline || undefined}
                                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="deadline">Fecha estimada de finalización</Label>
                            <Input
                                id="deadline"
                                type="date"
                                value={formData.deadline}
                                min={formData.start_date || undefined}
                                onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    {/* Tareas iniciales. Van acá para no tener que crear el
                        proyecto y volver a entrar sólo para cargar lo que ya se
                        sabe que hay que hacer. Todas se crean "Sin empezar"; el
                        resto de los campos se completa después, desde el
                        proyecto. */}
                    <div className="grid gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <div className="flex items-center justify-between">
                            <Label className="text-slate-700 dark:text-slate-200">
                                Tareas iniciales <span className="font-normal text-slate-400">(opcional)</span>
                            </Label>
                            <Button type="button" variant="outline" size="sm" onClick={agregarTarea} className="h-7 gap-1 px-2 text-xs">
                                <Plus className="h-3.5 w-3.5" />
                                Agregar
                            </Button>
                        </div>

                        {tareas.length === 0 ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Podés cargar acá las tareas que ya conocés, o dejarlo vacío y agregarlas después.
                            </p>
                        ) : (
                            <div className="grid gap-2">
                                {tareas.map((t, i) => (
                                    <div key={t.clave} className="grid gap-2 rounded-md bg-slate-50 p-2 dark:bg-slate-800/60">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Input
                                                value={t.title}
                                                onChange={(e) => cambiarTarea(t.clave, { title: e.target.value })}
                                                data-clave={t.clave}
                                                onKeyDown={(e) => {
                                                    // Sin esto, Enter dispara el envío implícito del
                                                    // formulario y crea el proyecto mientras se está
                                                    // escribiendo la lista de tareas. Sólo agrega un
                                                    // renglón si el último tiene nombre: si no, Enter
                                                    // repetido apilaba renglones vacíos.
                                                    if (e.key !== 'Enter') return
                                                    e.preventDefault()
                                                    const ultimo = tareas[tareas.length - 1]
                                                    if (ultimo && ultimo.title.trim()) agregarTarea()
                                                }}
                                                placeholder={`Tarea ${i + 1}`}
                                                aria-label={`Nombre de la tarea ${i + 1}`}
                                                className="h-8 min-w-[150px] flex-1 bg-white text-sm dark:bg-slate-900"
                                            />
                                            <Input
                                                type="date"
                                                value={t.deadline}
                                                onChange={(e) => cambiarTarea(t.clave, { deadline: e.target.value })}
                                                aria-label={`Fecha de vencimiento de la tarea ${i + 1}`}
                                                className="h-8 w-[140px] shrink-0 bg-white text-sm dark:bg-slate-900"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => quitarTarea(t.clave)}
                                                aria-label={`Quitar la tarea ${i + 1}`}
                                                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <Select value="" onValueChange={(id) => alternarResponsable(t.clave, id)}>
                                                <SelectTrigger
                                                    className="h-7 w-[150px] bg-white text-xs dark:bg-slate-900"
                                                    aria-label={`Responsables de la tarea ${i + 1}`}
                                                    onKeyDown={(e) => {
                                                        // El selector está siempre en value="" y usa
                                                        // onValueChange como conmutador, así que la
                                                        // búsqueda por tecleo de Radix agregaba o
                                                        // sacaba gente sin llegar a abrirlo.
                                                        if (e.key.length === 1) e.preventDefault()
                                                    }}
                                                >
                                                    <SelectValue placeholder="Responsables" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {members.length === 0 ? (
                                                        <SelectItem value="__VACIO__" disabled>No hay miembros cargados</SelectItem>
                                                    ) : (
                                                        members.map((m) => (
                                                            <SelectItem key={m.id} value={m.id}>
                                                                {t.responsables.includes(m.id) ? `✓ ${m.full_name}` : m.full_name}
                                                            </SelectItem>
                                                        ))
                                                    )}
                                                </SelectContent>
                                            </Select>

                                            {t.responsables.map(id => {
                                                const m = members.find(x => x.id === id)
                                                if (!m) return null
                                                return (
                                                    <Badge key={id} variant="secondary" className="gap-1 text-xs">
                                                        {m.full_name}
                                                        <button
                                                            type="button"
                                                            onClick={() => alternarResponsable(t.clave, id)}
                                                            aria-label={`Quitar a ${m.full_name}`}
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </Badge>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <Button type="submit" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {loading ? 'Guardando...' : 'Crear Proyecto'}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    )
}
