import { env, isYooKassaConfigured } from "@/lib/env";

// Тонкий клиент ЮKassa. Работает и в тестовом, и в боевом магазине — режим
// определяется тем, какие ключи (тестовые/боевые) положены в env. Серверный
// модуль: использует секретный ключ, нельзя импортировать в клиентский код.

const API_BASE = "https://api.yookassa.ru/v3";

export type YooKassaStatus =
  | "pending"
  | "waiting_for_capture"
  | "succeeded"
  | "canceled";

export type YooKassaPayment = {
  id: string;
  status: YooKassaStatus;
  paid: boolean;
  confirmationUrl: string | null;
  amountValue: string | null;
  metadata: Record<string, unknown>;
};

type YooKassaApiResponse = {
  id?: unknown;
  status?: unknown;
  paid?: unknown;
  amount?: { value?: unknown };
  confirmation?: { confirmation_url?: unknown };
  metadata?: unknown;
};

function authHeader() {
  const token = Buffer.from(
    `${env.yookassaShopId}:${env.yookassaSecretKey}`,
  ).toString("base64");
  return `Basic ${token}`;
}

function parsePayment(data: YooKassaApiResponse): YooKassaPayment {
  const status =
    typeof data.status === "string" ? (data.status as YooKassaStatus) : "pending";

  return {
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
}): Promise<YooKassaPayment> {
  if (!isYooKassaConfigured) {
    throw new Error("ЮKassa не настроена: добавь YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY.");
  }

  const response = await fetch(`${API_BASE}/payments`, {
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
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ЮKassa вернула ошибку ${response.status}: ${text}`);
  }

  return parsePayment((await response.json()) as YooKassaApiResponse);
}

export async function getYooKassaPayment(
  paymentId: string,
): Promise<YooKassaPayment> {
  if (!isYooKassaConfigured) {
    throw new Error("ЮKassa не настроена: добавь YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY.");
  }

  const response = await fetch(
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
