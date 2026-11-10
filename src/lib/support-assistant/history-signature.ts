import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

// Подпись реплик бота и специалиста в истории чата.
//
// Переписка живёт в браузере (localStorage) и приходит на сервер в каждом
// запросе целиком. Значит, кто угодно может прислать «историю», где бот или
// «специалист поддержки» якобы уже пообещал бесплатный PRO, возврат денег или
// скидку, — и модель продолжит разговор с этой точки. На red-team такие
// подделки она в основном опровергала, но не всегда: ложь про «автоматический
// возврат» в реплике «специалиста» приняла молча.
//
// Поэтому каждая реплика, которую сервер отдаёт от имени бота или
// специалиста, подписывается HMAC. Виджет хранит подпись рядом с текстом и
// отправляет обратно; реплика ассистента без верной подписи из истории
// выбрасывается до вызова модели. Реплики пользователя не подписываются —
// они и так его слова.
//
// Ключ выводится из ключа Anthropic: он есть везде, где работает поддержка,
// и не покидает сервер. Смена ключа обнуляет подписи — старая история просто
// перестанет попадать в контекст, это безопасный отказ.

export type SupportMessageAuthor = "bot" | "operator";

const SIGNATURE_LENGTH = 32;

function signingKey(): Buffer {
  return createHmac("sha256", "okno-support-history-v1")
    .update(env.anthropicApiKey ?? "")
    .digest();
}

export function signSupportMessage(author: SupportMessageAuthor, content: string): string {
  return createHmac("sha256", signingKey())
    .update(`${author}\n${content.trim()}`)
    .digest("base64url")
    .slice(0, SIGNATURE_LENGTH);
}

export function isSupportMessageSignatureValid(
  author: SupportMessageAuthor,
  content: string,
  signature: string | undefined,
): boolean {
  if (!signature || signature.length !== SIGNATURE_LENGTH) {
    return false;
  }

  const expected = Buffer.from(signSupportMessage(author, content));
  const actual = Buffer.from(signature);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
