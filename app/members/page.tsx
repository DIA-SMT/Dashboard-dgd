'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Member } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useRouter } from 'next/navigation'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

export default function MembersPage() {
    const router = useRouter()
    const { role } = useAuth()
    const [members, setMembers] = useState<Member[]>([])
    const [loading, setLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingMember, setEditingMember] = useState<Member | null>(null)
    const [formData, setFormData] = useState({ full_name: '', email: '' })
    const [saveLoading, setSaveLoading] = useState(false)
    const [deleteLoading, setDeleteLoading] = useState<string | null>(null)

    useEffect(() => {
        fetchMembers()
    }, [])

    async function fetchMembers() {
        try {
            const { data, error } = await supabase
                .from('members')
                .select('*')
                .eq('habilita', 1)
                .order('full_name')

            if (error) throw error
            if (data) setMembers(data)
        } catch (error) {
            console.error('Error fetching members:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setSaveLoading(true)

        try {
            if (editingMember) {
                const { error } = await supabase
                    .from('members')
                    .update({
                        full_name: formData.full_name,
                        // email is permanent
                    })
                    .eq('id', editingMember.id)

                if (error) throw error
            } else {
                const { error } = await supabase
                    .from('members')
                    .insert({
                        full_name: formData.full_name,
                        email: formData.email || null,
                    })

                if (error) throw error
            }

            setIsDialogOpen(false)
            fetchMembers()
            resetForm()
        } catch (error: any) {
            console.error('Error saving member:', error)
            alert(error.message || 'Error al guardar el miembro')
        } finally {
            setSaveLoading(false)
        }
    }

    async function handleDelete(member: Member) {
        if (!confirm('¿Estás seguro de que quieres eliminar a este miembro?')) return

        setDeleteLoading(member.id)
        try {
            const { error } = await supabase
                .from('members')
                .update({ habilita: 0 })
                .eq('id', member.id)

            if (error) throw error

            fetchMembers()
        } catch (error: any) {
            console.error('Error deleting member:', error)
            alert(error.message || 'Error al eliminar el miembro')
        } finally {
            setDeleteLoading(null)
        }
    }



    function resetForm() {
        setEditingMember(null)
        setFormData({ full_name: '', email: '' })
    }

    function openEditDialog(member: Member) {
        setEditingMember(member)
        setFormData({
            full_name: member.full_name,
            email: member.email || '',
        })
        setIsDialogOpen(true)
    }

    return (
        <div className="container mx-auto py-10">
            <Button
                variant="ghost"
                onClick={() => router.push('/')}
                className="mb-4"
            >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Volver a proyectos
            </Button>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Miembros del Equipo</h1>
                    <p className="text-sm text-slate-500">
                        Las personas a las que se les pueden asignar tareas.
                    </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open)
                    if (!open) resetForm()
                }}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="w-4 h-4 mr-2" />
                            Agregar Miembro
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>
                                {editingMember ? 'Editar Miembro' : 'Nuevo Miembro'}
                            </DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="full_name">Nombre Completo</Label>
                                <Input
                                    id="full_name"
                                    value={formData.full_name}
                                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    disabled={!!editingMember}
                                />
                            </div>
                            {!editingMember && (
                                <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                                    Esto suma a la persona a la nómina de asignables, sin crearle
                                    usuario. Para que además pueda iniciar sesión, dala de alta
                                    desde <strong>Configuración</strong>: al crear el usuario queda
                                    agregada acá automáticamente.
                                </p>
                            )}
                            <Button type="submit" className="w-full" disabled={saveLoading}>
                                {saveLoading ? 'Guardando...' : 'Guardar'}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-lg">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead className="w-[100px]">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {members.map((member) => (
                            <TableRow key={member.id}>
                                <TableCell className="font-medium">{member.full_name}</TableCell>
                                <TableCell>{member.email || '-'}</TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openEditDialog(member)}
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </Button>
                                        {role === 'admin' && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive hover:text-destructive/90"
                                                disabled={deleteLoading === member.id}
                                                onClick={() => handleDelete(member)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                        {members.length === 0 && !loading && (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                                    No hay miembros registrados
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
