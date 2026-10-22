#!/usr/bin/env bash
# Копия боевой базы для локальной разработки: схема и данные public,
# пользователи auth (вход под теми же почтами и паролями), бакеты и файлы
# storage. Источник — свой Supabase на сервере (/opt/supabase), приёмник —
# локальный стек `supabase start` (supabase/config.toml). Прод только читается.
#
#   npm run db:sync            — снять свежую копию и развернуть локально
#   npm run db:sync -- --keep  — развернуть последний скачанный дамп ещё раз
#
# Локальная база после синка полностью заменяется: всё, что агенты насоздавали
# в ней раньше, пропадает. Подробности — docs/local-database.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROOT/.supabase-sync"
HOST="${OKNO_PROD_HOST:-root@145.63.129.107}"
KEY="${OKNO_DEPLOY_KEY:-$HOME/.ssh/okno_deploy}"
DB_CONTAINER="supabase_db_okno"
STORAGE_CONTAINER="supabase_storage_okno"

if [[ "${1:-}" != "--keep" ]]; then
  docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER" || {
    echo "Локальный Supabase не запущен: npm run db:start" >&2
    exit 1
  }

  rm -rf "$CACHE"
  mkdir -p "$CACHE"
  echo "→ Снимаю дамп с сервера…"
  # Одно SSH-соединение: частые подключения сервер принимает за перебор и
  # блокирует адрес. docker compose exec читает stdin — отсекаем его.
  ssh -i "$KEY" -o IdentitiesOnly=yes -o IdentityAgent=none -o BatchMode=yes \
    -o ConnectTimeout=60 "$HOST" bash -s > "$CACHE/dump.tar.gz" << 'REMOTE'
set -euo pipefail
cd /opt/supabase
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
dump() { docker compose exec -T db pg_dump -U postgres -d postgres "$@" < /dev/null; }
dump --schema=public --no-owner > "$tmp/public.sql"
dump --data-only --table=auth.users --table=auth.identities > "$tmp/auth.sql"
dump --data-only --table=storage.buckets --table=storage.objects > "$tmp/storage.sql"
tar -czf - -C "$tmp" public.sql auth.sql storage.sql -C /opt/supabase/volumes storage
REMOTE
  tar -xzf "$CACHE/dump.tar.gz" -C "$CACHE"
  rm "$CACHE/dump.tar.gz"
fi

[[ -f "$CACHE/public.sql" ]] || { echo "Нет дампа в $CACHE — запусти без --keep" >&2; exit 1; }

echo "→ Разворачиваю в локальную базу…"
{
  cat << 'SQL'
\set ON_ERROR_STOP on
set client_min_messages = warning;
begin;
drop schema if exists public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
-- pg_dump --schema=public не выгружает расширения, а btree_gist нужен
-- ограничению bookings_no_overlap_excl.
create extension if not exists btree_gist schema public;
truncate auth.users cascade;
set local storage.allow_delete_query = 'true';
delete from storage.objects;
delete from storage.buckets;
SQL
  cat "$CACHE/auth.sql" "$CACHE/storage.sql"
  # Права по умолчанию для supabase_admin локально задаёт сам стек, а
  # postgres менять их для чужой роли не может.
  grep -v -E "^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin|^CREATE SCHEMA public;|^COMMENT ON SCHEMA public" "$CACHE/public.sql"
  cat << 'SQL'
commit;
notify pgrst, 'reload schema';
SQL
} | docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -q -o /dev/null

echo "→ Копирую файлы хранилища…"
docker exec "$STORAGE_CONTAINER" sh -c 'rm -rf /mnt/stub/stub && mkdir -p /mnt/stub'
docker cp "$CACHE/storage/stub/stub" "$STORAGE_CONTAINER:/mnt/stub/stub" > /dev/null

docker exec "$DB_CONTAINER" psql -U postgres -d postgres -At -c "
  select 'Готово: мастеров ' || (select count(*) from public.profiles)
    || ', записей ' || (select count(*) from public.bookings)
    || ', клиентов ' || (select count(*) from public.clients)
    || ', пользователей ' || (select count(*) from auth.users)
    || ', файлов ' || (select count(*) from storage.objects)"
