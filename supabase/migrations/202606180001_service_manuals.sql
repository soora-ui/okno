-- AI-консультация, этап 1: мануал мастера по конкретной услуге.
-- Мануал привязан к услуге, не к мастеру в целом: разные услуги = разные
-- протоколы, смешивать нельзя. Бот (этапы 2+) отвечает строго по этому
-- тексту, поэтому публикация требует явного подтверждения мастера.

create table if not exists service_manuals (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  version integer not null default 1,
  is_active boolean not null default false,
  -- null = мануал не подтверждён, для клиентов неактивен.
  confirmed_by_master_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_manuals_service_id_idx
on service_manuals(service_id);

create index if not exists service_manuals_profile_id_idx
on service_manuals(profile_id);

-- История версий сохраняется (append-only), но активной может быть только
-- одна версия на услугу — именно по ней работает бот.
create unique index if not exists service_manuals_active_unique_idx
on service_manuals(service_id)
where is_active;

alter table service_manuals enable row level security;

drop policy if exists "Owners can manage own service manuals" on service_manuals;
create policy "Owners can manage own service manuals" on service_manuals
for all
using (
  exists (
    select 1 from profiles
    where profiles.id = service_manuals.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1 from profiles
    where profiles.id = service_manuals.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
);
