'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const router = useRouter()

    const handleResetRequest = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        setSuccess(false)

        try {
            // Usamos una URL de redirección simple para máxima compatibilidad con el whitelist de Supabase
            // El 'relay' que pusimos en login y el callback se encargarán del resto
            const redirectTo = `${window.location.origin}/api/auth/callback?next=/reset-password`

            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo,
            })

            if (error) {
                throw error
            }

            setSuccess(true)
            setEmail('')
        } catch (err: any) {
            setError(err.message || 'Ha ocurrido un error al enviar el correo')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex h-screen w-full items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle className="text-2xl">Recuperar Contraseña</CardTitle>
                    <CardDescription>
                        Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
                    </CardDescription>
                </CardHeader>

                {success ? (
                    <CardContent className="space-y-4">
                        <Alert className="bg-green-50 text-green-900 border-green-200">
                            <CheckCircle2 className="h-4 w-4" />
                            <AlertDescription>
                                <strong>¡Correo enviado!</strong>
                                <br />
                                Revisa tu bandeja de entrada y haz clic en el enlace para restablecer tu contraseña.
                            </AlertDescription>
                        </Alert>
                        <Link href="/login" className="block">
                            <Button variant="outline" className="w-full">
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Volver al inicio de sesión
                            </Button>
                        </Link>
                    </CardContent>
                ) : (
                    <form onSubmit={handleResetRequest}>
                        <CardContent className="grid gap-4">
                            {error && (
                                <Alert variant="destructive">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}
                            <div className="grid gap-2">
                                <Label htmlFor="email">Correo Electrónico</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="m@example.com"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        </CardContent>
                        <CardFooter className="flex flex-col gap-2">
                            <Button className="w-full bg-[#1f89f6] hover:bg-[#1877d2]" type="submit" disabled={loading}>
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Enviando..
                                    </>
                                ) : (
                                    'Enviar enlace de recuperación'
                                )}
                            </Button>
                            <Link href="/login" className="w-full">
                                <Button variant="ghost" className="w-full" type="button">
                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                    Volver al inicio de sesión
                                </Button>
                            </Link>
                        </CardFooter>
                    </form>
                )}
            </Card>
        </div>
    )
}
