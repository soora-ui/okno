import { certificateQrSizePx } from "@/lib/certificate-verification";
import { certificateDimensions } from "@/lib/certificates/render";

// Промпт для генерации HTML-шаблона подарочного сертификата через Claude
// API (okno-tz-certificates.md, 2.1 и 3.1). Генерация происходит один раз
// при настройке дизайна мастером, не при каждой выдаче сертификата.
//
// Ключевое ограничение: рендерим через satori (см. certificates/render.ts),
// а не браузер — значит Claude должен вернуть HTML в подмножестве, которое
// satori умеет разбирать. Поддерживаемый набор проверен на реальном
// рендере: флексбокс, position absolute/relative, linear/radial-gradient,
// border-radius, box-shadow, transform (rotate/scale/translate), opacity,
// letter-spacing, text-transform, инлайн-SVG с явными width/height.
// НЕ поддерживается: CSS grid, float, backdrop-filter, внешние шрифты,
// классы, псевдоэлементы, @media.

export const certificateRequiredPlaceholders = [
  "{{amount}}",
  "{{certNumber}}",
  "{{issueDate}}",
  "{{expiryDate}}",
  "{{qrCodeSvg}}",
] as const;

// Движок вариативности: без него модель на похожих входных данных выдаёт
// один и тот же центрированный макет. Архетип выбирается детерминированно
// от мастера и номера попытки — значит каждая перегенерация даёт заведомо
// другую композицию, а не «то же самое, но чуть иначе».
const layoutArchetypes = [
  {
    id: "asymmetric-split",
    brief:
      "Асимметричный сплит: холст разделён по вертикали на широкую (≈62%) и узкую (≈38%) зоны разного тона. Номинал живёт в широкой зоне, прижат к левому краю по базовой линии; узкая зона — плотный блок с логотипом сверху и QR снизу. Граница зон — не линия, а смена фона.",
  },
  {
    id: "framed-plate",
    brief:
      "Обрамлённая пластина: внешний фон-подложка одного тона, внутри с отступом 28–36px лежит «карточка» со скруглением 32–44px, своим фоном, hairline-рамкой rgba и мягкой тенью. Вся композиция живёт внутри карточки, поля дышат.",
  },
  {
    id: "diagonal-accent",
    brief:
      "Диагональный акцент: фон с linear-gradient под углом 135deg, поверх — крупная геометрическая фигура (полоса или блок) с transform: rotate(-8deg), уходящая за край холста через overflow-скрытие родителя. Номинал контрастно поверх, QR в спокойном углу.",
  },
  {
    id: "ghost-numeral",
    brief:
      "Призрачная цифра: гигантский номинал-«тень» (font-size ≈420px, opacity 0.06–0.09) как фоновая текстура, поверх него — читаемый номинал нормального размера и остальная типографика. Строгая сетка, много воздуха.",
  },
  {
    id: "editorial-stack",
    brief:
      "Издательский стек: всё выстроено по левому краю в одну вертикальную колонку с крупными интервалами — eyebrow, название студии, огромный номинал, тонкая горизонтальная линейка, служебные строки. QR отдельным островом в правом нижнем углу, логотип — в правом верхнем.",
  },
] as const;

const vibeArchetypes = [
  {
    id: "editorial-luxury",
    brief:
      "Издательская роскошь: тёплые кремовые и припылённые тона, высокий контраст между огромным номиналом и микроскопическим служебным текстом, широкий letter-spacing в надписях капсом, тонкие hairline-линейки как разделители.",
  },
  {
    id: "soft-structuralism",
    brief:
      "Мягкий структурализм: почти монохром на светлом фоне, акцентный цвет только в одной-двух точках, крупная плотная типографика, очень мягкие рассеянные тени, скругления 32–48px, ощущение физического объекта.",
  },
  {
    id: "quiet-contrast",
    brief:
      "Тихий контраст: тёмная насыщенная зона рядом со светлой, номинал вывернут на тёмном, служебная информация на светлом. Никаких лишних деталей, вся выразительность из соотношения масс и одного акцентного пятна.",
  },
] as const;

