import { createHash } from "node:crypto";
import { logWarn } from "@/lib/observability/logger";

// Клиент личного кабинета «Мой налог» (lknpd.nalog.ru).
//
// Публичного API у ФНС для самозанятых нет — это тот же приватный JSON-API, на
// котором работает веб-кабинет. Отсюда особенности, которые нельзя «упростить»:
//
//   * заголовки притворяются браузером (Origin/Referer/User-Agent) — без них
//     кабинет отвечает 403;
//   * сессия привязана к deviceId: сменился идентификатор — прежний токен
//     недействителен, поэтому deviceId вычисляется один раз и хранится в базе;
//   * refreshToken ротируется при каждом обновлении, старый сразу умирает;
//   * кабинет доступен только с российских IP (см. NALOG_PROXY_URL).
//
// Порт логики из github.com/grandvan709/yookassa-to-mynalog (Apache-2.0):
// оттуда взяты набор эндпоинтов, форма тела запросов и приём с поиском уже
// выбитого чека после неудачного ответа.

const API_BASE = "https://lknpd.nalog.ru/api/v1";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

const REQUEST_TIMEOUT_MS = 30_000;

// Токен кабинета живёт около четырёх часов. Обновляем заранее, чтобы запрос не
// упёрся в 401 ровно на границе.
const TOKEN_EXPIRY_SKEW_MS = 5 * 60 * 1000;

// Вход не удался: пароль сменили, refreshToken отозвали, аккаунт снят с учёта.
// Повторять бессмысленно — нужен человек.
export class NalogAuthError extends Error {}

// Кабинет ответил ошибкой. 4xx (кроме 401) — проблема в самом запросе и
// повтором не лечится; 5xx и обрывы сети лечатся.
export class NalogRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }

  get isPermanent() {
    return this.status >= 400 && this.status < 500;
  }
}

export type NalogAuthMethodInput = "password" | "refresh";

// Причина аннулирования: кабинет принимает только два значения из своего
// списка, любой другой текст он отклонит.
export type NalogCancelReason = "Возврат средств" | "Чек сформирован ошибочно";

export type NalogIncome = {
  receiptUuid: string;
  receiptUrl: string;
};

export type NalogClientInput = {
  inn: string;
  authMethod: NalogAuthMethodInput;
  password?: string | null;
  refreshToken?: string | null;
  deviceId: string;
  proxyUrl?: string | null;
  // Вызывается, когда кабинет выдал новый refreshToken: его нужно немедленно
  // сохранить, иначе следующий запуск останется с мёртвым.
  onRefreshToken?: (token: string) => Promise<void>;
};

// deviceId в кабинете — 21 символ. Считаем его от ИНН, чтобы он был
// восстановим, если строка состояния потеряется.
export function deriveNalogDeviceId(inn: string) {
  return createHash("sha256").update(inn, "utf8").digest("hex").slice(0, 21);
}

// Прокси для запросов к ФНС. Node-овский fetch принимает undici-диспетчер, но
// самого undici в зависимостях нет: он нужен только тем, у кого приложение
// стоит за пределами РФ. Отсюда подключение через переменную-спецификатор и
// webpackIgnore — так сборка не требует пакета, которого может не быть, а
// ошибка «поставь undici» приходит только при заданном NALOG_PROXY_URL.
const UNDICI_SPECIFIER = "undici";

let dispatcherPromise: Promise<unknown> | null = null;

