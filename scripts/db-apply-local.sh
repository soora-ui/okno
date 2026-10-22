#!/usr/bin/env bash
# Применить миграции к локальной базе (supabase start), не трогая прод:
#   npm run db:apply -- supabase/migrations/202610210001_service_discounts.sql
# Нужно после npm run db:sync, если код уже читает колонки из миграции,
# которой на проде ещё нет. Каждый файл — отдельной транзакцией.
set -euo pipefail
[[ $# -gt 0 ]] || { echo "Укажи файлы миграций" >&2; exit 1; }
for file in "$@"; do
  docker exec -i supabase_db_okno psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q \
    --single-transaction -c "set client_min_messages = warning" -f - < "$file"
  echo "✓ $file"
done
docker exec supabase_db_okno psql -U postgres -d postgres -q -c "notify pgrst, 'reload schema'"
