-- MOZE V24 cloud sync
create table if not exists public.moze_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  client_updated_at timestamptz not null default now(),
  device_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.moze_snapshots enable row level security;

revoke all on table public.moze_snapshots from anon;
grant select, insert, update, delete on table public.moze_snapshots to authenticated;

drop policy if exists "moze_snapshots_select_own" on public.moze_snapshots;
drop policy if exists "moze_snapshots_insert_own" on public.moze_snapshots;
drop policy if exists "moze_snapshots_update_own" on public.moze_snapshots;
drop policy if exists "moze_snapshots_delete_own" on public.moze_snapshots;

create policy "moze_snapshots_select_own"
on public.moze_snapshots for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "moze_snapshots_insert_own"
on public.moze_snapshots for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "moze_snapshots_update_own"
on public.moze_snapshots for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "moze_snapshots_delete_own"
on public.moze_snapshots for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists moze_snapshots_user_id_idx on public.moze_snapshots(user_id);
