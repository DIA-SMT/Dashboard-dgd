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

    if (
        !user &&
        !request.nextUrl.pathname.startsWith('/api') &&
        !request.nextUrl.pathname.startsWith('/login') &&
        !request.nextUrl.pathname.startsWith('/auth') &&
        !request.nextUrl.pathname.startsWith('/forgot-password') &&
        !request.nextUrl.pathname.startsWith('/reset-password')
    ) {
        // no user, potentially respond by redirecting the user to the login page
        const redirectUrl = request.nextUrl.clone()
        redirectUrl.pathname = '/login'
        return NextResponse.redirect(redirectUrl)
    }

    return supabaseResponse
}
