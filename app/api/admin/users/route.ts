import { NextResponse } from 'next/server'
import { supabaseAdmin, requireAdmin, validarPassword } from '@/lib/auth-admin'

export const dynamic = 'force-dynamic'

type Rol = 'admin' | 'common'

const ROLES: Rol[] = ['admin', 'common']

export type UsuarioAdmin = {
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

/**
 * GET — nómina de usuarios.
 *
 * El mail vive en auth.users y el rol en profiles, así que hay que cruzar las
 * dos fuentes: ninguna alcanza sola.
 */
export async function GET() {
    const check = await requireAdmin()
    if (!check.ok) return check.response

    try {
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
        })
        if (authError) throw authError

        const ids = authData.users.map(u => u.id)

        const { data: profiles, error: profilesError } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, role, habilita, must_change_password')
            .in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
        if (profilesError) throw profilesError

        const { data: members, error: membersError } = await supabaseAdmin
            .from('members')
            .select('id, user_id')
            .not('user_id', 'is', null)
        if (membersError) throw membersError

        const porId = new Map((profiles ?? []).map(p => [p.id, p]))
        const memberPorUser = new Map((members ?? []).map(m => [m.user_id as string, m.id]))

        const usuarios: UsuarioAdmin[] = authData.users.map(u => {
            const p = porId.get(u.id)
            return {
                id: u.id,
                email: u.email ?? null,
                full_name: p?.full_name ?? (u.user_metadata?.full_name as string) ?? null,
                role: (p?.role as Rol) ?? 'common',
                habilita: p?.habilita ?? 1,
                must_change_password: p?.must_change_password ?? false,
                created_at: u.created_at ?? null,
                last_sign_in_at: u.last_sign_in_at ?? null,
                member_id: memberPorUser.get(u.id) ?? null,
            }
        })

        usuarios.sort((a, b) => (a.full_name ?? a.email ?? '').localeCompare(b.full_name ?? b.email ?? ''))

        return NextResponse.json({ usuarios })
    } catch (error) {
        console.error('[admin/users GET]', error)
        return NextResponse.json({ error: mensaje(error) }, { status: 500 })
    }
}

/**
 * POST — alta de usuario.
 *
 * Crea la cuenta, le fija el rol, la marca para que cambie la contraseña en el
 * primer ingreso y la suma a la nómina de asignables.
 */
export async function POST(request: Request) {
    const check = await requireAdmin()
    if (!check.ok) return check.response

    try {
        const { email, password, full_name, role, crear_member = true } = await request.json()

        if (!email || typeof email !== 'string') {
            return NextResponse.json({ error: 'El email es obligatorio' }, { status: 400 })
        }
        if (!full_name || typeof full_name !== 'string') {
            return NextResponse.json({ error: 'El nombre completo es obligatorio' }, { status: 400 })
        }
        const errorPassword = validarPassword(password)
        if (errorPassword) {
            return NextResponse.json({ error: errorPassword }, { status: 400 })
        }
        const rol: Rol = ROLES.includes(role) ? role : 'common'

        // 1. Cuenta de auth. El email queda confirmado porque lo da de alta un
        //    admin: no tiene sentido mandarle un mail de verificación.
        const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name },
        })
        if (createError) throw createError

        const nuevoId = userData.user.id

        // 2. El trigger on_auth_user_created ya creó el perfil con rol 'common'.
        //    El rol se fija acá, del lado del servidor, y nunca desde los
        //    metadatos del usuario: esos son editables por el propio usuario y
        //    permitirían que alguien se autoproclame admin al registrarse.
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .update({ role: rol, full_name, must_change_password: true, habilita: 1 })
            .eq('id', nuevoId)
        if (profileError) throw profileError

        // 3. Nómina. Sin esto la persona puede entrar pero no se le pueden
        //    asignar tareas, que era el agujero del alta anterior.
        if (crear_member) {
            const { data: existente } = await supabaseAdmin
                .from('members')
                .select('id')
                .eq('email', email)
                .maybeSingle()

            if (existente) {
                await supabaseAdmin
                    .from('members')
                    .update({ user_id: nuevoId, full_name, habilita: 1 })
                    .eq('id', existente.id)
            } else {
                await supabaseAdmin
                    .from('members')
                    .insert({ full_name, email, user_id: nuevoId })
            }
        }

        return NextResponse.json({ id: nuevoId }, { status: 201 })
    } catch (error) {
        console.error('[admin/users POST]', error)
        const msg = mensaje(error)
        const yaExiste = /already (been )?registered|already exists|duplicate/i.test(msg)
        return NextResponse.json(
            { error: yaExiste ? 'Ya existe un usuario con ese email' : msg },
            { status: yaExiste ? 409 : 500 }
        )
    }
}

