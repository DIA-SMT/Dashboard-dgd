'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Task, TaskAssignee, Member } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { X, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

type TaskWithAssignees = Task & {
    assignees: TaskAssignee[]
}

export function TaskEditForm({
    task,
    onTaskUpdated,
    onTaskDeleted
}: {
    task: TaskWithAssignees
    onTaskUpdated: () => void
    onTaskDeleted: () => void
}) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [selectedMembers, setSelectedMembers] = useState<Member[]>([])
    const [assigneeInput, setAssigneeInput] = useState('')
    const [availableMembers, setAvailableMembers] = useState<Member[]>([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [formData, setFormData] = useState({
        title: task.title,
        status: task.status || 'Sin empezar',
        deadline: task.deadline || '',
        notes: task.notes || '',
        link: task.link || ''
    })
    const { role } = useAuth()

    const fetchMembers = useCallback(async () => {
        const { data } = await supabase
            .from('members')
            .select('*')
            .order('full_name')

        if (data) {
            setAvailableMembers(data)

            // Map existing assignees to Member objects
            const currentMembers = task.assignees
                .map(a => {
                    // Try to find by member_id first, then by name
                    return data.find(m =>
                        (a.member_id && m.id === a.member_id) ||
                        m.full_name === a.assignee_name
                    )
                })
                .filter((m): m is Member => !!m)

            setSelectedMembers(currentMembers)
        }
    }, [task.assignees]) // Added task.assignees dependency for safety, though empty dependency array was in original useCallback

    useEffect(() => {
        if (open) {
            fetchMembers()
        }
    }, [open, fetchMembers])

    function addMember(member: Member) {
        if (!selectedMembers.find(m => m.id === member.id)) {
            setSelectedMembers([...selectedMembers, member])
            setAssigneeInput('')
            setShowSuggestions(false)
        }
    }

    function removeMember(memberId: string) {
        if (selectedMembers.length <= 1) {
            alert('La tarea debe tener al menos un responsable')
            return
        }
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
            if (task.project_id) {
                const { data: projectData } = await supabase
                    .from('projects')
                    .select('title')
                    .eq('id', task.project_id)
                    .single()
                if (projectData) {
                    projectTitle = projectData.title
                }
            }

            // Update task
            const { error: taskError } = await supabase
                .from('tasks')
                .update({
                    title: formData.title,
                    status: formData.status,
                    deadline: formData.deadline || null,
                    notes: formData.notes || null,
                    link: formData.link || null,
                })
                .eq('id', task.id)

            if (taskError) throw taskError

            // Delete old assignees
            const { error: deleteError } = await supabase
                .from('task_assignees')
                .delete()
                .eq('task_id', task.id)

            if (deleteError) throw deleteError

            // Insert new assignees
            if (selectedMembers.length > 0) {
                const assigneeRecords = selectedMembers.map(member => ({
                    task_id: task.id,
                    assignee_name: member.full_name,
                    member_id: member.id
                }))

                const { error: assigneeError } = await supabase
                    .from('task_assignees')
                    .insert(assigneeRecords)

                if (assigneeError) throw assigneeError

                // Enviar notificaciones por email a los responsables
                const emailPromises = selectedMembers
                    .filter(member => member.email) // Solo enviar a miembros con email
                    .map(async (member) => {
                        try {
                            const response = await fetch('/api/send-task-notification', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    email: member.email,
                                    memberName: member.full_name,
                                    taskTitle: formData.title,
                                    taskNotes: formData.notes || null,
                                    taskLink: formData.link || null,
                                    projectTitle: projectTitle,
                                    notificationType: 'update', // Indicar que es una actualización
                                }),
                            })

                            if (!response.ok) {
                                const errorData = await response.json()
                                console.error(`Error enviando email a ${member.email}:`, errorData)
                            }
                        } catch (error) {
                            console.error(`Error enviando email a ${member.email}:`, error)
                        }
                    })

                // Enviar emails en paralelo (no bloqueamos la UI)
                Promise.all(emailPromises).catch(err => {
                    console.error('Error al enviar algunos emails:', err)
                })
            }

            setOpen(false)
            onTaskUpdated()
        } catch (error) {
            console.error('Error updating task:', error)
            alert('Error al actualizar la tarea')
        } finally {
            setLoading(false)
        }
    }

    async function handleDelete() {
        if (!confirm('¿Estás seguro de que quieres eliminar esta tarea?')) return

        setDeleting(true)
        try {
            const { error } = await supabase
                .from('tasks')
                .update({ habilita: 0 })
                .eq('id', task.id)

            if (error) throw error

            setOpen(false)
            onTaskDeleted()
        } catch (error) {
            console.error('Error deleting task:', error)
            alert('Error al eliminar la tarea')
        } finally {
            setDeleting(false)
        }
    }

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                    e.stopPropagation()
                    setOpen(true)
                }}
            >
                <Pencil className="w-4 h-4" />
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Editar Tarea</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="title">Tarea</Label>
                            <Input
                                id="title"
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                required
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="status">Estado</Label>
                            <Select
                                value={formData.status}
                                onValueChange={(val) => setFormData({ ...formData, status: val })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Sin empezar">Sin empezar</SelectItem>
                                    <SelectItem value="En desarrollo">En desarrollo</SelectItem>
                                    <SelectItem value="Terminada">Terminada</SelectItem>
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
                                            <button
                                                type="button"
                                                className="ml-1 hover:bg-slate-200 rounded-full p-0.5 transition-colors focus:outline-none focus:ring-1 focus:ring-slate-400"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    removeMember(member.id)
                                                }}
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
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
                        <div className="flex gap-2 justify-between mt-4">
                            {role === 'admin' && (
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={handleDelete}
                                    disabled={deleting}
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    {deleting ? 'Eliminando...' : 'Eliminar'}
                                </Button>
                            )}
                            <div className="flex gap-2">
                                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={loading}>
                                    {loading ? 'Guardando...' : 'Guardar Cambios'}
                                </Button>
                            </div>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    )
}
