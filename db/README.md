# Base de datos

## Qué correr, y en qué orden

En el **SQL Editor** del proyecto Supabase, cada archivo completo y de una sola vez:

1. **`01_base.sql`** — crea las 6 tablas que la app usa hoy (`profiles`, `members`,
   `projects`, `tasks`, `task_assignees`, `daily_notes`), sus políticas RLS, el
   trigger que da de alta el perfil al registrarse y las suscripciones de Realtime.
   Sin esto la app no levanta.
2. **`02_pedido.sql`** — agrega lo que pide el expediente y todavía no existe:
   fecha de inicio, objetivos y alcance, avance manual, responsable de proyecto,
   subtareas, comentarios e historial de cambios. Es puramente aditivo.

Al final de `01_base.sql` está la consulta para convertirte en admin. Correla
**después** de registrarte por la app: sin rol `admin` no vas a poder crear
proyectos ni tareas.

Los dos archivos son idempotentes, así que se pueden volver a correr sin romper nada.

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
