import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PasswordConfirmCard } from "@/components/settings/password-confirm-card";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { isTelegramOriginSession } from "@/lib/auth/session-origin";
import { isSettingsTabId } from "@/config/settingsTabs";
import { getSettingsData } from "@/lib/data";
import { getOwnerRecentSubscriptionPayment } from "@/lib/repositories/owner-repository";
import { hasCapability, resolveSubscription } from "@/lib/subscription";
import { getBrandThemeGenerationsLeft } from "@/lib/brand-theme/usage";
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
  password_required: {
    text: "Чтобы подключить ЮKassa, подтверди пароль от кабинета — форма ниже.",
    tone: "warning",
  },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ subscription?: string; yookassa?: string; tab?: string }>;
}) {
  const [data, query, telegramSession] = await Promise.all([
    getSettingsData(),
    searchParams,
    isTelegramOriginSession(),
  ]);

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
  // Счётчик нужен только карточке фирменного стиля в состояниях B и C —
  // остальным мастерам лишний запрос ни к чему.
  const brandThemeGenerationsLeft =
    hasCapability(profile, "brandTheme")
      ? await getBrandThemeGenerationsLeft(profile.id)
      : undefined;
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

  const notices =
    failedPayment ||
    showSubscriptionNotice ||
    yookassaNotice ||
    showWorkspaceAdminLink ||
    telegramSession ? (
      <div className="space-y-4">
        {failedPayment ? (
          <Card className="bg-warning-soft">
            <p className="text-sm font-medium text-ink">Оплата не прошла</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              {paymentFailureReasons[failedPayment.cancellationReason ?? ""] ??
                "ЮKassa отклонила платёж."}{" "}
              Деньги не списаны, тариф не подключён. Попробуй оплатить ещё раз в разделе
              «Аккаунт» — можно другой картой.
            </p>
          </Card>
        ) : showSubscriptionNotice ? (
          <Card className="bg-panel">
            <p className="text-sm font-medium text-ink">Проверяем оплату подписки</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              ЮKassa подтверждает платёж — обычно это занимает несколько секунд. Обнови
              страницу: как только оплата пройдёт, новый тариф появится здесь и в
              разделе «Аккаунт».
            </p>
          </Card>
        ) : null}

        {yookassaNotice ? (
          <Card className={yookassaNotice.tone === "success" ? "bg-success-soft" : "bg-warning-soft"}>
            <p className="text-sm leading-6 text-ink">{yookassaNotice.text}</p>
          </Card>
        ) : null}

        {telegramSession ? <PasswordConfirmCard /> : null}

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
      </div>
    ) : null;

  // Выход, «Идеи и проблемы» и ссылка на страницу живут в навигации настроек:
  // на телефоне меню в шапке скрыто в пользу нижней панели, и их дом — там.
  return (
    <div className="py-4">
      <SettingsTabs
        profile={profile}
        services={services}
        availabilityRules={availabilityRules}
        serviceManuals={serviceManuals}
        referralInvites={referralInvites}
        certificateTemplate={certificateTemplate}
        brandThemeGenerationsLeft={brandThemeGenerationsLeft}
        yookassaAccount={yookassaAccount}
        activeSeats={activeSeats}
        autopay={autopay}
        seatBalance={seatBalance}
        initialTab={isSettingsTabId(query.tab) ? query.tab : null}
        notices={notices}
      />
    </div>
  );
}
