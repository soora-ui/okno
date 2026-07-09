create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_kind text not null check (actor_kind in ('master', 'client', 'system')),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  workspace_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  target_type text,
  target_id text,
  status text not null default 'success' check (status in ('success', 'failure')),
  message text,
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_logs_profile_created_at_idx
  on public.audit_logs (profile_id, created_at desc);

create index if not exists audit_logs_workspace_created_at_idx
  on public.audit_logs (workspace_id, created_at desc);

create index if not exists audit_logs_event_type_created_at_idx
  on public.audit_logs (event_type, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "Owners can read workspace audit logs" on public.audit_logs;
create policy "Owners can read workspace audit logs"
on public.audit_logs
for select
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and (
        audit_logs.workspace_id = profile.workspace_id
        or audit_logs.profile_id = profile.id
      )
  )
);
