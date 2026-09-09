"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured, isYooKassaConfigured } from "@/lib/env";
import { startTipPayment } from "@/lib/payments/tip-payment";

export type TipActionState = {
  success: boolean;
  message: string;
};

const tipSchema = z.object({
  bookingId: z.string().uuid(),
  amount: z.coerce.number().int(),
});

// Старт оплаты чаевых со страницы подтверждения записи: клиент анонимный, без
// авторизации. Вся работа — в startTipPayment; здесь остаётся то, ради чего
// это server action, — увести браузер на страницу оплаты.
export async function startTipPaymentAction(
  _prevState: TipActionState,
  formData: FormData,
): Promise<TipActionState> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Чаевые пока недоступны: нужно подключение к Supabase.",
    };
  }

  if (!isYooKassaConfigured) {
    return {
      success: false,
      message: "Оплата пока недоступна: не настроены ключи ЮKassa.",
    };
  }

  const parsed = tipSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { success: false, message: "Проверь сумму чаевых и попробуй ещё раз." };
  }

  const result = await startTipPayment(parsed.data);

  if (!result.ok) {
    return { success: false, message: result.message };
  }

  redirect(result.confirmationUrl);
}
