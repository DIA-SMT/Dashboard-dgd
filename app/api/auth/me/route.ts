import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
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
            // ignore (server component context)
          }
        },
      },
    }
  )

  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user) {
    return Response.json({ user: null }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .eq('habilita', 1)
    .maybeSingle()

  return Response.json(
    {
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      role: (profile?.role as 'admin' | 'common' | null) ?? 'common',
    },
    { status: 200 }
  )
}


