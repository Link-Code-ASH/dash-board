-- Run AFTER supabase/edu_lab.sql in the SQL Editor, as its normal postgres role.
-- Requires one existing signed-in HUB user. All new fixtures are rolled back.
begin;

do $$
declare
  owner_id uuid;
  table_name text;
  writer_role text;
  writer_privilege text;
begin
  foreach table_name in array array['edu_notes', 'edu_items'] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name and c.relrowsecurity
    ) then raise exception 'RLS is missing on %', table_name; end if;
    if has_table_privilege('anon', 'public.' || table_name, 'SELECT')
      or has_table_privilege('authenticated', 'public.' || table_name, 'DELETE')
      or has_table_privilege('service_role', 'public.' || table_name, 'DELETE')
      or has_table_privilege('authenticated', 'public.' || table_name, 'TRUNCATE')
      or has_table_privilege('service_role', 'public.' || table_name, 'TRUNCATE') then
      raise exception 'Unexpected anonymous or destructive grants on %', table_name;
    end if;
    foreach writer_role in array array['authenticated', 'service_role'] loop
      foreach writer_privilege in array array['SELECT', 'INSERT', 'UPDATE'] loop
        if not has_table_privilege(writer_role, 'public.' || table_name, writer_privilege) then
          raise exception 'Missing % grant for % on %', writer_privilege, writer_role, table_name;
        end if;
      end loop;
    end loop;
  end loop;
  select id into owner_id from auth.users limit 1;
  if owner_id is null then raise exception 'A signed-in HUB user is required for this smoke test'; end if;
  perform set_config('edu_lab.test_owner', owner_id::text, true);
  perform set_config('edu_lab.test_id', '__edu_lab_rls_' || gen_random_uuid()::text, true);
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
end $$;

set local role authenticated;
insert into public.edu_notes (user_id, id, kind, scope, title, body, tags, related, extra, created_at, updated_at)
values (
  current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id'),
  'custom-kind', '과목 > 자유 범위', 'RLS note', 'Markdown $F=ma$',
  array['역학'], array['related-id'], '{"test":true}'::jsonb,
  '2000-01-01'::timestamptz, '2000-01-01'::timestamptz
);
insert into public.edu_items (user_id, id, title, choices, figures, based_on, extra, updated_at)
values (
  current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id'), 'RLS item',
  '["1 m/s", "2 m/s"]'::jsonb,
  '[{"svg":"<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>","caption":"fixture"}]'::jsonb,
  array[current_setting('edu_lab.test_id')], '{"test":true}'::jsonb, '2000-01-01'::timestamptz
);

do $$
declare table_name text; n integer; stamp timestamptz;
begin
  foreach table_name in array array['edu_notes', 'edu_items'] loop
    execute format('select count(*) from public.%I where user_id = $1 and id = $2 and revision = 1 and deleted_at is null and created_at = now() and updated_at = now()', table_name)
      into n using current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id');
    if n <> 1 then raise exception 'Owner/default/timestamp check failed on %', table_name; end if;
    execute format('update public.%I set title = $1, revision = 2, updated_at = $2 where user_id = $3 and id = $4 and revision = 1', table_name)
      using 'Owner edited', '2000-01-01'::timestamptz, current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id');
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'Owner cannot update %', table_name; end if;
    execute format('select updated_at from public.%I where user_id = $1 and id = $2', table_name)
      into stamp using current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id');
    if stamp is distinct from now() then raise exception 'Timestamp guard failed on %', table_name; end if;
    execute format('update public.%I set title = $1, revision = 2 where user_id = $2 and id = $3 and revision = 1', table_name)
      using 'Stale overwrite', current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id');
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'Stale revision overwrote %', table_name; end if;
    begin
      execute format('update public.%I set revision = 9 where user_id = $1 and id = $2', table_name)
        using current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id');
      raise exception 'Revision guard failed';
    exception when raise_exception then
      if sqlerrm <> 'invalid revision' then raise; end if;
    end;
    begin
      execute format('update public.%I set id = id || ''_changed'', revision = 3 where user_id = $1 and id = $2', table_name)
        using current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id');
      raise exception 'Identity guard failed';
    exception when raise_exception then
      if sqlerrm <> 'owner and edu lab identity cannot change' then raise; end if;
    end;
    begin
      execute format('update public.%I set created_at = ''2000-01-01'', revision = 3 where user_id = $1 and id = $2', table_name)
        using current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id');
      raise exception 'Creation timestamp guard failed';
    exception when raise_exception then
      if sqlerrm <> 'created_at cannot change' then raise; end if;
    end;
    begin
      execute format('insert into public.%I (user_id, id, revision) values ($1, $2, 7)', table_name)
        using current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id') || '_bad_revision';
      raise exception 'Initial revision guard failed';
    exception when raise_exception then
      if sqlerrm <> 'initial revision must be 1' then raise; end if;
    end;
    begin
      execute format('delete from public.%I where user_id = $1 and id = $2', table_name)
        using current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id');
      raise exception 'Authenticated delete allowed';
    exception when insufficient_privilege then null;
    end;
    execute format('update public.%I set deleted_at = now(), revision = 3 where user_id = $1 and id = $2 and revision = 2', table_name)
      using current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id');
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'Soft delete failed on %', table_name; end if;
    execute format('select count(*) from public.%I where user_id = $1 and id = $2 and deleted_at is null', table_name)
      into n using current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id');
    if n <> 0 then raise exception 'Active query shows soft deleted %', table_name; end if;
  end loop;
  begin
    update public.edu_items set choices = '[{}]'::jsonb, revision = 4
      where user_id = current_setting('edu_lab.test_owner')::uuid and id = current_setting('edu_lab.test_id');
    raise exception 'Invalid choices allowed';
  exception when check_violation then null;
  end;
  begin
    update public.edu_items set figures = '[{"svg":"<svg/>"}]'::jsonb, revision = 4
      where user_id = current_setting('edu_lab.test_owner')::uuid and id = current_setting('edu_lab.test_id');
    raise exception 'Invalid figures allowed';
  exception when check_violation then null;
  end;
  begin
    update public.edu_items set status = 'unknown', revision = 4
      where user_id = current_setting('edu_lab.test_owner')::uuid and id = current_setting('edu_lab.test_id');
    raise exception 'Invalid status allowed';
  exception when check_violation then null;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
