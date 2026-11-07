<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Database

Local dev runs against a Docker copy of the production database, not the cloud Supabase project (that one is stale). Start it with `npm run db:start`, refresh it from prod with `npm run db:sync`, and apply a new migration locally with `npm run db:apply -- <file>`. Do not use the Supabase MCP connector for data or migrations. See `docs/local-database.md`.

# Фичи

Список работающих функций ведётся в папке `Фичи/`. Обновляй его каждый раз, когда реализуешь новую функцию, фишку или дополнение к существующей, и ещё раз после её выпуска на прод.

- `Фичи/okno-features-prod.md` — только то, что уже работает на проде. Запись добавляй или правь после деплоя, когда проверил, что функция работает на живом сайте. Обнови дату «Состояние на …» в шапке.
- `Фичи/okno-features-pending.md` — реализовано в коде, но ещё не на проде. Запись добавляй сразу после реализации. После деплоя перенеси её в `okno-features-prod.md` в нужный раздел.
- Формат строки: `* **Название функции** — как работает, чем отличается, особенности и ограничения (тарифы, лимиты).` Пиши по-русски, обычными словами, с фактическими цифрами из кода.
- Изменение существующей функции правит её строку, дубль рядом не добавляется. Убранная или отключённая функция удаляется из списка.
- Планы, эксперименты и функции за выключенным флагом или незаданными переменными окружения в `okno-features-prod.md` не пишутся.
