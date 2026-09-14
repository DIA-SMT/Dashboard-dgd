'use client'

import { supabase } from '@/lib/supabase'
import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { User, Session } from '@supabase/supabase-js'

type AuthContextType = {
    user: User | null
    session: Session | null
    role: 'admin' | 'common' | null
    loading: boolean
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    role: null,
    loading: true,
    signOut: async () => { }
})

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null)
    const [session, setSession] = useState<Session | null>(null)
    const [role, setRole] = useState<'admin' | 'common' | null>(null)
    const [loading, setLoading] = useState(true)

    const lastUserId = useRef<string | null>(null)
    const loadingTimeoutRef = useRef<number | null>(null)

    useEffect(() => {
        // Watchdog: en prod a veces una promesa de auth queda colgada (red, third-party, etc.).
        // Nunca dejamos loading infinito.
        loadingTimeoutRef.current = window.setTimeout(() => {
            setLoading(false)
        }, 8000)

        const initializeAuth = async () => {
            try {
                // En refresh, NO dependemos de una llamada remota (getUser) para salir de loading.
                // Primero leemos sesión local (rápido) y luego validamos en background.
                const { data: { session: currentSession } } = await supabase.auth.getSession()

                setSession(currentSession)
                setUser(currentSession?.user ?? null)

                if (currentSession?.user) {
                    lastUserId.current = currentSession.user.id
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('role')
                        .eq('id', currentSession.user.id)
                        .eq('habilita', 1)
                        .maybeSingle()

                    if (!profile) {
                        // Si no hay perfil habilitado, forzar logout
                        console.warn('Usuario deshabilitado o sin perfil. Cerrando sesión.')
                        await supabase.auth.signOut()
                        setSession(null)
                        setUser(null)
                        setRole(null)
                        lastUserId.current = null
                    } else {
                        setRole((profile.role as 'admin' | 'common') || 'common')
                    }
                } else {
                    setRole(null)
                    lastUserId.current = null
                }

                // Validación remota (server-side) para producción:
                // si en refresh a veces "no aparece /auth/v1/user", esto nos da un request estable
                // que depende de cookies del server (y se ve claro en Network: /api/auth/me).
                try {
                    const controller = new AbortController()
                    const t = window.setTimeout(() => controller.abort(), 8000)
                    const res = await fetch('/api/auth/me', {
                        method: 'GET',
                        cache: 'no-store',
                        signal: controller.signal,
                    })
                    window.clearTimeout(t)

                    if (res.ok) {
                        const payload = await res.json()
                        // payload.user puede ser minimal; mantenemos el user de sesión local si existe.
                        setRole(payload.role ?? 'common')
                        if (!currentSession?.user && payload.user) {
                            // fallback mínimo para UI (Navbar usa email)
                            setUser({ ...(payload.user ?? {}) } as any)
                        }
                    } else {
                        // Si el server dice 401, limpiamos; no tiene sentido quedarse cargando.
                        setSession(null)
                        setUser(null)
                        setRole(null)
                        lastUserId.current = null
                    }
                } catch {
                    // ignore: watchdog evita loading infinito
                }
            } catch (error) {
                console.error('Error initializing auth:', error)
                // Force cleanup on error
                setSession(null)
                setUser(null)
                setRole(null)
            } finally {
                setLoading(false)
                if (loadingTimeoutRef.current) {
                    window.clearTimeout(loadingTimeoutRef.current)
                    loadingTimeoutRef.current = null
                }
            }
        }

        initializeAuth()

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
            try {
                // Handle specific events that should force a reset
                // Supabase typings no siempre incluyen todos los eventos posibles.
                const eventName = event as string
                if (event === 'SIGNED_OUT' || eventName === 'TOKEN_REFRESH_REVOKED') {
                    setSession(null)
                    setUser(null)
                    setRole(null)
                    lastUserId.current = null
                    setLoading(false)
                    return
                }

                // Avoid unnecessary updates if the user is the same
                if (newSession?.user?.id !== lastUserId.current) {
                    setSession(newSession)
                    setUser(newSession?.user ?? null)

                    if (newSession?.user) {
                        lastUserId.current = newSession.user.id
                        const { data: profile } = await supabase
                            .from('profiles')
                            .select('role')
                            .eq('id', newSession.user.id)
                            .eq('habilita', 1)
                            .maybeSingle()

                        if (!profile) {
                            console.warn('Usuario deshabilitado o sin perfil en cambio de estado. Cerrando sesión.')
                            await supabase.auth.signOut()
                            setSession(null)
                            setUser(null)
                            setRole(null)
                            lastUserId.current = null
                        } else {
                            setRole((profile.role as 'admin' | 'common') || 'common')
                        }
                    } else {
                        lastUserId.current = null
                        setRole(null)
                    }
                } else if (!newSession && lastUserId.current) {
                    // Handle logout / session expiry where newSession is null but we had a user
                    setSession(null)
                    setUser(null)
                    setRole(null)
                    lastUserId.current = null
                }
            } catch (error) {
                console.error('Error in onAuthStateChange:', error)
            } finally {
                setLoading(false)
                if (loadingTimeoutRef.current) {
                    window.clearTimeout(loadingTimeoutRef.current)
                    loadingTimeoutRef.current = null
                }
            }
        })

        return () => {
            subscription.unsubscribe()
            if (loadingTimeoutRef.current) {
                window.clearTimeout(loadingTimeoutRef.current)
                loadingTimeoutRef.current = null
            }
        }
    }, [])

    const signOut = async () => {
        await supabase.auth.signOut()
        setUser(null)
        setSession(null)
        setRole(null)
    }

    return (
        <AuthContext.Provider value={{ user, session, role, loading, signOut }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
