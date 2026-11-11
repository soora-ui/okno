import { describe, expect, it } from "vitest";
import {
  planAuthEmails,
  signHookBody,
  verifyHookSignature,
  type SendEmailHookPayload,
} from "@/lib/auth/email-hook";

const secret = `v1,whsec_${Buffer.from("test-secret-0123456789abcdef").toString("base64")}`;
const appUrl = "https://okno.business";

function signed(body: string, timestamp = "1700000000") {
  return {
    secret,
    id: "msg_1",
    timestamp,
    signature: signHookBody({ secret, id: "msg_1", timestamp, body }),
    body,
    nowSeconds: 1700000000,
  };
}

function payload(
  type: SendEmailHookPayload["email_data"]["email_action_type"],
  extra: Partial<SendEmailHookPayload["email_data"]> = {},
  user: Partial<SendEmailHookPayload["user"]> = {},
): SendEmailHookPayload {
  return {
    user: { id: "user-1", email: "anna@example.com", ...user },
    email_data: { email_action_type: type, token_hash: "hash-1", ...extra },
  };
}

describe("подпись хука Send Email", () => {
  it("принимает подпись тем же секретом", () => {
    expect(verifyHookSignature(signed('{"a":1}'))).toBe(true);
  });

  it("отклоняет изменённое тело и чужой секрет", () => {
    const input = signed('{"a":1}');
    expect(verifyHookSignature({ ...input, body: '{"a":2}' })).toBe(false);
    const otherSecret = `v1,whsec_${Buffer.from("other").toString("base64")}`;
    expect(verifyHookSignature({ ...input, secret: otherSecret })).toBe(false);
  });

  it("отклоняет старый запрос и пустые заголовки", () => {
    const input = signed('{"a":1}', String(1700000000 - 600));
    expect(verifyHookSignature(input)).toBe(false);
    expect(verifyHookSignature({ ...signed("{}"), signature: null })).toBe(false);
  });

  it("находит верную подпись среди нескольких", () => {
    const input = signed("{}");
    expect(verifyHookSignature({ ...input, signature: `v1,AAAA ${input.signature}` })).toBe(true);
  });
});

describe("какие письма отправить", () => {
  it("регистрация — ссылка на страницу подтверждения", () => {
    const [message] = planAuthEmails(payload("signup"), appUrl);
    expect(message.to).toBe("anna@example.com");
    expect(message.link).toBe("https://okno.business/auth/confirm?token_hash=hash-1&type=signup");
  });

  it("берёт имя из данных регистрации — только первое слово", () => {
    const [message] = planAuthEmails(
      payload("signup", {}, { user_metadata: { full_name: "  Анна Смирнова " } }),
      appUrl,
    );
    expect(message.name).toBe("Анна");
    expect(planAuthEmails(payload("signup"), appUrl)[0].name).toBeUndefined();
  });

  it("сброс пароля", () => {
    const [message] = planAuthEmails(payload("recovery"), appUrl);
    expect(message.kind).toBe("recovery");
    expect(message.link).toContain("type=recovery");
  });

  it("безопасная смена почты — письмо на оба адреса со своими токенами", () => {
    const messages = planAuthEmails(
      payload("email_change", { token_hash_new: "hash-2" }, { new_email: "new@example.com" }),
      appUrl,
    );
    expect(messages.map((m) => [m.to, m.role])).toEqual([
      ["new@example.com", "new"],
      ["anna@example.com", "current"],
    ]);
    expect(messages[1].link).toContain("token_hash=hash-2");
  });

  it("ненужные типы и пустой токен ничего не отправляют", () => {
    expect(planAuthEmails(payload("magiclink"), appUrl)).toEqual([]);
    expect(planAuthEmails(payload("signup", { token_hash: "" }), appUrl)).toEqual([]);
  });
});