export function pickCertificateDesignArchetypes(input: {
  profileId: string;
  attemptIndex: number;
}) {
  let hash = 0;
  for (const char of input.profileId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  const layout = layoutArchetypes[(hash + input.attemptIndex) % layoutArchetypes.length];
  const vibe = vibeArchetypes[(hash + input.attemptIndex * 2) % vibeArchetypes.length];

  return { layout, vibe };
}

export const certificateTemplateSystemPrompt = `Ты арт-директор, который делает премиальные печатные подарочные сертификаты для мастеров бьюти-сферы (сервис okno.business). Твоя работа должна выглядеть как макет из хорошей студии, а не как заполненный шаблон из стокового генератора.

ФОРМАТ ХОЛСТА (не отклоняться):
- Ровно ${certificateDimensions.widthPx150dpi}×${certificateDimensions.heightPx150dpi}px — A5 альбомная, 210×148мм, пропорции 35:24.
- Корневой элемент: <div style="display:flex;width:${certificateDimensions.widthPx150dpi}px;height:${certificateDimensions.heightPx150dpi}px;..."> — размеры задай явно.
- Безопасное поле от края минимум 56px: в эту зону не заходит ни текст, ни QR, ни логотип.

ЧТО ДЕЛАЕТ МАКЕТ ПРЕМИАЛЬНЫМ (соблюдай всё):
- Номинал — безусловная доминанта: font-size не меньше 150px, font-weight 700, плотный line-height (0.9–1.0). Остальной текст рядом с ним обязан выглядеть микроскопическим.
- Иерархия в три ступени: (1) номинал, (2) название студии / «Подарочный сертификат», (3) служебные строки 15–19px приглушённым цветом.
- Надписи капсом («ПОДАРОЧНЫЙ СЕРТИФИКАТ», eyebrow-метки) — обязательно letter-spacing 4–8px и font-size 13–17px, иначе выглядит дёшево.
- Композиционное напряжение: НЕ центрируй всё подряд. Пусть между блоками будет разное расстояние, а не равномерная каша.
- Минимум один «физический» приём: мягкая рассеянная тень (box-shadow с большим blur и низкой alpha), hairline-рамка rgba(0,0,0,0.06–0.12), вложенная карточка со скруглением, тонкая линейка-разделитель или градиентная подложка.
- Цвета: используй переданные основной и дополнительный как каркас палитры, добавь их полупрозрачные производные (rgba) для фонов и разделителей. Не заливай весь холст одним плоским цветом без единого нюанса.

ЧТО ЗАПРЕЩЕНО (выглядит дёшево — не делай):
- Всё по центру в одну колонку с одинаковыми отступами.
- Рамка в 2–4px сплошным цветом по периметру холста.
- Номинал мельче 150px или визуально равный по весу другому тексту.
- Эмодзи, «декоративные» звёздочки, псевдо-орнаменты из символов (✦ ❋ ★ и подобное).
- Плоская заливка без единой тени, линейки, градиента или вложенной формы.

ТЕХНИЧЕСКОЕ ОГРАНИЧЕНИЕ РАЗМЕТКИ (рендерится через satori, не через браузер):
- Только теги div, span, img, svg, p. Никаких <html>/<head>/<body>/<style>/<link>/<script>.
- Только инлайн-атрибут style="...". Никаких классов, CSS-переменных, внешних стилей, @media, псевдоэлементов.
- КАЖДЫЙ div, внутри которого больше одного дочернего элемента, ОБЯЗАН иметь display:flex — это жёсткое требование satori, иначе рендер падает.
- Разрешено и приветствуется: flex (flexDirection, justifyContent, alignItems, gap), position:absolute внутри родителя с position:relative, linear-gradient и radial-gradient в background, border-radius, box-shadow, transform (rotate/scale/translate), opacity, letter-spacing, text-transform, border с rgba.
- Запрещено (satori не поддерживает): CSS grid, float, backdrop-filter, filter, внешние шрифты.
- Единственный шрифт — "PT Sans" (уже загружен, доступны начертания 400 и 700). Другие font-family не указывай.
- Логотип вставляй как <img src="ЛОГОТИП_URL" style="width:...px;height:...px;object-fit:contain" /> с переданным URL. Размеры задавай явно, пропорции не искажай.
- Верни ТОЛЬКО HTML-разметку. Без markdown-обёртки, без \`\`\`, без пояснений до и после.

ПЛЕЙСХОЛДЕРЫ — вставь каждый ровно один раз, буквально, не переводя и не убирая двойные скобки:
- {{amount}} — ТОЛЬКО ЧИСЛО номинала, уже отформатированное с пробелами (например «1 000»). Символ валюты «₽» плейсхолдер НЕ содержит — нарисуй его сам рядом отдельным span (обычно чуть меньшим кеглем). Ровно один знак ₽ на макете.
- {{certNumber}} — номер сертификата, служебной строкой.
- {{issueDate}} — дата выдачи, служебной строкой.
- {{expiryDate}} — срок действия, служебной строкой. Подставится либо дата, либо слово «бессрочно» — формулируй подпись так, чтобы оба варианта читались («Действителен до: {{expiryDate}}» — подходит).
- {{qrCodeSvg}} — будет заменён на готовый инлайн-SVG QR-кода РОВНО ${certificateQrSizePx}×${certificateQrSizePx}px. Поэтому: положи плейсхолдер в контейнер ровно ${certificateQrSizePx}×${certificateQrSizePx}px (width и height явно), без внутренних отступов и без масштабирования. Контейнер должен лежать на светлой подложке (белой или очень светлой) — если фон в этом месте тёмный, подложи под QR белый блок со скруглением и небольшим полем 12–16px вокруг зоны QR. Плейсхолдер — единственное содержимое контейнера.`;

export function buildCertificateTemplateUserPrompt(input: {
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  studioName: string;
  tagline: string;
  contacts: string;
  layoutBrief: string;
  vibeBrief: string;
}): string {
  const lines = [
    `АРХЕТИП КОМПОЗИЦИИ (следуй ему, это не пожелание): ${input.layoutBrief}`,
    `НАСТРОЕНИЕ И ФАКТУРА: ${input.vibeBrief}`,
    "",
    `Основной цвет: ${input.primaryColor}`,
    `Дополнительный цвет: ${input.secondaryColor}`,
  ];

  if (input.logoUrl) {
    lines.push(`URL логотипа: ${input.logoUrl}`);
  } else {
    lines.push(
      "Логотип не загружен — не вставляй <img> вообще. Компенсируй это типографикой: название студии становится логотипом (крупнее, плотнее, с проработанным letter-spacing).",
    );
  }

  if (input.studioName) {
    lines.push(`Название студии: ${input.studioName}`);
  }
  if (input.tagline) {
    lines.push(`Слоган: ${input.tagline}`);
  }
  if (input.contacts) {
    lines.push(`Контакты: ${input.contacts}`);
  }

  lines.push("", "Сгенерируй HTML-шаблон сертификата по этим данным.");

  return lines.join("\n");
}

export function buildCertificateTemplateRepairPrompt(renderError: string): string {
  return `Предыдущий вариант не прошёл рендер через satori с ошибкой:\n\n${renderError}\n\nПочини разметку, не упрощая дизайн: сохрани ту же композицию, иерархию и декоративные приёмы, поправь только несовместимость. Частая причина — div с несколькими детьми без display:flex, либо неподдерживаемое свойство (grid, float, filter, backdrop-filter). Верни исправленный HTML целиком, снова только разметку без пояснений.`;
}

export function findMissingCertificatePlaceholders(html: string): string[] {
  return certificateRequiredPlaceholders.filter((placeholder) => !html.includes(placeholder));
}
