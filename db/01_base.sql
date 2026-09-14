-- =============================================================================
-- Dashboard DGD — esquema base
-- =============================================================================
-- Reconstruido a partir de types/supabase.ts, que refleja la base real en
-- producción. Los .sql sueltos de la raíz del repo quedaron desactualizados:
-- no creaban `members` ni `task_assignees` y les faltaban columnas. No los uses.
--
-- Correr COMPLETO y de una sola vez en el SQL Editor del proyecto Supabase
-- nuevo, antes que cualquier otro script. Es idempotente: se puede volver a
-- correr sin romper nada.
--
-- Después de este va db/02_pedido.sql, que agrega lo que pide el expediente y
-- todavía no existe.
-- =============================================================================


-- =============================================================================
-- 1. profiles — espejo de auth.users, define el rol
-- =============================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  updated_at  timestamptz,
  full_name   text,
  role        text default 'common' check (role in ('admin', 'common')),
  avatar_url  text,
  habilita    integer default 1
);

-- Alta automática del perfil cuando se registra un usuario en Supabase Auth.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'common');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- =============================================================================
-- 2. members — nómina del equipo a la que se asignan tareas
-- =============================================================================
-- Ojo: es independiente de profiles. profiles son las cuentas que inician
-- sesión; members son las personas asignables. Se administra desde /members.
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  email       text,
  created_at  timestamptz default now(),
  habilita    integer default 1
);


-- =============================================================================
-- 3. projects
-- =============================================================================
create table if not exists public.projects (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  description          text,
  area                 text,
  type                 text,
  priority             text default 'Media',
  status               text default 'Pendiente',
  deadline             date,
  completed_at         timestamptz,
  completion_analysis  text,
  upload_link          text,
  created_at           timestamptz default now(),
  habilita             integer default 1
);


-- =============================================================================
-- 4. tasks
-- =============================================================================
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects(id) on delete cascade,
  title       text not null,
  status      text default 'Sin empezar',
  notes       text,
  link        text,
  deadline    date,
  created_at  timestamptz default now(),
  habilita    integer default 1
);

create index if not exists tasks_project_id_idx on public.tasks(project_id);

-- Nota: el esquema viejo tenía tasks.assignee (text). Quedó obsoleto: el
-- responsable se modela en task_assignees, que admite varios por tarea.


-- =============================================================================
-- 5. task_assignees — responsables de cada tarea (N a N)
-- =============================================================================
create table if not exists public.task_assignees (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid not null references public.tasks(id) on delete cascade,
  member_id      uuid references public.members(id) on delete set null,
  assignee_name  text not null,
  created_at     timestamptz default now(),
  habilita       integer default 1
);

create index if not exists task_assignees_task_id_idx   on public.task_assignees(task_id);
create index if not exists task_assignees_member_id_idx on public.task_assignees(member_id);


-- =============================================================================
-- 7. Row Level Security
-- =============================================================================
alter table public.profiles       enable row level security;
alter table public.members        enable row level security;
alter table public.projects       enable row level security;
alter table public.tasks          enable row level security;
alter table public.task_assignees enable row level security;

-- Helper: ¿el usuario actual es admin? Evita repetir el subselect en cada
-- política y hace que se lea mucho mejor.
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  );
$$ language sql security definer stable;

-- --- profiles ---------------------------------------------------------------
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- --- members ----------------------------------------------------------------
-- Estas políticas no existían en ningún .sql del repo. Siguen el mismo criterio
-- que projects y tasks: lectura para cualquier autenticado, escritura sólo admin
-- (que es lo que ya hace la UI en app/members/page.tsx).
drop policy if exists "members_select" on public.members;
create policy "members_select" on public.members
  for select to authenticated using (true);

drop policy if exists "members_admin_all" on public.members;
create policy "members_admin_all" on public.members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- --- projects ---------------------------------------------------------------
drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects
  for select to authenticated using (true);

drop policy if exists "projects_admin_all" on public.projects;
create policy "projects_admin_all" on public.projects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- --- tasks ------------------------------------------------------------------
drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks
  for select to authenticated using (true);

drop policy if exists "tasks_admin_all" on public.tasks;
create policy "tasks_admin_all" on public.tasks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- --- task_assignees ---------------------------------------------------------
drop policy if exists "task_assignees_select" on public.task_assignees;
create policy "task_assignees_select" on public.task_assignees
  for select to authenticated using (true);

drop policy if exists "task_assignees_admin_all" on public.task_assignees;
create policy "task_assignees_admin_all" on public.task_assignees
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- 8. Realtime
-- =============================================================================
-- La app se suscribe a cambios de estas dos tablas
-- (components/projects-list-view.tsx).
do $$
declare t text;
begin
  foreach t in array array['projects', 'tasks'] loop
    if not exists (
      select 1
      from pg_publication_rel pr
      join pg_class pc       on pr.prrelid = pc.oid
      join pg_publication pp on pr.prpubid = pp.oid
      where pp.pubname = 'supabase_realtime' and pc.relname = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- =============================================================================
-- 9. Primer admin
-- =============================================================================
-- Registrate por la app (/login) y después corré esto con tu mail para
-- convertirte en admin; si no, no vas a poder crear proyectos ni tareas.
--
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'tu@mail.com');
