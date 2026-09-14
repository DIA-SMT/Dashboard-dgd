'use client'

import Image from 'next/image'
import './navbar.css'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { Button } from '@/components/ui/button'
import { UserTasksPanel } from '@/components/user-tasks-panel'
import { LogOut, User as UserIcon, Moon, Sun, ClipboardList, Settings, BarChart3 } from 'lucide-react'

import Link from 'next/link'

export function Navbar() {
    const { user, role, signOut } = useAuth()
    const { theme, toggleTheme } = useTheme()
    const router = useRouter()
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
    const [isTasksPanelOpen, setIsTasksPanelOpen] = useState(false) // New state

    const handleSignOut = async () => {
        await signOut()
        router.refresh()
        router.push('/login')
    }

    return (
        <>
            <nav className="navbar relative">
                <div className="navbar-container flex items-center justify-between w-full">
                    <div className="navbar-logo">
                        <Image
                            src="/Logo_SMT_blanco.png" /*logo pedido por ellos */
                            alt="Logo Municipalidad de San Miguel de Tucumán"
                            width={200}
                            height={200}
                            className="logo-muni"
                            priority
                            unoptimized
                        />
                        {/* Replica el membrete institucional: el logo del municipio y,
                            separada por una barra, la dependencia. */}
                        <span className="navbar-divisor" aria-hidden="true" />
                        <span className="navbar-dependencia">
                            <span className="navbar-dependencia-linea1">Dirección de</span>
                            <span className="navbar-dependencia-linea2">Gerencia de Datos</span>
                        </span>
                    </div>

                    {user && (
                        <>
                            {/* Desktop View */}
                            <div className="hidden lg:flex items-center gap-4">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsTasksPanelOpen(true)}
                                    className="text-white hover:text-white/80 hover:bg-white/10"
                                >
                                    <ClipboardList className="h-4 w-4 mr-2" />
                                    Mis Tareas
                                </Button>
                                <Link
                                    href="/indicadores"
                                    className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                                >
                                    <BarChart3 className="h-4 w-4" />
                                    Indicadores
                                </Link>
                                {role === 'admin' && (
                                    <Link
                                        href="/configuracion"
                                        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                                    >
                                        <Settings className="h-4 w-4" />
                                        Configuración
                                    </Link>
                                )}
                                <Link href="/profile" className="flex items-center gap-2 text-white hover:text-white/80 transition-colors">
                                    <UserIcon className="h-4 w-4" />
                                    <span className="text-sm font-medium">{user.email}</span>
                                </Link>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={toggleTheme}
                                    className="text-white hover:text-white/80 hover:bg-white/10 transition-all"
                                    title={theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
                                >
                                    {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleSignOut}
                                    className="text-white hover:text-white/80 hover:bg-white/10"
                                >
                                    <LogOut className="h-4 w-4 mr-2" />
                                    Salir
                                </Button>
                            </div>

                            {/* Mobile View */}
                            <div className="lg:hidden flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setIsTasksPanelOpen(true)}
                                    className="text-white hover:text-white/80 hover:bg-white/10"
                                >
                                    <ClipboardList className="h-6 w-6" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                                    className="text-white hover:text-white/80 hover:bg-white/10"
                                >
                                    <UserIcon className="h-6 w-6" />
                                </Button>
                            </div>

                            {/* Mobile Menu Dropdown */}
                            {isMobileMenuOpen && (
                                <div className="absolute top-[80px] right-0 left-0 bg-[#1f89f6] border-t border-white/20 p-4 lg:hidden shadow-lg z-50 flex flex-col items-center gap-4 animate-in slide-in-from-top-2">
                                    <Link
                                        href="/profile"
                                        className="flex items-center gap-2 text-white hover:text-white/80 transition-colors p-2"
                                        onClick={() => setIsMobileMenuOpen(false)}
                                    >
                                        <UserIcon className="h-4 w-4" />
                                        <span className="text-sm font-medium">{user.email}</span>
                                    </Link>
                                    <Link
                                        href="/indicadores"
                                        className="flex items-center gap-2 p-2 text-white transition-colors hover:text-white/80"
                                        onClick={() => setIsMobileMenuOpen(false)}
                                    >
                                        <BarChart3 className="h-4 w-4" />
                                        <span className="text-sm font-medium">Indicadores</span>
                                    </Link>
                                    {role === 'admin' && (
                                        <Link
                                            href="/configuracion"
                                            className="flex items-center gap-2 p-2 text-white transition-colors hover:text-white/80"
                                            onClick={() => setIsMobileMenuOpen(false)}
                                        >
                                            <Settings className="h-4 w-4" />
                                            <span className="text-sm font-medium">Configuración</span>
                                        </Link>
                                    )}
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => {
                                            toggleTheme()
                                            setIsMobileMenuOpen(false)
                                        }}
                                        className="w-full max-w-xs flex items-center justify-center gap-2"
                                    >
                                        {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                                        {theme === 'light' ? 'Modo Oscuro' : 'Modo Claro'}
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={handleSignOut}
                                        className="w-full max-w-xs"
                                    >
                                        <LogOut className="h-4 w-4 mr-2" />
                                        Salir
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </nav>
            <UserTasksPanel isOpen={isTasksPanelOpen} onClose={() => setIsTasksPanelOpen(false)} />
        </>
    )
}
