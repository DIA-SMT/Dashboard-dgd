'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { PartyPopper } from 'lucide-react'

export function ProjectCompletionModal({
    projectId,
    onClose
}: {
    projectId: string
    onClose: () => void
}) {
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        completion_analysis: '',
        upload_link: ''
    })

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        try {
            const { error } = await supabase
                .from('projects')
                .update({
                    completion_analysis: formData.completion_analysis || null,
                    upload_link: formData.upload_link || null,
                    completed_at: new Date().toISOString(),
                    status: 'Completado'
                })
                .eq('id', projectId)

            if (error) throw error

            onClose()
        } catch (error) {
            console.error('Error completing project:', error)
            alert('Error al completar el proyecto')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <PartyPopper className="w-8 h-8 text-green-600" />
                        <DialogTitle className="text-2xl">¡Proyecto Completado!</DialogTitle>
                    </div>
                    <p className="text-slate-600">
                        Todas las tareas han sido completadas. Agrega un análisis final y el enlace donde se subió el proyecto.
                    </p>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="analysis">Análisis de Finalización</Label>
                        <Textarea
                            id="analysis"
                            placeholder="Describe el resultado del proyecto, aprendizajes, etc..."
                            value={formData.completion_analysis}
                            onChange={(e) => setFormData({ ...formData, completion_analysis: e.target.value })}
                            rows={4}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="link">Enlace del Proyecto (Drive, etc.)</Label>
                        <Input
                            id="link"
                            type="url"
                            placeholder="https://drive.google.com/..."
                            value={formData.upload_link}
                            onChange={(e) => setFormData({ ...formData, upload_link: e.target.value })}
                        />
                    </div>
                    <div className="flex gap-2 justify-end mt-4">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Guardando...' : 'Marcar como Completado'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
