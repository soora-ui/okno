import { describe, expect, it } from "vitest";
import {
  resolveSupportAnswer,
  supportAnswerSchema,
  type SupportAnswer,
} from "@/lib/support-assistant/answer";

// Разбор исходов — единственное место, где обещание «бот ходит только по базе
// знаний» превращается в проверяемое условие. Если эти тесты падают, бот
// начал отвечать из общих знаний модели, и заметить это иначе нечем.

const context = {
  isAuthenticated: true,
  question: "почему не прошёл платёж",
  hasOpenEscalation: true,
};
const guest = { ...context, isAuthenticated: false, hasOpenEscalation: false };

function answer(patch: Partial<SupportAnswer>): SupportAnswer {
  return { reply: "текст", outcome: "answer", ...patch } as SupportAnswer;
}

describe("resolveSupportAnswer", () => {
  it("отдаёт ответ, опирающийся на настоящую тему карты", () => {
    const verdict = resolveSupportAnswer(
      answer({ sources: ["Тарифы и цены"] }),
      context,
    );

    expect(verdict).toEqual({ kind: "reply", reply: "текст", suggestions: [] });
  });

  it("зовёт человека, когда ответ ни на что не опирается", () => {
    const verdict = resolveSupportAnswer(answer({ sources: [] }), context);

    expect(verdict).toEqual({ kind: "escalate", summary: "почему не прошёл платёж" });
  });

  it("зовёт человека, когда источник выдуман", () => {
    const verdict = resolveSupportAnswer(
      answer({ sources: ["Интеграция с Instagram"] }),
      context,
    );

    expect(verdict.kind).toBe("escalate");
  });

  it("подставляет суть от модели в обращение к человеку", () => {
    const verdict = resolveSupportAnswer(
      answer({ outcome: "needs_human", summary: "платёж завис" }),
      context,
    );

    expect(verdict).toEqual({ kind: "escalate", summary: "платёж завис" });
  });

  it("гостю не показывает выдуманный ответ, а зовёт заводить аккаунт", () => {
    const verdict = resolveSupportAnswer(answer({ sources: [] }), {
      ...context,
      isAuthenticated: false,
    });

    expect(verdict.kind).toBe("reply");
    expect(verdict.kind === "reply" && verdict.reply).toContain("register");
  });

  it("оставляет уточняющие варианты только у clarify", () => {
    const clarify = resolveSupportAnswer(
      answer({ outcome: "clarify", suggestions: ["Про тарифы", "Про запись"] }),
      context,
    );
    const plain = resolveSupportAnswer(
      answer({ sources: ["Тарифы и цены"], suggestions: ["А ещё?"] }),
      context,
    );

    expect(clarify.kind === "reply" && clarify.suggestions).toHaveLength(2);
    expect(plain.kind === "reply" && plain.suggestions).toHaveLength(0);
  });

  it("пропускает «такой функции нет» без источников", () => {
    const verdict = resolveSupportAnswer(
      answer({ outcome: "no_such_feature", reply: "Такой функции в okno.business нет." }),
      context,
    );

    expect(verdict.kind).toBe("reply");
  });

  it("пересылает реплику специалисту, не отвечая от себя", () => {
    const verdict = resolveSupportAnswer(
      answer({ outcome: "reply_to_operator", reply: "" }),
      context,
    );

    expect(verdict).toEqual({ kind: "forward", text: "почему не прошёл платёж" });
  });

  it("не показывает пустой ответ", () => {
    const verdict = resolveSupportAnswer(answer({ reply: "", sources: ["Тарифы и цены"] }), context);

    expect(verdict.kind).toBe("failed");
  });

  it("reply_to_operator без открытого разговора — обычное обращение к человеку", () => {
    const verdict = resolveSupportAnswer(
      answer({ outcome: "reply_to_operator", reply: "" }),
      { ...context, hasOpenEscalation: false },
    );

    expect(verdict).toEqual({ kind: "escalate", summary: "почему не прошёл платёж" });
  });

  it("гостю с reply_to_operator отдаёт свою формулировку, а не падает", () => {
    const verdict = resolveSupportAnswer(
      answer({ outcome: "reply_to_operator", reply: "" }),
      guest,
    );

    expect(verdict.kind).toBe("reply");
    expect(verdict.kind === "reply" && verdict.reply).toContain("register");
  });

  it("needs_human без текста: мастера передаёт человеку, гостю отвечает своей фразой", () => {
    const empty = answer({ outcome: "needs_human", reply: "" });

    expect(resolveSupportAnswer(empty, context).kind).toBe("escalate");
    expect(resolveSupportAnswer(empty, guest).kind).toBe("reply");
  });
});

describe("ответы гостю", () => {
  it("на вопрос для человека гость получает фиксированную фразу, а не текст модели", () => {
    const verdict = resolveSupportAnswer(
      answer({
        outcome: "needs_human",
        reply: "Сайт лежал — специалист решит по компенсации.",
      }),
      guest,
    );

    expect(verdict.kind).toBe("reply");
    expect(verdict.kind === "reply" && verdict.reply).not.toContain("компенсац");
    expect(verdict.kind === "reply" && verdict.reply).toContain("login");
  });
});

describe("supportAnswerSchema", () => {
  it("прощает мелкие промахи модели вместо ошибки", () => {
    const parsed = supportAnswerSchema.safeParse({
      reply: "  текст ",
      outcome: "clarify",
      sources: ["", "Тарифы и цены", "  "],
      summary: "я".repeat(800),
      suggestions: ["Про тарифы", "", "б".repeat(120), "1", "2", "3"],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.reply).toBe("текст");
    expect(parsed.data.sources).toEqual(["Тарифы и цены"]);
    expect(parsed.data.summary).toHaveLength(500);
    expect(parsed.data.suggestions).toHaveLength(4);
    expect(parsed.data.suggestions[1]).toHaveLength(80);
  });

  it("без полей sources и suggestions отдаёт пустые списки", () => {
    const parsed = supportAnswerSchema.parse({ reply: "ок", outcome: "off_topic" });

    expect(parsed.sources).toEqual([]);
    expect(parsed.suggestions).toEqual([]);
  });

  it("принимает список, присланный строкой", () => {
    const asJson = supportAnswerSchema.parse({
      reply: "ок",
      outcome: "answer",
      sources: '["Тарифы и цены", "Пробный месяц"]',
    });
    const single = supportAnswerSchema.parse({
      reply: "ок",
      outcome: "answer",
      sources: "Тарифы и цены",
    });

    expect(asJson.sources).toEqual(["Тарифы и цены", "Пробный месяц"]);
    expect(single.sources).toEqual(["Тарифы и цены"]);
  });

  it("неизвестный исход по-прежнему отвергает", () => {
    expect(supportAnswerSchema.safeParse({ reply: "ок", outcome: "maybe" }).success).toBe(false);
  });
});
