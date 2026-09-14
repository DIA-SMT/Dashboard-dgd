'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2 } from 'lucide-react'

export default function ResetPasswordPage() {
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [validSession, setValidSession] = useState<boolean | null>(null)
    const router = useRouter()

    useEffect(() => {
        const checkSession = async () => {
            // El callback del servidor (/api/auth/callback) ya debió haber intercambiado el código
            // y establecido la cookie de sesión. Aquí solo verificamos que exista.
            const { data: { session } } = await supabase.auth.getSession()

            if (session) {
                setValidSession(true)
            } else {
                // Si llegamos aquí sin sesión, algo falló en el callback o el link expiró
                // Intentamos una última verificación por si acaso es hash legacy
                const hashParams = new URLSearchParams(window.location.hash.substring(1))
                if (hashParams.get('type') === 'recovery' && hashParams.get('access_token')) {
                    setValidSession(true)
                } else {
                    setValidSession(false)
                }
            }
        }

        checkSession()
    }, [])

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden')
            setLoading(false)
            return
        }

        if (password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres')
            setLoading(false)
            return
        }

        try {
            const { error } = await supabase.auth.updateUser({
                password: password
            })

            if (error) throw error

            setSuccess(true)

            // Redirigir al login después de 2 segundos
            setTimeout(() => {
                router.push('/login')
            }, 2000)
        } catch (error: any) {
            console.error('Error resetting password:', error)
            setError(error.message || 'Error al restablecer la contraseña')
        } finally {
            setLoading(false)
        }
    }

    if (validSession === null) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
                <Card className="w-full max-w-sm">
                    <CardContent className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin" />
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (validSession === false) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
                <Card className="w-full max-w-sm">
                    <CardHeader>
                        <CardTitle className="text-2xl">Enlace Inválido</CardTitle>
                        <CardDescription>
                            No se pudo verificar tu sesión o el enlace ha expirado.
                        </CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Button
                            className="w-full bg-[#1f89f6] hover:bg-[#1877d2]"
                            onClick={() => router.push('/forgot-password')}
                        >
                            Solicitar nuevo enlace
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        )
    }

    return (
        <div className="flex h-screen w-full items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle className="text-2xl">Nueva Contraseña</CardTitle>
                    <CardDescription>
                        Ingresa tu nueva contraseña para tu cuenta.
                    </CardDescription>
                </CardHeader>

                {success ? (
                    <CardContent className="space-y-4">
                        <Alert className="bg-green-50 text-green-900 border-green-200">
                            <CheckCircle2 className="h-4 w-4" />
                            <AlertDescription>
                                <strong>¡Contraseña actualizada!</strong>
                                <br />
                                Serás redirigido al inicio de sesión en un momento...
                            </AlertDescription>
                        </Alert>
                    </CardContent>
                ) : (
                    <form onSubmit={handleResetPassword}>
                        <CardContent className="grid gap-4">
                            {error && (
                                <Alert variant="destructive">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}
                            <div className="grid gap-2">
                                <Label htmlFor="password">Nueva Contraseña</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Mínimo 8 caracteres"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="confirm-password">Confirmar Contraseña</Label>
                                <Input
                                    id="confirm-password"
                                    type="password"
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirma tu contraseña"
                                />
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button className="w-full bg-[#1f89f6] hover:bg-[#1877d2]" type="submit" disabled={loading}>
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Actualizando...
                                    </>
                                ) : (
                                    'Restablecer Contraseña'
                                )}
                            </Button>
                        </CardFooter>
                    </form>
                )}
            </Card>
        </div>
    )
}
