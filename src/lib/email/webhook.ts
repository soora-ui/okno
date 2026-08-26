import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import type { EmailLogStatus } from "@/lib/email/notification-log";

// Разбор вебхуков Unisender Go. Структура и список статусов — по разделу
// callback-format официальной документации:
// https://godocs.unisender.ru/web-api-ref#callback-format

// Подпись вебхука: MD5 от тела запроса, в котором значение поля auth заменено
// на API-ключ. Это одновременно и аутентификация, и проверка целостности —
// отдельный секрет для вебхука Unisender Go не использует.
export function verifyUnisenderSignature(rawBody: string, auth: string) {
  if (!env.unisenderApiKey || !auth) {
    return false;
  }

  const expected = createHash("md5")
    .update(rawBody.replace(auth, env.unisenderApiKey), "utf8")
    .digest("hex");

  const authBuffer = Buffer.from(auth.toLowerCase());
  const expectedBuffer = Buffer.from(expected);

  return (
    authBuffer.length === expectedBuffer.length &&
    timingSafeEqual(authBuffer, expectedBuffer)
  );
}

// Статусы доставки email из документации. Один в один совпадают со значениями
// notification_log.status, поэтому маппинг — это проверка «знаем ли мы такой
// статус», а не переименование. Неизвестное значение лучше пропустить, чем
// уронить на нём constraint таблицы.
const emailStatuses = new Set<EmailLogStatus>([
  "accepted",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "unsubscribed",
  "subscribed",
  "soft_bounced",
  "hard_bounced",
  "spam",
]);

export type UnisenderEmailEvent = {
  status: EmailLogStatus;
  email: string;
  jobId: string | null;
  metadata: Record<string, unknown>;
  eventAt: string | null;
  errorMessage: string | null;
};

export type UnisenderSpamBlock = {
  domain: string | null;
  domainStatus: string | null;
  blockType: string | null;
  blockTime: string | null;
};

export type UnisenderWebhookPayload = {
  auth: string;
  emailEvents: UnisenderEmailEvent[];
  spamBlocks: UnisenderSpamBlock[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// event_time приходит строкой «ГГГГ-ММ-ДД чч:мм:сс» в UTC — без пометки о зоне
// её нельзя отдавать в Postgres как есть, иначе время уедет на часовой пояс
// сервера.
function parseEventTime(value: unknown): string | null {
  const raw = asString(value);

  if (!raw) {
    return null;
  }

  const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/);

  if (!match) {
    return null;
  }

  return `${match[1]}T${match[2]}Z`;
}

// У недоставки полезны оба поля: внутренняя классификация Unisender Go и
// дословный ответ принимающего сервера. Первое удобно группировать, второе —
// единственное, что объясняет отказ конкретного провайдера.
function buildErrorMessage(deliveryInfo: Record<string, unknown>): string | null {
  const deliveryStatus = asString(deliveryInfo.delivery_status);
  const destinationResponse = asString(deliveryInfo.destination_response);

  const parts = [deliveryStatus, destinationResponse].filter(Boolean);

  return parts.length > 0 ? parts.join(": ") : null;
}

export function parseUnisenderWebhook(body: unknown): UnisenderWebhookPayload | null {
  const root = asRecord(body);
  const auth = asString(root.auth);
  const eventsByUser = Array.isArray(root.events_by_user) ? root.events_by_user : null;

  if (!auth || !eventsByUser) {
    return null;
  }

  const emailEvents: UnisenderEmailEvent[] = [];
  const spamBlocks: UnisenderSpamBlock[] = [];

  for (const userEntry of eventsByUser) {
    const events = asRecord(userEntry).events;

    if (!Array.isArray(events)) {
      continue;
    }

    for (const event of events) {
      const eventRecord = asRecord(event);
      const eventName = asString(eventRecord.event_name);
      const eventData = asRecord(eventRecord.event_data);

      if (eventName === "transactional_spam_block") {
        spamBlocks.push({
          domain: asString(eventData.domain),
          domainStatus: asString(eventData.domain_status),
          blockType: asString(eventData.block_type),
          blockTime: parseEventTime(eventData.block_time),
        });
        continue;
      }

      if (eventName !== "transactional_email_status") {
        continue;
      }

      const status = asString(eventData.status);
      const email = asString(eventData.email);

      if (!email || !status || !emailStatuses.has(status as EmailLogStatus)) {
        continue;
      }

      emailEvents.push({
        status: status as EmailLogStatus,
        email,
        jobId: asString(eventData.job_id),
        metadata: asRecord(eventData.metadata),
        eventAt: parseEventTime(eventData.event_time),
        errorMessage: buildErrorMessage(asRecord(eventData.delivery_info)),
      });
    }
  }

  return { auth, emailEvents, spamBlocks };
}
