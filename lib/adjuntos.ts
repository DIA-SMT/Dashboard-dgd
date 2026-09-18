import { supabase } from '@/lib/supabase'

/**
 * Archivos adjuntos a una tarea.
 *
 * El depósito es privado, así que nada de esto devuelve direcciones fijas: para
 * abrir un archivo hay que pedir un enlace firmado, que vence solo. Ver
 * db/07_adjuntos.sql.
 */

export const DEPOSITO = 'adjuntos'

/** Tope por archivo, igual al que declara el depósito en la base. */
export const TOPE_BYTES = 10 * 1024 * 1024

/** Cuánto vive un enlace firmado. Una hora alcanza para mirar o descargar. */
const VIGENCIA_SEGUNDOS = 3600

export type Adjunto = {
    id: string
    task_id: string
    ruta: string
    nombre: string
    tipo: string | null
    tamano: number | null
    subido_por: string | null
    subido_por_nombre: string | null
    created_at: string | null
}

export function esImagen(tipo: string | null | undefined): boolean {
    return !!tipo && tipo.startsWith('image/')
}

/** "2,4 MB", "318 KB". */
export function tamanoLegible(bytes: number | null | undefined): string {
    if (!bytes && bytes !== 0) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/**
 * Nombre seguro para el depósito.
 *
 * El nombre original se guarda aparte, en la ficha, y es el que se muestra.
 * Este se usa sólo como ruta: sin espacios ni acentos, que rompen las URLs
 * firmadas, y con un tramo al azar para que dos personas que suban
 * "foto.jpg" a la misma tarea no se pisen.
 */
function rutaSegura(taskId: string, nombre: string): string {
    const punto = nombre.lastIndexOf('.')
    const extension = punto > 0 ? nombre.slice(punto + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
    const base = (punto > 0 ? nombre.slice(0, punto) : nombre)
        .normalize('NFD').replace(/[̀-ͯ]/g, '')   // saca los acentos
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .toLowerCase() || 'archivo'

    const azar = Math.random().toString(36).slice(2, 8)
    return `${taskId}/${azar}-${base}${extension ? '.' + extension : ''}`
}

export async function listarAdjuntos(taskIds: string[]): Promise<Adjunto[]> {
    if (taskIds.length === 0) return []
    const { data, error } = await supabase
        .from('task_files')
        .select('*')
        .in('task_id', taskIds)
        .order('created_at', { ascending: true })

    if (error) {
        console.error('Error cargando los adjuntos:', error)
        return []
    }
    return (data ?? []) as Adjunto[]
}

/**
 * Sube un archivo y deja su ficha.
 *
 * Si la ficha falla, borra el archivo recién subido: quedarse con un archivo en
 * el depósito que ninguna tarea reclama es basura que nadie va a encontrar para
 * limpiar después.
 */
export async function subirAdjunto(
    taskId: string,
    archivo: File,
    autor: { id: string; nombre: string }
): Promise<{ ok: true; adjunto: Adjunto } | { ok: false; error: string }> {
    if (archivo.size > TOPE_BYTES) {
        return { ok: false, error: `"${archivo.name}" pesa ${tamanoLegible(archivo.size)}. El máximo es 10 MB.` }
    }

    const ruta = rutaSegura(taskId, archivo.name)

    const { error: errorSubida } = await supabase.storage
        .from(DEPOSITO)
        .upload(ruta, archivo, { contentType: archivo.type || undefined, upsert: false })

    if (errorSubida) {
        console.error('Error subiendo el archivo:', errorSubida)
        return {
            ok: false,
            error: /mime|content type/i.test(errorSubida.message)
                ? `No se admite este tipo de archivo (${archivo.type || 'desconocido'}).`
                : `No se pudo subir "${archivo.name}".`,
        }
    }

    const { data, error } = await supabase
        .from('task_files')
        .insert({
            task_id: taskId,
            ruta,
            nombre: archivo.name,
            tipo: archivo.type || null,
            tamano: archivo.size,
            subido_por: autor.id,
            subido_por_nombre: autor.nombre,
        })
        .select()
        .single()

    if (error || !data) {
        console.error('Error registrando el adjunto:', error)
        await supabase.storage.from(DEPOSITO).remove([ruta])
        return { ok: false, error: `Se subió "${archivo.name}" pero no se pudo registrar. Intentá de nuevo.` }
    }

    return { ok: true, adjunto: data as Adjunto }
}

/**
 * Enlaces temporales para varios archivos de una vez.
 *
 * Las miniaturas los necesitan todos juntos: pedirlos de a uno sería una
 * llamada por imagen cada vez que se abre una tarea.
 */
export async function enlacesFirmados(rutas: string[]): Promise<Record<string, string>> {
    if (rutas.length === 0) return {}
    const { data, error } = await supabase.storage
        .from(DEPOSITO)
        .createSignedUrls(rutas, VIGENCIA_SEGUNDOS)

    if (error) {
        console.error('Error generando los enlaces de los adjuntos:', error)
        return {}
    }
    const mapa: Record<string, string> = {}
    for (const f of data ?? []) {
        if (f.path && f.signedUrl) mapa[f.path] = f.signedUrl
    }
    return mapa
}

/** Enlace temporal para ver o descargar. `descargar` fuerza el guardado. */
export async function enlaceFirmado(ruta: string, descargar?: string): Promise<string | null> {
    const { data, error } = await supabase.storage
        .from(DEPOSITO)
        .createSignedUrl(ruta, VIGENCIA_SEGUNDOS, descargar ? { download: descargar } : undefined)

    if (error) {
        console.error('Error generando el enlace del adjunto:', error)
        return null
    }
    return data?.signedUrl ?? null
}

/**
 * Borra el archivo y su ficha.
 *
 * Primero la ficha: es la que tiene la política de permisos. Si la base la
 * rechaza, el archivo sigue en su lugar y no se perdió nada.
 */
export async function borrarAdjunto(adjunto: Adjunto): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await supabase
        .from('task_files')
        .delete()
        .eq('id', adjunto.id)
        .select('id')

    if (error) {
        console.error('Error borrando el adjunto:', error)
        return { ok: false, error: 'No se pudo borrar el archivo.' }
    }
    if (!data || data.length === 0) {
        return {
            ok: false,
            error: 'No tenés permiso para borrar este archivo. Sólo puede hacerlo quien lo subió o un administrador.',
        }
    }

    const { error: errorDeposito } = await supabase.storage.from(DEPOSITO).remove([adjunto.ruta])
    if (errorDeposito) {
        // La ficha ya no está, así que para la aplicación el archivo desapareció.
        // Queda un huérfano en el depósito; se avisa acá y no al usuario, que no
        // puede hacer nada al respecto.
        console.error('El archivo quedó en el depósito:', errorDeposito)
    }
    return { ok: true }
}
