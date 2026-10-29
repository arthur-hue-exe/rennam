-- Rennam Torado: shared, persistent, atomic click counter.
-- The counter is stored as NUMERIC(18,0) and always transported as text so the
-- browser never has to round a value above Number.MAX_SAFE_INTEGER.

create table if not exists public.rennam_counter (
  id smallint primary key,
  value numeric(18,0) not null,
  -- Monotonic version used only to order updates on the client. It never wraps.
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint rennam_counter_single_row check (id = 1),
  constraint rennam_counter_range check (value >= 0 and value <= 999999999999999999)
);

-- Idempotent initialization: only creates the row if it does not exist yet.
insert into public.rennam_counter (id, value)
values (1, 0)
on conflict (id) do nothing;

-- One row per confirmed click id. The primary key makes retries idempotent.
create table if not exists public.rennam_clicks (
  click_id uuid primary key,
  created_at timestamptz not null default now()
);

create index if not exists rennam_clicks_created_at_idx
  on public.rennam_clicks (created_at);

alter table public.rennam_counter enable row level security;
alter table public.rennam_clicks enable row level security;

-- Visitors may read the public scoreboard (also required by Realtime RLS).
drop policy if exists "rennam_counter_public_read" on public.rennam_counter;
create policy "rennam_counter_public_read"
  on public.rennam_counter
  for select
  to anon, authenticated
  using (true);

-- No client-side writes: RLS is enabled and no INSERT/UPDATE/DELETE policy exists.
revoke all on table public.rennam_counter from anon, authenticated;
grant select on table public.rennam_counter to anon, authenticated;

revoke all on table public.rennam_clicks from anon, authenticated;

-- Atomic increment. The click id is inserted first: a retried click returns the
-- current persisted value without incrementing a second time.
-- The single UPDATE takes a row lock, so concurrent clicks are serialized by
-- PostgreSQL and none are lost. The value wraps to zero only at the hard limit.
create or replace function public.rennam_torar(p_click_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value numeric(18,0);
  v_revision bigint;
  v_inserted boolean;
  v_limit constant numeric(18,0) := 999999999999999999;
begin
  if p_click_id is null then
    raise exception 'click id is required' using errcode = '22004';
  end if;

  insert into public.rennam_clicks (click_id)
  values (p_click_id)
  on conflict (click_id) do nothing;

  v_inserted := found;

  if v_inserted then
    update public.rennam_counter
      set value = case when value >= v_limit then 0 else value + 1 end,
          revision = revision + 1,
          updated_at = pg_catalog.now()
      where id = 1
      returning value, revision into v_value, v_revision;

    if v_value is null then
      raise exception 'counter row is missing' using errcode = 'P0002';
    end if;
  else
    select value, revision into v_value, v_revision
      from public.rennam_counter
      where id = 1;
  end if;

  return pg_catalog.jsonb_build_object(
    'value', v_value::text,
    'revision', v_revision::text,
    'counted', v_inserted
  );
end;
$$;

-- Dedicated read function: returns the exact decimal as text.
create or replace function public.rennam_contador()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'value', value::text,
    'revision', revision::text
  )
  from public.rennam_counter
  where id = 1;
$$;

revoke all on function public.rennam_torar(uuid) from public;
revoke all on function public.rennam_torar(uuid) from anon, authenticated;
grant execute on function public.rennam_torar(uuid) to anon, authenticated;

revoke all on function public.rennam_contador() from public;
revoke all on function public.rennam_contador() from anon, authenticated;
grant execute on function public.rennam_contador() to anon, authenticated;

-- Realtime: publish counter updates so every open browser can refresh itself.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.rennam_counter;
    exception
      when duplicate_object then null;
    end;
  else
    create publication supabase_realtime for table public.rennam_counter;
  end if;
end
$$;
