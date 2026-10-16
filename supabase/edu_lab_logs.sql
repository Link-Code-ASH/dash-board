-- Edu 문항 연구소 작업 기록: Claude의 정기 점검이 실행할 때마다 한 줄씩 남긴다.
-- Apply after edu_lab.sql. Additive only: creates one new table and its policies.
-- It never reads or writes hub_user_data, mindfold_*, edu_notes or edu_items.
begin;

create table if not exists public.edu_lab_logs (
  id text not null check (length(btrim(id)) > 0),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  ran_at timestamptz not null default now(),
  title text not null default '',
  body text not null default '',
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  primary key (user_id, id)
);

create index if not exists edu_lab_logs_recent_idx on public.edu_lab_logs (user_id, ran_at desc, id);

alter table public.edu_lab_logs enable row level security;

-- The app only reads. Claude adds rows with service privileges; nobody updates or deletes.
revoke all on public.edu_lab_logs from public, anon, authenticated, service_role;
grant select on public.edu_lab_logs to authenticated;
grant select, insert on public.edu_lab_logs to service_role;

drop policy if exists edu_lab_logs_owner_select on public.edu_lab_logs;
create policy edu_lab_logs_owner_select on public.edu_lab_logs for select to authenticated
  using ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';
commit;
