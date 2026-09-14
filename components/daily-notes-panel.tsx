'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StickyNote, Loader2, Trash2, Plus, Pencil, Check, X as CloseIcon } from 'lucide-react'
import { Member } from '@/types'

type DailyNote = {
    id: string
    content: string
    done: boolean
    created_by: string
    created_at: string
    habilita: number
    member_id?: string
    member_name?: string
}

interface DailyNotesPanelProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function DailyNotesPanel({ open, onOpenChange }: DailyNotesPanelProps) {
    const { user } = useAuth()
    const [notes, setNotes] = useState<DailyNote[]>([])
    const [newContent, setNewContent] = useState('')
    const [saving, setSaving] = useState(false)
    const [loading, setLoading] = useState(false)
    const [members, setMembers] = useState<Member[]>([])
    const [selectedMemberId, setSelectedMemberId] = useState<string>('none')

    // State for editing
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editContent, setEditContent] = useState('')
    const [updating, setUpdating] = useState(false)

    // Deshabilita automáticamente las notas de días anteriores
    const disableOldNotes = useCallback(async () => {
        try {
            const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000)

            const { error } = await supabase
                .from('daily_notes')
                .update({ habilita: 0 })
                .eq('habilita', 1)
                .lt('created_at', seventyTwoHoursAgo.toISOString())

            if (error) console.error('Error disabling old notes:', error)
        } catch (error) {
            console.error('Error disabling old notes:', error)
        }
    }, [])

    const fetchMembers = useCallback(async () => {
        const { data } = await supabase
            .from('members')
            .select('*')
            .eq('habilita', 1)
            .order('full_name')
        if (data) setMembers(data)
    }, [])

    const fetchNotes = useCallback(async () => {
        setLoading(true)
        try {
            // Primero deshabilitamos notas de más de 72hs
            await disableOldNotes()

            // Rango de las últimas 72 horas
            const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000)

            const { data, error } = await supabase
                .from('daily_notes')
                .select('*')
                .gte('created_at', seventyTwoHoursAgo.toISOString())
                .eq('habilita', 1)
                .order('created_at', { ascending: false })

            if (error) throw error
            setNotes(data || [])
        } catch (error) {
            console.error('Error fetching daily notes:', error)
        } finally {
            setLoading(false)
        }
    }, [disableOldNotes])

    // Fetch notes when panel opens
    useEffect(() => {
        if (open) {
            fetchNotes()
            fetchMembers()
        }
    }, [open, fetchNotes, fetchMembers])

    // Realtime subscription
    useEffect(() => {
        if (!open) return

        const channel = supabase
            .channel('daily-notes-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'daily_notes',
                },
                () => {
                    fetchNotes()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [open, fetchNotes])

    const handleSave = async () => {
        if (!newContent.trim() || saving || !user) return

        setSaving(true)
        try {
            const selectedMember = members.find(m => m.id === selectedMemberId)

            const { error } = await supabase
                .from('daily_notes')
                .insert({
                    content: newContent.trim(),
                    created_by: user.email || user.id,
                    member_id: selectedMemberId === 'none' ? null : selectedMemberId,
                    member_name: selectedMember ? selectedMember.full_name : null
                })

            if (error) throw error

            setNewContent('')
            setSelectedMemberId('none')
            // Realtime will trigger a refetch, but also do it immediately for responsiveness
            fetchNotes()
        } catch (error) {
            console.error('Error saving note:', error)
            alert('Error al guardar la nota')
        } finally {
            setSaving(false)
        }
    }

    const handleUpdate = async () => {
        if (!editingId || !editContent.trim() || updating) return

        setUpdating(true)
        try {
            const { error } = await supabase
                .from('daily_notes')
                .update({ content: editContent.trim() })
                .eq('id', editingId)

            if (error) throw error

            setEditingId(null)
            setEditContent('')
            fetchNotes()
        } catch (error) {
            console.error('Error updating note:', error)
            alert('Error al actualizar la nota')
        } finally {
            setUpdating(false)
        }
    }

    const handleToggleDone = async (noteId: string, currentDone: boolean) => {
        try {
            const { error } = await supabase
                .from('daily_notes')
                .update({ done: !currentDone })
                .eq('id', noteId)

            if (error) throw error
        } catch (error) {
            console.error('Error toggling note:', error)
        }
    }

    const handleDelete = async (noteId: string) => {
        try {
            const { error } = await supabase
                .from('daily_notes')
                .update({ habilita: 0 })
                .eq('id', noteId)

            if (error) throw error

            // Refrescar manualmente por las dudas
            fetchNotes()
        } catch (error: any) {
            console.error('Error deleting note:', error.message || error)
            alert('Error al eliminar la nota: ' + (error.message || 'Error desconocido'))
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            if (editingId) {
                handleUpdate()
            } else {
                handleSave()
            }
        }
        if (e.key === 'Escape' && editingId) {
            setEditingId(null)
            setEditContent('')
        }
    }

    const startEditing = (note: DailyNote) => {
        setEditingId(note.id)
        setEditContent(note.content)
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="left" className="w-full sm:w-[420px] flex flex-col p-0">
                <SheetHeader className="px-5 pt-5 pb-4 border-b bg-amber-50/80 flex-shrink-0">
                    <SheetTitle className="flex items-center gap-2 text-amber-900">
                        <StickyNote className="w-5 h-5" />
                        Notas (72hs disponibles)
                    </SheetTitle>
                    <p className="text-xs text-amber-700/70">
                        {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                        {' · '}{notes.length} nota{notes.length !== 1 ? 's' : ''}
                    </p>
                </SheetHeader>

                {/* New note input */}
                <div className="px-4 py-3 border-b bg-amber-50/40 flex-shrink-0">
                    <textarea
                        className="w-full resize-none rounded-lg border border-amber-200 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-300 placeholder:text-amber-400/60"
                        placeholder="Escribí una nota..."
                        rows={3}
                        value={newContent}
                        onChange={(e) => setNewContent(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={saving}
                    />
                    <div className="flex items-center justify-between mt-2 gap-2">
                        <div className="flex-1 max-w-[180px]">
                            <Select
                                value={selectedMemberId}
                                onValueChange={setSelectedMemberId}
                                disabled={saving}
                            >
                                <SelectTrigger className="h-8 text-[11px] bg-white border-amber-200 text-amber-900 focus:ring-amber-400/50">
                                    <SelectValue placeholder="Vincular a..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Sin vincular</SelectItem>
                                    {members.map((member) => (
                                        <SelectItem key={member.id} value={member.id}>
                                            {member.full_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            size="sm"
                            className="bg-amber-600 hover:bg-amber-700 text-white flex-shrink-0"
                            disabled={saving || !newContent.trim()}
                            onClick={handleSave}
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                                    Guardar
                                </>
                            )}
                        </Button>
                    </div>
                </div>

                {/* Notes list */}
                <ScrollArea className="flex-1 min-h-0">
                    <div className="p-4 space-y-3">
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                            </div>
                        ) : notes.length === 0 ? (
                            <div className="text-center py-10 text-amber-600/60">
                                <StickyNote className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p className="font-medium">Sin notas hoy</p>
                                <p className="text-xs mt-1">Escribí la primera nota del día</p>
                            </div>
                        ) : (
                            [...notes].sort((a, b) => Number(a.done) - Number(b.done)).map((note) => (
                                <div
                                    key={note.id}
                                    className={`group relative rounded-lg border p-3 transition-all ${note.done
                                        ? 'bg-emerald-50 border-emerald-200/60'
                                        : 'bg-amber-50/60 border-amber-200/60 hover:shadow-sm'
                                        }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <label className="flex items-center mt-0.5 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={note.done}
                                                onChange={() => handleToggleDone(note.id, note.done)}
                                                className="w-4 h-4 rounded border-amber-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                            />
                                        </label>
                                        <div className="flex-1 min-w-0">
                                            {editingId === note.id ? (
                                                <div className="space-y-2">
                                                    <textarea
                                                        className="w-full resize-none rounded border border-amber-300 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                                                        rows={3}
                                                        value={editContent}
                                                        onChange={(e) => setEditContent(e.target.value)}
                                                        onKeyDown={handleKeyDown}
                                                        autoFocus
                                                    />
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-7 w-7 text-slate-400 hover:text-slate-600"
                                                            onClick={() => setEditingId(null)}
                                                        >
                                                            <CloseIcon className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-7 w-7 text-emerald-500 hover:text-emerald-700"
                                                            onClick={handleUpdate}
                                                            disabled={updating || !editContent.trim()}
                                                        >
                                                            {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <p
                                                        className={`text-sm whitespace-pre-wrap break-words ${note.done
                                                            ? 'line-through text-emerald-700/60'
                                                            : 'text-slate-800'
                                                            }`}
                                                    >
                                                        {note.content}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1.5">
                                                        {note.member_name && (
                                                            <span className="px-1.5 py-0.5 rounded-full bg-amber-200/50 text-amber-800 text-[10px] font-medium border border-amber-300/50">
                                                                @{note.member_name}
                                                            </span>
                                                        )}
                                                        <p className="text-[10px] text-slate-400">
                                                            {note.created_by}
                                                        </p>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-slate-300 hover:text-amber-600 hover:bg-amber-50"
                                                onClick={() => startEditing(note)}
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                onClick={() => handleDelete(note.id)}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    )
}
