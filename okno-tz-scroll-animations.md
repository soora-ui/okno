# ТЗ: Scroll-reveal анимации для okno.business

## 1. Цель

Добавить на сайт эффект "появления из ниоткуда" при скролле — элементы не просто статично лежат на странице, а плавно проявляются, когда пользователь до них доскроллил. Задача не "напихать эффектов", а сделать сайт ощутимо более premium и живым, оставаясь в рамках японского минимализма (пастель, воздух, сдержанность — без цирка и мельтешения).

Стиль анимаций: **Soft Structuralism** — мягкие, сильно диффузные, неторопливые появления. Никакого resize/bounce/rotate-эффектов в духе "трендовых SaaS-лендингов" — это будет спорить с эстетикой okno.

## 2. Стек и библиотека

Стек уже есть: React + Vite + TS + Tailwind. Под него органичнее всего ложится:

**Framer Motion** (`npm i framer-motion`) — а не GSAP/ScrollTrigger. Причины:
- Нативно под React, не нужно городить рефы и ручную очистку таймлайнов
- `whileInView` из коробки делает ровно то, что нужно — анимация при входе элемента во вьюпорт
- Меньше кода, меньше точек отказа

GSAP имеет смысл, только если позже понадобится сложная синхронизация со скроллом (пиннинг секций, покадровая анимация по прогрессу скролла). Для reveal-эффектов это оверкилл.

Смуз-скролл (Lenis) — **опционально**, отдельная фаза. Сначала reveal-анимации на нативном скролле, чтобы оценить эффект, потом при желании накатить Lenis поверх.

## 3. Базовый переиспользуемый компонент

```tsx
// src/components/ui/Reveal.tsx
import { motion, useReducedMotion } from "framer-motion";
import { ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  delay?: number;
  className?: string;
  variant?: "fade-up" | "fade" | "scale" | "blur";
};

const variants = {
  "fade-up": {
    hidden: { opacity: 0, y: 32 },
    visible: { opacity: 1, y: 0 },
  },
  "fade": {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
  "scale": {
    hidden: { opacity: 0, scale: 0.96 },
    visible: { opacity: 1, scale: 1 },
  },
  "blur": {
    hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
    visible: { opacity: 1, y: 0, filter: "blur(0px)" },
  },
};

export function Reveal({ children, delay = 0, className, variant = "fade-up" }: RevealProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants[variant]}
      transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
```

Ключевые решения зашиты уже здесь:
- `once: true` — анимация проигрывается один раз, при повторном скролле вверх-вниз элемент не мигает заново (важно для ощущения "качественности", а не "демки")
- `margin: "-80px"` — триггер немного раньше, чем элемент долистали до самого края экрана, иначе появление выглядит запоздалым
- easing `[0.22, 1, 0.36, 1]` — мягкий "ease-out-expo", без искусственной пружинистости
- `useReducedMotion` — уважение к `prefers-reduced-motion`, обязательно для доступности

## 4. Каталог анимаций по секциям

| Секция | Вариант | Задержка/стаггер | Комментарий |
|---|---|---|---|
| Hero (заголовок + подзаголовок) | `blur` | заголовок 0s → подзаголовок +0.15s → CTA +0.3s | Единственное место, где анимация играет **на загрузке**, а не по скроллу |
| Карточки услуг / бенто-грид | `fade-up` | стаггер +0.1s на карточку | Каждая карточка своим `Reveal`, не одна обёртка на всю секцию — иначе теряется ощущение "появления по одной" |
| Блок с отзывами | `fade-up` | стаггер +0.12s | Если карусель — анимировать только при первом появлении блока, не при свайпе |
| Разделы с картинкой + текстом | картинка — `scale`, текст — `fade-up` со сдвигом +0.2s | — | Картинка чуть "всплывает" первой, текст подхватывает следом — создаёт глубину |
| CTA-блок в конце страницы | `fade-up` | — | Можно чуть крупнее amplitude (y: 40 вместо 32), это финальный акцент |
| Футер | без анимации | — | Футер не должен "выпрыгивать", пользователь долистал до конца — уже достаточно контекста |