/**
 * PATCH — cambia rol, alta/baja, nombre o contraseña de un usuario.
 *
 * Body: { id, role?, habilita?, full_name?, password? }
 */
export async function PATCH(request: Request) {
    const check = await requireAdmin()
    if (!check.ok) return check.response

    try {
        const { id, role, habilita, full_name, password } = await request.json()

        if (!id || typeof id !== 'string') {
            return NextResponse.json({ error: 'Falta el id del usuario' }, { status: 400 })
        }

        // Un admin no puede sacarse a sí mismo el rol ni darse de baja. Sin
        // esta guarda, el único admin del sistema puede dejarse afuera y ya no
        // hay forma de volver a entrar salvo tocando la base a mano.
        const esUnoMismo = id === check.userId
        if (esUnoMismo && role !== undefined && role !== 'admin') {
            return NextResponse.json(
                { error: 'No podés quitarte a vos mismo el rol de administrador' }, { status: 400 })
        }
        if (esUnoMismo && habilita !== undefined && habilita !== 1) {
            return NextResponse.json(
                { error: 'No podés darte de baja a vos mismo' }, { status: 400 })
        }

        // Tampoco se puede dejar el sistema sin ningún admin activo.
        if (!esUnoMismo || role !== undefined || habilita !== undefined) {
            const quedaSinAdmin = await dejariaSinAdmins(id, role, habilita)
            if (quedaSinAdmin) {
                return NextResponse.json(
                    { error: 'Tiene que quedar al menos un administrador activo' }, { status: 400 })
            }
        }

        const cambios: Record<string, unknown> = {}
        if (role !== undefined) {
            if (!ROLES.includes(role)) {
                return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
            }
            cambios.role = role
        }
        if (habilita !== undefined) cambios.habilita = habilita ? 1 : 0
        if (full_name !== undefined) cambios.full_name = full_name

        if (Object.keys(cambios).length > 0) {
            const { error } = await supabaseAdmin.from('profiles').update(cambios).eq('id', id)
            if (error) throw error

            if (full_name !== undefined) {
                await supabaseAdmin.from('members').update({ full_name }).eq('user_id', id)
            }
            // Dar de baja al usuario también lo saca de la nómina de asignables.
            if (habilita !== undefined) {
                await supabaseAdmin.from('members').update({ habilita: habilita ? 1 : 0 }).eq('user_id', id)
            }
        }

        // Reseteo de contraseña: vuelve a quedar marcada como provisoria, así
        // la persona la cambia apenas entra.
        if (password !== undefined) {
            const errorPassword = validarPassword(password)
            if (errorPassword) {
                return NextResponse.json({ error: errorPassword }, { status: 400 })
            }
            const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, { password })
            if (authError) throw authError

            const { error: flagError } = await supabaseAdmin
                .from('profiles')
                .update({ must_change_password: true })
                .eq('id', id)
            if (flagError) throw flagError
        }

        return NextResponse.json({ ok: true })
    } catch (error) {
        console.error('[admin/users PATCH]', error)
        return NextResponse.json({ error: mensaje(error) }, { status: 500 })
    }
}

/** ¿El cambio dejaría al sistema sin ningún admin habilitado? */
async function dejariaSinAdmins(id: string, role?: unknown, habilita?: unknown): Promise<boolean> {
    const pierdeAdmin = (role !== undefined && role !== 'admin') || (habilita !== undefined && !habilita)
    if (!pierdeAdmin) return false

    const { data } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .eq('habilita', 1)

    const admins = (data ?? []).map(p => p.id)
    return admins.length <= 1 && admins.includes(id)
}

function mensaje(error: unknown): string {
    if (error instanceof Error) return error.message
    return 'Error inesperado'
}
