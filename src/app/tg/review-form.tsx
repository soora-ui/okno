"use client";

import { useCallback, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reviewMaxCommentLength, reviewMaxRating } from "@/lib/reviews";

// Отзыв о визите.
//
// Отзыв приватный: его видит только мастер. Так и написано в форме — человек
// пишет иначе, когда знает, что текст не окажется на витрине, и это как раз
// то, ради чего отзывы и заводились.

type ReviewFormProps = {
  initData: string;
  bookingId: string;
  existingRating: number | null;
  existingComment: string;
  onSaved: () => void;
};

export function ReviewForm({
  initData,
  bookingId,
  existingRating,
  existingComment,
  onSaved,
}: ReviewFormProps) {
  const [rating, setRating] = useState(existingRating ?? 0);
  const [comment, setComment] = useState(existingComment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = useCallback(async () => {
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/telegram/miniapp/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, bookingId, rating, comment: comment.trim() }),
      });

      const payload = (await response.json()) as { ok?: boolean; error?: string };

      if (payload.error || !payload.ok) {
        setError(payload.error ?? "Не получилось сохранить отзыв.");
        return;
      }

      onSaved();
    } catch {
      setError("Нет связи. Попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  }, [bookingId, comment, initData, onSaved, rating]);

  return (
    <div
      className="mt-4 space-y-3 border-t pt-4"
      style={{ borderColor: "var(--color-line)" }}
    >
      <p className="text-sm leading-6" style={{ color: "var(--color-muted)" }}>
        Отзыв увидит только мастер — он не попадёт на его страницу записи.
      </p>

      <div className="flex gap-1">
        {Array.from({ length: reviewMaxRating }, (_, index) => index + 1).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setRating(value)}
            aria-label={`Оценка ${value}`}
            className="p-1"
          >
            <Star
              size={28}
              style={{ color: value <= rating ? "var(--color-warning)" : "var(--color-line)" }}
              fill={value <= rating ? "currentColor" : "none"}
            />
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={reviewMaxCommentLength}
        rows={4}
        placeholder="Что понравилось, что нет. Мастер прочитает."
        className="w-full rounded-field border px-3 py-2 text-sm outline-none"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--ui-field-bg)",
          color: "var(--color-ink)",
        }}
      />

      <Button onClick={() => void save()} disabled={busy || rating === 0} className="w-full">
        {busy ? "Сохраняем…" : existingRating ? "Изменить отзыв" : "Отправить отзыв"}
      </Button>

      {error ? (
        <p className="text-sm leading-6" style={{ color: "var(--color-warning)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
