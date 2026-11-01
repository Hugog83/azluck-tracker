-- Migration 001 : données publiques et administration fermée par défaut.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.administrators (user_id uuid primary key references auth.users(id) on delete cascade);
alter table private.administrators enable row level security;
revoke all on private.administrators from public, anon, authenticated;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from private.administrators where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;
create table public.tracker (
 id text primary key check(id in ('profiles','weapons','challenges','matches','loadouts')),
 data jsonb not null check(jsonb_typeof(data)='array'),
 updated_at timestamptz not null default now()
);
alter table public.tracker enable row level security;
grant select on public.tracker to anon, authenticated;
revoke insert, update, delete on public.tracker from anon, authenticated;
create policy "Public profile read" on public.tracker for select to anon, authenticated using (true);
-- SECURITY INVOKER : les écritures effectuées par la fonction restent soumises à RLS.
grant insert,update,delete on public.tracker to authenticated;
create policy "Administrator insert" on public.tracker for insert to authenticated with check ((select public.is_admin()));
create policy "Administrator update" on public.tracker for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Administrator delete" on public.tracker for delete to authenticated using ((select public.is_admin()));
create or replace function public.save_tracker(payload jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare collection text;
begin
 if not public.is_admin() then raise exception 'Accès administrateur requis' using errcode='42501'; end if;
 if jsonb_typeof(payload) <> 'object' or (select count(*) from jsonb_object_keys(payload)) <> 5 then raise exception 'Format de sauvegarde invalide'; end if;
 foreach collection in array array['profiles','weapons','challenges','matches','loadouts'] loop
  if payload->collection is null or jsonb_typeof(payload->collection)<>'array' then raise exception 'Collection manquante ou invalide : %',collection; end if;
  if exists(select 1 from jsonb_array_elements(payload->collection) r where jsonb_typeof(r)<>'object' or r->>'id' is null or length(r->>'id')=0) then raise exception 'Identifiant manquant'; end if;
  if (select count(*) from jsonb_array_elements(payload->collection))<>(select count(distinct r->>'id') from jsonb_array_elements(payload->collection) r) then raise exception 'Identifiant dupliqué'; end if;
 end loop;
 if jsonb_array_length(payload->'profiles')<>1 then raise exception 'Un profil requis'; end if;
 if exists(select 1 from (select r from jsonb_array_elements(payload->'challenges') r union all select r from jsonb_array_elements(payload->'loadouts') r union all select r from jsonb_array_elements(payload->'matches') r) refs where coalesce(r->>'weaponId','')<>'' and not exists(select 1 from jsonb_array_elements(payload->'weapons') w where w->>'id'=r->>'weaponId')) then raise exception 'Référence arme inconnue'; end if;
 foreach collection in array array['profiles','weapons','challenges','matches','loadouts'] loop
  insert into public.tracker(id,data,updated_at) values(collection,payload->collection,now()) on conflict(id) do update set data=excluded.data,updated_at=now();
 end loop;
end; $$;
revoke all on function public.save_tracker(jsonb) from public, anon;
grant execute on function public.save_tracker(jsonb) to authenticated;
