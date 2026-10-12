import { legalEntity } from "@/config/legal";
import {
  billingPeriods,
  extraSeatPriceRub,
  pricingPlans,
  trialDays,
} from "@/config/plans";
import { siteUrl } from "@/config/site";

// llms.txt — выжимка о продукте для AI-поиска (ChatGPT, Perplexity, Алиса).
// Цены собираются из тех же тарифов, что видит мастер, чтобы ответ модели
// не устарел после смены цены.
export const dynamic = "force-static";

const maxDiscount = Math.max(...billingPeriods.map((period) => period.discountPercent));

const plans = pricingPlans
  .map((plan) => {
    const features = plan.features.map((feature) => `- ${feature}`).join("\n");
    return `### ${plan.title} — ${plan.priceRub} ₽ в месяц\n${plan.description}\n${features}`;
  })
  .join("\n\n");

const body = `# okno

> okno — сервис онлайн-записи для мастеров бьюти-сферы, студий, салонов и барбершопов в России и СНГ. Мастер получает страницу записи по ссылке, клиент сам выбирает услугу и время без регистрации и приложения, мастер видит расписание и базу клиентов в кабинете.

## Для кого
- Частные мастера: маникюр, брови, ресницы, косметология, парикмахеры
- Студии, салоны красоты и барбершопы с несколькими мастерами

## Возможности
- Страница онлайн-записи: клиент записывается без регистрации, капчи и приложения
- Расписание, блокировки и защита от двойной записи
- База клиентов и история визитов
- Напоминание клиенту в календарь телефона и отмена записи по ссылке; уведомления мастеру в Telegram
- Предоплата за услугу через ЮKassa мастера: деньги идут мастеру напрямую, мимо сервиса
- Рейтинг надёжности клиента по отметкам «пришёл» / «не пришёл», виден только мастеру
- AI-консультант: отвечает клиентам на вопросы об услугах строго по мануалу мастера
- Подарочные сертификаты с QR-кодом, погашение частями
- Чаевые через CloudTips

## Тарифы
Первые ${trialDays} дней бесплатно. Оплата вперёд даёт скидку до ${maxDiscount} %.

${plans}

Сотрудник сверх трёх в тарифе для студии — ${extraSeatPriceRub} ₽ в месяц.

## Страницы
- [Главная](${siteUrl}/): что умеет сервис и как начать
- [Тарифы](${siteUrl}/pricing): цены, сравнение тарифов, вопросы об оплате
- [Правовые документы](${siteUrl}/legal): оферта, политика обработки персональных данных

## Контакты
- Почта: ${legalEntity.email}
- ${legalEntity.shortName || legalEntity.name}, ИНН ${legalEntity.inn}
`;

export function GET() {
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
