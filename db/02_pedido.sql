-- =============================================================================
-- Dashboard Dulci — lo que pide el expediente y todavía no existe
-- =============================================================================
-- Correr DESPUÉS de db/01_base.sql.
--
-- Es puramente aditivo: agrega columnas y tablas nuevas, no toca ni borra nada
-- de lo que ya hay. Se puede correr ahora aunque la UI todavía no use estos
-- campos — así la base queda armada de una vez y no hay que migrarla de nuevo
-- con datos adentro.
--
-- Entre paréntesis, el requisito del expediente que cubre cada cosa.
--
-- NO incluye prioridad a nivel tarea: queda para más adelante.
-- Tampoco toca los estados de tarea: sumar "Pausada" y "Cancelada" es trabajo
-- de UI, porque tasks.status es texto libre y no tiene restricción.
-- =============================================================================


-- =============================================================================
-- projects
-- =============================================================================

-- (R3) Fecha de inicio. Hoy sólo existe deadline, que es la fecha estimada de
-- finalización.
alter table public.projects add column if not exists start_date date;

-- (R4) Objetivos y alcance.
alter table public.projects add column if not exists objectives text;
alter table public.projects add column if not exists scope      text;

-- (R11) Porcentaje de avance cargado a mano.
-- Hoy el % se calcula en memoria desde el estado de las tareas. Esta columna
-- permite sobrescribirlo manualmente; queda en null mientras nadie lo cargue.
-- Pendiente de definir: si hay valor manual, ¿pisa al calculado o se muestran
-- los dos? Mientras sea null, la app sigue mostrando el derivado de siempre.
alter table public.projects add column if not exists progress integer
  check (progress is null or (progress between 0 and 100));

-- (R14) Responsable del proyecto.
-- El expediente pide poder ver los proyectos por responsable, y hasta ahora el
-- responsable existía sólo a nivel tarea. Es un único dueño por proyecto; los
-- responsables de cada tarea se siguen manejando en task_assignees.
alter table public.projects add column if not exists owner_id uuid
  references public.members(id) on delete set null;

create index if not exists projects_owner_id_idx on public.projects(owner_id);


-- =============================================================================
-- tasks
-- =============================================================================

-- (R5) Subtareas. Una tarea con parent_task_id apuntando a otra es subtarea de
-- esa. Si queda en null, es una tarea de primer nivel. El on delete cascade
-- hace que borrar la madre se lleve las hijas.
alter table public.tasks add column if not exists parent_task_id uuid
  references public.tasks(id) on delete cascade;

create index if not exists tasks_parent_task_id_idx on public.tasks(parent_task_id);

-- (R15, D9) Momento en que la tarea pasó a terminada.
-- Sin este dato no hay forma de medir cumplimiento en plazo ni productividad
-- por período: sólo se sabe el estado actual, no cuándo se alcanzó.
alter table public.tasks add column if not exists completed_at timestamptz;

-- Estampa y limpia completed_at solo, según el estado. Así el dato no depende
-- de que cada pantalla se acuerde de escribirlo.
create or replace function public.tasks_stamp_completed_at()
returns trigger as $$
begin
  -- En un INSERT no existe OLD: tocarlo aborta con "record old is not assigned yet".
  if tg_op = 'INSERT' then
    if new.status = 'Terminada' then
      new.completed_at := now();
    end if;
    return new;
  end if;

  if new.status = 'Terminada' and old.status is distinct from 'Terminada' then
    new.completed_at := now();
  elsif new.status is distinct from 'Terminada' then
    new.completed_at := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_completed_at_trigger on public.tasks;
create trigger tasks_completed_at_trigger
  before insert or update of status on public.tasks
  for each row execute function public.tasks_stamp_completed_at();

-- Backfill para las tareas que ya estaban terminadas antes de existir la
-- columna: no sabemos la fecha real, usamos la de creación como aproximación.
update public.tasks
set completed_at = created_at
where status = 'Terminada' and completed_at is null;


