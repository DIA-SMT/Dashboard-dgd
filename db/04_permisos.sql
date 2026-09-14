-- =============================================================================
-- Dashboard DGD — permisos: que cada uno pueda cerrar sus propias tareas
-- =============================================================================
-- Correr DESPUÉS de db/01_base.sql, 02_pedido.sql y 03_configuracion.sql.
--
-- Qué arregla: hasta acá, la única política de escritura sobre `tasks` era
-- para administradores. Un usuario común que apretaba "Terminar" en su panel
-- de tareas, o que movía el selector de estado, no recibía ningún error: RLS
-- no rechaza el UPDATE, simplemente no alcanza ninguna fila. La pantalla
-- mostraba el cambio (actualización optimista) y al recargar volvía atrás.
--
-- La aplicación siempre dio por hecho que la gente cierra sus propias tareas
-- —el botón "Terminar" existe desde el principio—, así que esto es un agujero,
-- no una decisión de permisos.
-- =============================================================================


-- =============================================================================
-- ¿El usuario actual es responsable de esta tarea?
-- =============================================================================
-- El vínculo es tasks -> task_assignees -> members -> auth.users, que es
-- members.user_id, la columna que agregó 03_configuracion.sql. Por eso alguien
-- cargado sólo en la nómina, sin usuario, no puede cerrar nada: no hay forma
-- de saber que es él quien está del otro lado.
create or replace function public.es_responsable_de(tarea uuid)
returns boolean as $$
  select exists (
    select 1
    from public.task_assignees ta
    join public.members m on m.id = ta.member_id
    where ta.task_id = tarea
      and coalesce(ta.habilita, 1) = 1
      and m.user_id = auth.uid()
  );
$$ language sql security definer stable;


-- =============================================================================
-- Política: el responsable puede actualizar su tarea
-- =============================================================================
-- Convive con "tasks_admin_all": las políticas permisivas se suman, así que el
-- admin conserva todos sus permisos y el responsable gana los suyos.
drop policy if exists "tasks_update_assignee" on public.tasks;
create policy "tasks_update_assignee" on public.tasks
  for update to authenticated
  using (public.es_responsable_de(id))
  with check (public.es_responsable_de(id));


-- =============================================================================
-- Trigger: el responsable mueve el estado, no el resto
-- =============================================================================
-- La política de arriba, sola, dejaría que un responsable le cambie el título,
-- la fecha límite o el proyecto a su tarea. RLS no distingue por columna, así
-- que la restricción fina va en un trigger.
--
-- Se permite tocar status, notes y link: es lo que hace quien está ejecutando
-- la tarea. completed_at queda libre porque lo escribe el trigger de
-- 02_pedido.sql, no la persona.
create or replace function public.proteger_campos_tarea()
returns trigger as $$
begin
  -- Sólo se restringe a los usuarios finales por PostgREST (ver la nota en
  -- 03_configuracion.sql sobre current_user).
  if current_user <> 'authenticated' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.title          is distinct from old.title
  or new.project_id     is distinct from old.project_id
  or new.deadline       is distinct from old.deadline
  or new.parent_task_id is distinct from old.parent_task_id
  or new.habilita       is distinct from old.habilita then
    raise exception 'Sólo un administrador puede cambiar esos datos de la tarea';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_proteger_campos on public.tasks;
create trigger tasks_proteger_campos
  before update on public.tasks
  for each row execute function public.proteger_campos_tarea();
