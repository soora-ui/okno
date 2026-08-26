"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import { revokeYooKassaAccountAction } from "@/app/actions/yookassa-oauth";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { MasterYooKassaAccount } from "@/lib/payments/yookassa-oauth";

const initialState = { success: false, message: "" };

// Подключение мастера к ЮKassa Partners API (okno-tz-yookassa-oauth.md) —
// вместо прежней предоплаты через общий shopId платформы деньги идут прямо в
// магазин мастера. Без подключенного и активного (status='enabled')
// аккаунта включить предоплату на услуге нельзя (см. серверную проверку в
// createServiceAction/updateServiceAction) — эта карточка единственное
// место, где мастер может это подключение завести или отозвать.
export function YooKassaConnectSection({
  account,
}: {
  account: MasterYooKassaAccount | null;
}) {
  const [state, action] = useActionState(revokeYooKassaAccountAction, initialState);
  const isConnected = account?.status === "enabled";

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-3">
        <ShieldCheck size={18} className="text-success" />
        <h2 className="text-xl font-semibold text-ink">Приём предоплаты</h2>
      </div>
      <p className="text-sm leading-6 text-ink-soft">
        Подключи свой аккаунт ЮKassa — предоплата клиентов будет приходить напрямую в твой
        магазин, платформа деньги не удерживает. У тебя уже должен быть собственный магазин
        (ИП или самозанятый) в ЮKassa.
      </p>

      {isConnected ? (
        <div className="space-y-3">
          <div className="rounded-panel bg-panel p-4">
            <p className="text-sm font-medium text-ink">
              Подключено{account?.isTestShop ? " (тестовый магазин)" : ""}
            </p>
            <p className="mt-1 text-sm text-ink-soft">Магазин: {account?.yookassaAccountId}</p>
            {account?.isTestShop ? (
              <p className="mt-2 text-sm text-warning">
                Тестовый магазин — реальные платежи клиентов через него не проходят. Подключи
                боевой магазин ЮKassa, чтобы клиенты могли вносить предоплату.
              </p>
            ) : null}
          </div>
          <form action={action}>
            <FormMessage message={state.message} success={state.success} />
            <SubmitButton idleLabel="Отключить" pendingLabel="Отключаю..." />
          </form>
        </div>
      ) : (
        <div className="space-y-3">
          {account?.status === "revoked" ? (
            <p className="text-sm text-warning">
              Подключение отозвано. Подключи ЮKassa заново, чтобы включить предоплату на
              услугах.
            </p>
          ) : null}
          {account?.status === "disabled" ? (
            <p className="text-sm text-warning">
              Магазин подключён, но ЮKassa не приняла настройку уведомлений об оплате — без
              них платёж клиента до записи не дойдёт. Подключи заново; если не поможет,
              напиши в поддержку.
            </p>
          ) : null}
          <ButtonLink href="/api/yookassa/oauth/start" documentNavigation>
            Подключить ЮKassa
          </ButtonLink>
        </div>
      )}
    </Card>
  );
}
