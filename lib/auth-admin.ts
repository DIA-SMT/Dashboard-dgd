import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/supabase'

// La validación de contraseña se comparte con el formulario del cliente.
export { validarPassword } from '@/lib/password'

/**
 * Cliente con service role: saltea RLS y habilita la Admin API de Auth.
 *
 * Sólo puede usarse desde el servidor. Si esta clave llega al browser, alcanza
 * para leer y escribir cualquier fila de la base.
 */
export const supabaseAdmin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
)

/** Cliente atado a las cookies del request, para saber quién está llamando. */
export async function getRequestClient() {
    const cookieStore = await cookies()
    return createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // Llamado desde un Server Component: lo refresca el middleware.
                    }
                },
            },
        }
    )
}

export type AdminCheck =
    | { ok: true; userId: string; email: string | undefined }
    | { ok: false; response: NextResponse }

/**
 * Exige que quien llama sea un admin habilitado.
 *
 * Usa getUser() y no getSession(): getSession lee la cookie y confía en su
 * contenido, mientras que getUser la valida contra el servidor de auth. Para
 * decidir permisos hace falta lo segundo.
 */
export async function requireAdmin(): Promise<AdminCheck> {
    const supabase = await getRequestClient()

    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
        return { ok: false, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
    }

    // El perfil se lee con service role a propósito: así la verificación no
    // depende de las policies de lectura de profiles.
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role, habilita')
        .eq('id', user.id)
        .maybeSingle()

    if (!profile || profile.habilita !== 1) {
        return { ok: false, response: NextResponse.json({ error: 'Usuario deshabilitado' }, { status: 403 }) }
    }
    if (profile.role !== 'admin') {
        return { ok: false, response: NextResponse.json({ error: 'Requiere rol de administrador' }, { status: 403 }) }
    }

    return { ok: true, userId: user.id, email: user.email }
}
