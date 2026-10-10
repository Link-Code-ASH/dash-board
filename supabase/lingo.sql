create table public.lingo_decks (
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id text not null,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, deck_id),
  constraint lingo_payload_shape check (
    jsonb_typeof(payload) = 'object'
    and payload->>'version' = '1'
    and payload->>'id' = deck_id
    and jsonb_typeof(payload->'words') = 'array'
    and length(btrim(payload->>'name')) > 0
    and payload ?& array['version', 'id', 'name', 'words', 'source']
  )
);
alter table public.lingo_decks enable row level security;
revoke all on public.lingo_decks from public, anon, authenticated;
grant select, insert, update on public.lingo_decks to authenticated;
create policy lingo_owner_select on public.lingo_decks for select to authenticated
  using ((select auth.uid()) = user_id);
create policy lingo_owner_insert on public.lingo_decks for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy lingo_owner_update on public.lingo_decks for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function public.lingo_revision_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.revision <> 1 then raise exception 'initial revision must be 1'; end if;
  else
    if new.user_id <> old.user_id or new.deck_id <> old.deck_id then
      raise exception 'owner and deck identity cannot change';
    end if;
    if new.revision <> old.revision + 1 then raise exception 'invalid revision'; end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.lingo_revision_guard() from public, anon;
grant execute on function public.lingo_revision_guard() to authenticated;
create trigger lingo_deck_revision before insert or update on public.lingo_decks
  for each row execute function public.lingo_revision_guard();
