-- Покупка подарочного сертификата уходит напрямую в магазин мастера через его
-- OAuth-токен ЮKassa (okno-tz-yookassa-oauth.md), а не через платформенную
-- пару shopId/secretKey. До этой миграции деньги покупателя физически
-- проходили через счёт ИП платформы, что противоречит модели: платформа не
-- платёжный агент (PRODUCT.md, раздел «Деньги»;
-- okno-functional-description.md п. 7.2). Область OAuth расширяется с одной
-- предоплаты (202607140001_yookassa_oauth_accounts.sql) на сертификаты;
-- на платформенных ключах остаются только чаевые (до переезда на CloudTips,
-- okno-todo.md) и PRO-подписка мастера — там платит мастер платформе, и это
-- как раз её собственный доход.
--
-- Связь нужна вебхуку: статус платежа перепроверяется тем же Bearer-токеном,
-- которым платёж был создан — ровно как prepayments.master_yookassa_account_id.
--
-- Колонка nullable: у сертификатов, купленных до миграции, платёж живёт в
-- магазине платформы, и вебхук по ним и дальше ходит её ключами.
alter table gift_certificates
  add column if not exists master_yookassa_account_id uuid
  references master_yookassa_accounts(id) on delete set null;
