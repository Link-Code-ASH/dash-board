-- Nest (housing game): one hero row, one lot row (size, floors, walls) and one row per placed object.
-- Rows are never deleted by the app; a removed object keeps its row with payload.deletedAt.
create table public.nest_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id),
  constraint nest_payload_shape check (
    jsonb_typeof(payload) = 'object'
    and payload->>'version' = '1'
    and payload->>'id' = item_id
    and payload->>'kind' in ('hero', 'land', 'decor')
  )
);
alter table public.nest_items enable row level security;
revoke all on public.nest_items from public, anon, authenticated;
grant select, insert, update on public.nest_items to authenticated;
create policy nest_owner_select on public.nest_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy nest_owner_insert on public.nest_items for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy nest_owner_update on public.nest_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function public.nest_revision_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.revision <> 1 then raise exception 'initial revision must be 1'; end if;
  else
    if new.user_id <> old.user_id or new.item_id <> old.item_id then
      raise exception 'owner and item identity cannot change';
    end if;
    if new.revision <> old.revision + 1 then raise exception 'invalid revision'; end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.nest_revision_guard() from public, anon;
grant execute on function public.nest_revision_guard() to authenticated;
create trigger nest_item_revision before insert or update on public.nest_items
  for each row execute function public.nest_revision_guard();

