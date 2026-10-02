import { fetch as undiciFetch, ProxyAgent } from "undici";
import { env } from "@/lib/env";

// Часть российских сервисов (ЮKassa, ЮMoney, Unisender) перестаёт отвечать на
// запросы с зарубежного хостинга. Такие запросы можно пустить через прокси в РФ:
// RU_EGRESS_PROXY_URL=http://user:pass@host:port. Без переменной — обычный fetch.
const DEFAULT_TIMEOUT_MS = 25_000;

let proxyAgent: ProxyAgent | null | undefined;

function getProxyAgent() {
  if (proxyAgent === undefined) {
    proxyAgent = env.ruEgressProxyUrl ? new ProxyAgent(env.ruEgressProxyUrl) : null;
  }

  return proxyAgent;
}

export function ruFetch(input: string, init: RequestInit = {}): Promise<Response> {
  // Без таймаута зависшее TLS-рукопожатие держит запрос минутами, и оплата «висит».
  const signal = init.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const agent = getProxyAgent();

  if (!agent) {
    return fetch(input, { ...init, signal });
  }

  // fetch и ProxyAgent берём из одного пакета: чужой dispatcher во встроенном
  // в Node fetch ломается, когда версии undici расходятся.
  return undiciFetch(input, {
    ...(init as Parameters<typeof undiciFetch>[1]),
    signal,
    dispatcher: agent,
  }) as unknown as Promise<Response>;
}
