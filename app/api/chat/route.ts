import { createOpenAI } from '@ai-sdk/openai';
import { convertToModelMessages, jsonSchema, streamText, tool } from 'ai';
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
    // OpenRouter (vía proveedor OpenAI compatible)
    // Permite cambiar el modelo por .env sin tocar código.
    const openrouterApiKey = process.env.OPENROUTER_API_KEY
    if (!openrouterApiKey) {
        // Si no existe la key, en producción/dev el request “parece” colgar o fallar sin explicación.
        return Response.json(
            {
                error: 'Falta configurar OPENROUTER_API_KEY en el .env (y reiniciar el servidor)',
            },
            { status: 500 }
        )
    }

    const openrouter = createOpenAI({
        baseURL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
        apiKey: openrouterApiKey,
        headers: {
            // Recomendados por OpenRouter (opcionales pero útiles para rate-limit/analytics)
            ...(process.env.OPENROUTER_HTTP_REFERER ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER } : {}),
            ...(process.env.OPENROUTER_X_TITLE ? { 'X-Title': process.env.OPENROUTER_X_TITLE } : {}),
        },
        // Para que metadata del provider no diga "openai" si querés diferenciar
        name: 'openrouter',
    })

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
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    )

    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
        // Cuando no hay sesión/cookies, Supabase devuelve este error (no es un 500 real).
        if (userError.message?.toLowerCase().includes('auth session missing')) {
            return Response.json({ error: 'No autenticado' }, { status: 401 })
        }
        return Response.json({ error: userError.message }, { status: 500 })
    }

    if (!user) {
        return Response.json({ error: 'No autenticado' }, { status: 401 })
    }

    let body: any
    try {
        body = await req.json()
    } catch {
        return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
    }

    const messagesRaw = Array.isArray(body?.messages) ? body.messages : []

    // Normalización defensiva: `convertToModelMessages` asume que `parts` existe (especialmente en role=user/system).
    // Soportamos formatos viejos (content) y nuevos (parts / text).
    const uiMessages = messagesRaw
        .filter((m: any) => m && typeof m === 'object')
        .map((m: any) => {
            const { id: _id, ...rest } = m

            // Si viene en formato viejo `content`, lo convertimos a `parts`.
            const contentText =
                typeof (rest as any).content === 'string'
                    ? (rest as any).content
                    : typeof (rest as any).text === 'string'
                        ? (rest as any).text
                        : null

            if (!Array.isArray((rest as any).parts)) {
                return {
                    ...rest,
                    parts: contentText != null ? [{ type: 'text', text: contentText }] : [],
                }
            }

            return rest
        })

    const tools = {
        get_my_tasks: tool({
            description:
                'Obtener tareas asignadas al usuario actual (en sesión). Puedes filtrar por status: "Pendiente" (incluye "Pendiente" y "Sin empezar"), "En desarrollo", "Terminada", etc.',
            inputSchema: jsonSchema({
                type: 'object',
                properties: {
                    status: { type: 'string' },
                },
                required: [],
                additionalProperties: false,
            }),
            execute: async ({ status }: any) => {
                // Estricto para evitar filtrar tareas de otros: mapeamos usuario -> miembro SOLO por email exacto.
                const email = user.email ?? null
                if (!email) return []

                const { data: myMember, error: myMemberError } = await supabase
                    .from('members')
                    .select('id, full_name, email')
                    .eq('email', email)
                    .maybeSingle()

                if (myMemberError) throw new Error(myMemberError.message)
                if (!myMember?.id) {
                    // Sin vínculo email->miembro: por seguridad no devolvemos tareas de nadie.
                    return []
                }

                // Traer task_ids asignadas a este miembro
                const { data: assignees, error: assigneesError } = await supabase
                    .from('task_assignees')
                    .select('task_id')
                    .eq('member_id', myMember.id)
                    .eq('habilita', 1)

                if (assigneesError) throw new Error(assigneesError.message)

                const taskIds = (assignees ?? []).map((r: any) => r.task_id).filter(Boolean)
                if (taskIds.length === 0) return []

                // Traer solo esas tareas
                let query = supabase
                    .from('tasks')
                    .select('*, projects(title), task_assignees(id, assignee_name, member_id)')
                    .in('id', taskIds)
                    .eq('habilita', 1)

                if (status) {
                    const normalized = String(status).toLowerCase().trim()
                    if (normalized === 'pendiente' || normalized === 'pending') {
                        query = query.in('status', ['Pendiente', 'Sin empezar'])
                    } else {
                        query = query.eq('status', status)
                    }
                }

                const { data, error } = await query.order('created_at', { ascending: false })
                if (error) throw new Error(error.message)

                return (data ?? []).map((t: any) => {
                    const fromJoin = Array.isArray(t?.task_assignees)
                        ? t.task_assignees
                            .map((a: any) => a?.assignee_name)
                            .filter((x: any) => typeof x === 'string' && x.trim().length > 0)
                        : []

                    const assignedTo = [...new Set(fromJoin)].join(', ')

                    return {
                        ...t,
                        project_title: t?.projects?.title ?? null,
                        assigned_to: assignedTo || null,
                    }
                })
            },
        }),
        get_members: tool({
            description: 'Listar miembros del equipo (id, nombre, email)',
            inputSchema: jsonSchema({
                type: 'object',
                properties: {},
                required: [],
                additionalProperties: false,
            }),
            execute: async () => {
                const { data, error } = await supabase
                    .from('members')
                    .select('*')
                    .eq('habilita', 1)
                    .order('full_name', { ascending: true })

                if (error) throw new Error(error.message)
                return data
            },
        }),
        get_projects: tool({
            description: 'Get the list of projects the user has access to',
            // En ai@5 el campo correcto es `inputSchema` (no `parameters`).
            // Debe ser un schema de tipo objeto para OpenAI.
            inputSchema: jsonSchema({
                type: 'object',
                properties: {},
                required: [],
                additionalProperties: false,
            }),
            execute: async () => {
                const { data, error } = await supabase
                    .from('projects')
                    .select('*')
                    .eq('habilita', 1)
                    .order('created_at', { ascending: false });

                if (error) throw new Error(error.message);
                return data;
            },
        }),
        get_tasks: tool({
            description:
                'Obtener tareas. Puede filtrar por project_id, status, member_id, assignee_name (nombre del asignado) o assigned_to_me (tareas asignadas al usuario actual).',
            inputSchema: jsonSchema({
                type: 'object',
                properties: {
                    project_id: { type: 'string', format: 'uuid' },
                    status: { type: 'string' },
                    member_id: { type: 'string', format: 'uuid' },
                    assignee_name: { type: 'string' },
                    assigned_to_me: { type: 'boolean' },
                },
                required: [],
                additionalProperties: false,
            }),
            execute: async ({ project_id, status, member_id, assignee_name, assigned_to_me }: any) => {
                let query = supabase
                    .from('tasks')
                    .select('*, projects(title), task_assignees(id, assignee_name, member_id)')
                    .eq('habilita', 1);

                if (project_id) {
                    query = query.eq('project_id', project_id);
                }

                if (status) {
                    // Mapeo básico de estados para que el bot entienda español/inglés común
                    const normalized = String(status).toLowerCase().trim()
                    if (normalized === 'pendiente' || normalized === 'pending') {
                        // En la app aparecen ambos ("Pendiente" y "Sin empezar")
                        query = query.in('status', ['Pendiente', 'Sin empezar'])
                    } else {
                        const mapped =
                            normalized === 'in_progress' ? 'En desarrollo' :
                                normalized === 'completed' ? 'Terminada' :
                                    normalized === 'cancelled' ? 'Cancelada' :
                                        status
                        query = query.eq('status', mapped);
                    }
                }

                // Filtrar por miembro asignado (vía tabla task_assignees) si existe
                if (member_id) {
                    query = query.eq('task_assignees.member_id', member_id);
                }

                // "Mis tareas": resolvemos el miembro por email del usuario autenticado y filtramos por member_id
                if (assigned_to_me) {
                    const email = user.email
                    const { data: myMember, error: myMemberError } = await supabase
                        .from('members')
                        .select('id, full_name, email')
                        .eq('email', email)
                        .maybeSingle()

                    if (myMemberError) throw new Error(myMemberError.message)
                    if (!myMember?.id) {
                        // Si no existe el miembro para este usuario, devolvemos vacío en vez de explotar
                        return []
                    }

                    // Forzamos restricción vía task_assignees para no traer tareas sin asignación
                    const { data: assignees, error: assigneesError } = await supabase
                        .from('task_assignees')
                        .select('task_id')
                        .eq('member_id', myMember.id)

                    if (assigneesError) throw new Error(assigneesError.message)
                    const taskIds = (assignees ?? []).map((r: any) => r.task_id).filter(Boolean)
                    if (taskIds.length === 0) return []

                    query = query.in('id', taskIds)
                }

                if (assignee_name) {
                    // Filtrar por nombre de asignado (solo join table)
                    query = query.ilike('task_assignees.assignee_name', `%${assignee_name}%`)
                }

                // `due_date` no existe en el esquema actual; ordenamos por created_at.
                const { data, error } = await query.order('created_at', { ascending: false });

                if (error) throw new Error(error.message);

                // Normalizar salida para que el modelo siempre tenga un "assigned_to" consistente.
                return (data ?? []).map((t: any) => {
                    const fromJoin = Array.isArray(t?.task_assignees)
                        ? t.task_assignees
                            .map((a: any) => a?.assignee_name)
                            .filter((x: any) => typeof x === 'string' && x.trim().length > 0)
                        : []

                    const assignedTo = [...new Set(fromJoin)].join(', ')

                    return {
                        ...t,
                        project_title: t?.projects?.title ?? null,
                        assigned_to: assignedTo || null,
                    }
                });
            },
        }),
    } as const;

    let modelMessages
    try {
        modelMessages = convertToModelMessages(uiMessages, { tools })
    } catch (e: any) {
        // Evitar 500 con stack opaco; devolver error claro.
        return Response.json(
            { error: 'Formato de mensajes inválido para el chatbot', detail: String(e?.message ?? e) },
            { status: 400 }
        )
    }

    const openrouterModel = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini'
    const openrouterFallbackModel = process.env.OPENROUTER_FALLBACK_MODEL
    const openrouterMaxRetries = Number(process.env.OPENROUTER_MAX_RETRIES ?? '2')

    let result
    try {
        const run = async (modelId: string) =>
            streamText({
                // OpenRouter es compatible con el endpoint OpenAI "chat completions".
                // El endpoint "responses" puede fallar en OpenRouter (400 con validación Zod).
                model: openrouter.chat(modelId),
                // El retry interno del AI SDK aplica a 5xx/transitorios. Lo hacemos configurable.
                maxRetries: Number.isFinite(openrouterMaxRetries) ? openrouterMaxRetries : 2,
                // Importante: con tools, el stream NO debe terminar en `finishReason: "tool-calls"`,
                // porque eso deja la UI sin texto (solo tool events). Terminamos cuando el último
                // paso ya no sea "tool-calls", con un tope de seguridad.
                stopWhen: ({ steps }) => {
                    const last = steps[steps.length - 1]
                    if (!last) return false
                    if (steps.length >= 6) return true
                    return last.finishReason !== 'tool-calls'
                },
                system: `Eres un asistente del sistema de gestión de proyectos "Comunicación".
Tienes acceso a datos de la BD mediante herramientas (projects, tasks, members).
Antes de decir "no sé", consulta la BD con las herramientas.
Si el usuario pregunta por tareas de un miembro y no especifica el id, primero usa get_members para encontrarlo por nombre/email y luego usa get_tasks con member_id o assignee_name.
Si el usuario pregunta por "mis tareas" o "mis tareas pendientes", usa get_my_tasks (y para pendientes usa status="Pendiente").
Nota: "mis tareas" se resuelve por members.email == auth.email(). Si no existe, responde pidiendo que se cargue el email del miembro.
Después de ejecutar herramientas, SIEMPRE responde con una respuesta final en texto para el usuario (no te quedes solo en llamadas a herramientas).

FORMATO DE RESPUESTA (muy importante):
- Responde SIEMPRE en español.
- Usa saltos de línea.
- Si estás listando cosas, usa viñetas con este patrón:
  - **Título** — Estado: **X** — Proyecto: **Y** — Asignado a: **Z**
- Para "Asignado a", usa el campo "assigned_to" si existe; si no, muestra "Sin asignar".
- Si no hay resultados, dilo explícitamente (ej: "No encontré tareas para <miembro> con ese filtro.").

Fecha actual: ${new Date().toISOString()}`,
                messages: modelMessages,
                tools,
            })

        try {
            result = await run(openrouterModel)
        } catch (e: any) {
            const statusCode = e?.statusCode ?? e?.cause?.statusCode ?? e?.lastError?.statusCode
            const isGatewayError = statusCode === 502 || statusCode === 503 || statusCode === 504

            // Fallback opcional si OpenRouter responde con 502/503/504 (problemas de gateway/upstream)
            if (openrouterFallbackModel && isGatewayError) {
                result = await run(openrouterFallbackModel)
            } else {
                throw e
            }
        }
    } catch (e: any) {
        return Response.json(
            {
                error: 'Error llamando a OpenRouter',
                model: openrouterModel,
                fallbackModel: openrouterFallbackModel ?? null,
                detail: String(e?.message ?? e),
            },
            { status: 500 }
        )
    }

    // The AI SDK v5 expone el stream de chat como "UI message stream".
    // `useChat` espera este formato, así que devolvemos la respuesta SSE correspondiente.
    return result.toUIMessageStreamResponse();
}