-- =============================================================================
-- (R10) task_comments — observaciones y comentarios
-- =============================================================================
-- tasks.notes ya existe, pero es un campo único que se pisa a sí mismo. El
-- expediente pide comentarios, en plural y acumulativos, así que van en su
-- propia tabla con autor y fecha. notes queda como está.
create table if not exists public.task_comments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  author_id    uuid references public.profiles(id) on delete set null,
  author_name  text,
  content      text not null,
  created_at   timestamptz default now(),
  habilita     integer default 1
);

create index if not exists task_comments_task_id_idx on public.task_comments(task_id);

alter table public.task_comments enable row level security;

drop policy if exists "task_comments_select" on public.task_comments;
create policy "task_comments_select" on public.task_comments
  for select to authenticated using (habilita = 1);

-- Comenta cualquier autenticado, pero sólo a nombre propio.
drop policy if exists "task_comments_insert" on public.task_comments;
create policy "task_comments_insert" on public.task_comments
  for insert to authenticated with check (auth.uid() = author_id);

-- Edita y borra cada uno lo suyo; un admin, cualquiera.
drop policy if exists "task_comments_update" on public.task_comments;
create policy "task_comments_update" on public.task_comments
  for update to authenticated
  using (auth.uid() = author_id or public.is_admin())
  with check (true);


-- =============================================================================
-- (R13) activity_log — historial de modificaciones
-- =============================================================================
-- Un renglón por cambio. Los triggers de abajo lo llenan solos, así que el
-- historial no depende de que la app se acuerde de registrar nada.
--
-- El formato de esta tabla es una propuesta: si querés registrar otra cosa
-- (por ejemplo un resumen legible en vez de campo/valor viejo/valor nuevo),
-- se cambia antes de que tenga datos.
create table if not exists public.activity_log (
  id           bigserial primary key,
  entity_type  text not null check (entity_type in ('project', 'task')),
  entity_id    uuid not null,
  action       text not null check (action in ('insert', 'update', 'delete')),
  field        text,
  old_value    text,
  new_value    text,
  changed_by   uuid references public.profiles(id) on delete set null,
  changed_at   timestamptz default now()
);

create index if not exists activity_log_entity_idx     on public.activity_log(entity_type, entity_id);
create index if not exists activity_log_changed_at_idx on public.activity_log(changed_at desc);

alter table public.activity_log enable row level security;

-- Sólo lectura desde la app: los renglones los escriben los triggers, que
-- corren como security definer y no pasan por RLS. Nadie puede falsear el
-- historial ni borrarlo.
drop policy if exists "activity_log_select" on public.activity_log;
create policy "activity_log_select" on public.activity_log
  for select to authenticated using (true);

-- Compara fila vieja contra nueva y anota un renglón por campo que cambió.
create or replace function public.log_activity()
returns trigger as $$
declare
  entity text := tg_argv[0];
  k      text;
  oldv   text;
  newv   text;
  oldj   jsonb;
  newj   jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (entity_type, entity_id, action, changed_by)
    values (entity, new.id, 'insert', auth.uid());
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.activity_log (entity_type, entity_id, action, changed_by)
    values (entity, old.id, 'delete', auth.uid());
    return old;
  end if;

  oldj := to_jsonb(old);
  newj := to_jsonb(new);

  for k in select jsonb_object_keys(newj) loop
    oldv := oldj ->> k;
    newv := newj ->> k;
    if oldv is distinct from newv then
      insert into public.activity_log
        (entity_type, entity_id, action, field, old_value, new_value, changed_by)
      values (entity, new.id, 'update', k, oldv, newv, auth.uid());
    end if;
  end loop;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists projects_activity_log on public.projects;
create trigger projects_activity_log
  after insert or update or delete on public.projects
  for each row execute function public.log_activity('project');

drop trigger if exists tasks_activity_log on public.tasks;
create trigger tasks_activity_log
  after insert or update or delete on public.tasks
  for each row execute function public.log_activity('task');
