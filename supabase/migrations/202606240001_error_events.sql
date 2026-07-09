-- Технические ошибки со всех пользователей. Сюда пишет серверный logError/
-- reportError (через сервис-роль) и клиентский приёмник /api/observability/
-- client-error. Нужна, чтобы платформенный админ видел проблемы в первую
-- очередь и мог их чинить, не лазая в Sentry.

create table if not exists public.error_events (
  id uuid primary key default gen_random_uuid(),
  level text not null default 'error' check (level in ('warn', 'error')),
  source text not null default 'server' check (source in ('server', 'client')),
  message text not null,
  route text,
  digest text,
  -- профиль, в чьей сессии случилась ошибка (если удалось определить)
  profile_id uuid references public.profiles(id) on delete set null,
  context jsonb,
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists error_events_created_at_idx
  on public.error_events (created_at desc);

create index if not exists error_events_resolved_created_at_idx
  on public.error_events (resolved, created_at desc);

-- Доступ только через сервис-роль (серверные модули и админка). RLS включён
-- без политик, поэтому обычные пользователи через anon-ключ ничего не видят.
alter table public.error_events enable row level security;
