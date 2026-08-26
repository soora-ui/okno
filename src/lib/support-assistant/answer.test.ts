import { describe, expect, it } from "vitest";
import { resolveSupportAnswer, type SupportAnswer } from "@/lib/support-assistant/answer";

// Разбор исходов — единственное место, где обещание «бот ходит только по базе
// знаний» превращается в проверяемое условие. Если эти тесты падают, бот
// начал отвечать из общих знаний модели, и заметить это иначе нечем.

const context = { isAuthenticated: true, question: "почему не прошёл платёж" };

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
});
