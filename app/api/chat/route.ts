import { createOpenAI } from '@ai-sdk/openai';
import { convertToModelMessages, jsonSchema, streamText, tool } from 'ai';
import { createServerClient } from '@supabase/ssr'
import { consumir } from '@/lib/rate-limit'
import { cookies } from 'next/headers'

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

/** Tope por usuario y por hora del asistente. Ver lib/rate-limit.ts. */
const CONSULTAS_POR_HORA = 40

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

    // Este endpoint es el único que cuesta dinero por llamada, así que además de
    // la sesión se comprueba que el usuario siga habilitado: a alguien dado de
    // baja le queda el token vivo hasta que expire.
    const { data: perfil } = await supabase
        .from('profiles')
        .select('habilita')
        .eq('id', user.id)
        .maybeSingle()

    if (!perfil || perfil.habilita !== 1) {
        return Response.json({ error: 'Usuario deshabilitado' }, { status: 403 })
    }

    const cupo = consumir(`chat:${user.id}`, CONSULTAS_POR_HORA, 60 * 60 * 1000)
    if (!cupo.permitido) {
        return Response.json(
            {
                error: `Alcanzaste el límite de ${CONSULTAS_POR_HORA} consultas por hora. ` +
                    `Volvé a intentar en ${Math.ceil(cupo.esperarSegundos / 60)} minutos.`,
            },
            { status: 429 }
        )
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

                // Filtrar por miembro asignado.
                //
                // Ojo con el atajo `.eq('task_assignees.member_id', x)`: sobre un embed
                // normal, PostgREST filtra las filas EMBEBIDAS, no las tareas. Devolvía
                // todas las tareas con el array de responsables vacío, así que el
                // asistente listaba tareas ajenas como "Sin asignar". Hay que resolver
                // primero los ids, como ya hacía la rama de "mis tareas".
                if (member_id) {
                    const { data: deEseMiembro, error: errMiembro } = await supabase
                        .from('task_assignees')
                        .select('task_id')
                        .eq('member_id', member_id)

                    if (errMiembro) throw new Error(errMiembro.message)
                    const ids = (deEseMiembro ?? []).map((r: any) => r.task_id).filter(Boolean)
                    if (ids.length === 0) return []
                    query = query.in('id', ids)
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

                // Mismo problema que arriba: el filtro sobre el embed no descarta tareas.
                if (assignee_name) {
                    const { data: porNombre, error: errNombre } = await supabase
                        .from('task_assignees')
                        .select('task_id')
                        .ilike('assignee_name', `%${assignee_name}%`)

                    if (errNombre) throw new Error(errNombre.message)
                    const ids = (porNombre ?? []).map((r: any) => r.task_id).filter(Boolean)
                    if (ids.length === 0) return []
                    query = query.in('id', ids)
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
        get_task_comments: tool({
            description:
                'Obtener los comentarios de una tarea (autor, texto y fecha). Usar cuando pregunten qué se dijo o se observó sobre una tarea.',
            inputSchema: jsonSchema({
                type: 'object',
                properties: { task_id: { type: 'string', format: 'uuid' } },
                required: ['task_id'],
                additionalProperties: false,
            }),
            execute: async ({ task_id }: any) => {
                const { data, error } = await supabase
                    .from('task_comments')
                    .select('id, task_id, author_name, content, created_at')
                    .eq('task_id', task_id)
                    .eq('habilita', 1)
                    .order('created_at', { ascending: true })

                if (error) throw new Error(error.message)
                return data
            },
        }),
        get_activity_log: tool({
            description:
                'Historial de modificaciones de un proyecto o una tarea: qué campo cambió, de qué valor a cuál, quién y cuándo. Usar para preguntas del tipo "quién cambió el estado" o "qué pasó con este proyecto".',
            inputSchema: jsonSchema({
                type: 'object',
                properties: {
                    entity_id: { type: 'string', format: 'uuid', description: 'id del proyecto o de la tarea' },
                    limit: { type: 'number', description: 'cantidad máxima de registros, por defecto 50' },
                },
                required: ['entity_id'],
                additionalProperties: false,
            }),
            execute: async ({ entity_id, limit }: any) => {
                const { data, error } = await supabase
                    .from('activity_log')
                    .select('entity_type, entity_id, action, field, old_value, new_value, changed_at, profiles(full_name)')
                    .eq('entity_id', entity_id)
                    .order('changed_at', { ascending: false })
                    .limit(Math.min(Number(limit) || 50, 200))

                if (error) throw new Error(error.message)
                return (data ?? []).map((r: any) => ({ ...r, changed_by_name: r?.profiles?.full_name ?? null }))
            },
        }),
        get_users: tool({
            description:
                'Listar los usuarios del sistema con su rol (admin o common) y si están habilitados. Distinto de get_members: members son las personas a las que se asignan tareas; usuarios son las cuentas que inician sesión.',
            inputSchema: jsonSchema({
                type: 'object',
                properties: {},
                required: [],
                additionalProperties: false,
            }),
            execute: async () => {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, full_name, role, habilita')
                    .order('full_name', { ascending: true })

                if (error) throw new Error(error.message)
                return data
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
                system: `Eres un asistente del sistema de gestión de proyectos "Dashboard DGD".
Tienes acceso a datos de la BD mediante herramientas: proyectos, tareas,
miembros, comentarios de tareas, historial de cambios y usuarios.
Antes de decir "no sé", consulta la BD con las herramientas.

Sobre el modelo de datos:
- Los estados de tarea son: "Sin empezar", "En desarrollo", "Pausada", "Terminada" y "Cancelada".
  "Pausada" sigue siendo trabajo pendiente; "Cancelada" no se hará y no cuenta para el avance.
- Las tareas pueden tener SUBTAREAS: si parent_task_id no es nulo, esa tarea es subtarea
  de la que ese id indica. Al listar, agrupá las subtareas bajo su tarea madre en vez de
  mezclarlas, y aclará cuáles son subtareas.
- "Vencida" es una tarea con deadline anterior a hoy que no está Terminada ni Cancelada.
- completed_at es cuándo se terminó la tarea; sirve para saber si se cerró dentro del plazo.
- Los proyectos tienen owner_id (responsable), start_date, objectives, scope y progress
  (avance cargado a mano; si es nulo, el avance sale de las tareas).
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
