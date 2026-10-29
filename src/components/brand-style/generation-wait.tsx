"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, WifiOff } from "lucide-react";
import { Eyebrow, GenerationsCounter, Spinner, WizardCard } from "@/components/brand-style/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 4.7 «Подбираем варианты палитры» и ошибки генерации из 4.16. Этапы
// сменяются по времени — это подсказка, что идёт работа, а не отчёт
// сервера; итог всё равно приходит одним ответом за 10–40 секунд.

const stages = ["Изучаем материалы", "Собираем цвета", "Проверяем читаемость", "Готовим три варианта"];
const stageSeconds = [0, 6, 16, 24];

export function GenerationWait({
  foundColors,
  error,
  offline,
  generationsLeft,
  onCancel,
  onRetry,
  onClose,
}: {
  foundColors: string[];
  error: string | null;
  offline: boolean;
  generationsLeft: number;
  onCancel: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (error) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [error]);

  const stage = stageSeconds.filter((start) => seconds >= start).length - 1;
  const slow = seconds > 40;

  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-10 sm:pt-16">
      <WizardCard className="w-full max-w-[600px] gap-5 sm:p-8">
        {error ? (
          <>
            <div className="flex items-start gap-3.5 rounded-panel border border-[var(--color-danger-border)] bg-[var(--color-danger-soft)] p-4">
              <AlertCircle aria-hidden="true" size={22} className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-ink">{error}</p>
                <GenerationsCounter left={generationsLeft} label={`Всё ещё ${generationsLeft} из 3`} />
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={onRetry}>Попробовать ещё раз</Button>
              <Button variant="ghost" onClick={onClose}>
                Закрыть
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Eyebrow>Палитра</Eyebrow>
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Подбираем варианты палитры</h1>
              <p className="text-sm text-ink-soft">Читаем ваши материалы и собираем три разных варианта.</p>
            </div>

            {offline ? (
              <div className="flex items-start gap-3 rounded-panel border p-4" style={{ backgroundColor: "var(--color-warning-soft)", borderColor: "var(--color-warning)" }}>
                <WifiOff aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-warning" />
                <p className="text-[13px] text-ink">
                  <b>Нет соединения.</b> Генерация идёт на нашей стороне. Когда интернет вернётся, продолжим с того же места.
                </p>
              </div>
            ) : null}

            <ol className="flex flex-col gap-3.5">
              {stages.map((label, index) => {
                const state = index < stage ? "done" : index === stage ? "on" : "todo";
                return (
                  <li key={label} className={cn("flex items-center gap-3 text-sm", state === "todo" ? "text-muted" : "text-ink")}>
                    {state === "done" ? (
                      <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border border-[var(--color-accent-deep)] bg-accent-soft text-accent-deep">
                        <Check size={13} />
                      </span>
                    ) : state === "on" ? (
                      <Spinner />
                    ) : (
                      <span className="h-[22px] w-[22px] rounded-full border border-line" />
                    )}
                    <span className={state === "on" ? "font-medium" : undefined}>{label}</span>
                  </li>
                );
              })}
            </ol>

            {slow ? (
              <div className="flex flex-col gap-2 rounded-panel border border-line bg-panel p-4">
                <p className="text-sm text-ink">Чуть дольше обычного, ещё немного.</p>
                <span className="h-1.5 overflow-hidden rounded-full border border-line bg-surface">
                  <i className="block h-full w-4/5 rounded-full" style={{ backgroundColor: "var(--color-accent-deep)" }} />
                </span>
              </div>
            ) : null}

            {foundColors.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                <Eyebrow>Уже нашли</Eyebrow>
                <div className="flex gap-2">
                  {foundColors.slice(0, 6).map((color) => (
                    <span key={color} className="h-11 w-11 rounded-full border border-black/15" style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>
            ) : null}

            <hr className="h-px border-0 bg-[var(--color-line)]" />
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-muted">
                Обычно это занимает 10–40 секунд. Окно можно не закрывать.
                <br />
                Если отменить, генерация не спишется.
              </p>
              <Button variant="secondary" onClick={onCancel}>
                Отменить
              </Button>
            </div>
          </>
        )}
      </WizardCard>
    </main>
  );
}
