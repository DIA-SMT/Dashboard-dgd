-- =============================================================================
-- Dashboard DGD — quitar las notas del día
-- =============================================================================
-- Opcional. La aplicación ya no usa `daily_notes`: se removieron el panel, el
-- botón flotante, la suscripción de Realtime y la herramienta del asistente.
-- La tabla, si queda, no molesta a nadie; esto es sólo para no dejarla dando
-- vueltas.
--
-- Antes de correrlo, verificá que no tenga nada que quieras conservar:
--
--   select count(*) from public.daily_notes;
--
-- Al momento de escribir esto la tabla estaba vacía. Esta operación NO se
-- puede deshacer.
-- =============================================================================

-- Sale de la publicación de Realtime antes de borrarse, para no dejar la
-- publicación apuntando a una tabla inexistente.
do $$
begin
  if exists (
    select 1
    from pg_publication_rel pr
    join pg_class pc       on pr.prrelid = pc.oid
    join pg_publication pp on pr.prpubid = pp.oid
    where pp.pubname = 'supabase_realtime' and pc.relname = 'daily_notes'
  ) then
    alter publication supabase_realtime drop table public.daily_notes;
  end if;
end $$;

drop table if exists public.daily_notes;
