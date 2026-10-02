import { env, isYooKassaConfigured } from "@/lib/env";
import { ruFetch } from "@/lib/net/ru-egress";

// Тонкий клиент ЮKassa. Работает и в тестовом, и в боевом магазине — режим
// определяется тем, какие ключи (тестовые/боевые) положены в env. Серверный
// модуль: использует секретный ключ, нельзя импортировать в клиентский код.

const API_BASE = "https://api.yookassa.ru/v3";

export type YooKassaStatus =
  | "pending"
  | "waiting_for_capture"
  | "succeeded"
  | "canceled";

// Сохранённый способ оплаты для автосписания. Номер карты к нам не приходит:
// ЮKassa отдаёт только идентификатор привязки и маску для показа мастеру.
export type YooKassaPaymentMethod = {
  id: string;
  type: string;
  saved: boolean;
  cardLast4: string | null;
  cardType: string | null;
  cardExpiryMonth: string | null;
  cardExpiryYear: string | null;
};

export type YooKassaPayment = {
  id: string;
  status: YooKassaStatus;
  paid: boolean;
  confirmationUrl: string | null;
  amountValue: string | null;
  metadata: Record<string, unknown>;
  paymentMethod: YooKassaPaymentMethod | null;
  // Почему платёж отменён ('insufficient_funds', 'card_expired', ...).
  // Для автосписания это единственный способ отличить «нет денег на карте»
  // от «карта больше не работает» — от этого зависит, ретраить или гасить.
  cancellationReason: string | null;
};

type YooKassaApiResponse = {
  id?: unknown;
  status?: unknown;
  paid?: unknown;
  amount?: { value?: unknown };
  confirmation?: { confirmation_url?: unknown };
  metadata?: unknown;
  payment_method?: {
    id?: unknown;
    type?: unknown;
    saved?: unknown;
    card?: {
      last4?: unknown;
      card_type?: unknown;
      expiry_month?: unknown;
      expiry_year?: unknown;
    };
  };
  cancellation_details?: { reason?: unknown };
};

function authHeader() {
  const token = Buffer.from(
    `${env.yookassaShopId}:${env.yookassaSecretKey}`,
  ).toString("base64");
  return `Basic ${token}`;
}

function parsePaymentMethod(
  data: YooKassaApiResponse["payment_method"],
): YooKassaPaymentMethod | null {
  if (!data || typeof data.id !== "string" || !data.id) {
    return null;
  }

  const card = data.card ?? {};
  const str = (value: unknown) => (typeof value === "string" ? value : null);

  return {
    id: data.id,
    type: typeof data.type === "string" ? data.type : "unknown",
    saved: data.saved === true,
    cardLast4: str(card.last4),
    cardType: str(card.card_type),
    cardExpiryMonth: str(card.expiry_month),
    cardExpiryYear: str(card.expiry_year),
  };
}

function parsePayment(data: YooKassaApiResponse): YooKassaPayment {
  const status =
    typeof data.status === "string" ? (data.status as YooKassaStatus) : "pending";

  return {
    paymentMethod: parsePaymentMethod(data.payment_method),
    cancellationReason:
      data.cancellation_details && typeof data.cancellation_details.reason === "string"
        ? data.cancellation_details.reason
        : null,
    id: typeof data.id === "string" ? data.id : "",
    status,
    paid: data.paid === true,
    confirmationUrl:
      data.confirmation && typeof data.confirmation.confirmation_url === "string"
        ? data.confirmation.confirmation_url
        : null,
    amountValue:
      data.amount && typeof data.amount.value === "string"
        ? data.amount.value
        : null,
    metadata:
      data.metadata && typeof data.metadata === "object"
        ? (data.metadata as Record<string, unknown>)
        : {},
  };
}

export async function createYooKassaPayment(input: {
  amountRub: number;
  description: string;
  returnUrl: string;
  idempotenceKey: string;
  metadata?: Record<string, unknown>;
  // Привязать карту для последующих автосписаний. ЮKassa вернёт
  // payment_method.id только после успешной оплаты и только если мастер
  // заплатил картой — при оплате кошельком или SBP привязки не будет.
  savePaymentMethod?: boolean;
  // Идентификатор плательщика на нашей стороне (profile.id). ЮKassa
  // связывает по нему сохранённые способы оплаты одного покупателя.
  merchantCustomerId?: string;
}): Promise<YooKassaPayment> {
  if (!isYooKassaConfigured) {
    throw new Error("ЮKassa не настроена: добавь YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY.");
  }

  const response = await ruFetch(`${API_BASE}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotence-Key": input.idempotenceKey,
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      amount: { value: input.amountRub.toFixed(2), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: input.returnUrl },
      description: input.description,
      metadata: input.metadata ?? {},
      ...(input.savePaymentMethod ? { save_payment_method: true } : {}),
      ...(input.merchantCustomerId
        ? { merchant_customer_id: input.merchantCustomerId }
        : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ЮKassa вернула ошибку ${response.status}: ${text}`);
  }

  return parsePayment((await response.json()) as YooKassaApiResponse);
}

// Ошибка запроса к ЮKassa с сохранённым HTTP-статусом. Нужна автосписанию:
// 400 по мёртвой привязке (карту закрыли, срок истёк) — это конец жизни
// способа оплаты, ретраить бессмысленно, а 5xx/сеть — временная беда.
export class YooKassaRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }

  // Ответ 4xx означает, что запрос не примут и через сутки — незачем
  // держать мастера в ретраях.
  get isPermanent() {
    return this.status >= 400 && this.status < 500;
  }
}

