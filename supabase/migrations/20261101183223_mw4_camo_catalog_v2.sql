-- À relire puis appliquer sur une base de test avant production.
-- Cette migration ne lit/écrit aucune donnée de public.tracker et ne modifie ni Auth ni ses RLS.
begin;

create function public.camo_definition_valid(d jsonb) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select coalesce(
    jsonb_typeof(d) = 'object'
    and d ?& array['id','weaponId','mode','track','slot','name','description','target','unlockLevel','rule','prerequisiteId','source','sourceUrl']
    and (select count(*) = 13 from jsonb_object_keys(d))
    and jsonb_typeof(d->'id') = 'string' and length(d->>'id') between 1 and 512
    and jsonb_typeof(d->'weaponId') in ('string','null') and (d->>'weaponId' is null or length(d->>'weaponId') > 0)
    and d->>'mode' in ('shared','mp','dmz','warzone')
    and d->>'track' in ('military','special','gold','platinum','harmonic','divergence','mastery','prestige','legacy')
    and case when jsonb_typeof(d->'slot') = 'number' then (d->>'slot') ~ '^[1-9][0-9]*$' and (d->>'slot')::numeric <= 2147483647 else false end
    and jsonb_typeof(d->'name') in ('string','null')
    and jsonb_typeof(d->'description') in ('string','null')
    and case when d->'target' = 'null'::jsonb then true when jsonb_typeof(d->'target') = 'number' then (d->>'target') ~ '^[1-9][0-9]*$' and (d->>'target')::numeric <= 2147483647 else false end
    and case when d->'unlockLevel' = 'null'::jsonb then true when jsonb_typeof(d->'unlockLevel') = 'number' then (d->>'unlockLevel') ~ '^(0|[1-9][0-9]*)$' and (d->>'unlockLevel')::numeric <= 2147483647 else false end
    and d->>'rule' in ('none','base','category-gold','all-platinum','all-harmonic','previous','unknown')
    and jsonb_typeof(d->'prerequisiteId') in ('string','null')
    and (d->>'rule' <> 'previous' or coalesce(length(d->>'prerequisiteId'),0) > 0)
    and d->>'source' in ('official','community','owner','unknown')
    and jsonb_typeof(d->'sourceUrl') in ('string','null')
    and (d->>'sourceUrl' is null or d->>'sourceUrl' ~ '^https://'), false);
$$;
revoke all on function public.camo_definition_valid(jsonb) from public, anon;
grant execute on function public.camo_definition_valid(jsonb) to authenticated;

