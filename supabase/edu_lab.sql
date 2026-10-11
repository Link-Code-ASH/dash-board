-- Edu 문항 연구소. Apply this complete file in the Supabase SQL Editor.
-- This file creates only edu_notes / edu_items and their own guards/policies.
-- It never reads or writes hub_user_data, mindfold_* or existing Edu snapshots.
begin;

create table if not exists public.edu_notes (
  id text not null check (length(btrim(id)) > 0),
  user_id uuid not null references auth.users(id),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  kind text not null default 'idea',
  title text not null default '',
  body text not null default '',
  scope text not null default '전 과목',
  tags text[] not null default '{}',
  source text not null default '',
  related text[] not null default '{}',
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  primary key (user_id, id)
);

create table if not exists public.edu_items (
  id text not null check (length(btrim(id)) > 0),
  user_id uuid not null references auth.users(id),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  title text not null default '',
  subject text not null default '',
  unit text not null default '',
  difficulty text not null default '',
  question_type text not null default '',
  stem text not null default '',
  choices jsonb not null default '[]'::jsonb,
  answer text not null default '',
  explanation text not null default '',
  figures jsonb not null default '[]'::jsonb,
  based_on text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'review', 'revise', 'approved')),
  feedback text not null default '',
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  primary key (user_id, id),
  constraint edu_items_choices_shape check (
    jsonb_typeof(choices) = 'array'
    and not jsonb_path_exists(choices, '$[*] ? (@.type() != "string")')
  ),
  constraint edu_items_figures_shape check (
    jsonb_typeof(figures) = 'array'
    and not jsonb_path_exists(figures,
      '$[*] ? (@.type() != "object" || !exists(@.svg) || @.svg.type() != "string" || !exists(@.caption) || @.caption.type() != "string")')
  )
);

-- Owner is the first key column, so the indexes also support RLS filtering.
create index if not exists edu_notes_active_updated_idx
  on public.edu_notes (user_id, updated_at desc, id) where deleted_at is null;
create index if not exists edu_items_active_updated_idx
  on public.edu_items (user_id, updated_at desc, id) where deleted_at is null;

alter table public.edu_notes enable row level security;
alter table public.edu_items enable row level security;

-- Explicit grants work with projects that disable automatic Data API grants.
-- service_role bypasses RLS, but must still obey the revision/delete triggers.
revoke all on public.edu_notes, public.edu_items from public, anon, authenticated, service_role;
grant select, insert, update on public.edu_notes, public.edu_items to authenticated, service_role;

drop policy if exists edu_notes_owner_select on public.edu_notes;
create policy edu_notes_owner_select on public.edu_notes for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists edu_notes_owner_insert on public.edu_notes;
create policy edu_notes_owner_insert on public.edu_notes for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists edu_notes_owner_update on public.edu_notes;
create policy edu_notes_owner_update on public.edu_notes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists edu_items_owner_select on public.edu_items;
create policy edu_items_owner_select on public.edu_items for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists edu_items_owner_insert on public.edu_items;
create policy edu_items_owner_insert on public.edu_items for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists edu_items_owner_update on public.edu_items;
create policy edu_items_owner_update on public.edu_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.edu_lab_revision_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'edu lab rows must be soft deleted';
  elsif tg_op = 'INSERT' then
    if new.revision is distinct from 1::bigint then
      raise exception 'initial revision must be 1';
    end if;
    new.created_at = now();
  else
    if new.user_id is distinct from old.user_id or new.id is distinct from old.id then
      raise exception 'owner and edu lab identity cannot change';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'created_at cannot change';
    end if;
    if new.revision is distinct from old.revision + 1 then
      raise exception 'invalid revision';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.edu_lab_revision_guard() from public, anon;
grant execute on function public.edu_lab_revision_guard() to authenticated, service_role;

drop trigger if exists edu_notes_revision on public.edu_notes;
create trigger edu_notes_revision before insert or update or delete on public.edu_notes
  for each row execute function public.edu_lab_revision_guard();
drop trigger if exists edu_items_revision on public.edu_items;
create trigger edu_items_revision before insert or update or delete on public.edu_items
  for each row execute function public.edu_lab_revision_guard();

notify pgrst, 'reload schema';
commit;
