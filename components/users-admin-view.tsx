'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
    Loader2, Plus, KeyRound, ShieldCheck, User as UserIcon,
    AlertCircle, CheckCircle2, Ban, RotateCcw, Copy,
} from 'lucide-react'
import { validarPassword, REQUISITOS_PASSWORD, PASSWORD_MIN } from '@/lib/password'

type Rol = 'admin' | 'common'

type Usuario = {
    id: string
    email: string | null
    full_name: string | null
    role: Rol
    habilita: number
    must_change_password: boolean
    created_at: string | null
    last_sign_in_at: string | null
    member_id: string | null
}

const NOMBRE_ROL: Record<Rol, string> = {
    admin: 'Administrador',
    common: 'Usuario',
}

/**
 * Contraseña provisoria legible, para que el admin se la pueda dictar.
 *
 * Se excluyen los caracteres que se confunden al leerlos en voz alta o en
 * papel (l, I, 1, O, 0). Usa crypto y no Math.random: aunque dure un solo
 * ingreso, sigue siendo una credencial, y Math.random es predecible.
 */
function generarPassword(): string {
    const mayus = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    const letras = 'abcdefghijkmnpqrstuvwxyz'
    const nums = '23456789'
    const bytes = new Uint32Array(PASSWORD_MIN)
    crypto.getRandomValues(bytes)
    const al = (s: string, i: number) => s[bytes[i] % s.length]

    const cuerpo = Array.from({ length: PASSWORD_MIN - 3 }, (_, i) => al(letras, i + 1)).join('')
    return al(mayus, 0) + cuerpo + al(nums, PASSWORD_MIN - 2) + al(nums, PASSWORD_MIN - 1)
}

