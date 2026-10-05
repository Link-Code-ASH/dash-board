create table if not exists public.mindfold_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  metadata jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.mindfold_pages (
  user_id uuid not null references auth.users(id) on delete cascade,
  page_id text not null,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, page_id)
);
alter table public.mindfold_workspaces enable row level security;
alter table public.mindfold_pages enable row level security;
create policy mindfold_workspace_owner on public.mindfold_workspaces for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy mindfold_page_owner on public.mindfold_pages for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.mindfold_workspaces, public.mindfold_pages to authenticated;
revoke all on public.mindfold_workspaces, public.mindfold_pages from anon;

create function public.mindfold_revision_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.user_id <> old.user_id then raise exception 'owner cannot change'; end if;
  if new.revision <> old.revision + 1 then raise exception 'invalid revision'; end if;
  new.updated_at = now();
  if tg_table_name = 'mindfold_pages' then new.deleted_at = (new.payload->>'deletedAt')::timestamptz; end if;
  return new;
end;
$$;
revoke all on function public.mindfold_revision_guard() from public, anon;
grant execute on function public.mindfold_revision_guard() to authenticated;
create trigger mindfold_workspace_revision before update on public.mindfold_workspaces
  for each row execute function public.mindfold_revision_guard();
create trigger mindfold_page_revision before update on public.mindfold_pages
  for each row execute function public.mindfold_revision_guard();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mindfold-assets', 'mindfold-assets', false, 10485760, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do nothing;
create policy mindfold_asset_owner on storage.objects for all to authenticated
  using (bucket_id = 'mindfold-assets' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'mindfold-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.mindfold_workspaces;
    alter publication supabase_realtime add table public.mindfold_pages;
  end if;
end $$;
