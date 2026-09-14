import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    // Evitar loops/hangs en producción con App Router:
    // Next hace requests internas (RSC/prefetch) con query `?_rsc=` y/o headers especiales.
    // Si las redirigimos a /login, a veces el router queda “cargando” en refresh.
    const url = request.nextUrl
    const isRscRequest =
        url.searchParams.has('_rsc') ||
        request.headers.get('RSC') === '1' ||
        request.headers.get('Next-Router-Prefetch') === '1' ||
        request.headers.get('Purpose') === 'prefetch' ||
        request.headers.get('X-Middleware-Prefetch') === '1'

    if (isRscRequest) {
        return NextResponse.next({ request })
    }

    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        request.cookies.set(name, value)
                    )
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    let user: any = null
    try {
        const {
            data: { user: u },
        } = await supabase.auth.getUser()
        user = u
    } catch {
        // Si falla (edge transient), no redirigimos en middleware para no colgar la app;
        // el cliente manejará el redirect.
        return supabaseResponse
    }

    const path = request.nextUrl.pathname

    // Rutas que tienen que seguir siendo alcanzables sin sesión, o mientras la
    // sesión está a medio resolver.
    const esRutaPublica =
        path.startsWith('/api') ||
        path.startsWith('/login') ||
        path.startsWith('/auth') ||
        path.startsWith('/forgot-password') ||
        path.startsWith('/reset-password')

    if (!user && !esRutaPublica) {
        const redirectUrl = request.nextUrl.clone()
        redirectUrl.pathname = '/login'
        return NextResponse.redirect(redirectUrl)
    }

    // Contraseña provisoria: hasta que no elija una nueva, no entra a ningún
    // lado. Se controla acá y no sólo en el cliente porque en el cliente
    // alcanza con escribir otra URL para saltearlo.
    if (user && !esRutaPublica && path !== '/cambiar-password') {
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('must_change_password')
                .eq('id', user.id)
                .maybeSingle()

            if (profile?.must_change_password) {
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = '/cambiar-password'
                redirectUrl.search = ''
                return NextResponse.redirect(redirectUrl)
            }
        } catch {
            // Si la consulta falla no bloqueamos la navegación: el guard del
            // cliente sigue en pie y es preferible a dejar la app inaccesible.
        }
    }

    return supabaseResponse
}