function formatearFecha(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function UsersAdminView() {
    const { role, user: usuarioActual } = useAuth()

    const [usuarios, setUsuarios] = useState<Usuario[]>([])
    const [cargando, setCargando] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [aviso, setAviso] = useState<string | null>(null)
    const [ocupado, setOcupado] = useState<string | null>(null)

    const [dialogoAlta, setDialogoAlta] = useState(false)
    const [dialogoReset, setDialogoReset] = useState<Usuario | null>(null)

    const cargar = useCallback(async () => {
        setCargando(true)
        setError(null)
        try {
            const r = await fetch('/api/admin/users', { cache: 'no-store' })
            const cuerpo = await r.json()
            if (!r.ok) throw new Error(cuerpo.error || 'No se pudo cargar la lista de usuarios')
            setUsuarios(cuerpo.usuarios)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error inesperado')
        } finally {
            setCargando(false)
        }
    }, [])

    useEffect(() => {
        if (role === 'admin') cargar()
    }, [role, cargar])

    async function patch(id: string, cambios: Record<string, unknown>, exito: string) {
        setOcupado(id)
        setError(null)
        setAviso(null)
        try {
            const r = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...cambios }),
            })
            const cuerpo = await r.json()
            if (!r.ok) throw new Error(cuerpo.error || 'No se pudo aplicar el cambio')
            setAviso(exito)
            await cargar()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error inesperado')
        } finally {
            setOcupado(null)
        }
    }

    if (role !== 'admin') {
        return (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                    Esta sección es sólo para administradores.
                </AlertDescription>
            </Alert>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Usuarios</h2>
                    <p className="text-sm text-slate-500">
                        Quién entra al sistema, con qué rol, y quién puede recibir tareas.
                    </p>
                </div>
                <Button onClick={() => setDialogoAlta(true)} className="bg-[#0065ff] hover:bg-[#0052cc]">
                    <Plus className="mr-2 h-4 w-4" />
                    Nuevo usuario
                </Button>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            {aviso && (
                <Alert className="border-green-200 bg-green-50 text-green-900">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>{aviso}</AlertDescription>
                </Alert>
            )}

            <div className="rounded-lg border bg-white dark:bg-slate-900">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead className="w-[170px]">Rol</TableHead>
                            <TableHead className="w-[130px]">Último ingreso</TableHead>
                            <TableHead className="w-[220px] text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {cargando && (
                            <TableRow>
                                <TableCell colSpan={5} className="py-10 text-center">
                                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                                </TableCell>
                            </TableRow>
                        )}

                        {!cargando && usuarios.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="py-10 text-center text-slate-500">
                                    Todavía no hay usuarios cargados.
                                </TableCell>
                            </TableRow>
                        )}

                        {!cargando && usuarios.map((u) => {
                            const esUnoMismo = u.id === usuarioActual?.id
                            const dadoDeBaja = u.habilita !== 1
                            return (
                                <TableRow key={u.id} className={dadoDeBaja ? 'opacity-50' : ''}>
                                    <TableCell className="font-medium">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {u.full_name || '—'}
                                            {esUnoMismo && <Badge variant="outline" className="text-xs">vos</Badge>}
                                            {dadoDeBaja && (
                                                <Badge className="bg-slate-200 text-xs text-slate-700">dado de baja</Badge>
                                            )}
                                            {u.must_change_password && !dadoDeBaja && (
                                                <Badge className="bg-amber-100 text-xs text-amber-800">
                                                    contraseña provisoria
                                                </Badge>
                                            )}
                                            {!u.member_id && !dadoDeBaja && (
                                                <Badge variant="outline" className="text-xs text-slate-500">
                                                    no asignable
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>

                                    <TableCell className="text-slate-600">{u.email || '—'}</TableCell>

                                    <TableCell>
                                        <Select
                                            value={u.role}
                                            disabled={ocupado === u.id || esUnoMismo || dadoDeBaja}
                                            onValueChange={(val) =>
                                                patch(u.id, { role: val },
                                                    `${u.full_name || u.email} ahora es ${NOMBRE_ROL[val as Rol].toLowerCase()}`)
                                            }
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="admin">
                                                    <span className="flex items-center gap-2">
                                                        <ShieldCheck className="h-3.5 w-3.5" /> Administrador
                                                    </span>
                                                </SelectItem>
                                                <SelectItem value="common">
                                                    <span className="flex items-center gap-2">
                                                        <UserIcon className="h-3.5 w-3.5" /> Usuario
                                                    </span>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>

                                    <TableCell className="text-sm text-slate-500">
                                        {formatearFecha(u.last_sign_in_at)}
                                    </TableCell>

                                    <TableCell>
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={ocupado === u.id || dadoDeBaja}
                                                onClick={() => setDialogoReset(u)}
                                                title="Asignar una contraseña nueva"
                                            >
                                                <KeyRound className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={ocupado === u.id || esUnoMismo}
                                                className={dadoDeBaja ? '' : 'text-destructive hover:text-destructive/90'}
                                                title={dadoDeBaja ? 'Reactivar' : 'Dar de baja'}
                                                onClick={() => {
                                                    if (!dadoDeBaja && !confirm(
                                                        `¿Dar de baja a ${u.full_name || u.email}? No va a poder iniciar sesión ni recibir tareas nuevas.`
                                                    )) return
                                                    patch(u.id, { habilita: dadoDeBaja ? 1 : 0 },
                                                        dadoDeBaja ? 'Usuario reactivado' : 'Usuario dado de baja')
                                                }}
                                            >
                                                {dadoDeBaja ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                                            </Button>
                                            {ocupado === u.id && (
                                                <Loader2 className="h-4 w-4 animate-spin self-center text-slate-400" />
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </div>

            <DialogoAlta
                abierto={dialogoAlta}
                onCerrar={() => setDialogoAlta(false)}
                onCreado={(msg) => { setAviso(msg); cargar() }}
            />

            <DialogoReset
                usuario={dialogoReset}
                onCerrar={() => setDialogoReset(null)}
                onListo={(msg) => { setAviso(msg); cargar() }}
            />
        </div>
    )
}

// ---------------------------------------------------------------------------

function DialogoAlta({ abierto, onCerrar, onCreado }: {
    abierto: boolean
    onCerrar: () => void
    onCreado: (mensaje: string) => void
}) {
    const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'common' as Rol })
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [copiado, setCopiado] = useState(false)

    function reset() {
        setForm({ full_name: '', email: '', password: '', role: 'common' })
        setError(null)
        setCopiado(false)
    }

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        const errorPassword = validarPassword(form.password)
        if (errorPassword) return setError(errorPassword)

        setGuardando(true)
        try {
            const r = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            })
            const cuerpo = await r.json()
            if (!r.ok) throw new Error(cuerpo.error || 'No se pudo crear el usuario')
            onCreado(`${form.full_name} ya puede entrar. Pasale la contraseña provisoria: se la va a pedir cambiar en el primer ingreso.`)
            reset()
            onCerrar()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error inesperado')
        } finally {
            setGuardando(false)
        }
    }

    return (
        <Dialog open={abierto} onOpenChange={(o) => { if (!o) { reset(); onCerrar() } }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Nuevo usuario</DialogTitle>
                    <DialogDescription>
                        Se crea con una contraseña provisoria. La primera vez que entre, el sistema
                        le va a pedir que elija una propia.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={submit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="full_name">Nombre completo</Label>
                        <Input
                            id="full_name"
                            value={form.full_name}
                            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="role">Rol</Label>
                        <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Rol })}>
                            <SelectTrigger id="role">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="common">Usuario</SelectItem>
                                <SelectItem value="admin">Administrador</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500">
                            El administrador puede crear proyectos y tareas, y gestionar usuarios.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password">Contraseña provisoria</Label>
                        <div className="flex gap-2">
                            <Input
                                id="password"
                                value={form.password}
                                onChange={(e) => { setForm({ ...form, password: e.target.value }); setCopiado(false) }}
                                required
                            />
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => { setForm({ ...form, password: generarPassword() }); setCopiado(false) }}
                            >
                                Generar
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                disabled={!form.password}
                                title="Copiar"
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(form.password)
                                        setCopiado(true)
                                    } catch { /* el navegador puede bloquearlo; queda visible igual */ }
                                }}
                            >
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                        <p className="text-xs text-slate-500">
                            {copiado ? 'Copiada al portapapeles.' : REQUISITOS_PASSWORD.join(' · ')}
                        </p>
                    </div>

                    {error && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <Button type="submit" className="w-full bg-[#0065ff] hover:bg-[#0052cc]" disabled={guardando}>
                        {guardando ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creando...</> : 'Crear usuario'}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    )
}

