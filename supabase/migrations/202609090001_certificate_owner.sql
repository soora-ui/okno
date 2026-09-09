-- Владелец сертификата: чей он в кабинете клиента.
--
-- До этой миграции покупатель записан одним текстовым полем purchaser_contact
-- («почта · контакт»), а получатель не записан вообще — и правильно, потому
-- что сертификат подарок: покупает один, пользуется другой, связывает их
-- только код. Для мастера этого хватало, для кабинета клиента нет: по такому
-- полю не понять, чей сертификат показывать.
--
-- Два хеша вместо одного, потому что это два разных человека:
--
--   purchaser_phone_hash — проставляется при покупке, если в контакте был
--   телефон. Закрывает случай «купил себе»: сертификат появляется в кабинете
--   сам, без ввода кода.
--
--   owner_phone_hash — проставляется, когда человек ввёл код в кабинете. Это
--   единственный способ узнать получателя подарка: больше о нём никто ничего
--   не сообщает.
--
-- Хеш тот же, что у clients.phone_hash (202604050001): sha256 от секрета и
-- цифр телефона. Значит по одному хешу находится и человек, и его записи, и
-- его сертификаты — без хранения самого номера.
--
-- Привязка не даёт исключительных прав: код — предъявительский документ, и
-- погасить сертификат может тот, у кого код на руках. owner_phone_hash решает
-- только, в чьём кабинете он показывается.

begin;

alter table gift_certificates
  add column if not exists purchaser_phone_hash text,
  add column if not exists owner_phone_hash text,
  -- Когда предъявили код в кабинете. Нужно, чтобы отличить «привязал сам» от
  -- «проставилось при покупке» при разборе спорных случаев.
  add column if not exists owner_claimed_at timestamptz;

-- Выборка сертификатов человека в кабинете идёт по обоим хешам.
create index if not exists gift_certificates_owner_phone_idx
on gift_certificates(owner_phone_hash)
where owner_phone_hash is not null;

create index if not exists gift_certificates_purchaser_phone_idx
on gift_certificates(purchaser_phone_hash)
where purchaser_phone_hash is not null;

commit;

-- Откат:
-- begin;
-- drop index if exists gift_certificates_purchaser_phone_idx;
-- drop index if exists gift_certificates_owner_phone_idx;
-- alter table gift_certificates
--   drop column if exists owner_claimed_at,
--   drop column if exists owner_phone_hash,
--   drop column if exists purchaser_phone_hash;
-- commit;
