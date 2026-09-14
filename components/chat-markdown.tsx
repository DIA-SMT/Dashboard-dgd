import { Fragment, type ReactNode } from 'react'

/**
 * Renderizador mínimo de Markdown para las respuestas del asistente.
 *
 * El modelo contesta con Markdown —el propio prompt le pide viñetas y
 * negritas— pero la burbuja lo mostraba como texto plano, así que los
 * asteriscos salían a la vista.
 *
 * Arma nodos de React en vez de inyectar HTML: el texto viene de un modelo de
 * lenguaje que a su vez leyó datos cargados por usuarios, así que meterlo con
 * dangerouslySetInnerHTML sería abrir una puerta de inyección por dos lados.
 *
 * Cubre lo que el asistente realmente usa: negrita, cursiva, código en línea,
 * viñetas, listas numeradas y saltos de línea. Cualquier otra marca se muestra
 * tal cual, que es mejor que romper.
 */

/** Negrita, cursiva y código dentro de una línea. */
function conFormatoInline(texto: string, clave: string): ReactNode[] {
    // Se parte por los tres marcadores a la vez para no anidar pasadas.
    const partes = texto.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*)/g)

    return partes.filter(Boolean).map((parte, i) => {
        const k = `${clave}-${i}`

        if (parte.startsWith('**') && parte.endsWith('**') && parte.length > 4) {
            return <strong key={k} className="font-semibold">{parte.slice(2, -2)}</strong>
        }
        if (parte.startsWith('__') && parte.endsWith('__') && parte.length > 4) {
            return <strong key={k} className="font-semibold">{parte.slice(2, -2)}</strong>
        }
        if (parte.startsWith('`') && parte.endsWith('`') && parte.length > 2) {
            return (
                <code key={k} className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[0.85em]">
                    {parte.slice(1, -1)}
                </code>
            )
        }
        if (parte.startsWith('*') && parte.endsWith('*') && parte.length > 2) {
            return <em key={k}>{parte.slice(1, -1)}</em>
        }
        return <Fragment key={k}>{parte}</Fragment>
    })
}

export function ChatMarkdown({ texto }: { texto: string }) {
    const lineas = texto.split('\n')
    const bloques: ReactNode[] = []

    let viñetas: { contenido: string; numerada: boolean }[] = []

    const cerrarLista = () => {
        if (viñetas.length === 0) return
        const numerada = viñetas[0].numerada
        const Etiqueta = numerada ? 'ol' : 'ul'
        bloques.push(
            <Etiqueta
                key={`lista-${bloques.length}`}
                className={`my-1 space-y-1 pl-4 ${numerada ? 'list-decimal' : 'list-disc'}`}
            >
                {viñetas.map((v, i) => (
                    <li key={i} className="pl-0.5">{conFormatoInline(v.contenido, `li-${bloques.length}-${i}`)}</li>
                ))}
            </Etiqueta>
        )
        viñetas = []
    }

    lineas.forEach((linea, i) => {
        const limpia = linea.trim()

        if (limpia === '') {
            cerrarLista()
            return
        }

        const conViñeta = limpia.match(/^[-*•]\s+(.*)$/)
        if (conViñeta) {
            if (viñetas.length && viñetas[0].numerada) cerrarLista()
            viñetas.push({ contenido: conViñeta[1], numerada: false })
            return
        }

        const numerada = limpia.match(/^\d+[.)]\s+(.*)$/)
        if (numerada) {
            if (viñetas.length && !viñetas[0].numerada) cerrarLista()
            viñetas.push({ contenido: numerada[1], numerada: true })
            return
        }

        cerrarLista()

        // Encabezados: se muestran como una línea destacada, sin cambiar el
        // tamaño, para no descuadrar una burbuja de chat.
        const encabezado = limpia.match(/^#{1,4}\s+(.*)$/)
        if (encabezado) {
            bloques.push(
                <p key={`h-${i}`} className="mt-2 font-semibold first:mt-0">
                    {conFormatoInline(encabezado[1], `h-${i}`)}
                </p>
            )
            return
        }

        bloques.push(
            <p key={`p-${i}`} className="first:mt-0">{conFormatoInline(limpia, `p-${i}`)}</p>
        )
    })

    cerrarLista()

    return <div className="space-y-1.5 leading-relaxed">{bloques}</div>
}