## 5. Тайминги — общие правила

- Длительность: **0.7–1s**. Короче — теряется "плавность", длиннее — начинает раздражать при быстром скролле.
- Стаггер между элементами в группе: **0.08–0.15s**. Больше — сайт кажется медленным.
- Amplitude смещения (`y`): **24–40px**. Больше — уже похоже на слайд-шоу, а не на реveal.
- Никогда не анимировать `width`/`height`/`top`/`left` — только `transform` и `opacity` (плюс `filter: blur` — он тоже GPU-friendly). Это критично для производительности на мобильных.

## 6. Мобильная адаптация

- На мобильных `margin` в `viewport` уменьшить до `-40px` — вьюпорт меньше, элементы иначе не будут успевать доскроллиться до триггера
- Blur-эффект (`variant="blur"`) на слабых мобильных устройствах может проседать по FPS — тестировать на реальном бюджетном Android, при просадках заменить на `fade-up` только для мобильной версии
- Стаггер на мобильных можно чуть сократить (0.08s вместо 0.15s) — экран уже, элементы идут плотнее друг за другом

## 7. Порядок внедрения (чтобы не переделывать всё разом)

1. Завести компонент `Reveal` + протестировать на одной секции (например, карточки услуг)
2. Прогнать Lighthouse/PageSpeed до и после — убедиться, что просадки нет
3. Раскатить на остальные секции по таблице из п.4
4. Проверить `prefers-reduced-motion` в devtools (эмуляция в Chrome)
5. Проверить на реальном телефоне, не эмуляторе — блюр и стаггер часто иначе ощущаются на слабом GPU

## 7.1. Отдельный паттерн: Capsule / Iris Reveal

Найден референс (запись экрана с сайта monks.com) — элемент раскрывается не фейдом/сдвигом, а как диафрагма: маленькая скруглённая капсула в центре растёт во все стороны, `border-radius` уменьшается по мере роста от почти круглого к финальному значению карточки, а контент внутри проявляется отдельным фейдом чуть позже, когда форма уже почти раскрыта.

Это не замена базовому `Reveal`, а отдельный вариант — уместен точечно, для одного-двух акцентных блоков на странице (например, большая карточка-фото мастера или блюр-превью услуги), а не массово на все карточки. Если раскрывать так каждую карточку в сетке услуг — эффект "утомит" и потеряет статус акцента.

```tsx
// src/components/ui/RoundedReveal.tsx
import { motion, useReducedMotion } from "framer-motion";
import { ReactNode } from "react";

type RoundedRevealProps = {
  children: ReactNode;
  className?: string;
  finalRadius?: string;   // финальный border-radius раскрытой формы
  contentDelay?: number;  // задержка фейда контента внутри, сек
};

export function RoundedReveal({
  children,
  className,
  finalRadius = "24px",
  contentDelay = 0.35,
}: RoundedRevealProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      style={{ overflow: "hidden" }}
      initial={{ scale: 0.4, borderRadius: "999px", opacity: 0.5 }}
      whileInView={{ scale: 1, borderRadius: finalRadius, opacity: 1 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: contentDelay, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
```

**Где применить на okno:** фото мастера в блоке "О враче/специалисте" или крупная карточка-превью услуги с фото — то есть места, где элемент один и заслуживает акцента, а не переиспользуется в сетке.

## 8. Что отдать Claude Code одним сообщением

> Добавь в проект компонент Reveal (Framer Motion, whileInView, once: true), примени его к секциям [hero/услуги/отзывы/CTA] согласно таблице анимаций из okno-tz-scroll-animations.md, соблюдая тайминги и variant для каждой секции. Не трогай футер. Учти prefers-reduced-motion.

Файл с ТЗ прикладывать вместе с этим сообщением — тогда Claude Code сразу видит и таблицу, и код компонента, и не придётся ничего пересказывать словами.
