'use client'

import { useState, useSyncExternalStore } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import {
    FolderKanban, ListChecks, Users, BarChart3, Settings,
    LogOut, Moon, Sun, User as UserIcon, ChevronRight,
    Menu, X, PanelLeftClose, PanelLeftOpen,
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

const CLAVE_COLAPSO = 'dgd:sidebar-colapsado'
const ANCHO_ABIERTO = 240
const ANCHO_CERRADO = 68

/**
 * Estado del menú plegado, guardado en el navegador.
 *
 * Vive fuera de React y se lee con useSyncExternalStore porque en el servidor
 * no hay localStorage: si se aplicara durante el render, el HTML del servidor y
 * el del cliente no coincidirían. El servidor siempre dibuja el menú abierto y
 * el navegador corrige apenas hidrata.
 */
let colapsadoEnMemoria: boolean | null = null
const oyentesColapso = new Set<() => void>()

function leerColapso(): boolean {
    if (colapsadoEnMemoria === null) {
        try {
            colapsadoEnMemoria = localStorage.getItem(CLAVE_COLAPSO) === '1'
        } catch {
            colapsadoEnMemoria = false // modo privado o almacenamiento bloqueado
        }
    }
    return colapsadoEnMemoria
}

function escribirColapso(valor: boolean) {
    colapsadoEnMemoria = valor
    try { localStorage.setItem(CLAVE_COLAPSO, valor ? '1' : '0') } catch { }
    oyentesColapso.forEach(avisar => avisar())
}

function suscribirColapso(avisar: () => void) {
    oyentesColapso.add(avisar)
    return () => { oyentesColapso.delete(avisar) }
}

type Item = { etiqueta: string; href: string; icono: LucideIcon; soloAdmin?: boolean }

const NAVEGACION: Item[] = [
    { etiqueta: 'Proyectos', href: '/', icono: FolderKanban },
    { etiqueta: 'Tareas', href: '/tareas', icono: ListChecks },
    { etiqueta: 'Asignaciones', href: '/assignments', icono: Users },
    { etiqueta: 'Miembros', href: '/members', icono: UserIcon },
    { etiqueta: 'Indicadores', href: '/indicadores', icono: BarChart3 },
    { etiqueta: 'Configuración', href: '/configuracion', icono: Settings, soloAdmin: true },
]

/** `compacto` sólo aplica al panel fijo; en el cajón de celular siempre va completo. */
type PropsBarra = {
    compacto: boolean
    visibles: Item[]
    esActivo: (href: string) => boolean
    alNavegar: () => void
    nombre: string
    role: string | null
    menuUsuario: boolean
    setMenuUsuario: (v: boolean) => void
    theme: string
    toggleTheme: () => void
    salir: () => void
}

function BarraLateral({
    compacto, visibles, esActivo, alNavegar, nombre, role,
    menuUsuario, setMenuUsuario, theme, toggleTheme, salir,
}: PropsBarra) {
    return (
        <div className="flex h-full flex-col bg-white dark:bg-slate-900">
            {/* Membrete. Con el menú desplegado el logo va arriba y el nombre
                debajo, en dos renglones completos: puesto al lado, "Gerencia
                de Datos" no entraba y quedaba cortado. */}
            <div className={`border-b border-slate-200 dark:border-slate-800 ${compacto ? 'px-2 py-3' : 'px-4 py-4'}`}>
                {compacto ? (
                    <Image
                        src="/Logo_SMT_neg_4.png"
                        alt="Municipalidad de San Miguel de Tucumán"
                        width={120} height={120}
                        title="Dirección de Gerencia de Datos"
                        className="mx-auto h-8 w-auto object-contain"
                        unoptimized
                    />
                ) : (
                    <>
                        <Image
                            src="/Logo_SMT_neg_4.png"
                            alt="Municipalidad de San Miguel de Tucumán"
                            width={160} height={160}
                            className="mb-2 h-9 w-auto object-contain"
                            unoptimized
                        />
                        <p className="text-[10px] uppercase leading-none tracking-wide text-slate-400">
                            Dirección de
                        </p>
                        <p className="mt-0.5 text-sm font-semibold leading-tight text-slate-800 dark:text-slate-100">
                            Gerencia de Datos
                        </p>
                    </>
                )}
            </div>

            <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2.5">
                {visibles.map(({ etiqueta, href, icono: Icono }) => {
                    const activo = esActivo(href)
                    return (
                        <Link
                            key={href}
                            href={href}
                            onClick={() => alNavegar()}
                            aria-current={activo ? 'page' : undefined}
                            title={compacto ? etiqueta : undefined}
                            className={`flex items-center gap-2.5 rounded-lg py-2 text-sm transition-colors ${
                                compacto ? 'justify-center px-2' : 'px-3'
                            } ${
                                activo
                                    ? 'bg-[#0065ff]/10 font-medium text-[#0065ff]'
                                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                            }`}
                        >
                            <Icono className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
                            {!compacto && etiqueta}
                        </Link>
                    )
                })}
            </nav>

            <div className="relative border-t border-slate-200 p-2.5 dark:border-slate-800">
                {menuUsuario && (
                    <div className={`absolute bottom-full mb-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800 ${
                        compacto ? 'left-2 w-44' : 'left-2.5 right-2.5'
                    }`}>
                        <Link
                            href="/profile"
                            onClick={() => { setMenuUsuario(false); alNavegar() }}
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
                    title={compacto ? nombre : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-lg py-2 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${
                        compacto ? 'justify-center px-1' : 'px-2'
                    }`}
                >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tonoAvatar(nombre)}`}>
                        {iniciales(nombre)}
                    </span>
                    {!compacto && (
                        <>
                            <span className="flex min-w-0 flex-col leading-tight">
                                <span className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
                                    {nombre.split('@')[0]}
                                </span>
                                <span className="truncate text-[11px] text-slate-400">
                                    {role === 'admin' ? 'Administrador' : 'Usuario'}
                                </span>
                            </span>
                            <ChevronRight className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${menuUsuario ? '-rotate-90' : ''}`} />
                        </>
                    )}
                </button>
            </div>
        </div>
    )
}

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const router = useRouter()
    const { user, role, signOut } = useAuth()
    const { theme, toggleTheme } = useTheme()

    const [cajonAbierto, setCajonAbierto] = useState(false)
    const [menuUsuario, setMenuUsuario] = useState(false)
    const colapsado = useSyncExternalStore(suscribirColapso, leerColapso, () => false)

    const sinArmazon = SIN_ARMAZON.some(r => pathname === r || pathname.startsWith(r + '/'))
    if (sinArmazon || !user) return <>{children}</>

    const visibles = NAVEGACION.filter(i => !i.soloAdmin || role === 'admin')
    const nombre = (user.user_metadata?.full_name as string) || user.email || ''

    const esActivo = (href: string) =>
        href === '/' ? pathname === '/' || pathname.startsWith('/projects') : pathname.startsWith(href)

    async function salir() {
        await signOut()
        router.refresh()
        router.push('/login')
    }

    const propsBarra = {
        visibles, esActivo, nombre, role, menuUsuario, setMenuUsuario, theme, toggleTheme, salir,
        alNavegar: () => setCajonAbierto(false),
    }

    const ancho = colapsado ? ANCHO_CERRADO : ANCHO_ABIERTO

    return (
        <div className="min-h-screen bg-[#f6f8fb] dark:bg-slate-950">
            <aside
                className="fixed inset-y-0 left-0 z-40 hidden border-r border-slate-200 transition-[width] duration-200 lg:block dark:border-slate-800"
                style={{ width: ancho }}
            >
                <BarraLateral compacto={colapsado} {...propsBarra} />

                {/* El tirador vive sobre el borde, para no robarle lugar al menú
                    ni desaparecer cuando está colapsado. */}
                <button
                    onClick={() => escribirColapso(!colapsado)}
                    aria-label={colapsado ? 'Expandir el menú' : 'Colapsar el menú'}
                    title={colapsado ? 'Expandir el menú' : 'Colapsar el menú'}
                    className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:text-[#0065ff] dark:border-slate-700 dark:bg-slate-800"
                >
                    {colapsado ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
                </button>
            </aside>

            <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden dark:border-slate-800 dark:bg-slate-900">
                <button
                    onClick={() => setCajonAbierto(true)}
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

            {cajonAbierto && (
                <>
                    <div
                        className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
                        onClick={() => setCajonAbierto(false)}
                        aria-hidden="true"
                    />
                    <aside className="fixed inset-y-0 left-0 z-50 w-[260px] border-r border-slate-200 lg:hidden dark:border-slate-800">
                        <button
                            onClick={() => setCajonAbierto(false)}
                            aria-label="Cerrar menú"
                            className="absolute right-2 top-3 z-10 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                            <X className="h-4 w-4" />
                        </button>
                        <BarraLateral compacto={false} {...propsBarra} />
                    </aside>
                </>
            )}

            <main className="transition-[padding] duration-200 lg:pl-[var(--ancho-menu)]" style={{ ['--ancho-menu' as string]: `${ancho}px` }}>
                {children}
            </main>
        </div>
    )
}
