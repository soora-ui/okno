-- Мастер фирменного стиля по макетам 4.2–4.16.
--
-- 1. Материалы мастера хранятся: «Сгенерировать заново» и «Поправить»
--    работают с теми же файлами, а экран управления (4.15) даёт их заменить
--    или удалить. Бакет приватный — брендбук мастера не публичный документ;
--    читает и пишет его только сервер (admin-клиент), политик для клиентов
--    нет. Логотип, который попадает на публичную страницу, живёт отдельно —
--    в profile-media, уже растеризованным в PNG.
-- 2. У генерации появляется статус: если связь пропала посреди ожидания,
--    сервер всё равно доводит её до конца, а клиент по возвращении
--    спрашивает статус и забирает варианты (4.16, «Пропало соединение»).
-- 3. Черновик мастера: ушёл с шага — «Сохранить черновик?» (4.16).

insert into storage.buckets (id, name, public)
values ('brand-materials', 'brand-materials', false)
on conflict (id) do update set public = false;

create table if not exists brand_materials (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('brandbook', 'logo', 'example', 'colorPhoto')),
  name text not null,
  mime text not null,
  size_bytes integer not null check (size_bytes > 0),
  -- Для PDF — сколько страниц после обрезки до первых 15.
  page_count integer,
  storage_path text not null unique,
  -- pending — ещё не разобран, ok — можно в генерацию, rejected — не прошёл
  -- модерацию при разборе и в генерацию не попадает.
  moderation text not null default 'pending'
    check (moderation in ('pending', 'ok', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists brand_materials_profile_idx
on brand_materials(profile_id, created_at desc);

alter table brand_materials enable row level security;

drop policy if exists "Owners can read own brand materials" on brand_materials;
create policy "Owners can read own brand materials" on brand_materials
for select
using (
  exists (
    select 1 from profiles
    where profiles.id = brand_materials.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
);

alter table brand_theme_generations
  add column if not exists status text not null default 'done'
    check (status in ('pending', 'done', 'failed')),
  add column if not exists error text;

create table if not exists brand_theme_wizard_drafts (
  profile_id uuid primary key references profiles(id) on delete cascade,
  -- Состояние мастера: шаг, выбранные материалы (id из brand_materials),
  -- цвета, настроение, пожелания. Файлов здесь нет — только ссылки.
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table brand_theme_wizard_drafts enable row level security;

drop policy if exists "Owners can read own brand wizard drafts" on brand_theme_wizard_drafts;
create policy "Owners can read own brand wizard drafts" on brand_theme_wizard_drafts
for select
using (
  exists (
    select 1 from profiles
    where profiles.id = brand_theme_wizard_drafts.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
);
