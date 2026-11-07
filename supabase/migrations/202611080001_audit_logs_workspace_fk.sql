-- audit_logs.workspace_id ссылался на profiles(id), но workspace_id — это
-- не профиль, а общий идентификатор рабочего пространства (profiles.workspace_id,
-- 202604190002_workspace_accounts.sql). У соло-мастера он совпадает с id
-- профиля, а у студий это отдельный uuid, которого нет среди profiles.id.
-- Из-за ключа каждая запись аудита по студии падала с 23503 и терялась.
-- Отдельной таблицы workspaces нет, а profiles.workspace_id не уникален,
-- поэтому сослаться не на что: снимаем внешний ключ. Индекс
-- audit_logs_workspace_created_at_idx и RLS-политика остаются как были.
alter table public.audit_logs
  drop constraint if exists audit_logs_workspace_id_fkey;

comment on column public.audit_logs.workspace_id is
  'profiles.workspace_id рабочего пространства (не profiles.id); без внешнего ключа';
