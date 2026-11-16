-- Include operator fuel and repair records in realtime so owner reports refresh without reload.
do $$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='diesel_logs') then
  alter publication supabase_realtime add table public.diesel_logs;
 end if;
end $$;
