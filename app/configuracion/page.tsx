'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { UsersAdminView } from '@/components/users-admin-view'
import { ArrowLeft, Settings, Loader2 } from 'lucide-react'

export default function ConfiguracionPage() {
    const router = useRouter()
    const { role, loading } = useAuth()

    // Guarda del lado del cliente. La de verdad está en la API: cada endpoint
    // de /api/admin verifica el rol contra la base, así que entrar a esta URL
    // sin ser admin no alcanza para hacer nada.
    //
    // El `role === null` no es cosmético: en una carga directa de esta URL,
    // AuthContext apaga `loading` desde el listener de onAuthStateChange antes
    // de que la consulta del perfil haya devuelto el rol. Sin esta guarda, un
    // admin que entra por favorito o refresca la página se expulsa a sí mismo.
    // Que haya sesión ya lo garantizó el middleware, así que esperar a que el
    // rol resuelva no deja a nadie colgado.
    useEffect(() => {
        if (loading || role === null) return
        if (role !== 'admin') router.replace('/')
    }, [loading, role, router])

    if (loading || role === null || role !== 'admin') {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
        )
    }

    return (
        <div className="container mx-auto max-w-6xl px-4 py-8">
            <Button variant="ghost" onClick={() => router.push('/')} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver a proyectos
            </Button>

            <div className="mb-8 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0065ff]/10">
                    <Settings className="h-5 w-5 text-[#0065ff]" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Configuración</h1>
                    <p className="text-sm text-slate-500">Administración del sistema</p>
                </div>
            </div>

            <UsersAdminView />
        </div>
    )
}
