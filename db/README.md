# Base de datos

## Qué correr, y en qué orden

En el **SQL Editor** del proyecto Supabase, cada archivo completo y de una sola vez:

1. **`01_base.sql`** — crea las 6 tablas que la app usa hoy (`profiles`, `members`,
   `projects`, `tasks`, `task_assignees`), sus políticas RLS, el
   trigger que da de alta el perfil al registrarse y las suscripciones de Realtime.
   Sin esto la app no levanta.
2. **`02_pedido.sql`** — agrega lo que pide el expediente y todavía no existe:
   fecha de inicio, objetivos y alcance, avance manual, responsable de proyecto,
   subtareas, comentarios e historial de cambios. Es puramente aditivo.
3. **`03_configuracion.sql`** — gestión de usuarios: la marca de contraseña
   provisoria (`profiles.must_change_password`) y el vínculo entre la nómina y
   las cuentas que inician sesión (`members.user_id`). También aditivo.
4. **`04_permisos.sql`** — deja que cada uno cierre sus propias tareas, no sólo
   un administrador.
5. **`05_sacar_notas.sql`** — opcional: da de baja las notas del día, que la
   aplicación ya no muestra.
6. **`06_comentarios.sql`** — arregla el borrado de observaciones, que la
   política de la base rechazaba.
7. **`07_adjuntos.sql`** — el depósito de archivos y la tabla de adjuntos de las
   tareas. Al final trae consultas de comprobación: **corrélas**, porque si una
   política no queda aplicada el borrado falla sin dar error.

Al final de `01_base.sql` está la consulta para convertirte en admin. Correla
**después** de registrarte por la app: sin rol `admin` no vas a poder crear
proyectos ni tareas.

Todos son idempotentes, así que se pueden volver a correr sin romper nada.

## `legacy/`

Los `.sql` que estaban sueltos en la raíz del repo. **No los corras.**

Quedaron congelados en una versión vieja mientras la base real siguió cambiando
a mano: no creaban `members` ni `task_assignees` —que la app sí usa— y a
`projects`, `tasks` y `profiles` les faltaban columnas. Una base creada con
ellos rompe apenas levanta la app. Se conservan sólo como referencia.

## Si cambiás el esquema

`types/supabase.ts` está escrito a mano y es lo que TypeScript usa para tipar las
consultas. Si agregás o cambiás una columna, actualizalo también o las consultas
nuevas no compilan.
