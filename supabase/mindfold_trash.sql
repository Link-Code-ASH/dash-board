create extension if not exists pg_cron;
select cron.schedule(
  'mindfold-expire-trash',
  '17 */6 * * *',
  $$delete from public.mindfold_pages
    where (payload->>'deletedAt')::timestamptz < now() - interval '30 days';$$
);
