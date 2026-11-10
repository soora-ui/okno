-- Сколько реплик мастер переслал в открытое обращение с последнего ответа
-- специалиста. Пересылки не считались в лимит обращений (5 в час), и каждая
-- продлевала окно разговора, так что мастер мог без конца слать сообщения в
-- группу поддержки. Счётчик растёт при пересылке и обнуляется ответом
-- специалиста; потолок — supportForwardsWithoutReplyLimit в escalation.ts.
alter table public.support_escalations
  add column if not exists master_forwards_since_reply integer not null default 0;
