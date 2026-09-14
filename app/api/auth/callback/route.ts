import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const type = searchParams.get('type')
    const errorParam = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    // Log para diagnóstico
    console.log('[auth/callback] params:', { code: !!code, type, errorParam, errorDescription })

    // Si Supabase devolvió un error explícito
    if (errorParam) {
        console.error('[auth/callback] error de Supabase:', errorParam, errorDescription)
        return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
    }

    if (code) {
        const cookieStore = await cookies()

        // Helper de cookies que escribe en la response
        let cookiesToSetInResponse: Array<{ name: string; value: string; options: any }> = []

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(items) {
                        cookiesToSetInResponse = items
                    },
                },
            }
        )

        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        console.log('[auth/callback] exchangeCodeForSession:', {
            userId: data?.user?.id,
            error: error?.message,
        })

        if (!error) {
            // Determinar a dónde redirigir
            let next = searchParams.get('next')
            if (!next) {
                next = type === 'recovery' ? '/reset-password' : '/'
            }

            const response = NextResponse.redirect(`${origin}${next}`)

            // Setear las cookies de sesión en la respuesta
            cookiesToSetInResponse.forEach(({ name, value, options }) => {
                response.cookies.set(name, value, options)
            })

            return response
        } else {
            console.error('[auth/callback] exchangeCodeForSession error:', error)
        }
    } else {
        console.warn('[auth/callback] no se recibió código en la URL')
    }

    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
