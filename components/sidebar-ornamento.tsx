/**
 * Remate del menú lateral: la ciudad dibujada y el lema del municipio.
 *
 * Es decoración, no información, así que va con `aria-hidden` y en un trazo muy
 * tenue: tiene que dar identidad al pie de la barra sin competir con la
 * navegación, que es lo único que ahí se usa.
 *
 * El dibujo (`public/ciudad.png`) se aplica como máscara y no como imagen. El
 * archivo guarda sólo la silueta en el canal alfa, así que el color lo pone el
 * fondo del elemento: el mismo archivo sirve en claro y en oscuro, sin arrastrar
 * el papel blanco del original ni necesitar dos versiones.
 */
const MASCARA = {
    maskImage: 'url(/ciudad.png)',
    WebkitMaskImage: 'url(/ciudad.png)',
    maskSize: 'contain',
    WebkitMaskSize: 'contain',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
    aspectRatio: '212 / 129',
} as const

export function SidebarOrnamento() {
    return (
        <div className="px-4 pb-2 pt-1">
            <span
                aria-hidden="true"
                className="mx-auto block w-full max-w-[180px] bg-[#0065ff]/40 dark:bg-slate-400/30"
                style={MASCARA}
            />

            <p aria-hidden="true" className="mt-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                Una ciudad
                <br />
                de oportunidades
            </p>
            <span className="mt-1 block h-[3px] w-7 rounded-full bg-amber-400" aria-hidden="true" />
        </div>
    )
}
