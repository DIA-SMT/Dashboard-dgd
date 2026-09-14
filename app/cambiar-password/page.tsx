'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, KeyRound, AlertCircle } from 'lucide-react'
import { validarPassword, REQUISITOS_PASSWORD } from '@/lib/password'

/**
 * Cambio de contraseña del primer ingreso.
 *
 * A esta pantalla llega quien tiene `must_change_password` en true: o bien
 * recién lo dio de alta un admin, o bien un admin le reseteó la clave. En los
 * dos casos la contraseña actual la conocen dos personas, así que no puede
 * quedar en uso. El middleware redirige acá y no deja salir hasta que se
 * cambie.
 */
export default function CambiarPasswordPage() {
    const router = useRouter()
    const { user, loading: authLoading, mustChangePassword, refreshProfile } = useAuth()

    const [password, setPassword] = useState('')
    const [confirmacion, setConfirmacion] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [listo, setListo] = useState(false)

    // Si alguien entra a mano a esta URL sin tenerla pendiente, no tiene nada
    // que hacer acá.
    useEffect(() => {
        if (!authLoading && user && !mustChangePassword && !listo) {
            router.replace('/')
        }
    }, [authLoading, user, mustChangePassword, listo, router])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        const errorPassword = validarPassword(password)
        if (errorPassword) {
            setError(errorPassword)
            return
        }
        if (password !== confirmacion) {
            setError('Las dos contraseñas no coinciden')
            return
        }

        setLoading(true)
        try {
            const { error: updateError } = await supabase.auth.updateUser({ password })
            if (updateError) {
                // Supabase rechaza reusar la contraseña actual cuando esa
                // política está activada en el proyecto.
                throw new Error(
                    /same|different from the old/i.test(updateError.message)
                        ? 'La contraseña nueva tiene que ser distinta de la actual'
                        : updateError.message
                )
            }

            if (!user) throw new Error('Se perdió la sesión. Volvé a iniciar sesión.')

            const { error: perfilError } = await supabase
                .from('profiles')
                .update({ must_change_password: false })
                .eq('id', user.id)
            if (perfilError) throw perfilError

            setListo(true)
            await refreshProfile()
            setTimeout(() => router.replace('/'), 1500)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña')
        } finally {
            setLoading(false)
        }
    }

    if (authLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
        )
    }

    return (
        <div className="flex min-h-[80vh] w-full items-center justify-center bg-gray-50 px-4 py-10 dark:bg-gray-900">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#0065ff]/10">
                        <KeyRound className="h-5 w-5 text-[#0065ff]" />
                    </div>
                    <CardTitle className="text-2xl">Elegí tu contraseña</CardTitle>
                    <CardDescription>
                        Tu cuenta se creó con una contraseña provisoria. Para seguir, definí una
                        nueva que sólo conozcas vos.
                    </CardDescription>
                </CardHeader>

                {listo ? (
                    <CardContent>
                        <Alert className="border-green-200 bg-green-50 text-green-900">
                            <CheckCircle2 className="h-4 w-4" />
                            <AlertDescription>
                                <strong>Contraseña actualizada.</strong>
                                <br />
                                Te llevamos al dashboard...
                            </AlertDescription>
                        </Alert>
                    </CardContent>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="password">Contraseña nueva</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    autoComplete="new-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="confirmacion">Repetir contraseña</Label>
                                <Input
                                    id="confirmacion"
                                    type="password"
                                    autoComplete="new-password"
                                    value={confirmacion}
                                    onChange={(e) => setConfirmacion(e.target.value)}
                                    required
                                />
                            </div>

                            <ul className="space-y-1 text-xs text-slate-500">
                                {REQUISITOS_PASSWORD.map((r) => (
                                    <li key={r} className="flex items-center gap-1.5">
                                        <span className="h-1 w-1 rounded-full bg-slate-400" />
                                        {r}
                                    </li>
                                ))}
                            </ul>

                            {error && (
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            <Button
                                type="submit"
                                className="w-full bg-[#0065ff] hover:bg-[#0052cc]"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    'Guardar y continuar'
                                )}
                            </Button>
                        </CardContent>
                    </form>
                )}
            </Card>
        </div>
    )
}
