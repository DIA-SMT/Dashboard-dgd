'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { Project, Member } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { X, Plus } from 'lucide-react'
import { TASK_STATUSES, DEFAULT_TASK_STATUS, type TaskStatus } from '@/lib/task-status'
import { avisarAsignacion } from '@/lib/notificaciones'

export function TaskForm({
    onTaskCreated,
    projectId,
    parentTaskId,
}: {
    onTaskCreated: () => void
    projectId?: string
    /**
     * Si viene, la tarea se crea como subtarea de esta (R5). Cambia el
     * disparador y el título del diálogo, pero el formulario es el mismo:
     * una subtarea tiene los mismos campos que una tarea.
     */
    parentTaskId?: string
}) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [projects, setProjects] = useState<Project[]>([])
    const [selectedMembers, setSelectedMembers] = useState<Member[]>([])
    const [assigneeInput, setAssigneeInput] = useState('')
    const [availableMembers, setAvailableMembers] = useState<Member[]>([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [formData, setFormData] = useState({
        project_id: projectId || '',
        title: '',
        status: DEFAULT_TASK_STATUS,
        deadline: '',
        notes: '',
        link: ''
    })
    const { role } = useAuth()



    useEffect(() => {
        if (open) {
            if (!projectId) {
                fetchProjects()
            }
            fetchMembers()
        }
    }, [open, projectId])

    async function fetchProjects() {
        const { data } = await supabase
            .from('projects')
            .select('*')
            .is('completed_at', null)
            .order('created_at', { ascending: false })
        if (data) setProjects(data)
    }

    async function fetchMembers() {
        const { data } = await supabase
            .from('members')
            .select('*')
            .order('full_name')

        if (data) setAvailableMembers(data)
    }

    function addMember(member: Member) {
        if (!selectedMembers.find(m => m.id === member.id)) {
            setSelectedMembers([...selectedMembers, member])
            setAssigneeInput('')
            setShowSuggestions(false)
        }
    }

    function removeMember(memberId: string) {
        setSelectedMembers(selectedMembers.filter(m => m.id !== memberId))
    }

    const filteredSuggestions = availableMembers.filter(
        member =>
            member.full_name.toLowerCase().includes(assigneeInput.toLowerCase()) &&
            !selectedMembers.find(m => m.id === member.id)
    )

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        try {
            // Obtener información del proyecto si existe
            let projectTitle: string | null = null
            if (formData.project_id) {
                const { data: projectData } = await supabase
                    .from('projects')
                    .select('title')
                    .eq('id', formData.project_id)
                    .single()
                if (projectData) {
                    projectTitle = projectData.title
                }
            }

            // Insert task
            const { data: taskData, error: taskError } = await supabase
                .from('tasks')
                .insert([{
                    project_id: formData.project_id || null,
                    parent_task_id: parentTaskId ?? null,
                    title: formData.title,
                    status: formData.status,
                    deadline: formData.deadline || null,
                    notes: formData.notes || null,
                    link: formData.link || null,
                }])
                .select()
                .single()

            if (taskError) throw taskError

            // Insert assignees
            if (selectedMembers.length > 0 && taskData) {
                const assigneeRecords = selectedMembers.map(member => ({
                    task_id: taskData.id,
                    assignee_name: member.full_name,
                    member_id: member.id
                }))

                const { error: assigneeError } = await supabase
                    .from('task_assignees')
                    .insert(assigneeRecords)

                if (assigneeError) throw assigneeError

                // El aviso por correo no bloquea: la tarea ya está guardada.
                avisarAsignacion(selectedMembers, {
                    titulo: formData.title,
                    notas: formData.notes || null,
                    link: formData.link || null,
                    proyecto: projectTitle,
                })
            }

            setOpen(false)
            setFormData({
                project_id: projectId || '',
                title: '',
                status: DEFAULT_TASK_STATUS,
                deadline: '',
                notes: '',
                link: ''
            })
            setSelectedMembers([])
            setAssigneeInput('')
            onTaskCreated()
        } catch (error) {
            console.error('Error creating task:', error)
            console.error('Error creating task:', error)
            alert(`Error creating task: ${(error as any).message || 'Unknown error'}`)
        } finally {
            setLoading(false)
        }
    }

    if (role !== 'admin') return null

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {parentTaskId ? (
                    <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-slate-500 hover:text-slate-700">
                        <Plus className="h-3.5 w-3.5" />
                        Subtarea
                    </Button>
                ) : (
                    <Button>Nueva Tarea</Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{parentTaskId ? 'Nueva subtarea' : 'Crear Nueva Tarea'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    {!projectId && (
                        <div className="grid gap-2">
                            <Label htmlFor="project">Proyecto</Label>
                            <Select
                                value={formData.project_id}
                                onValueChange={(val) => setFormData({ ...formData, project_id: val })}
                                required
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar proyecto" />
                                </SelectTrigger>
                                <SelectContent>
                                    {projects.map(p => (
                                        <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="grid gap-2">
                        <Label htmlFor="title">Tarea</Label>
                        <Input
                            id="title"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="Ej: Guion, Edición..."
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="status">Estado</Label>
                        <Select
                            value={formData.status}
                            onValueChange={(val) => setFormData({ ...formData, status: val as TaskStatus })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TASK_STATUSES.map((estado) => (
                                    <SelectItem key={estado} value={estado}>{estado}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="deadline">Fecha de vencimiento</Label>
                        <Input
                            id="deadline"
                            type="date"
                            value={formData.deadline}
                            onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="assignees">Responsables</Label>
                        <div className="relative">
                            <div className="flex gap-2">
                                <Input
                                    id="assignees"
                                    value={assigneeInput}
                                    onChange={(e) => {
                                        setAssigneeInput(e.target.value)
                                        setShowSuggestions(true)
                                    }}
                                    onFocus={() => setShowSuggestions(true)}
                                    placeholder="Buscar miembro..."
                                />
                            </div>

                            {/* Suggestions dropdown */}
                            {showSuggestions && filteredSuggestions.length > 0 && (
                                <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-40 overflow-y-auto">
                                    {filteredSuggestions.map((member) => (
                                        <button
                                            key={member.id}
                                            type="button"
                                            className="w-full text-left px-3 py-2 hover:bg-slate-100 text-sm"
                                            onClick={() => addMember(member)}
                                        >
                                            {member.full_name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {selectedMembers.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {selectedMembers.map((member) => (
                                    <Badge key={member.id} variant="secondary" className="gap-1">
                                        {member.full_name}
                                        <X
                                            className="w-3 h-3 cursor-pointer"
                                            onClick={() => removeMember(member.id)}
                                        />
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="notes">Notas</Label>
                        <Textarea
                            id="notes"
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="link">Link / Archivo</Label>
                        <Input
                            id="link"
                            value={formData.link}
                            onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                            placeholder="https://..."
                        />
                    </div>
                    <Button type="submit" disabled={loading}>
                        {loading ? 'Guardando...' : 'Crear Tarea'}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    )
}