set local role authenticated;
do $$
declare table_name text; n integer;
begin
  foreach table_name in array array['edu_notes', 'edu_items'] loop
    execute format('select count(*) from public.%I where id = $1', table_name)
      into n using current_setting('edu_lab.test_id');
    if n <> 0 then raise exception 'Foreign owner can read %', table_name; end if;
    execute format('update public.%I set revision = 4 where id = $1', table_name)
      using current_setting('edu_lab.test_id');
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'Foreign owner can update %', table_name; end if;
    begin
      execute format('insert into public.%I (user_id, id) values ($1, $2)', table_name)
        using current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id') || '_foreign';
      raise exception 'Foreign owner can insert row';
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

reset role;
set local role anon;
do $$
declare table_name text;
begin
  foreach table_name in array array['edu_notes', 'edu_items'] loop
    begin
      execute format('select 1 from public.%I limit 1', table_name);
      raise exception 'Anonymous read allowed';
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

reset role;
set local role service_role;
do $$
declare table_name text; n integer;
begin
  foreach table_name in array array['edu_notes', 'edu_items'] loop
    execute format('insert into public.%I (user_id, id, title) values ($1, $2, $3)', table_name)
      using current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id') || '_service', 'Service inserted';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'Service writer cannot insert %', table_name; end if;
    execute format('select count(*) from public.%I where user_id = $1 and id = $2', table_name)
      into n using current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id');
    if n <> 1 then raise exception 'Service writer cannot read %', table_name; end if;
    execute format('update public.%I set deleted_at = null, revision = 4 where user_id = $1 and id = $2 and revision = 3', table_name)
      using current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id');
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'Service writer cannot update %', table_name; end if;
    begin
      execute format('update public.%I set user_id = $1, revision = 5 where user_id = $2 and id = $3', table_name)
        using gen_random_uuid(), current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id');
      raise exception 'Service writer changed owner';
    exception when raise_exception then
      if sqlerrm <> 'owner and edu lab identity cannot change' then raise; end if;
    end;
    begin
      execute format('update public.%I set revision = 99 where user_id = $1 and id = $2', table_name)
        using current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id');
      raise exception 'Service writer bypassed revision guard';
    exception when raise_exception then
      if sqlerrm <> 'invalid revision' then raise; end if;
    end;
  end loop;
end $$;

-- Even the privileged SQL Editor role must use soft deletion.
reset role;
do $$
declare table_name text;
begin
  foreach table_name in array array['edu_notes', 'edu_items'] loop
    begin
      execute format('delete from public.%I where user_id = $1 and id = $2', table_name)
        using current_setting('edu_lab.test_owner')::uuid, current_setting('edu_lab.test_id');
      raise exception 'Privileged physical delete allowed';
    exception when raise_exception then
      if sqlerrm <> 'edu lab rows must be soft deleted' then raise; end if;
    end;
  end loop;
end $$;

rollback;
select 'PASS: owner/service writes, RLS isolation, anonymous/delete denied, revision/identity/timestamp guards, soft delete, JSON/status shapes; fixtures rolled back' as result;
