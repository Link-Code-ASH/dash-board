-- Contents (trophy room): one row per enjoyed title, covers in Storage.
-- Rows are never deleted by the app; a removed title keeps its row with payload.deletedAt.
create table public.contents_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id),
  constraint contents_payload_shape check (
    jsonb_typeof(payload) = 'object'
    and payload->>'version' = '1'
    and payload->>'id' = item_id
    and jsonb_typeof(payload->'title') = 'string'
    and jsonb_typeof(payload->'type') = 'string'
  )
);
alter table public.contents_items enable row level security;
revoke all on public.contents_items from public, anon, authenticated;
grant select, insert, update on public.contents_items to authenticated;
create policy contents_owner_select on public.contents_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy contents_owner_insert on public.contents_items for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy contents_owner_update on public.contents_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function public.contents_revision_guard() returns trigger
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
revoke all on function public.contents_revision_guard() from public, anon;
grant execute on function public.contents_revision_guard() to authenticated;
create trigger contents_item_revision before insert or update on public.contents_items
  for each row execute function public.contents_revision_guard();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contents-covers', 'contents-covers', false, 5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
create policy contents_cover_owner on storage.objects for all to authenticated
  using (bucket_id = 'contents-covers' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'contents-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