function getProxyDispatcher(proxyUrl: string) {
  if (!dispatcherPromise) {
    dispatcherPromise = import(/* webpackIgnore: true */ UNDICI_SPECIFIER)
      .then((undici: { ProxyAgent: new (uri: string) => unknown }) => {
        return new undici.ProxyAgent(proxyUrl);
      })
      .catch((error) => {
        throw new Error(
          `NALOG_PROXY_URL задан, но пакет undici не установлен (npm i undici): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }

  return dispatcherPromise;
}

function baseHeaders() {
  return {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "ru,en-US;q=0.9,en;q=0.8",
    "Content-Type": "application/json",
    Origin: "https://lknpd.nalog.ru",
    Referer: "https://lknpd.nalog.ru/",
    "User-Agent": USER_AGENT,
  } satisfies Record<string, string>;
}

function deviceInfo(deviceId: string) {
  return {
    sourceDeviceId: deviceId,
    sourceType: "WEB",
    appVersion: "1.0.0",
    metaDetails: { userAgent: USER_AGENT },
  };
}

// Кабинет складывает человеческую причину отказа в message — она гораздо
// полезнее кода статуса, когда чек не выбился.
async function readError(response: Response) {
  const text = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { message?: unknown };
    if (typeof parsed.message === "string" && parsed.message) {
      return parsed.message.slice(0, 300);
    }
  } catch {
    // Не JSON — вернём как есть, обрезав.
  }
  return text ? text.slice(0, 300) : `HTTP ${response.status}`;
}

// Дата расчёта в формате кабинета: локальное время со смещением,
// 2026-08-06T12:30:00+03:00. Времени в UTC («Z») кабинет не понимает.
export function formatNalogDateTime(date: Date, timeZone = "Europe/Moscow") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  // Смещение зоны считаем от той же даты: у Москвы оно постоянное, но
  // хардкодить +03:00 — значит сломаться при первой же смене TZ в конфиге.
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // '24' вместо '00' — известная особенность hour12: false.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMinutes = Math.round((asUtc - date.getTime()) / 60_000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absMinutes = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absMinutes / 60)).padStart(2, "0")}:${String(
    absMinutes % 60,
  ).padStart(2, "0")}`;

  const hour = String(Number(parts.hour) % 24).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}${offset}`;
}

// Сумма для кабинета: он принимает число, но сверяет его с суммой позиций,
// поэтому округляем до копеек один раз и в одном месте.
function toKopeckPrecision(amountRub: number) {
  return Math.round(amountRub * 100) / 100;
}

export class NalogClient {
  private token: string | null = null;
  private tokenExpiresAt = 0;
  private refreshToken: string | null;

  constructor(private readonly input: NalogClientInput) {
    this.refreshToken = input.refreshToken ?? null;
  }

  private async request(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown; token?: string | null },
  ) {
    const headers: Record<string, string> = baseHeaders();
    if (init.token) {
      headers.Authorization = `Bearer ${init.token}`;
    }

    const options: RequestInit & { dispatcher?: unknown } = {
      method: init.method,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    };

    if (this.input.proxyUrl) {
      options.dispatcher = await getProxyDispatcher(this.input.proxyUrl);
    }

    return fetch(`${API_BASE}${path}`, options);
  }

  private applyTokenResponse(data: {
    token?: unknown;
    tokenExpireIn?: unknown;
    refreshToken?: unknown;
  }) {
    if (typeof data.token !== "string" || !data.token) {
      throw new NalogAuthError("Кабинет не вернул токен авторизации.");
    }

    this.token = data.token;

    const expiresAt =
      typeof data.tokenExpireIn === "string" ? Date.parse(data.tokenExpireIn) : NaN;
    this.tokenExpiresAt = Number.isFinite(expiresAt)
      ? expiresAt - TOKEN_EXPIRY_SKEW_MS
      : Date.now() + 60 * 60 * 1000;

    return typeof data.refreshToken === "string" && data.refreshToken
      ? data.refreshToken
      : null;
  }

  private async persistRefreshToken(token: string | null) {
    if (!token || token === this.refreshToken) {
      return;
    }

    this.refreshToken = token;

    if (this.input.onRefreshToken) {
      await this.input.onRefreshToken(token);
    }
  }

  // Вход. Пароль от кабинета ФНС либо refreshToken — у аккаунтов, заведённых
  // через Госуслуги, пароля просто нет.
  async authenticate() {
    const useRefresh = this.input.authMethod === "refresh";
    const path = useRefresh ? "/auth/token" : "/auth/lkfl";
    const body = useRefresh
      ? {
          deviceInfo: deviceInfo(this.input.deviceId),
          refreshToken: this.refreshToken,
        }
      : {
          username: this.input.inn,
          password: this.input.password,
          deviceInfo: deviceInfo(this.input.deviceId),
        };

    if (useRefresh && !this.refreshToken) {
      throw new NalogAuthError(
        "Нет refreshToken «Моего налога»: добавь NALOG_REFRESH_TOKEN и перезапусти приложение.",
      );
    }

    const response = await this.request(path, { method: "POST", body });

    if (!response.ok) {
      const message = await readError(response);
      // 4xx на входе — это неверные учётные данные или отозванный токен.
      if (response.status >= 400 && response.status < 500) {
        throw new NalogAuthError(`Мой налог: вход отклонён (${message}).`);
      }
      throw new NalogRequestError(`Мой налог: вход не удался (${message}).`, response.status);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const nextRefreshToken = this.applyTokenResponse(data);
    // Пароль тоже выдаёт refreshToken — сохраняем его: если пароль потом
    // сменят, чеки продолжат выбиваться до истечения токена.
    await this.persistRefreshToken(nextRefreshToken);
  }

  private async getToken() {
    if (this.token && Date.now() < this.tokenExpiresAt) {
      return this.token;
    }

    await this.authenticate();
    return this.token!;
  }

  // Один повтор после 401: токен мог протухнуть между проверкой и запросом.
  private async authorizedRequest(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown },
  ) {
    let response = await this.request(path, { ...init, token: await this.getToken() });

    if (response.status === 401) {
      this.token = null;
      response = await this.request(path, { ...init, token: await this.getToken() });
    }

    return response;
  }

  receiptUrl(receiptUuid: string) {
    return `${API_BASE}/receipt/${this.input.inn}/${receiptUuid}/print`;
  }

  // Регистрация дохода = выбитый чек.
  //
  // client.incomeType = FROM_INDIVIDUAL: плательщик — физлицо. Для оплат от
  // юрлиц и ИП налоговая ждёт FROM_LEGAL_ENTITY с ИНН плательщика, которого у
  // нас нет (ЮKassa его не отдаёт). См. docs/nalog-setup.md.
  //
  // paymentType = CASH: так же поступает и веб-кабинет для поступлений на
  // карту — отдельного типа для эквайринга в API нет.
  async addIncome(input: {
    name: string;
    amountRub: number;
    operationTime: Date;
  }): Promise<NalogIncome> {
    const amount = toKopeckPrecision(input.amountRub);
    const operationTime = formatNalogDateTime(input.operationTime);
    const requestTime = formatNalogDateTime(new Date());

    const response = await this.authorizedRequest("/income", {
      method: "POST",
      body: {
        operationTime,
        requestTime,
        services: [{ name: input.name, amount, quantity: 1 }],
        totalAmount: String(amount),
        client: {
          contactPhone: null,
          displayName: null,
          inn: null,
          incomeType: "FROM_INDIVIDUAL",
        },
        paymentType: "CASH",
        ignoreMaxTotalIncomeRestriction: false,
      },
    });

    if (!response.ok) {
      const message = await readError(response);
      throw new NalogRequestError(`Мой налог: чек не выбит (${message}).`, response.status);
    }

    const data = (await response.json()) as { approvedReceiptUuid?: unknown };
    const receiptUuid =
      typeof data.approvedReceiptUuid === "string" ? data.approvedReceiptUuid : "";

    if (!receiptUuid) {
      // Ответ 200 без номера чека — редкость, но полагаться на него нельзя:
      // деньги могли быть проведены. Вызывающий код после этой ошибки идёт
      // искать чек в кабинете, а не выбивает второй.
      throw new NalogRequestError(
        "Мой налог: ответ без approvedReceiptUuid.",
        response.status,
      );
    }

    return { receiptUuid, receiptUrl: this.receiptUrl(receiptUuid) };
  }

  async cancelIncome(receiptUuid: string, reason: NalogCancelReason) {
    const now = formatNalogDateTime(new Date());

    const response = await this.authorizedRequest("/cancel", {
      method: "POST",
      body: {
        operationTime: now,
        requestTime: now,
        comment: reason,
        receiptUuid,
      },
    });

    if (!response.ok) {
      const message = await readError(response);
      throw new NalogRequestError(
        `Мой налог: чек ${receiptUuid} не аннулирован (${message}).`,
        response.status,
      );
    }
  }

  // Поиск уже выбитого чека по наименованию и сумме. Нужен ровно в одном
  // сценарии: предыдущая попытка оборвалась на ответе, и мы не знаем, дошёл
  // ли доход до кабинета. Без этой проверки повтор выбивает второй чек на те
  // же деньги — а лишний доход в НПД снимается только руками.
  async findIncome(input: {
    name: string;
    amountRub: number;
    withinDays?: number;
  }): Promise<NalogIncome | null> {
    const amount = toKopeckPrecision(input.amountRub);
    const now = new Date();
    const from = new Date(now.getTime() - (input.withinDays ?? 7) * 24 * 60 * 60 * 1000);

    const query = new URLSearchParams({
      from: from.toISOString(),
      to: now.toISOString(),
      offset: "0",
      sortBy: "operation_time:desc",
      limit: "50",
    });

    const response = await this.authorizedRequest(`/incomes?${query.toString()}`, {
      method: "GET",
    });

    if (!response.ok) {
      const message = await readError(response);
      throw new NalogRequestError(
        `Мой налог: список чеков недоступен (${message}).`,
        response.status,
      );
    }

    const data = (await response.json()) as {
      content?: Array<{
        name?: unknown;
        totalAmount?: unknown;
        approvedReceiptUuid?: unknown;
        cancellationInfo?: unknown;
      }>;
    };

    for (const income of data.content ?? []) {
      if (income.cancellationInfo) {
        continue;
      }
      if (income.name !== input.name) {
        continue;
      }
      if (toKopeckPrecision(Number(income.totalAmount ?? 0)) !== amount) {
        continue;
      }

      const receiptUuid =
        typeof income.approvedReceiptUuid === "string" ? income.approvedReceiptUuid : "";
      if (!receiptUuid) {
        logWarn("Nalog: matched income without approvedReceiptUuid", { name: input.name });
        continue;
      }

      return { receiptUuid, receiptUrl: this.receiptUrl(receiptUuid) };
    }

    return null;
  }
}
