-- =============================================================================
-- Dashboard DGD — configuración: gestión de usuarios y roles
-- =============================================================================
-- Correr DESPUÉS de db/01_base.sql y db/02_pedido.sql.
-- Aditivo: agrega dos columnas y una política. No toca datos existentes.
-- =============================================================================


-- =============================================================================
-- profiles.must_change_password — cambio de contraseña en el primer ingreso
-- =============================================================================
-- El admin da de alta al usuario con una contraseña inicial. Esa contraseña la
-- conocen dos personas, así que no puede quedar como definitiva: la marca se
-- pone en true al crear el usuario (y cada vez que un admin le resetea la
-- clave), y se apaga sola cuando la persona elige una nueva.
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;


-- =============================================================================
-- members.user_id — vincula la nómina con la cuenta que inicia sesión
-- =============================================================================
-- `members` son las personas a las que se les asignan tareas; `profiles` son
-- las cuentas que entran al sistema. Hasta ahora eran dos mundos sueltos: el
-- alta de "miembro" creaba la cuenta pero nunca la fila en members, así que la
-- persona podía entrar pero no recibir tareas.
--
-- Queda nullable a propósito: un colaborador externo puede necesitar tareas
-- asignadas sin tener usuario, y un admin puede tener usuario sin estar en la
-- nómina operativa.
alter table public.members
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists members_user_id_key
  on public.members(user_id) where user_id is not null;


-- =============================================================================
-- Que nadie se ascienda solo
-- =============================================================================
-- `profiles` se expone por PostgREST y la política "profiles_update_own" de
-- 01_base.sql deja que cada uno actualice su propia fila —necesario, porque es
-- así como se apaga must_change_password al elegir la contraseña nueva—. Pero
-- esa misma puerta permitiría un PATCH con role='admin'.
--
-- Se resuelve con un trigger y no con un WITH CHECK: dentro del trigger, OLD y
-- NEW son valores explícitos, mientras que una subconsulta a la propia tabla
-- desde la política depende de qué snapshot ve la sentencia. Si eso se
-- comportara distinto a lo esperado, el usuario no podría apagar su marca y
-- quedaría encerrado en el redirect a /cambiar-password.
--
-- Sólo se restringe a los usuarios finales. El acceso directo a la base (SQL
-- Editor) y la API de admin quedan exentos: sin esa excepción, el trigger
-- bloquearía el bootstrap del primer administrador, que se hace justamente
-- desde el SQL Editor porque todavía no hay ningún admin que lo pueda hacer
-- desde la aplicación.
create or replace function public.proteger_rol_perfil()
returns trigger as $$
begin
  -- current_user es el rol de Postgres bajo el que corre la sentencia, y
  -- alcanza para distinguir de dónde viene el cambio:
  --
  --   'authenticated' -> un usuario logueado pegándole a PostgREST  => se restringe
  --   'service_role'  -> /api/admin/users, que ya verificó que sea admin => pasa
  --   'postgres'      -> el SQL Editor o psql, acceso directo a la base  => pasa
  --
  -- La función NO es security definer, a propósito: con security definer,
  -- current_user pasaría a ser el dueño de la función y siempre daría
  -- 'postgres', con lo que el control no distinguiría nada y no protegería
  -- nada. Acá no hace falta elevar privilegios: sólo compara y aborta.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'El rol de un usuario sólo lo cambia un administrador';
  end if;

  if new.habilita is distinct from old.habilita then
    raise exception 'El alta y la baja de un usuario sólo las hace un administrador';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_proteger_rol on public.profiles;
create trigger profiles_proteger_rol
  before update on public.profiles
  for each row execute function public.proteger_rol_perfil();


-- =============================================================================
-- Backfill
-- =============================================================================
-- Los usuarios que ya existen eligieron su contraseña o se la puso el admin
-- antes de que existiera esta marca: no se les fuerza el cambio.
update public.profiles set must_change_password = false where must_change_password is null;