// Автосписание по ранее привязанной карте. Отличия от обычного платежа:
// нет confirmation (мастера нет рядом, подтверждать некому) и вместо него
// payment_method_id. Платёж уходит сразу в succeeded или canceled — но
// полагаться на это нельзя, статус всё равно подтверждает вебхук.
export async function chargeSavedPaymentMethod(input: {
  paymentMethodId: string;
  amountRub: number;
  description: string;
  idempotenceKey: string;
  metadata?: Record<string, unknown>;
  merchantCustomerId?: string;
}): Promise<YooKassaPayment> {
  if (!isYooKassaConfigured) {
    throw new Error("ЮKassa не настроена: добавь YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY.");
  }

  const response = await ruFetch(`${API_BASE}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotence-Key": input.idempotenceKey,
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      amount: { value: input.amountRub.toFixed(2), currency: "RUB" },
      capture: true,
      payment_method_id: input.paymentMethodId,
      description: input.description,
      metadata: input.metadata ?? {},
      ...(input.merchantCustomerId
        ? { merchant_customer_id: input.merchantCustomerId }
        : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new YooKassaRequestError(
      `ЮKassa вернула ошибку ${response.status}: ${text}`,
      response.status,
    );
  }

  return parsePayment((await response.json()) as YooKassaApiResponse);
}

export async function getYooKassaPayment(
  paymentId: string,
): Promise<YooKassaPayment> {
  if (!isYooKassaConfigured) {
    throw new Error("ЮKassa не настроена: добавь YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY.");
  }

  const response = await ruFetch(
    `${API_BASE}/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: { Authorization: authHeader() },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ЮKassa вернула ошибку ${response.status}: ${text}`);
  }

  return parsePayment((await response.json()) as YooKassaApiResponse);
}

// Возвраты магазина платформы (подписка мастеров). Нужны чекам НПД:
// возвращённые деньги перестают быть доходом, и чек в «Моём налоге» надо
// аннулировать (src/lib/nalog). Возврат подписки делается руками в кабинете
// ЮKassa, поэтому узнать о нём можно только опросом — вебхука
// refund.succeeded мы не подписываем.
export type YooKassaRefund = {
  id: string;
  paymentId: string;
  status: string;
  amountValue: string | null;
  createdAt: string | null;
};

export async function listYooKassaRefunds(input: {
  // ISO-8601. ЮKassa отдаёт возвраты, созданные не раньше этого момента.
  createdAtGte: string;
  cursor?: string | null;
  limit?: number;
}): Promise<{ items: YooKassaRefund[]; nextCursor: string | null }> {
  if (!isYooKassaConfigured) {
    throw new Error("ЮKassa не настроена: добавь YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY.");
  }

  const query = new URLSearchParams({
    status: "succeeded",
    "created_at.gte": input.createdAtGte,
    limit: String(input.limit ?? 100),
  });

  if (input.cursor) {
    query.set("cursor", input.cursor);
  }

  const response = await ruFetch(`${API_BASE}/refunds?${query.toString()}`, {
    headers: { Authorization: authHeader() },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ЮKassa вернула ошибку ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    items?: Array<Record<string, unknown>>;
    next_cursor?: unknown;
  };

  const items: YooKassaRefund[] = (data.items ?? [])
    .filter((item) => typeof item.id === "string" && typeof item.payment_id === "string")
    .map((item) => ({
      id: String(item.id),
      paymentId: String(item.payment_id),
      status: typeof item.status === "string" ? item.status : "unknown",
      amountValue:
        item.amount && typeof (item.amount as { value?: unknown }).value === "string"
          ? String((item.amount as { value?: unknown }).value)
          : null,
      createdAt: typeof item.created_at === "string" ? item.created_at : null,
    }));

  return {
    items,
    nextCursor: typeof data.next_cursor === "string" ? data.next_cursor : null,
  };
}

// Предоплата за услугу (okno-tz-yookassa-oauth.md) идёт напрямую в магазин
// мастера через его личный OAuth-токен — Bearer вместо платформенной пары
// shopId/secretKey. Ошибка со статусом 401/403 означает, что мастер отозвал
// доступ на стороне ЮKassa напрямую (не через кнопку «Отключить») —
// вызывающий код должен пометить аккаунт revoked.
export class YooKassaAuthError extends Error {}

export async function createYooKassaPaymentWithToken(
  accessToken: string,
  input: {
    amountRub: number;
    description: string;
    returnUrl: string;
    idempotenceKey: string;
    metadata?: Record<string, unknown>;
  },
): Promise<YooKassaPayment> {
  const response = await ruFetch(`${API_BASE}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotence-Key": input.idempotenceKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      amount: { value: input.amountRub.toFixed(2), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: input.returnUrl },
      description: input.description,
      metadata: input.metadata ?? {},
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new YooKassaAuthError("Токен мастера отозван или недействителен.");
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ЮKassa вернула ошибку ${response.status}: ${text}`);
  }

  return parsePayment((await response.json()) as YooKassaApiResponse);
}

export async function getYooKassaPaymentWithToken(
  accessToken: string,
  paymentId: string,
): Promise<YooKassaPayment> {
  const response = await ruFetch(
    `${API_BASE}/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (response.status === 401 || response.status === 403) {
    throw new YooKassaAuthError("Токен мастера отозван или недействителен.");
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ЮKassa вернула ошибку ${response.status}: ${text}`);
  }

  return parsePayment((await response.json()) as YooKassaApiResponse);
}
