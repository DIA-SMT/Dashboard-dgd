/**
 * Aviso por correo a quien queda a cargo de una tarea.
 *
 * Vivía copiado dentro del formulario de tareas. Ahora también se crean tareas
 * desde el formulario de proyecto, y dos copias del mismo pedido se habrían
 * separado a la primera corrección.
 *
 * Nunca lanza: que falle un correo no puede tumbar la creación de la tarea, que
 * es lo que la persona pidió. Los errores quedan en la consola.
 */
export type DestinatarioAviso = {
    email: string | null
    full_name: string
}

export async function avisarAsignacion(
    destinatarios: DestinatarioAviso[],
    tarea: {
        titulo: string
        notas?: string | null
        link?: string | null
        proyecto?: string | null
        /** 'update' avisa que la tarea cambió; por omisión, que es nueva. */
        tipo?: 'update'
    }
): Promise<void> {
    const conCorreo = destinatarios.filter(d => d.email)
    if (conCorreo.length === 0) return

    await Promise.all(conCorreo.map(async (d) => {
        try {
            const respuesta = await fetch('/api/send-task-notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: d.email,
                    memberName: d.full_name,
                    taskTitle: tarea.titulo,
                    taskNotes: tarea.notas ?? null,
                    taskLink: tarea.link ?? null,
                    projectTitle: tarea.proyecto ?? null,
                    ...(tarea.tipo ? { notificationType: tarea.tipo } : {}),
                }),
            })
            if (!respuesta.ok) {
                console.error(`No se pudo avisar a ${d.email}:`, respuesta.status, await respuesta.text())
            }
        } catch (error) {
            console.error(`No se pudo avisar a ${d.email}:`, error)
        }
    }))
}
