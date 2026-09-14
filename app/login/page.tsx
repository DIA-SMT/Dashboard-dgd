'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()

    // Relay para códigos de sesión que caen aquí por redirecciones de Supabase no autorizadas
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search)
        const code = urlParams.get('code')
        const type = urlParams.get('type')
        const nextParam = urlParams.get('next')

        if (code) {
            // Redirigir al callback oficial para procesar el código
            const callbackUrl = new URL('/api/auth/callback', window.location.origin)
            callbackUrl.searchParams.set('code', code)

            // Determinamos el destino
            // Si hay un 'next' explícito, lo usamos.
            // Si es tipo 'recovery' o no sabemos el tipo pero hay código en login, 
            // asumimos recuperación para que el usuario pueda cambiar su contraseña.
            let next = nextParam
            if (!next || next === '/') {
                next = (type === 'recovery' || !type) ? '/reset-password' : '/'
            }

            callbackUrl.searchParams.set('next', next)
            if (type) callbackUrl.searchParams.set('type', type)

            router.replace(callbackUrl.pathname + callbackUrl.search)
        }
    }, [router])

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (error) {
                throw error
            }

            router.refresh()
            router.push('/')
        } catch (err: any) {
            setError(err.message || 'Ha ocurrido un error al iniciar sesión')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex h-screen w-full items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle className="text-2xl">Iniciar Sesión</CardTitle>
                    <CardDescription>
                        Ingrese sus credenciales para acceder al dashboard.
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
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
                        <div className="grid gap-2">
                            <Label htmlFor="password">Contraseña</Label>
                            <Input
                                id="password"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-2">
                        <Button className="w-full bg-[#1f89f6] hover:bg-[#1877d2]" type="submit" disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Conectando...
                                </>
                            ) : (
                                'Ingresar'
                            )}
                        </Button>
                        <div className="text-center text-sm text-gray-500 dark:text-gray-400">
                            <a href="/forgot-password" className="text-[#1f89f6] hover:underline">
                                ¿Olvidaste tu contraseña?
                            </a>
                        </div>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
