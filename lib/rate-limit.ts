/**
 * Límite de frecuencia por usuario, en memoria.
 *
 * Protege el endpoint del asistente, que es el único que cuesta dinero por
 * llamada. Sin esto, una cuenta —propia o ajena— puede hacer pedidos sin
 * techo y agotar el crédito de OpenRouter.
 *
 * Limitación honesta: el contador vive en la memoria del proceso. En un
 * despliegue con varias instancias (Vercel, por ejemplo) cada una lleva el
 * suyo, así que el techo real es el límite por la cantidad de instancias
 * activas, y se reinicia con cada despliegue. Igual corta el abuso por varios
 * órdenes de magnitud. El tope de gasto de la cuenta de OpenRouter sigue
 * siendo la última línea de defensa y conviene configurarlo.
 */

type Ventana = { desde: number; usos: number }

const registro = new Map<string, Ventana>()

export type Resultado =
    | { permitido: true; restantes: number }
    | { permitido: false; esperarSegundos: number }

export function consumir(clave: string, maximo: number, ventanaMs: number): Resultado {
    const ahora = Date.now()
    const actual = registro.get(clave)

    if (!actual || ahora - actual.desde >= ventanaMs) {
        registro.set(clave, { desde: ahora, usos: 1 })
        limpiarViejas(ahora, ventanaMs)
        return { permitido: true, restantes: maximo - 1 }
    }

    if (actual.usos >= maximo) {
        return { permitido: false, esperarSegundos: Math.ceil((ventanaMs - (ahora - actual.desde)) / 1000) }
    }

    actual.usos++
    return { permitido: true, restantes: maximo - actual.usos }
}

/** Evita que el Map crezca sin fin en un proceso de larga vida. */
function limpiarViejas(ahora: number, ventanaMs: number) {
    if (registro.size < 500) return
    for (const [clave, v] of registro) {
        if (ahora - v.desde >= ventanaMs) registro.delete(clave)
    }
}