// ---------------------------------------------------------------------------

function DialogoReset({ usuario, onCerrar, onListo }: {
    usuario: Usuario | null
    onCerrar: () => void
    onListo: (mensaje: string) => void
}) {
    const [password, setPassword] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (usuario) { setPassword(generarPassword()); setError(null) }
    }, [usuario])

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        if (!usuario) return
        const errorPassword = validarPassword(password)
        if (errorPassword) return setError(errorPassword)

        setGuardando(true)
        setError(null)
        try {
            const r = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: usuario.id, password }),
            })
            const cuerpo = await r.json()
            if (!r.ok) throw new Error(cuerpo.error || 'No se pudo cambiar la contraseña')
            onListo(`Contraseña de ${usuario.full_name || usuario.email} actualizada. Se la va a pedir cambiar al entrar.`)
            onCerrar()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error inesperado')
        } finally {
            setGuardando(false)
        }
    }

    return (
        <Dialog open={!!usuario} onOpenChange={(o) => { if (!o) onCerrar() }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Nueva contraseña</DialogTitle>
                    <DialogDescription>
                        Para {usuario?.full_name || usuario?.email}. Va a tener que cambiarla la
                        próxima vez que entre.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={submit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="nueva">Contraseña provisoria</Label>
                        <div className="flex gap-2">
                            <Input id="nueva" value={password} onChange={(e) => setPassword(e.target.value)} required />
                            <Button type="button" variant="outline" onClick={() => setPassword(generarPassword())}>
                                Generar
                            </Button>
                        </div>
                        <p className="text-xs text-slate-500">{REQUISITOS_PASSWORD.join(' · ')}</p>
                    </div>

                    {error && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <Button type="submit" className="w-full bg-[#0065ff] hover:bg-[#0052cc]" disabled={guardando}>
                        {guardando ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : 'Asignar contraseña'}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    )
}
