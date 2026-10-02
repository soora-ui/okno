# Прокси в РФ для ЮKassa и Unisender

С 28.09.2026 сервер okno (зарубежный хостинг) перестал достукиваться до
`api.yookassa.ru`: TCP иногда соединяется, но TLS не проходит. yoomoney.ru и
ya.ru ведут себя так же, Unisender отвечает по 7–8 секунд. Telegram, Supabase,
Anthropic и sms.ru работают нормально. Похоже, российские сервисы ограничивают
доступ с зарубежных хостингов. Без ЮKassa не создаются платежи.

Перенести okno в РФ целиком нельзя: там перестанет работать Anthropic API. Поэтому
в РФ уходят только запросы к ЮKassa и Unisender, через небольшой прокси.

## Как это устроено

- `src/lib/net/ru-egress.ts` — `ruFetch`. Если задана `RU_EGRESS_PROXY_URL`,
  запрос идёт через прокси (undici `ProxyAgent`), иначе это обычный `fetch`.
  В обоих случаях таймаут 25 с, если вызывающий код не передал свой `signal`.
- Через `ruFetch` идут все запросы из `src/lib/payments/yookassa.ts`,
  `src/lib/payments/yookassa-oauth.ts` и `src/lib/email/unisender.ts`.
- Вебхуки ЮKassa и Unisender приходят к нам через Cloudflare, прокси им не нужен.

## Поднять прокси

1. Взять самый дешёвый VPS с российским IP (Ubuntu 22.04/24.04).
2. Скопировать туда `scripts/ru-egress-proxy-setup.sh` и запустить от root:
   `OKNO_SERVER_IP=185.113.139.76 bash ru-egress-proxy-setup.sh`
   Скрипт ставит tinyproxy с паролем, пускает только IP сервера okno и только
   к доменам ЮKassa/Unisender, закрывает порт файрволом и печатает строку
   `RU_EGRESS_PROXY_URL=...`.
3. Добавить эту строку в `/opt/okno/.env` и выполнить `systemctl restart okno`
   (переменная серверная, пересборка не нужна).
4. Проверить с сервера okno:
   `curl -x "$RU_EGRESS_PROXY_URL" -s -o /dev/null -w '%{http_code}' https://api.yookassa.ru/v3/me`
   Ожидается `401` (ЮKassa доступна, просит авторизацию), а не таймаут.

Отключить: удалить `RU_EGRESS_PROXY_URL` из `.env` и перезапустить okno.
