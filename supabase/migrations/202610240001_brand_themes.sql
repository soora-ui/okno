-- Фирменный стиль публичной страницы (okno-tz-brand-theme-ui.md).
--
-- Активная тема лежит прямо в profiles.brand_theme: публичная страница и так
-- читает профиль, отдельный join на каждый показ страницы не нужен. Формат —
-- токены, которые проверяет zod-схема src/lib/brand-theme/schema.ts; битая
-- запись в коде превращается в null, и страница остаётся на пресете.
--
-- brand_themes — черновики и история версий для мастера генерации: мастер
-- может вернуться к любому из сгенерированных вариантов. brand_theme_generations
-- — журнал списаний, по нему считается лимит «3 генерации в месяц».

alter table profiles
  add column if not exists brand_theme jsonb,
  add column if not exists brand_theme_applied_at timestamptz;

create table if not exists brand_themes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  tokens jsonb not null,
  -- draft — сгенерирован и ждёт решения, active — сейчас на странице,
  -- archived — был применён раньше или вытеснен новой версией.
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  -- Что мастер загрузил и написал: пути к файлам в сторадже, выбранное
  -- настроение, комментарий к перегенерации. Нужно, чтобы «Поправить»
  -- продолжало с того же контекста, а не начинало с нуля.
  source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists brand_themes_profile_created_idx
on brand_themes(profile_id, created_at desc);

-- Активная версия у мастера одна.
create unique index if not exists brand_themes_one_active_idx
on brand_themes(profile_id) where status = 'active';

alter table brand_themes enable row level security;

drop policy if exists "Owners can manage own brand themes" on brand_themes;
create policy "Owners can manage own brand themes" on brand_themes
for all
using (
  exists (
    select 1 from profiles
    where profiles.id = brand_themes.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1 from profiles
    where profiles.id = brand_themes.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
);

create table if not exists brand_theme_generations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  -- full — новая генерация с нуля, списывает попытку; tweak — точечная
  -- правка («Поправить»), считается отдельно, чтобы цену правки можно было
  -- менять, не трогая схему.
  kind text not null check (kind in ('full', 'tweak')),
  -- Купленная сверх лимита генерация помечается, чтобы не съедать
  -- бесплатные попытки следующего месяца.
  paid boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists brand_theme_generations_profile_created_idx
on brand_theme_generations(profile_id, created_at desc);

-- Мастер видит свой журнал, но пишет в него только сервер (admin-клиент):
-- иначе счётчик можно было бы обнулить прямым запросом.
alter table brand_theme_generations enable row level security;

drop policy if exists "Owners can read own brand theme generations" on brand_theme_generations;
create policy "Owners can read own brand theme generations" on brand_theme_generations
for select
using (
  exists (
    select 1 from profiles
    where profiles.id = brand_theme_generations.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
);
