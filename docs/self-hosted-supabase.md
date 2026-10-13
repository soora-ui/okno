# Свой Supabase на сервере okno

С 05.10.2026 okno работает не на облачном Supabase, а на своём — в Docker на том же
сервере (`145.63.129.107`). Запрос к базе стал занимать ~3 мс вместо ~54 мс.

## Как устроено

- Конфигурация: `/opt/supabase` (официальный self-hosted, релиз `self-hosted/v0.8.2`),
  секреты — `/opt/supabase/.env` (права 600).
- Запущены только нужные сервисы: `db` (Postgres 17.6), `auth`, `rest`, `storage`,
  `imgproxy`, `meta`, `studio`, `api-gw`. Realtime, функции и пулер (`supavisor`) не
  запускаем: okno их не использует, а пулер публикует 5432/6543 на все интерфейсы.
- Запуск: `cd /opt/supabase && docker compose up -d --wait db auth rest storage imgproxy meta studio api-gw`.
  `sh run.sh start` поднимает всё подряд — им не пользоваться.
- Шлюз слушает только `127.0.0.1:8000`. Наружу nginx отдаёт лишь
  `/supabase/{rest,auth,storage}/v1/` (`/etc/nginx/snippets/okno-supabase.conf`);
  дашборд и `/pg/` закрыты.
- okno: `NEXT_PUBLIC_SUPABASE_URL=https://okno.business/supabase` и ключи `ANON_KEY` /
  `SERVICE_ROLE_KEY` из `/opt/supabase/.env`. В `/etc/hosts` сервера `okno.business`
  указывает на `127.0.0.1` — серверные запросы к базе идут локально, без Cloudflare.

## Миграции

Облачный проект `egnplghmcrpbqhdqxdmb` больше не боевой — там копия данных на 05.10.2026.
Миграции применяем к своей базе:

```bash
cd /opt/supabase
docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction -f - < migration.sql
```

## Дашборд (Studio)

Только через SSH-туннель: `ssh -L 8000:127.0.0.1:8000 root@145.63.129.107`, затем
http://localhost:8000. Логин и пароль — `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`
в `/opt/supabase/.env`.

## Бэкапы

`/usr/local/bin/okno-backup.sh`, cron каждый день в 03:30 UTC. В архиве: дамп базы
(`pg_dump -Fc`), роли (`pg_dumpall --globals-only`), файлы хранилища и оба `.env`
(без `PHONE_ENCRYPTION_SECRET` телефоны клиентов не расшифровать). Последние 3 архива
лежат в `/var/backups/okno`, копии за 14 дней — на `185.113.139.76:/root/okno-backups`
(ключ `/root/.ssh/okno_backup`). Лог: `/var/log/okno-backup.log`.

Восстановление базы в свежий Supabase с теми же секретами:

```bash
tar -xf okno-backup-<дата>.tar
docker compose exec -T db pg_restore -U supabase_admin -d postgres --clean --if-exists < db.dump
```

## Грабли

- Не запускать `setup.sh` под `umask 077`: Postgres в контейнере не прочитает
  init-скрипты, и служебные роли останутся без паролей (GoTrue/PostgREST не подключатся).
- Next 16 не оптимизирует картинки с локальных IP, а `okno.business` на сервере
  резолвится в `127.0.0.1`. Без `images.dangerouslyAllowLocalIP: true` в
  `next.config.ts` все фото через `next/image` отдают 400 ("url" parameter is not allowed).
- Первая инициализация базы идёт ~70 с: сначала поднять `db`, дождаться `healthy`,
  потом остальные сервисы — иначе `compose --wait` бросит зависимые.
