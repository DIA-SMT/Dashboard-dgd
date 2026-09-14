'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, ArrowLeft } from 'lucide-react'

export default function ProfilePage() {
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
    const router = useRouter()

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setMessage(null)

        if (password !== confirmPassword) {
            setMessage({ type: 'error', text: 'Las contraseñas no coinciden' })
            setLoading(false)
            return
        }

        if (password.length < 6) {
            setMessage({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres' })
            setLoading(false)
            return
        }

        try {
            const { error } = await supabase.auth.updateUser({
                password: password
            })

            if (error) throw error

            setMessage({ type: 'success', text: 'Contraseña actualizada exitosamente' })
            setPassword('')
            setConfirmPassword('')
        } catch (error: any) {
            console.error('Error updating password:', error)
            setMessage({ type: 'error', text: error.message || 'Error al actualizar la contraseña' })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-7xl mx-auto">
                <Button
                    variant="ghost"
                    onClick={() => router.back()}
                    className="mb-4"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Volver
                </Button>

                <div className="flex items-center justify-center py-12">
                    <div className="w-full max-w-md space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Perfil de Usuario</CardTitle>
                                <CardDescription>
                                    Administra tu cuenta y seguridad
                                </CardDescription>
                            </CardHeader>
                            <form onSubmit={handleUpdatePassword}>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <h3 className="text-lg font-medium">Cambiar Contraseña</h3>
                                        <p className="text-sm text-slate-500">
                                            Ingresa tu nueva contraseña para actualizarla.
                                        </p>
                                    </div>

                                    {message && (
                                        <Alert variant={message.type === 'error' ? 'destructive' : 'default'} className={message.type === 'success' ? 'bg-green-50 text-green-900 border-green-200' : ''}>
                                            <AlertDescription>
                                                {message.text}
                                            </AlertDescription>
                                        </Alert>
                                    )}

                                    <div className="space-y-2">
                                        <Label htmlFor="new-password">Nueva Contraseña</Label>
                                        <Input
                                            id="new-password"
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="confirm-password">Confirmar Contraseña</Label>
                                        <Input
                                            id="confirm-password"
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                </CardContent>
                                <CardFooter>
                                    <Button type="submit" className="w-full mt-4 bg-[#1f89f6] hover:bg-[#1877d2]" disabled={loading}>
                                        {loading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Actualizando...
                                            </>
                                        ) : (
                                            'Actualizar Contraseña'
                                        )}
                                    </Button>
                                </CardFooter>
                            </form>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    )
}
