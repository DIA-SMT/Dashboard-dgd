-- =============================================================================
-- Dashboard DGD — adjuntos en las tareas
-- =============================================================================
-- Correr DESPUÉS de db/01_base.sql … 06_comentarios.sql.
--
-- Qué agrega: hasta ahora una tarea sólo podía tener un enlace escrito a mano
-- (`tasks.link`). Esto permite además subir archivos —fotos de un relevamiento,
-- el PDF de una nota, una planilla— para que queden pegados a la tarea y los
-- vea el resto del equipo.
--
-- El depósito es PRIVADO: los archivos no se sirven por una dirección fija.
-- Cada vez que alguien abre uno, la aplicación pide un enlace firmado que vence
-- en una hora. Son fotos de expedientes y documentos internos, así que un
-- enlace filtrado no debería quedar accesible para siempre.
-- =============================================================================


-- =============================================================================
-- 1. El depósito
-- =============================================================================
-- `public = false` es lo que obliga a pedir enlaces firmados.
-- El tope por archivo son 10 MB: alcanza de sobra para una foto de celular o un
-- PDF escaneado, y evita que alguien suba un video sin darse cuenta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'adjuntos',
  'adjuntos',
  false,
  10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- =============================================================================
-- 2. Quién puede tocar el depósito
-- =============================================================================
-- Cualquier persona con sesión puede subir y ver. El borrado se controla en la
-- tabla de abajo, no acá: storage.objects no sabe quién subió qué archivo en
-- términos de la aplicación.
drop policy if exists "adjuntos_leer" on storage.objects;
create policy "adjuntos_leer" on storage.objects
  for select to authenticated using (bucket_id = 'adjuntos');

drop policy if exists "adjuntos_subir" on storage.objects;
create policy "adjuntos_subir" on storage.objects
  for insert to authenticated with check (bucket_id = 'adjuntos');

drop policy if exists "adjuntos_borrar" on storage.objects;
create policy "adjuntos_borrar" on storage.objects
  for delete to authenticated using (bucket_id = 'adjuntos');


-- =============================================================================
-- 3. La ficha de cada archivo
-- =============================================================================
-- El archivo vive en el depósito; acá queda el registro de qué es, de qué tarea
-- cuelga y quién lo subió. `subido_por_nombre` se congela al momento de subir,
-- igual que en los comentarios: si la persona cambia de nombre o se da de baja,
-- el adjunto sigue diciendo quién lo puso.
create table if not exists public.task_files (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  ruta         text not null unique,
  nombre       text not null,
  tipo         text,
  tamano       bigint,
  subido_por   uuid references public.profiles(id) on delete set null,
  subido_por_nombre text,
  created_at   timestamptz default now()
);

create index if not exists task_files_task_id_idx on public.task_files(task_id);

alter table public.task_files enable row level security;

-- Lo ve cualquiera con sesión, como las tareas.
drop policy if exists "task_files_select" on public.task_files;
create policy "task_files_select" on public.task_files
  for select to authenticated using (true);

-- Sube cualquiera, pero sólo a nombre propio.
drop policy if exists "task_files_insert" on public.task_files;
create policy "task_files_insert" on public.task_files
  for insert to authenticated with check (auth.uid() = subido_por);

-- Borra quien lo subió, o un administrador.
--
-- Acá el borrado es REAL y no lógico, a diferencia del resto de la aplicación.
-- Es a propósito: el archivo se borra del depósito, así que dejar la ficha
-- marcada como dada de baja describiría un archivo que ya no existe. Y de paso
-- evita el problema que tuvo el borrado de comentarios, donde apagar la fila la
-- volvía invisible para su propia política de lectura.
drop policy if exists "task_files_delete" on public.task_files;
create policy "task_files_delete" on public.task_files
  for delete to authenticated
  using (auth.uid() = subido_por or public.is_admin());


-- =============================================================================
-- Comprobación — CORRELA, no es opcional
-- =============================================================================
-- Comprobado en la base real: la primera vez que se corrió este archivo, las
-- tres políticas de `task_files` no quedaron todas aplicadas y el borrado de
-- adjuntos fallaba en silencio para todo el mundo, autor y administrador por
-- igual. RLS niega por omisión: sin política de DELETE, el borrado no da error,
-- simplemente no toca ninguna fila. Así que hay que mirar qué quedó.

-- 1. Las tres políticas de la tabla. Tienen que aparecer las tres:
--    task_files_select, task_files_insert y task_files_delete.
select polname as politica,
       case polcmd when 'r' then 'select' when 'a' then 'insert'
                   when 'w' then 'update' when 'd' then 'delete' else polcmd::text end as para,
       pg_get_expr(polqual, polrelid) as usando
from pg_policy
where polrelid = 'public.task_files'::regclass
order by polname;

-- 2. Las tres del depósito: adjuntos_leer, adjuntos_subir y adjuntos_borrar.
select polname as politica
from pg_policy
where polrelid = 'storage.objects'::regclass and polname like 'adjuntos_%'
order by polname;

-- 3. Que el depósito quedó privado y con el tope puesto.
--    Tiene que decir public = false y file_size_limit = 10485760.
select id, public, file_size_limit from storage.buckets where id = 'adjuntos';

-- Si en la primera consulta falta `task_files_delete`, correr sólo esto:
--
--   drop policy if exists "task_files_delete" on public.task_files;
--   create policy "task_files_delete" on public.task_files
--     for delete to authenticated
--     using (auth.uid() = subido_por or public.is_admin());
--
-- Y después, desde la aplicación: adjuntá una foto y un PDF a una tarea, fijate
-- que la foto se vea en miniatura, que el PDF se abra, y que el tachito borre.
-- Entrá con otro usuario y comprobá que también los ve pero no puede borrarlos.
-- =============================================================================
