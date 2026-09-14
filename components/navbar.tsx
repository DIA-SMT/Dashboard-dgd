'use client'

import Image from 'next/image'
import './navbar.css'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { Button } from '@/components/ui/button'
import { UserTasksPanel } from '@/components/user-tasks-panel'
import { LogOut, User as UserIcon, Moon, Sun, ClipboardList } from 'lucide-react'

import Link from 'next/link'

export function Navbar() {
    const { user, signOut } = useAuth()
    const { theme, toggleTheme } = useTheme()
    const router = useRouter()
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
    const [isTasksPanelOpen, setIsTasksPanelOpen] = useState(false) // New state
    const [currentTime, setCurrentTime] = useState<Date | null>(null)

    useEffect(() => {
        // Seteo inicial de tiempo, para evitar erro de hidratacion
        setCurrentTime(new Date())
        // console.log(currentTime)
        const timer = setInterval(() => {
            setCurrentTime(new Date())
        }, 1000)

        return () => clearInterval(timer)
    }, [])

    const handleSignOut = async () => {
        await signOut()
        router.refresh()
        router.push('/login')
    }

    return (
        <>
            <nav className="navbar relative">
                {/* Reloj absolutamente centrado */}
                {currentTime && (
                    <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 items-center gap-3 px-6 py-2.5 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 z-10">
                        <div className="flex flex-col items-center leading-tight min-w-[140px]">
                            <span className="text-white font-semibold text-base tracking-wide">
                                {currentTime.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                            </span>
                            <span className="text-white/70 text-sm">
                                {currentTime.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </span>
                        </div>
                    </div>
                )}

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
                    </div>

                    {user && (
                        <>
                            {/* Desktop View */}
                            <div className="hidden md:flex items-center gap-4">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsTasksPanelOpen(true)}
                                    className="text-white hover:text-white/80 hover:bg-white/10"
                                >
                                    <ClipboardList className="h-4 w-4 mr-2" />
                                    Mis Tareas
                                </Button>
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
                            <div className="md:hidden flex items-center gap-2">
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
                                <div className="absolute top-[80px] right-0 left-0 bg-[#1f89f6] border-t border-white/20 p-4 md:hidden shadow-lg z-50 flex flex-col items-center gap-4 animate-in slide-in-from-top-2">
                                    <Link
                                        href="/profile"
                                        className="flex items-center gap-2 text-white hover:text-white/80 transition-colors p-2"
                                        onClick={() => setIsMobileMenuOpen(false)}
                                    >
                                        <UserIcon className="h-4 w-4" />
                                        <span className="text-sm font-medium">{user.email}</span>
                                    </Link>
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
