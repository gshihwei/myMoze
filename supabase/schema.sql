-- MOZE V25: per-record multi-user sync architecture
-- Run after V24 schema. Keep legacy moze_snapshots during migration/recovery.

create table if not exists public.moze_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity text not null check (entity in ('accounts','categories','projects','transactions','budgets','recurring','loans')),
  record_id text not null,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  deleted boolean not null default false,
  version bigint not null default 1,
  device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entity, record_id)
);

create index if not exists moze_records_user_updated_idx on public.moze_records(user_id, updated_at);
create index if not exists moze_records_user_entity_idx on public.moze_records(user_id, entity);

alter table public.moze_records enable row level security;
revoke all on table public.moze_records from anon, authenticated;
grant select on table public.moze_records to authenticated;

drop policy if exists "moze_records_select_own" on public.moze_records;
drop policy if exists "moze_records_insert_own" on public.moze_records;
drop policy if exists "moze_records_update_own" on public.moze_records;
drop policy if exists "moze_records_delete_own" on public.moze_records;

create policy "moze_records_select_own" on public.moze_records for select to authenticated using ((select auth.uid()) = user_id);
create policy "moze_records_insert_own" on public.moze_records for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "moze_records_update_own" on public.moze_records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "moze_records_delete_own" on public.moze_records for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.moze_write_record(
  p_entity text,
  p_record_id text,
  p_data jsonb,
  p_deleted boolean,
  p_base_version bigint,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  existing public.moze_records%rowtype;
  saved public.moze_records%rowtype;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_entity not in ('accounts','categories','projects','transactions','budgets','recurring','loans') then raise exception 'invalid entity'; end if;
  if p_record_id is null or length(trim(p_record_id)) = 0 then raise exception 'invalid record id'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'record data must be a JSON object'; end if;

  select * into existing from public.moze_records
    where user_id = uid and entity = p_entity and record_id = p_record_id for update;

  if not found then
    if coalesce(p_base_version,0) <> 0 then return jsonb_build_object('status','conflict','row',null); end if;
    insert into public.moze_records(user_id,entity,record_id,data,deleted,version,device_id,created_at,updated_at)
    values(uid,p_entity,p_record_id,p_data,coalesce(p_deleted,false),1,p_device_id,now(),now()) returning * into saved;
  else
    if coalesce(p_base_version,0) <> existing.version then
      return jsonb_build_object(
        'status','conflict',
        'row',jsonb_build_object('user_id',existing.user_id,'entity',existing.entity,'record_id',existing.record_id,'data',existing.data,'deleted',existing.deleted,'version',existing.version,'device_id',existing.device_id,'created_at',existing.created_at,'updated_at',existing.updated_at)
      );
    end if;
    update public.moze_records set data=p_data, deleted=coalesce(p_deleted,false), version=existing.version+1, device_id=p_device_id, updated_at=now()
      where user_id=uid and entity=p_entity and record_id=p_record_id returning * into saved;
  end if;

  return jsonb_build_object(
    'status','applied',
    'row',jsonb_build_object('user_id',saved.user_id,'entity',saved.entity,'record_id',saved.record_id,'data',saved.data,'deleted',saved.deleted,'version',saved.version,'device_id',saved.device_id,'created_at',saved.created_at,'updated_at',saved.updated_at)
  );
end;
$$;

revoke all on function public.moze_write_record(text,text,jsonb,boolean,bigint,text) from public, anon;
grant execute on function public.moze_write_record(text,text,jsonb,boolean,bigint,text) to authenticated;

create or replace function public.moze_my_record_counts()
returns table(entity text, record_count bigint, deleted_count bigint)
language sql
security invoker
stable
as $$
  select entity, count(*) filter (where not deleted)::bigint, count(*) filter (where deleted)::bigint
  from public.moze_records where user_id = (select auth.uid()) group by entity order by entity;
$$;
revoke all on function public.moze_my_record_counts() from public, anon;
grant execute on function public.moze_my_record_counts() to authenticated;
