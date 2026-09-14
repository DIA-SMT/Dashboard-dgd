'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
        'Missing Supabase environment variables. ' +
        'Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment.'
    )
}

// Importante: usamos el mismo tipo de cliente que el login (createBrowserClient),
// para que la sesión (cookies) sea consistente en toda la app. Evita casos en prod
// donde el dashboard queda cargando o no ve la sesión.
const withTimeoutFetch: typeof fetch = async (input, init) => {
    const controller = new AbortController()
    const timeoutMs = Number(process.env.NEXT_PUBLIC_SUPABASE_FETCH_TIMEOUT_MS ?? '12000')

    const timeout = window.setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 12000)
    try {
        return await fetch(input, { ...init, signal: controller.signal })
    } finally {
        window.clearTimeout(timeout)
    }
}

export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
    // Dejar que @supabase/ssr administre el singleton interno del browser.
    isSingleton: true,
    global: {
        fetch: withTimeoutFetch,
    },
})