create table public.camo_definitions (
  id text primary key,
  definition jsonb not null,
  constraint camo_definition_shape check (public.camo_definition_valid(definition)),
  constraint camo_definition_id_matches check (id = definition->>'id')
);
-- Une case logique ne peut pas être créée une seconde fois avec un autre identifiant.
create unique index camo_definitions_logical_slot on public.camo_definitions (
  (coalesce(definition->>'weaponId','')), (definition->>'mode'), (definition->>'track'), ((definition->>'slot')::integer)
);
create table public.camo_progress (
  definition_id text primary key references public.camo_definitions(id) on delete restrict,
  current integer check (current is null or current >= 0),
  completed boolean,
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

alter table public.camo_definitions enable row level security;
alter table public.camo_progress enable row level security;
revoke all on public.camo_definitions, public.camo_progress from public, anon, authenticated;
grant select on public.camo_definitions, public.camo_progress to anon, authenticated;
grant insert, update on public.camo_definitions, public.camo_progress to authenticated;
create policy "Camo definitions public read" on public.camo_definitions for select to anon, authenticated using (true);
create policy "Camo definitions admin insert" on public.camo_definitions for insert to authenticated with check ((select public.is_admin()));
create policy "Camo definitions admin update" on public.camo_definitions for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Camo progress public read" on public.camo_progress for select to anon, authenticated using (true);
create policy "Camo progress admin insert" on public.camo_progress for insert to authenticated with check ((select public.is_admin()));
create policy "Camo progress admin update" on public.camo_progress for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create function public.camo_keep_definition_identity() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.id is distinct from old.id
    or row(new.definition->>'weaponId',new.definition->>'mode',new.definition->>'track',new.definition->>'slot')
      is distinct from row(old.definition->>'weaponId',old.definition->>'mode',old.definition->>'track',old.definition->>'slot') then
    raise exception 'L''identité d''un camouflage existant est immuable' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.camo_keep_definition_identity() from public, anon;
grant execute on function public.camo_keep_definition_identity() to authenticated;
create trigger camo_definition_identity before update on public.camo_definitions
for each row execute function public.camo_keep_definition_identity();

-- Import atomique, additif : aucun DELETE, aucun remplacement de progrès existant.
create function public.install_camo_catalog(payload jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare d jsonb; p jsonb;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Accès administrateur requis' using errcode='42501'; end if;
  if payload is null or jsonb_typeof(payload) is distinct from 'object' then raise exception 'Objet catalogue requis' using errcode='22023'; end if;
  if not payload ?& array['definitions','progress'] or (select count(*) from jsonb_object_keys(payload)) <> 2
    or jsonb_typeof(payload->'definitions') is distinct from 'array'
    or jsonb_typeof(payload->'progress') is distinct from 'array' then
    raise exception 'Format catalogue invalide' using errcode='22023';
  end if;
  if (select count(*) from jsonb_array_elements(payload->'definitions')) <>
     (select count(distinct item->>'id') from jsonb_array_elements(payload->'definitions') item) then
    raise exception 'Identifiants de camouflage dupliqués ou absents' using errcode='22023';
  end if;
  if (select count(*) from jsonb_array_elements(payload->'progress')) <>
     (select count(distinct item->>'definitionId') from jsonb_array_elements(payload->'progress') item) then
    raise exception 'Identifiants de progression dupliqués ou absents' using errcode='22023';
  end if;
  for d in select value from jsonb_array_elements(payload->'definitions') loop
    if not public.camo_definition_valid(d) then raise exception 'Définition invalide' using errcode='22023'; end if;
    if d->>'weaponId' is not null and not exists (
      select 1 from public.tracker t cross join lateral jsonb_array_elements(t.data) w
      where t.id='weapons' and w->>'id'=d->>'weaponId'
    ) then raise exception 'Arme inconnue : %',d->>'weaponId' using errcode='22023'; end if;
    if d->>'prerequisiteId' is not null and not exists (
      select 1 from public.camo_definitions where id=d->>'prerequisiteId'
      union all select 1 from jsonb_array_elements(payload->'definitions') v where v->>'id'=d->>'prerequisiteId'
    ) then raise exception 'Prérequis inconnu' using errcode='22023'; end if;
    insert into public.camo_definitions(id,definition) values(d->>'id',d)
      on conflict(id) do update set definition=excluded.definition;
  end loop;
  for p in select value from jsonb_array_elements(payload->'progress') loop
    if jsonb_typeof(p) is distinct from 'object'
      or not p ?& array['definitionId','current','completed','revision']
      or (select count(*) from jsonb_object_keys(p)) <> 4
      or jsonb_typeof(p->'definitionId') is distinct from 'string'
      or coalesce(length(p->>'definitionId'),0)=0
      or not (case when p->'current'='null'::jsonb then true when jsonb_typeof(p->'current')='number' then (p->>'current') ~ '^(0|[1-9][0-9]*)$' and (p->>'current')::numeric <= 2147483647 else false end)
      or coalesce(jsonb_typeof(p->'completed'),'') not in ('boolean','null')
      or not (case when jsonb_typeof(p->'revision')='number' then (p->>'revision') ~ '^(0|[1-9][0-9]*)$' and (p->>'revision')::numeric <= 2147483647 else false end) then
      raise exception 'Progression invalide' using errcode='22023';
    end if;
    -- L'import conserve aussi les compteurs historiques supérieurs à une cible corrigée.
    -- Ils ne sont jamais tronqués. Une prochaine saisie devra respecter la cible courante.
    insert into public.camo_progress(definition_id,current,completed,revision)
      values(p->>'definitionId',(p->>'current')::integer,(p->>'completed')::boolean,0)
      on conflict(definition_id) do nothing;
  end loop;
end;
$$;
revoke all on function public.install_camo_catalog(jsonb) from public, anon;
grant execute on function public.install_camo_catalog(jsonb) to authenticated;

-- Une seule ligne modifiée, avec contrôle de révision : un onglet ancien ne peut pas écraser le plus récent.
create function public.set_camo_progress(p_definition_id text,p_current integer,p_completed boolean,p_expected_revision integer)
returns public.camo_progress
language plpgsql security invoker set search_path = '' as $$
declare d jsonb; existing public.camo_progress; saved public.camo_progress;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Accès administrateur requis' using errcode='42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0 or (p_current is not null and p_current < 0) then
    raise exception 'Compteur ou révision invalide' using errcode='22023';
  end if;
  select definition into d from public.camo_definitions where id=p_definition_id for share;
  if not found then raise exception 'Camouflage inconnu' using errcode='P0002'; end if;
  if d->>'target' is not null and p_current > (d->>'target')::integer then
    raise exception 'Le compteur dépasse la cible connue' using errcode='22023';
  end if;
  insert into public.camo_progress(definition_id,current,completed,revision) values(p_definition_id,null,null,0)
    on conflict(definition_id) do nothing;
  select * into existing from public.camo_progress where definition_id=p_definition_id for update;
  if existing.revision <> p_expected_revision then
    raise exception 'Progression modifiée ailleurs : rechargez avant de sauvegarder' using errcode='40001';
  end if;
  update public.camo_progress set current=p_current,completed=p_completed,revision=existing.revision+1,updated_at=now()
    where definition_id=p_definition_id returning * into saved;
  return saved;
end;
$$;
revoke all on function public.set_camo_progress(text,integer,boolean,integer) from public, anon;
grant execute on function public.set_camo_progress(text,integer,boolean,integer) to authenticated;

comment on table public.camo_definitions is 'Catalogue V2 séparé de la progression ; identifiants stables, aucune suppression automatique.';
comment on table public.camo_progress is 'État explicite du propriétaire : NULL = inconnu ; aucun succès déduit d''un compteur.';
commit;
