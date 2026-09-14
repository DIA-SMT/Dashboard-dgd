/**
 * Utilidades de presentación compartidas por la interfaz.
 */

/** Iniciales para el avatar: "Agustín Brito" -> "AB". */
export function iniciales(nombre: string | null | undefined): string {
    if (!nombre) return '—'
    const partes = nombre.trim().split(/\s+/).filter(Boolean)
    if (partes.length === 0) return '—'
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/**
 * Color estable para el avatar de cada persona.
 *
 * Se deriva del nombre, no de un azar: así la misma persona conserva su color
 * entre pantallas y recargas, que es lo que permite reconocerla de un vistazo.
 */
const TONOS_AVATAR = [
    'bg-blue-100 text-blue-700',
    'bg-emerald-100 text-emerald-700',
    'bg-violet-100 text-violet-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-cyan-100 text-cyan-700',
    'bg-indigo-100 text-indigo-700',
]

export function tonoAvatar(nombre: string | null | undefined): string {
    if (!nombre) return 'bg-slate-100 text-slate-500'
    let suma = 0
    for (let i = 0; i < nombre.length; i++) suma = (suma + nombre.charCodeAt(i)) % 997
    return TONOS_AVATAR[suma % TONOS_AVATAR.length]
}

/** "Hace 2 horas", "Hace 3 días", "Recién". */
export function tiempoRelativo(iso: string | null | undefined): string {
    if (!iso) return '—'
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '—'

    const segundos = Math.floor((Date.now() - d.getTime()) / 1000)
    if (segundos < 0) return 'Recién'
    if (segundos < 60) return 'Recién'

    const minutos = Math.floor(segundos / 60)
    if (minutos < 60) return `Hace ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`

    const horas = Math.floor(minutos / 60)
    if (horas < 24) return `Hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`

    const dias = Math.floor(horas / 24)
    if (dias < 30) return `Hace ${dias} ${dias === 1 ? 'día' : 'días'}`

    const meses = Math.floor(dias / 30)
    if (meses < 12) return `Hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`

    const años = Math.floor(meses / 12)
    return `Hace ${años} ${años === 1 ? 'año' : 'años'}`
}

/** 'YYYY-MM-DD' al formato corto que usa la interfaz: "30 sep 2026". */
export function fechaCorta(fecha: string | null | undefined): string {
    if (!fecha) return '—'
    const d = new Date(fecha.length === 10 ? fecha + 'T00:00:00' : fecha)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')
}

/** Día y mes por separado, para los bloques de fecha del panel lateral. */
export function diaYMes(fecha: string | null | undefined): { dia: string; mes: string } {
    if (!fecha) return { dia: '—', mes: '' }
    const d = new Date(fecha.length === 10 ? fecha + 'T00:00:00' : fecha)
    if (isNaN(d.getTime())) return { dia: '—', mes: '' }
    return {
        dia: String(d.getDate()),
        mes: d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').toUpperCase(),
    }
}
