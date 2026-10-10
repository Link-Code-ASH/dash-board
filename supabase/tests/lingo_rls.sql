-- Transaction-only smoke test: leaves no test data behind.
begin;
do $$
declare owner_id uuid; test_id text := '__lingo_rls_' || gen_random_uuid()::text;
begin
  select id into owner_id from auth.users limit 1;
  if owner_id is null then raise exception 'A signed-in app user is required for this smoke test'; end if;
  perform set_config('lingo.test_owner', owner_id::text, true);
  perform set_config('lingo.test_deck', test_id, true);
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
end $$;
set local role authenticated;
insert into public.lingo_decks(user_id, deck_id, payload)
values (
  current_setting('lingo.test_owner')::uuid,
  current_setting('lingo.test_deck'),
  jsonb_build_object('version',1,'id',current_setting('lingo.test_deck'),'name','RLS smoke test','source',null,'words','[]'::jsonb)
);
do $$
declare n integer;
begin
  select count(*) into n from public.lingo_decks where deck_id = current_setting('lingo.test_deck');
  if n <> 1 then raise exception 'Owner cannot read own row'; end if;
  update public.lingo_decks set revision = 2 where deck_id = current_setting('lingo.test_deck') and revision = 1;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Owner cannot update own row'; end if;
  update public.lingo_decks set revision = 2 where deck_id = current_setting('lingo.test_deck') and revision = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Stale revision was accepted'; end if;
  begin
    update public.lingo_decks set revision = 8 where deck_id = current_setting('lingo.test_deck');
    raise exception 'Revision guard failed';
  exception when raise_exception then
    if sqlerrm <> 'invalid revision' then raise; end if;
  end;
  begin
    delete from public.lingo_decks where deck_id = current_setting('lingo.test_deck');
    raise exception 'Unexpected delete access';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
set local role authenticated;
do $$
declare n integer;
begin
  select count(*) into n from public.lingo_decks where deck_id = current_setting('lingo.test_deck');
  if n <> 0 then raise exception 'Foreign user can read row'; end if;
  update public.lingo_decks set revision = 3 where deck_id = current_setting('lingo.test_deck');
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Foreign user can update row'; end if;
  begin
    insert into public.lingo_decks(user_id,deck_id,payload)
    values(current_setting('lingo.test_owner')::uuid,current_setting('lingo.test_deck') || '_foreign',
      jsonb_build_object('version',1,'id',current_setting('lingo.test_deck') || '_foreign','name','Foreign insert','source',null,'words','[]'::jsonb));
    raise exception 'Foreign user can insert row';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.lingo_decks;
    raise exception 'Anonymous read allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
select 'PASS: owner read/write, stale revision, revision guard, foreign read/write/insert, anonymous read, delete denied; all fixtures rolled back' as result;
