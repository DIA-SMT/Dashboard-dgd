'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { CheckCircle2 } from 'lucide-react'

export function TaskCompletionModal({
    taskTitle,
    existingNotes,
    isOpen,
    onClose,
    onConfirm
}: {
    taskTitle: string
    existingNotes: string | null
    isOpen: boolean
    onClose: () => void
    onConfirm: (notes: string) => void
}) {
    const [notes, setNotes] = useState(existingNotes || '')
    const [loading, setLoading] = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        try {
            await onConfirm(notes)
            onClose()
        } catch (error) {
            console.error('Error in task completion modal:', error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <CheckCircle2 className="w-6 h-6 text-green-600" />
                        <DialogTitle className="text-xl">Finalizar Tarea</DialogTitle>
                    </div>
                    <p className="text-slate-600 font-medium">
                        {taskTitle}
                    </p>
                    <p className="text-sm text-slate-500">
                        ¿Quieres agregar alguna nota o comentario final sobre esta tarea? (Opcional)
                    </p>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="notes">Notas / Comentario</Label>
                        <Textarea
                            id="notes"
                            placeholder="Ej: Archivos subidos, ajustes realizados..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                        />
                    </div>
                    <div className="flex gap-2 justify-end mt-4">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700">
                            {loading ? 'Guardando...' : 'Confirmar Finalización'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
