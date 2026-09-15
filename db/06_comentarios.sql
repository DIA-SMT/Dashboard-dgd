-- =============================================================================
-- Dashboard DGD — permisos: poder borrar una observación
-- =============================================================================
-- Correr DESPUÉS de db/01_base.sql … 05_sacar_notas.sql.
--
-- Qué arregla: el tacho de basura de los comentarios no funciona. La aplicación
-- borra en lógico (`habilita = 0`), como en todas las tablas, pero la base
-- rechaza ese UPDATE con
--
--     ERROR 42501: new row violates row-level security policy
--                  for table "task_comments"
--
-- Por qué pasa, comprobado contra la base real con una sesión de usuario que es
-- a la vez AUTOR del comentario y ADMINISTRADOR:
--
--   * cambiar `content`        -> OK
--   * poner `habilita = 0`     -> rechazado
--
-- Con ese usuario la política de UPDATE se cumple de sobra, así que no es ella
-- la que frena. Lo único que separa los dos casos es si la fila resultante
-- sigue cumpliendo `habilita = 1`, que es el predicado de la política de
-- SELECT. El motivo: PostgREST arma el UPDATE con RETURNING (lo hace siempre,
-- para contar las filas afectadas, incluso con `Prefer: return=minimal`), y
-- ante un UPDATE con RETURNING PostgreSQL agrega las políticas de SELECT como
-- WITH CHECK. El mensaje de error sale sin el sufijo "(USING expression)", así
-- que no se distingue de un WITH CHECK propio del UPDATE — eso fue lo que
-- despistó el primer intento de arreglo.
--
-- Entonces: para poder esconder un comentario, su autor —o un administrador—
-- tiene que poder seguir viéndolo. Eso es lo que abre la política de SELECT de
-- abajo. No cambia nada de lo que se muestra: la aplicación filtra
-- `habilita = 1` en todas sus consultas (components/task-comments.tsx y la
-- herramienta get_task_comments del asistente), así que un comentario borrado
-- sigue sin aparecer en ningún lado.
-- =============================================================================

-- Se ve lo vigente; y además, cada uno lo suyo aunque esté dado de baja.
drop policy if exists "task_comments_select" on public.task_comments;
create policy "task_comments_select" on public.task_comments
  for select to authenticated
  using (habilita = 1 or auth.uid() = author_id or public.is_admin());

-- Edita y da de baja cada uno lo suyo; un admin, cualquiera. El WITH CHECK
-- repite la condición del USING en vez de quedar en `true`, para que el autor
-- no pueda reasignarle el comentario a otra persona.
drop policy if exists "task_comments_update" on public.task_comments;
create policy "task_comments_update" on public.task_comments
  for update to authenticated
  using (auth.uid() = author_id or public.is_admin())
  with check (auth.uid() = author_id or public.is_admin());


-- =============================================================================
-- Comprobación
-- =============================================================================
-- 1. Ver qué quedó aplicado:
--
--      select polname, pg_get_expr(polqual, polrelid)      as usando,
--                      pg_get_expr(polwithcheck, polrelid) as con_check
--      from pg_policy
--      where polrelid = 'public.task_comments'::regclass;
--
-- 2. Desde la aplicación: dejá una observación en cualquier tarea y borrala con
--    el tacho. Tiene que desaparecer, y el contador de la tarjeta bajar en uno.
--    Si aparece "No se pudo borrar el comentario", la política no se aplicó.
-- =============================================================================
