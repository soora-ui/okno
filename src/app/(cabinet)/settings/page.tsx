import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { getSettingsData } from "@/lib/data";
import { getOwnerRecentSubscriptionPayment } from "@/lib/repositories/owner-repository";
import { resolveSubscription } from "@/lib/subscription";
import { canManageWorkspace, isTeamWorkspaceKind } from "@/lib/workspace";

// Причины отказа из ЮKassa (cancellation_details.reason) человеческим языком.
// Разные причины лечатся по-разному: пополнить карту, взять другую, позвонить
// в банк — поэтому «что-то пошло не так» здесь не годится.
const paymentFailureReasons: Record<string, string> = {
  insufficient_funds: "На карте не хватило средств.",
  card_expired: "Срок действия карты истёк.",
  invalid_card_number: "Номер карты введён неверно.",
  invalid_csc: "Неверный код CVC.",
  call_issuer: "Банк отклонил платёж — нужно связаться с ним.",
  payment_method_restricted: "Банк ограничил операции по этой карте.",
  general_decline: "Банк отклонил платёж без указания причины.",
  three_d_secure_failed: "Не пройдено подтверждение 3-D Secure.",
  expired_on_confirmation: "Оплата не была завершена вовремя.",
  canceled_by_merchant: "Платёж отменён.",
};

const yookassaOAuthNotices: Record<string, { text: string; tone: "success" | "warning" }> = {
  connected: {
    text: "ЮKassa подключена. Предоплата клиентов теперь идёт напрямую в твой магазин.",
    tone: "success",
  },
  connected_test: {
    text: "Подключен тестовый магазин ЮKassa. Реальные платежи клиентов через него не пройдут — подключи боевой магазин, когда будешь готов принимать предоплату.",
    tone: "warning",
  },
  error: {
    text: "Не получилось подключить ЮKassa. Попробуй еще раз или напиши в поддержку.",
    tone: "warning",
  },
  // Токен получен, но подписаться на уведомления в магазине мастера не вышло.
  // Без них мы не узнаем об оплате: клиент заплатит, а бронь снимется как
  // неоплаченная — поэтому подключение остаётся неактивным.
  webhooks_failed: {
    text: "ЮKassa ответила, но настроить уведомления об оплате не получилось — предоплату пока включить нельзя. Нажми «Подключить ЮKassa» ещё раз, а если повторится — напиши в поддержку.",
    tone: "warning",
  },
  not_configured: {
    text: "Подключение ЮKassa пока недоступно на платформе.",
    tone: "warning",
  },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ subscription?: string; yookassa?: string }>;
}) {
  const [data, query] = await Promise.all([getSettingsData(), searchParams]);

  if (!data) {
    redirect("/login");
  }

  const {
    availabilityRules,
    profile,
    services,
    serviceManuals,
    referralInvites,
    certificateTemplate,
    yookassaAccount,
    activeSeats,
    autopay,
    seatBalance,
  } = data;
  const showWorkspaceAdminLink =
    canManageWorkspace(profile.accountRole) &&
    isTeamWorkspaceKind(profile.workspaceKind);
  // Плашку «проверяем оплату» показываем только пока оплаченного тарифа ещё
  // нет. Раньше она зависела лишь от ?subscription=processing в URL и висела
  // вечно после успешной оплаты. Как только вебхук ЮKassa проставил план,
  // resolveSubscription видит оплаченный тариф — и плашка исчезает сама.
  const subscriptionAccess = resolveSubscription({
    subscriptionTier: profile.subscriptionTier,
    subscriptionUntil: profile.subscriptionUntil,
  });
  const hasPaidPlan = subscriptionAccess.planId !== null && !subscriptionAccess.isTrial;
  // Возврат с ЮKassa сам по себе не означает, что деньги ушли. Спрашиваем
  // фактический исход последней оплаты: пока он неизвестен — «проверяем»,
  // при отказе — прямо об этом и говорим, а не обещаем тариф, которого не
  // будет. Запрос делаем только при возврате с оплаты, а не на каждом
  // открытии настроек.
  const returnedFromPayment =
    query.subscription === "processing" && !hasPaidPlan;
  const recentPayment = returnedFromPayment
    ? await getOwnerRecentSubscriptionPayment({ profileId: profile.id })
    : null;
  const failedPayment =
    recentPayment?.status === "canceled" ? recentPayment : null;
  // «Проверяем» — только пока исход действительно неизвестен. Если ЮKassa уже
  // ответила (успехом или отказом), ждать нечего, и висящая плашка вводит в
  // заблуждение — именно так она и обещала тариф после неудачной оплаты.
  const showSubscriptionNotice = recentPayment?.status === "pending";
  const yookassaNotice = query.yookassa ? yookassaOAuthNotices[query.yookassa] : undefined;

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Badge tone="accent">Настройки</Badge>
          <h1 className="text-4xl font-semibold text-ink">Профиль и параметры записи</h1>
        </div>
      </div>

      {failedPayment ? (
        <Card className="bg-warning-soft">
          <p className="text-sm font-medium text-ink">Оплата не прошла</p>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            {paymentFailureReasons[failedPayment.cancellationReason ?? ""] ??
              "ЮKassa отклонила платёж."}{" "}
            Деньги не списаны, тариф не подключён. Попробуй оплатить ещё раз во вкладке
            «Аккаунт» — можно другой картой.
          </p>
        </Card>
      ) : showSubscriptionNotice ? (
        <Card className="bg-panel">
          <p className="text-sm font-medium text-ink">Проверяем оплату подписки</p>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            ЮKassa подтверждает платёж — обычно это занимает несколько секунд. Обнови
            страницу: как только оплата пройдёт, новый тариф появится здесь и во
            вкладке «Аккаунт».
          </p>
        </Card>
      ) : null}

      {yookassaNotice ? (
        <Card className={yookassaNotice.tone === "success" ? "bg-success-soft" : "bg-warning-soft"}>
          <p className="text-sm leading-6 text-ink">{yookassaNotice.text}</p>
        </Card>
      ) : null}

      {showWorkspaceAdminLink ? (
        <Card className="flex flex-wrap items-center justify-between gap-4 bg-panel">
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">Админка студии вынесена отдельно</p>
            <p className="text-sm leading-6 text-ink-soft">
              Управление сотрудниками и общей командой находится в отдельном разделе, чтобы личный кабинет не смешивался с администрированием.
            </p>
          </div>
          <ButtonLink href="/team" variant="secondary">
            Открыть админку
          </ButtonLink>
        </Card>
      ) : null}

      <SettingsTabs
        profile={profile}
        services={services}
        availabilityRules={availabilityRules}
        serviceManuals={serviceManuals}
        referralInvites={referralInvites}
        certificateTemplate={certificateTemplate}
        yookassaAccount={yookassaAccount}
        activeSeats={activeSeats}
        autopay={autopay}
        seatBalance={seatBalance}
      />

      {/* На мобильном меню в шапке скрыто в пользу нижней панели, а выхода
          среди её вкладок нет — его дом здесь. Публичная страница уже есть
          выше отдельной карточкой со ссылкой. */}
      <Card>
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center justify-between gap-4 rounded-panel border border-line px-4 py-3 text-sm font-medium text-ink transition hover:bg-panel"
          >
            <span>Выйти из аккаунта</span>
            <LogOut size={16} />
          </button>
        </form>
      </Card>
    </div>
  );
}
