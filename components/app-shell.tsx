'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { UserTasksPanel } from '@/components/user-tasks-panel'
import {
    FolderKanban, ClipboardList, Users, BarChart3, Settings,
    LogOut, Moon, Sun, User as UserIcon, ChevronRight, Menu, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { iniciales, tonoAvatar } from '@/lib/ui'

/**
 * Rutas que se dibujan solas, sin el armazón.
 *
 * Son las de fuera de sesión: mostrar el menú lateral a alguien que todavía no
 * entró sería ofrecerle navegación que no puede usar.
 */
const SIN_ARMAZON = ['/login', '/cambiar-password', '/forgot-password', '/reset-password', '/auth']

type Item = {
    etiqueta: string
    href: string
    icono: LucideIcon
    soloAdmin?: boolean
}

const NAVEGACION: Item[] = [
    { etiqueta: 'Proyectos', href: '/', icono: FolderKanban },
    { etiqueta: 'Asignaciones', href: '/assignments', icono: ClipboardList },
    { etiqueta: 'Miembros', href: '/members', icono: Users },
    { etiqueta: 'Indicadores', href: '/indicadores', icono: BarChart3 },
    { etiqueta: 'Configuración', href: '/configuracion', icono: Settings, soloAdmin: true },
]

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const router = useRouter()
    const { user, role, signOut } = useAuth()
    const { theme, toggleTheme } = useTheme()

    const [menuAbierto, setMenuAbierto] = useState(false)
    const [panelTareas, setPanelTareas] = useState(false)
    const [menuUsuario, setMenuUsuario] = useState(false)

    const sinArmazon = SIN_ARMAZON.some(r => pathname === r || pathname.startsWith(r + '/'))
    if (sinArmazon || !user) {
        return <>{children}</>
    }

    const visibles = NAVEGACION.filter(i => !i.soloAdmin || role === 'admin')
    const nombre = (user.user_metadata?.full_name as string) || user.email || ''

    const esActivo = (href: string) =>
        href === '/' ? pathname === '/' || pathname.startsWith('/projects') : pathname.startsWith(href)

    async function salir() {
        await signOut()
        router.refresh()
        router.push('/login')
    }

    const barraLateral = (
        <div className="flex h-full flex-col bg-white dark:bg-slate-900">
            {/* Membrete: el logo del municipio y la dependencia, como en el papel. */}
            <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
                <Image
                    src="/Logo_SMT_neg_4.png"
                    alt="Municipalidad de San Miguel de Tucumán"
                    width={120}
                    height={120}
                    className="h-9 w-auto shrink-0 object-contain"
                    unoptimized
                />
                <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-[10px] uppercase tracking-wide text-slate-400">Dirección de</span>
                    <span className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                        Gerencia de Datos
                    </span>
                </span>
            </div>

            <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
                {visibles.map(({ etiqueta, href, icono: Icono }) => {
                    const activo = esActivo(href)
                    return (
                        <Link
                            key={href}
                            href={href}
                            onClick={() => setMenuAbierto(false)}
                            aria-current={activo ? 'page' : undefined}
                            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                                activo
                                    ? 'bg-[#0065ff]/10 font-medium text-[#0065ff]'
                                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                            }`}
                        >
                            <Icono className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
                            {etiqueta}
                        </Link>
                    )
                })}

                {/* Mis Tareas abre un panel, no una página: por eso es botón. */}
                <button
                    onClick={() => { setPanelTareas(true); setMenuAbierto(false) }}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                    <ClipboardList className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
                    Mis Tareas
                </button>
            </nav>

            {/* Bloque de usuario */}
            <div className="relative border-t border-slate-200 p-3 dark:border-slate-800">
                {menuUsuario && (
                    <div className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                        <Link
                            href="/profile"
                            onClick={() => { setMenuUsuario(false); setMenuAbierto(false) }}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                            <UserIcon className="h-4 w-4" />
                            Mi perfil
                        </Link>
                        <button
                            onClick={() => { toggleTheme(); setMenuUsuario(false) }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                            {theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
                        </button>
                        <button
                            onClick={salir}
                            className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:border-slate-700 dark:hover:bg-red-950/40"
                        >
                            <LogOut className="h-4 w-4" />
                            Cerrar sesión
                        </button>
                    </div>
                )}

                <button
                    onClick={() => setMenuUsuario(!menuUsuario)}
                    aria-expanded={menuUsuario}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tonoAvatar(nombre)}`}>
                        {iniciales(nombre)}
                    </span>
                    <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
                            {nombre.split('@')[0]}
                        </span>
                        <span className="truncate text-[11px] text-slate-400">
                            {role === 'admin' ? 'Administrador' : 'Usuario'}
                        </span>
                    </span>
                    <ChevronRight className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${menuUsuario ? '-rotate-90' : ''}`} />
                </button>
            </div>
        </div>
    )

    return (
        <div className="min-h-screen bg-[#f6f8fb] dark:bg-slate-950">
            {/* Barra lateral fija, desde 1024px. */}
            <aside className="fixed inset-y-0 left-0 z-40 hidden w-[228px] border-r border-slate-200 lg:block dark:border-slate-800">
                {barraLateral}
            </aside>

            {/* Cabecera de celular: el menú lateral pasa a ser un cajón. */}
            <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden dark:border-slate-800 dark:bg-slate-900">
                <button
                    onClick={() => setMenuAbierto(true)}
                    aria-label="Abrir menú"
                    className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                    <Menu className="h-5 w-5" />
                </button>
                <Image
                    src="/Logo_SMT_neg_4.png"
                    alt="Municipalidad de San Miguel de Tucumán"
                    width={120} height={120}
                    className="h-7 w-auto object-contain"
                    unoptimized
                />
                <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">Gerencia de Datos</span>
            </header>

            {menuAbierto && (
                <>
                    <div
                        className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
                        onClick={() => setMenuAbierto(false)}
                        aria-hidden="true"
                    />
                    <aside className="fixed inset-y-0 left-0 z-50 w-[260px] border-r border-slate-200 lg:hidden dark:border-slate-800">
                        <button
                            onClick={() => setMenuAbierto(false)}
                            aria-label="Cerrar menú"
                            className="absolute right-2 top-3 z-10 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                            <X className="h-4 w-4" />
                        </button>
                        {barraLateral}
                    </aside>
                </>
            )}

            <main className="lg:pl-[228px]">{children}</main>

            <UserTasksPanel isOpen={panelTareas} onClose={() => setPanelTareas(false)} />
        </div>
    )
}
