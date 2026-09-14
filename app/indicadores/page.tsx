'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { IndicadoresView } from '@/components/indicadores-view'
import { ArrowLeft, BarChart3 } from 'lucide-react'

export default function IndicadoresPage() {
    const router = useRouter()

    return (
        <div className="container mx-auto max-w-6xl px-4 py-8">
            <Button variant="ghost" onClick={() => router.push('/')} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver a proyectos
            </Button>

            <div className="mb-8 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0065ff]/10">
                    <BarChart3 className="h-5 w-5 text-[#0065ff]" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Indicadores</h1>
                    <p className="text-sm text-slate-500">Cumplimiento y productividad del equipo</p>
                </div>
            </div>

            <IndicadoresView />
        </div>
    )
}
